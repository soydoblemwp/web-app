import "server-only";
import { prisma } from "@/lib/db/prisma";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { logGovernanceAction } from "@/server/services/agent-governance-audit";
import { activatePolicyVersion } from "@/server/services/agent-governance-policy";
import { notifyShadowRolloutDivergence } from "@/server/services/agent-governance-notifications";

/**
 * Staged rollout for a DRAFT policy version (Fase 38 spec section 19) — one
 * row per policy (`AiAgentPolicyRollout.policyId @unique`), layered on top
 * of (never replacing) the real DRAFT/ACTIVE/ARCHIVED lifecycle. Promotion
 * to PROMOTED calls the REAL `activatePolicyVersion()` — never a second,
 * parallel activation path.
 */

export async function getRollout(projectId: string, policyId: string) {
  const row = await prisma.aiAgentPolicyRollout.findUnique({ where: { policyId } });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export async function listActiveRollouts(projectId: string) {
  return prisma.aiAgentPolicyRollout.findMany({ where: { projectId, stage: { in: ["SHADOW", "LIMITED"] } }, include: { policy: true } });
}

/** Starts a SHADOW rollout — idempotent (one row per policyId, `upsert` never creates a second). */
export async function startShadowRollout(projectId: string, userId: string, policyId: string) {
  const policy = await prisma.aiAgentPolicy.findUnique({ where: { id: policyId } });
  if (!policy || policy.projectId !== projectId) return { error: "Política no encontrada." };
  if (policy.status !== "DRAFT") return { error: "Solo un borrador puede iniciar un rollout." };

  const rollout = await prisma.aiAgentPolicyRollout.upsert({
    where: { policyId },
    create: { policyId, projectId, stage: "SHADOW", createdById: userId },
    update: {},
  });

  await logGovernanceAction(projectId, userId, "ai_agent_governance.shadow_rollout_started", "AiAgentPolicyRollout", rollout.id, { policyId });
  await publishAutomationEvent({
    projectId,
    eventKey: "ai_agent_governance.shadow_rollout_started",
    resourceId: rollout.id,
    actorId: userId,
    payload: { policyId },
    idempotencyKey: `ai_agent_governance.shadow_rollout_started:${rollout.id}`,
  });
  return { id: rollout.id, stage: rollout.stage };
}

export async function updateRolloutScope(projectId: string, userId: string, policyId: string, scope: { scopeAgentRefs: string[]; scopeModes: string[]; percentage: number | null }) {
  const rollout = await getRollout(projectId, policyId);
  if (!rollout) return { error: "Este borrador todavía no tiene un rollout iniciado." };
  if (rollout.stage === "PROMOTED" || rollout.stage === "RETIRED") return { error: `No se puede modificar el alcance de un rollout en estado ${rollout.stage}.` };

  await prisma.aiAgentPolicyRollout.update({ where: { policyId }, data: { scopeAgentRefs: scope.scopeAgentRefs, scopeModes: scope.scopeModes, percentage: scope.percentage } });
  await logGovernanceAction(projectId, userId, "ai_agent_governance.rollout_scope_updated", "AiAgentPolicyRollout", rollout.id, scope);
  return { id: rollout.id };
}

/**
 * Promotes a rollout — SHADOW -> LIMITED is a plain stage transition;
 * LIMITED/SHADOW -> PROMOTED calls the REAL `activatePolicyVersion()`.
 * Both require an explicit human action (never a cron, never automatic).
 */
export async function promoteRollout(projectId: string, userId: string, policyId: string, targetStage: "LIMITED" | "PROMOTED") {
  const rollout = await getRollout(projectId, policyId);
  if (!rollout) return { error: "Este borrador todavía no tiene un rollout iniciado." };
  if (rollout.stage === "PROMOTED" || rollout.stage === "RETIRED") return { error: `Este rollout ya está en estado ${rollout.stage}.` };

  if (targetStage === "LIMITED") {
    if (rollout.stage !== "SHADOW") return { error: "Solo un rollout en SHADOW puede pasar a LIMITED." };
    const updated = await prisma.aiAgentPolicyRollout.update({ where: { policyId }, data: { stage: "LIMITED", stageChangedAt: new Date() } });
    await logGovernanceAction(projectId, userId, "ai_agent_governance.limited_rollout_started", "AiAgentPolicyRollout", updated.id, { policyId });
    await publishAutomationEvent({
      projectId,
      eventKey: "ai_agent_governance.limited_rollout_started",
      resourceId: updated.id,
      actorId: userId,
      payload: { policyId },
      idempotencyKey: `ai_agent_governance.limited_rollout_started:${updated.id}`,
    });
    return { id: updated.id, stage: updated.stage };
  }

  // targetStage === "PROMOTED" — the REAL activation. Any error from activatePolicyVersion (including
  // "requires policy-change approval") is propagated as-is; the rollout row is only updated on success.
  const activation = await activatePolicyVersion(projectId, userId, policyId);
  if ("error" in activation) return activation;

  const updated = await prisma.aiAgentPolicyRollout.update({ where: { policyId }, data: { stage: "PROMOTED", stageChangedAt: new Date(), promotedById: userId, promotedAt: new Date() } });
  await logGovernanceAction(projectId, userId, "ai_agent_governance.policy_promoted", "AiAgentPolicyRollout", updated.id, { policyId });
  await publishAutomationEvent({
    projectId,
    eventKey: "ai_agent_governance.policy_promoted",
    resourceId: updated.id,
    actorId: userId,
    payload: { policyId, version: rollout.policyId },
    idempotencyKey: `ai_agent_governance.policy_promoted:${updated.id}`,
  });
  return { id: updated.id, stage: updated.stage };
}

export async function retireRollout(projectId: string, userId: string, policyId: string) {
  const rollout = await getRollout(projectId, policyId);
  if (!rollout) return { error: "Este borrador todavía no tiene un rollout iniciado." };
  if (rollout.stage === "PROMOTED") return { error: "Un rollout ya promovido no se retira — archiva la política si quieres retirarla." };
  const updated = await prisma.aiAgentPolicyRollout.update({ where: { policyId }, data: { stage: "RETIRED", stageChangedAt: new Date(), retiredById: userId, retiredAt: new Date() } });
  await logGovernanceAction(projectId, userId, "ai_agent_governance.rollout_retired", "AiAgentPolicyRollout", updated.id, { policyId });
  return { id: updated.id, stage: updated.stage };
}

/**
 * Records a SHADOW/LIMITED evaluation outcome (Fase 38 spec section 20) —
 * always increments the cheap running counters; only inserts a detailed,
 * bounded row when the hypothetical decision actually DIFFERS from the real
 * one (spec: "guarda únicamente información limitada y útil").
 */
export async function recordShadowEvaluation(params: {
  rolloutId: string;
  projectId: string;
  agentRef: string;
  mode: string | null;
  activeDecision: string;
  shadowDecision: string;
  activeCode: string;
  shadowCode: string;
  runId?: string | null;
}) {
  const differs = params.activeDecision !== params.shadowDecision || params.activeCode !== params.shadowCode;
  const updated = await prisma.aiAgentPolicyRollout.update({
    where: { id: params.rolloutId },
    data: { shadowEvaluationCount: { increment: 1 }, ...(differs ? { shadowDifferenceCount: { increment: 1 } } : {}) },
    select: { shadowDifferenceCount: true },
  });
  if (!differs) return;

  // Notify at every multiple of 10 differences — a real, meaningful, non-spammy threshold signal (spec section 35: "diferencias significativas"), never one notification per single evaluation.
  if (updated.shadowDifferenceCount > 0 && updated.shadowDifferenceCount % 10 === 0) {
    await notifyShadowRolloutDivergence(params.projectId, updated.shadowDifferenceCount).catch(() => null);
  }

  await prisma.aiAgentPolicyShadowEvaluation.create({
    data: {
      rolloutId: params.rolloutId,
      projectId: params.projectId,
      agentRef: params.agentRef,
      mode: params.mode,
      activeDecision: params.activeDecision as never,
      shadowDecision: params.shadowDecision as never,
      activeCode: params.activeCode,
      shadowCode: params.shadowCode,
      runId: params.runId ?? null,
    },
  });
}

export async function listShadowDifferences(projectId: string, rolloutId: string, limit = 50) {
  const rollout = await prisma.aiAgentPolicyRollout.findUnique({ where: { id: rolloutId } });
  if (!rollout || rollout.projectId !== projectId) return [];
  return prisma.aiAgentPolicyShadowEvaluation.findMany({ where: { rolloutId }, orderBy: { createdAt: "desc" }, take: limit });
}

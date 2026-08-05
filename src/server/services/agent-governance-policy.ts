import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { GOVERNANCE_LIMITS } from "@/lib/agents/governance-limits";
import type { EffectiveLimits } from "@/lib/agents/governance-types";
import type { CreatePolicyVersionInput } from "@/lib/validation/agent-governance";
import { detectPolicyConflicts, hasBlockingConflicts } from "@/lib/agents/governance-conflicts";
import { detectSensitiveChanges, type ComparableLimits } from "@/lib/agents/governance-sensitive-changes";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { logGovernanceAction } from "@/server/services/agent-governance-audit";
import { getApprovedPolicyChangeApproval } from "@/server/services/agent-governance-change-approval";
import { notifyPolicyRollbackCreated } from "@/server/services/agent-governance-notifications";

/**
 * Versioned, project-scoped policy CRUD (Fase 37 spec sections 8-10) —
 * exactly one ACTIVE version per project at a time (enforced by a real
 * Postgres partial unique index added in the migration, never just an
 * application-level check). Activating a new version archives the
 * previous one inside the SAME transaction; nothing here ever edits an
 * existing version's fields once created.
 */

export interface ResolvedPolicy {
  id: string;
  version: number;
  disabledAgentRefs: string[];
  limits: EffectiveLimits;
}

function rowToResolvedPolicy(row: {
  id: string;
  version: number;
  disabledAgentRefs: string[];
  maxRunsPerDay: number | null;
  maxRunsPerMonth: number | null;
  maxConcurrentRunsPerProject: number;
  maxConcurrentRunsPerAgent: number;
  maxRetries: number;
  maxDurationSeconds: number | null;
  maxSteps: number | null;
  maxContextChars: number | null;
  maxOutputChars: number | null;
  maxRiskLevel: EffectiveLimits["maxRiskLevel"];
  requireApprovalAtOrAboveRisk: EffectiveLimits["requireApprovalAtOrAboveRisk"];
  onBudgetExhausted: EffectiveLimits["onBudgetExhausted"];
  unknownAgentBehavior: EffectiveLimits["unknownAgentBehavior"];
}): ResolvedPolicy {
  return {
    id: row.id,
    version: row.version,
    disabledAgentRefs: row.disabledAgentRefs,
    limits: {
      maxRunsPerDay: row.maxRunsPerDay,
      maxRunsPerMonth: row.maxRunsPerMonth,
      maxConcurrentRunsPerProject: row.maxConcurrentRunsPerProject,
      maxConcurrentRunsPerAgent: row.maxConcurrentRunsPerAgent,
      maxRetries: row.maxRetries,
      maxDurationSeconds: row.maxDurationSeconds,
      maxSteps: row.maxSteps,
      maxContextChars: row.maxContextChars,
      maxOutputChars: row.maxOutputChars,
      maxRiskLevel: row.maxRiskLevel,
      requireApprovalAtOrAboveRisk: row.requireApprovalAtOrAboveRisk,
      requireApproval: false,
      onBudgetExhausted: row.onBudgetExhausted,
      unknownAgentBehavior: row.unknownAgentBehavior,
    },
  };
}

export async function getActivePolicy(projectId: string): Promise<ResolvedPolicy | null> {
  const row = await prisma.aiAgentPolicy.findFirst({ where: { projectId, status: "ACTIVE" } });
  return row ? rowToResolvedPolicy(row) : null;
}

/** Resolves ANY policy version by id (draft, active, or archived) — scoped to the project. Used for LIMITED/SHADOW rollout evaluation, comparison, and impact analysis, which all need to read a policy that isn't necessarily the currently active one. */
export async function getPolicyById(projectId: string, policyId: string): Promise<ResolvedPolicy | null> {
  const row = await prisma.aiAgentPolicy.findUnique({ where: { id: policyId } });
  if (!row || row.projectId !== projectId) return null;
  return rowToResolvedPolicy(row);
}

/**
 * Only rules currently within their validity window are matched (Fase 38
 * spec section 25) — a rule outside its `startsAt`/`expiresAt` window is
 * treated as if it didn't exist, never deleted, always visible in history.
 * The engine itself stays unaware of dates; this is the ONE place that
 * filters by "now", checked on every real evaluation (never only by a
 * cron sweep).
 */
export async function getMatchedRules(policyId: string, agentRef: string, mode: string | null, now: Date = new Date()) {
  const rows = await prisma.aiAgentPolicyRule.findMany({
    where: {
      policyId,
      agentRef,
      OR: [{ scope: "AGENT" }, { scope: "MODE", mode: mode ?? "" }],
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
  });
  const agentRule = rows.find((r) => r.scope === "AGENT") ?? null;
  const modeRule = mode ? rows.find((r) => r.scope === "MODE" && r.mode === mode) ?? null : null;
  return {
    agentRule: agentRule ? { enabled: agentRule.enabled, requireApproval: agentRule.requireApproval, riskOverride: agentRule.riskOverride, maxRunsPerDay: agentRule.maxRunsPerDay, maxConcurrent: agentRule.maxConcurrent, maxRetries: agentRule.maxRetries } : null,
    modeRule: modeRule ? { enabled: modeRule.enabled, requireApproval: modeRule.requireApproval, riskOverride: modeRule.riskOverride, maxRunsPerDay: modeRule.maxRunsPerDay, maxConcurrent: modeRule.maxConcurrent, maxRetries: modeRule.maxRetries } : null,
  };
}

export async function listPolicyVersions(projectId: string) {
  return prisma.aiAgentPolicy.findMany({
    where: { projectId },
    include: { createdBy: { select: { id: true, name: true, email: true } }, rules: true },
    orderBy: { version: "desc" },
  });
}

export async function getPolicyVersionDetail(projectId: string, policyId: string) {
  const row = await prisma.aiAgentPolicy.findUnique({ where: { id: policyId }, include: { rules: true, createdBy: { select: { id: true, name: true } } } });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

/** Creates a new DRAFT version (never overwrites an existing one) — the next sequential version number for this project. Blocked by any ERROR-severity conflict (spec section 31); WARNING/INFO never block, only surface. */
export async function createPolicyDraft(projectId: string, userId: string, input: CreatePolicyVersionInput, basedOnPolicyId?: string | null) {
  const conflicts = detectPolicyConflicts({
    maxRiskLevel: input.maxRiskLevel,
    requireApprovalAtOrAboveRisk: input.requireApprovalAtOrAboveRisk ?? null,
    maxRunsPerDay: input.maxRunsPerDay ?? null,
    maxConcurrentRunsPerProject: input.maxConcurrentRunsPerProject,
    disabledAgentRefs: input.disabledAgentRefs,
    rules: input.rules,
  });
  if (hasBlockingConflicts(conflicts)) {
    return { error: "El borrador tiene conflictos que impiden guardarlo.", conflicts };
  }

  const last = await prisma.aiAgentPolicy.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { version: true } });
  const nextVersion = (last?.version ?? 0) + 1;

  // Normalize rule "mode" to "" for AGENT-scope rows (never null) — the real Postgres NULL-distinctness reason baked into the schema's unique constraint.
  const normalizedRules = input.rules.map((r) => ({ ...r, mode: r.scope === "AGENT" ? "" : (r.mode || "").trim() }));
  if (normalizedRules.some((r) => r.scope === "MODE" && !r.mode)) {
    return { error: "Una regla de modo necesita un valor de modo real." };
  }

  const created = await prisma.aiAgentPolicy.create({
    data: {
      projectId,
      version: nextVersion,
      status: "DRAFT",
      createdById: userId,
      comment: input.comment || null,
      maxRiskLevel: input.maxRiskLevel,
      requireApprovalAtOrAboveRisk: input.requireApprovalAtOrAboveRisk ?? null,
      maxRunsPerDay: input.maxRunsPerDay ?? null,
      maxRunsPerMonth: input.maxRunsPerMonth ?? null,
      maxConcurrentRunsPerProject: input.maxConcurrentRunsPerProject,
      maxConcurrentRunsPerAgent: input.maxConcurrentRunsPerAgent,
      maxRetries: input.maxRetries,
      maxDurationSeconds: input.maxDurationSeconds ?? null,
      maxSteps: input.maxSteps ?? null,
      maxContextChars: input.maxContextChars ?? null,
      maxOutputChars: input.maxOutputChars ?? null,
      onBudgetExhausted: input.onBudgetExhausted,
      disabledAgentRefs: input.disabledAgentRefs,
      unknownAgentBehavior: input.unknownAgentBehavior,
      basedOnPolicyId: basedOnPolicyId ?? input.basedOnPolicyId ?? null,
      rules: {
        create: normalizedRules.map((r) => ({
          scope: r.scope,
          agentRef: r.agentRef,
          mode: r.mode,
          enabled: r.enabled ?? null,
          riskOverride: r.riskOverride ?? null,
          requireApproval: r.requireApproval ?? null,
          maxRunsPerDay: r.maxRunsPerDay ?? null,
          maxConcurrent: r.maxConcurrent ?? null,
          maxRetries: r.maxRetries ?? null,
          startsAt: r.startsAt ? new Date(r.startsAt) : null,
          expiresAt: r.expiresAt ? new Date(r.expiresAt) : null,
        })),
      },
    },
  });

  await logGovernanceAction(projectId, userId, "ai_agent_policy.created", "AiAgentPolicy", created.id, { version: nextVersion });
  await publishAutomationEvent({
    projectId,
    eventKey: "ai_agent_governance.policy_created",
    resourceId: created.id,
    actorId: userId,
    payload: { id: created.id, version: nextVersion },
    idempotencyKey: `ai_agent_governance.policy_created:${created.id}`,
  });

  return { id: created.id, version: nextVersion, conflicts };
}

/**
 * "Restaurar" a historical version (Fase 38 spec section 22) — ALWAYS
 * creates a brand-new DRAFT cloned from the source's fields/rules, tagged
 * via `basedOnPolicyId`. Never mutates or reactivates the source version's
 * own historical record.
 */
export async function restorePolicyVersion(projectId: string, userId: string, sourcePolicyId: string) {
  const source = await prisma.aiAgentPolicy.findUnique({ where: { id: sourcePolicyId }, include: { rules: true } });
  if (!source || source.projectId !== projectId) return { error: "Versión de origen no encontrada." };

  const input: CreatePolicyVersionInput = {
    comment: `Restaurada desde la versión ${source.version}.`,
    maxRiskLevel: source.maxRiskLevel,
    requireApprovalAtOrAboveRisk: source.requireApprovalAtOrAboveRisk,
    maxRunsPerDay: source.maxRunsPerDay,
    maxRunsPerMonth: source.maxRunsPerMonth,
    maxConcurrentRunsPerProject: source.maxConcurrentRunsPerProject,
    maxConcurrentRunsPerAgent: source.maxConcurrentRunsPerAgent,
    maxRetries: source.maxRetries,
    maxDurationSeconds: source.maxDurationSeconds,
    maxSteps: source.maxSteps,
    maxContextChars: source.maxContextChars,
    maxOutputChars: source.maxOutputChars,
    onBudgetExhausted: source.onBudgetExhausted,
    disabledAgentRefs: source.disabledAgentRefs,
    unknownAgentBehavior: source.unknownAgentBehavior,
    basedOnPolicyId: source.id,
    rules: source.rules.map((r) => ({
      scope: r.scope,
      agentRef: r.agentRef,
      mode: r.mode || undefined,
      enabled: r.enabled,
      riskOverride: r.riskOverride,
      requireApproval: r.requireApproval,
      maxRunsPerDay: r.maxRunsPerDay,
      maxConcurrent: r.maxConcurrent,
      maxRetries: r.maxRetries,
      startsAt: r.startsAt ? r.startsAt.toISOString() : null,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    })),
  };

  const result = await createPolicyDraft(projectId, userId, input, source.id);
  if ("error" in result) return result;

  await logGovernanceAction(projectId, userId, "ai_agent_governance.policy_restored", "AiAgentPolicy", result.id, { sourcePolicyId, sourceVersion: source.version });
  await publishAutomationEvent({
    projectId,
    eventKey: "ai_agent_governance.policy_rollback_created",
    resourceId: result.id,
    actorId: userId,
    payload: { policyId: result.id, sourcePolicyId },
    idempotencyKey: `ai_agent_governance.policy_rollback_created:${result.id}`,
  });
  await notifyPolicyRollbackCreated(projectId, userId, source.version);
  return result;
}

function toComparableLimits(row: {
  maxRiskLevel: EffectiveLimits["maxRiskLevel"];
  requireApprovalAtOrAboveRisk: EffectiveLimits["requireApprovalAtOrAboveRisk"];
  maxRunsPerDay: number | null;
  maxRunsPerMonth: number | null;
  maxConcurrentRunsPerProject: number;
  maxConcurrentRunsPerAgent: number;
  unknownAgentBehavior: EffectiveLimits["unknownAgentBehavior"];
  onBudgetExhausted: EffectiveLimits["onBudgetExhausted"];
  disabledAgentRefs: string[];
}): ComparableLimits {
  return {
    maxRiskLevel: row.maxRiskLevel,
    requireApprovalAtOrAboveRisk: row.requireApprovalAtOrAboveRisk,
    maxRunsPerDay: row.maxRunsPerDay,
    maxRunsPerMonth: row.maxRunsPerMonth,
    maxConcurrentRunsPerProject: row.maxConcurrentRunsPerProject,
    maxConcurrentRunsPerAgent: row.maxConcurrentRunsPerAgent,
    unknownAgentBehavior: row.unknownAgentBehavior,
    onBudgetExhausted: row.onBudgetExhausted,
    disabledAgentRefs: row.disabledAgentRefs,
  };
}

/**
 * Activates a DRAFT version — archives whatever was previously ACTIVE in the
 * SAME transaction, and relies on the migration's partial unique index as
 * the final, race-proof guarantee (spec section 34). Fase 38: when the
 * draft contains a SENSITIVE change relative to the currently active
 * policy (spec section 23), activation is blocked until a real, human
 * `AiAgentPolicyChangeApproval` for this exact policyId is APPROVED —
 * `requestPolicyChangeApprovalAction` starts that flow.
 */
export async function activatePolicyVersion(projectId: string, userId: string, policyId: string) {
  const target = await prisma.aiAgentPolicy.findUnique({ where: { id: policyId } });
  if (!target || target.projectId !== projectId) return { error: "Política no encontrada." };
  if (target.status === "ACTIVE") return { id: target.id };
  if (target.status === "ARCHIVED") return { error: "No se puede reactivar una versión archivada — crea una nueva versión." };

  const currentlyActive = await prisma.aiAgentPolicy.findFirst({ where: { projectId, status: "ACTIVE" } });
  const sensitiveChanges = detectSensitiveChanges(currentlyActive ? toComparableLimits(currentlyActive) : null, toComparableLimits(target));
  if (sensitiveChanges.length > 0) {
    const approved = await getApprovedPolicyChangeApproval(projectId, policyId);
    if (!approved) {
      return { error: "Este cambio incluye modificaciones sensibles y requiere aprobación humana antes de activarse.", sensitiveChanges, requiresChangeApproval: true };
    }
  }

  try {
    await prisma.$transaction([
      prisma.aiAgentPolicy.updateMany({ where: { projectId, status: "ACTIVE" }, data: { status: "ARCHIVED", archivedAt: new Date() } }),
      prisma.aiAgentPolicy.update({ where: { id: policyId }, data: { status: "ACTIVE", activatedAt: new Date() } }),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Otra versión ya fue activada simultáneamente — vuelve a intentarlo." };
    }
    throw err;
  }

  await logGovernanceAction(projectId, userId, "ai_agent_policy.activated", "AiAgentPolicy", policyId, { version: target.version });
  await publishAutomationEvent({
    projectId,
    eventKey: "ai_agent_governance.policy_activated",
    resourceId: policyId,
    actorId: userId,
    payload: { id: policyId, version: target.version },
    idempotencyKey: `ai_agent_governance.policy_activated:${policyId}`,
  });
  return { id: policyId };
}

export async function archivePolicyVersion(projectId: string, userId: string, policyId: string) {
  const target = await prisma.aiAgentPolicy.findUnique({ where: { id: policyId } });
  if (!target || target.projectId !== projectId) return { error: "Política no encontrada." };
  await prisma.aiAgentPolicy.update({ where: { id: policyId }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  await logGovernanceAction(projectId, userId, "ai_agent_policy.archived", "AiAgentPolicy", policyId, { version: target.version });
  return { id: policyId };
}

export const DEFAULT_POLICY_LIMITS: EffectiveLimits = {
  maxRunsPerDay: null,
  maxRunsPerMonth: null,
  maxConcurrentRunsPerProject: GOVERNANCE_LIMITS.MAX_CONCURRENT_RUNS_PER_PROJECT >= 5 ? 5 : GOVERNANCE_LIMITS.MAX_CONCURRENT_RUNS_PER_PROJECT,
  maxConcurrentRunsPerAgent: 2,
  maxRetries: 3,
  maxDurationSeconds: null,
  maxSteps: null,
  maxContextChars: null,
  maxOutputChars: null,
  maxRiskLevel: "DRAFT_WRITE",
  requireApprovalAtOrAboveRisk: null,
  requireApproval: false,
  onBudgetExhausted: "DENY",
  unknownAgentBehavior: "ALLOW_DEFAULT",
};

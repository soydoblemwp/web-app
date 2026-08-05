import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { GovernanceRiskLevelValue } from "@/lib/agents/governance-types";
import { GOVERNANCE_LIMITS } from "@/lib/agents/governance-limits";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { logGovernanceAction } from "@/server/services/agent-governance-audit";
import { notifyGovernanceApprovalPending } from "@/server/services/agent-governance-notifications";

/**
 * Real, human-only pre-run approval requests (Fase 37 spec section 12) —
 * distinct from the pre-existing `AiAgentApproval` model (a Fase-31,
 * per-step gate inside an already-running multi-agent team chain). This
 * model gates whether a RUN is even created/started at all. Nothing here
 * ever auto-approves — `decideGovernanceApproval` always requires a real
 * `decidedById` (a human actor resolved by the caller's own session), never
 * called from a cron job, automation, or AI Workflow node.
 */

export interface CreateApprovalInput {
  projectId: string;
  requestedById: string;
  agentRef: string;
  mode: string | null;
  riskLevel: GovernanceRiskLevelValue;
  sanitizedInput: unknown;
  reason: string;
  policyId: string;
  policyVersion: number;
  idempotencyKey: string;
  expiresInHours?: number;
}

export async function createApprovalRequest(input: CreateApprovalInput) {
  const existing = await prisma.aiAgentGovernanceApproval.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  const hours = input.expiresInHours ?? GOVERNANCE_LIMITS.DEFAULT_APPROVAL_EXPIRY_HOURS;
  const expiresAt = new Date(Date.now() + Math.min(hours, GOVERNANCE_LIMITS.MAX_APPROVAL_EXPIRY_HOURS) * 60 * 60 * 1000);

  const serializedInput = JSON.stringify(input.sanitizedInput ?? {});
  const boundedInput = serializedInput.length > GOVERNANCE_LIMITS.MAX_SANITIZED_INPUT_BYTES ? JSON.parse(serializedInput.slice(0, GOVERNANCE_LIMITS.MAX_SANITIZED_INPUT_BYTES)) : (input.sanitizedInput ?? {});

  let created;
  try {
    created = await prisma.aiAgentGovernanceApproval.create({
      data: {
        projectId: input.projectId,
        requestedById: input.requestedById,
        agentRef: input.agentRef,
        mode: input.mode,
        riskLevel: input.riskLevel,
        sanitizedInput: boundedInput as Prisma.InputJsonValue,
        reason: input.reason.slice(0, 4000),
        policyId: input.policyId,
        policyVersion: input.policyVersion,
        status: "PENDING",
        expiresAt,
        idempotencyKey: input.idempotencyKey,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.aiAgentGovernanceApproval.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (raced) return raced;
    }
    throw err;
  }

  await logGovernanceAction(input.projectId, input.requestedById, "ai_agent_governance.approval_requested", "AiAgentGovernanceApproval", created.id, { agentRef: input.agentRef, riskLevel: input.riskLevel });
  await publishAutomationEvent({
    projectId: input.projectId,
    eventKey: "ai_agent_governance.approval_requested",
    resourceId: created.id,
    actorId: input.requestedById,
    payload: { id: created.id, agentRef: input.agentRef, riskLevel: input.riskLevel },
    idempotencyKey: `ai_agent_governance.approval_requested:${created.id}`,
  });
  await notifyGovernanceApprovalPending(input.projectId, created.id, input.agentRef);

  return created;
}

export async function getApproval(projectId: string, approvalId: string) {
  const row = await prisma.aiAgentGovernanceApproval.findUnique({ where: { id: approvalId } });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

/** Human decision — atomic (conditioned updateMany) so two concurrent approvers can never both "win" the same PENDING request. */
export async function decideGovernanceApproval(projectId: string, approvalId: string, decidedById: string, decision: "APPROVED" | "REJECTED", comment?: string) {
  const target = await prisma.aiAgentGovernanceApproval.findUnique({ where: { id: approvalId } });
  if (!target || target.projectId !== projectId) return { error: "Solicitud de aprobación no encontrada." };
  if (target.status !== "PENDING") return { error: `Esta solicitud ya está en estado ${target.status}.` };
  if (target.expiresAt && target.expiresAt.getTime() < Date.now()) {
    await prisma.aiAgentGovernanceApproval.updateMany({ where: { id: approvalId, status: "PENDING" }, data: { status: "EXPIRED" } });
    return { error: "Esta solicitud ya expiró." };
  }

  const claim = await prisma.aiAgentGovernanceApproval.updateMany({
    where: { id: approvalId, status: "PENDING" },
    data: { status: decision, decidedById, decidedAt: new Date(), decisionComment: comment ?? null },
  });
  if (claim.count === 0) return { error: "Otra persona ya decidió esta solicitud." };

  await logGovernanceAction(projectId, decidedById, decision === "APPROVED" ? "ai_agent_governance.approval_approved" : "ai_agent_governance.approval_rejected", "AiAgentGovernanceApproval", approvalId, { comment });
  await publishAutomationEvent({
    projectId,
    eventKey: decision === "APPROVED" ? "ai_agent_governance.approval_approved" : "ai_agent_governance.approval_rejected",
    resourceId: approvalId,
    actorId: decidedById,
    payload: { id: approvalId, agentRef: target.agentRef },
    idempotencyKey: `ai_agent_governance.approval_decided:${approvalId}`,
  });

  return { id: approvalId, status: decision };
}

export async function cancelApprovalRequest(projectId: string, requestedById: string, approvalId: string) {
  const target = await prisma.aiAgentGovernanceApproval.findUnique({ where: { id: approvalId } });
  if (!target || target.projectId !== projectId) return { error: "Solicitud no encontrada." };
  if (target.requestedById !== requestedById) return { error: "Solo quien solicitó la aprobación puede cancelarla." };
  if (target.status !== "PENDING") return { error: `No se puede cancelar una solicitud en estado ${target.status}.` };
  const claim = await prisma.aiAgentGovernanceApproval.updateMany({ where: { id: approvalId, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (claim.count === 0) return { error: "Esta solicitud ya no está pendiente." };
  await logGovernanceAction(projectId, requestedById, "ai_agent_governance.approval_cancelled", "AiAgentGovernanceApproval", approvalId);
  return { id: approvalId, status: "CANCELLED" as const };
}

/** Marks past-due PENDING approvals as EXPIRED — safe to call repeatedly (conditioned updateMany, idempotent). Intended for a cron sweep alongside the existing automation cron. */
export async function expireStaleApprovals(now: Date = new Date()) {
  const result = await prisma.aiAgentGovernanceApproval.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

/** Returns a valid (PENDING-turned-APPROVED, unexpired, not yet consumed) approval matching this exact agent/mode — the ONLY way `preApprovedRequestId` should ever be set before calling the pure engine. */
export async function findValidApprovalForRun(projectId: string, agentRef: string, mode: string | null, requestedById: string) {
  return prisma.aiAgentGovernanceApproval.findFirst({
    where: {
      projectId,
      agentRef,
      mode: mode ?? undefined,
      requestedById,
      status: "APPROVED",
      createdRunId: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { decidedAt: "desc" },
  });
}

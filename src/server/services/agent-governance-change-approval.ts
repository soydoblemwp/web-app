import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { SensitiveChangeEntry } from "@/lib/agents/governance-sensitive-changes";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { logGovernanceAction } from "@/server/services/agent-governance-audit";
import { managersAndOwner, notifyPolicyChangeApprovalPending } from "@/server/services/agent-governance-notifications";

/**
 * Human approval for a SENSITIVE policy activation (Fase 38 spec sections
 * 23-24) — distinct from `AiAgentGovernanceApproval` (gates a RUN) and the
 * Fase-31 `AiAgentApproval` (gates a step). Real separation of duties when
 * the project has more than one MANAGER/OWNER: the requester cannot also
 * decide their own request. When a project genuinely has only one
 * MANAGER/OWNER, that same person MAY decide it — this is a documented,
 * honest limitation (spec section 24: "no simules una separación que los
 * datos reales no soportan"), never silently bypassed: the decision is
 * still fully audited and the approval record still exists.
 */

export async function canEnforceSeparationOfDuties(projectId: string): Promise<boolean> {
  const approvers = await managersAndOwner(projectId);
  return approvers.length > 1;
}

export async function requestPolicyChangeApproval(projectId: string, policyId: string, requestedById: string, reason: string, sensitiveChanges: SensitiveChangeEntry[]) {
  const idempotencyKey = `policy-change-approval:${policyId}`;
  const existing = await prisma.aiAgentPolicyChangeApproval.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  let created;
  try {
    created = await prisma.aiAgentPolicyChangeApproval.create({
      data: {
        projectId,
        policyId,
        requestedById,
        sensitiveChanges: sensitiveChanges as unknown as Prisma.InputJsonValue,
        reason: reason.slice(0, 2000),
        status: "PENDING",
        idempotencyKey,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await prisma.aiAgentPolicyChangeApproval.findUnique({ where: { idempotencyKey } });
      if (raced) return raced;
    }
    throw err;
  }

  await logGovernanceAction(projectId, requestedById, "ai_agent_governance.policy_change_approval_requested", "AiAgentPolicyChangeApproval", created.id, { policyId });
  await publishAutomationEvent({
    projectId,
    eventKey: "ai_agent_governance.policy_promotion_requested",
    resourceId: created.id,
    actorId: requestedById,
    payload: { id: created.id, policyId },
    idempotencyKey: `ai_agent_governance.policy_promotion_requested:${created.id}`,
  });
  await notifyPolicyChangeApprovalPending(projectId, requestedById);

  return created;
}

export async function getPendingPolicyChangeApproval(projectId: string, policyId: string) {
  return prisma.aiAgentPolicyChangeApproval.findFirst({ where: { projectId, policyId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
}

export async function getApprovedPolicyChangeApproval(projectId: string, policyId: string) {
  return prisma.aiAgentPolicyChangeApproval.findFirst({ where: { projectId, policyId, status: "APPROVED" }, orderBy: { decidedAt: "desc" } });
}

export async function decidePolicyChangeApproval(projectId: string, approvalId: string, decidedById: string, decision: "APPROVED" | "REJECTED", comment?: string) {
  const target = await prisma.aiAgentPolicyChangeApproval.findUnique({ where: { id: approvalId } });
  if (!target || target.projectId !== projectId) return { error: "Solicitud no encontrada." };
  if (target.status !== "PENDING") return { error: `Esta solicitud ya está en estado ${target.status}.` };

  const separationEnforced = await canEnforceSeparationOfDuties(projectId);
  if (separationEnforced && target.requestedById === decidedById) {
    return { error: "Otra persona con rol MANAGER debe decidir esta solicitud — quien la solicitó no puede aprobarla en un proyecto con más de un MANAGER." };
  }

  const claim = await prisma.aiAgentPolicyChangeApproval.updateMany({
    where: { id: approvalId, status: "PENDING" },
    data: { status: decision, decidedById, decidedAt: new Date(), decisionComment: comment ?? null },
  });
  if (claim.count === 0) return { error: "Otra persona ya decidió esta solicitud." };

  await logGovernanceAction(projectId, decidedById, decision === "APPROVED" ? "ai_agent_governance.policy_change_approved" : "ai_agent_governance.policy_change_rejected", "AiAgentPolicyChangeApproval", approvalId, {
    comment,
    selfApproved: !separationEnforced,
  });

  return { id: approvalId, status: decision, selfApproved: !separationEnforced };
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import { automationError, type WorkflowAutomationActionError } from "@/lib/automations/types";
import { startAutomationRun } from "@/server/services/automation-workflow-bridge";
import { cancelWorkflowRunCore } from "@/server/actions/workflow-execution";

export type DecideApprovalResult = WorkflowAutomationActionError | Record<string, never>;

async function getOwnedApproval(projectId: string, approvalId: string) {
  const approval = await prisma.workflowAutomationApproval.findUnique({
    where: { id: approvalId },
    include: { run: { include: { automation: true } } },
  });
  if (!approval || approval.run.projectId !== projectId) return null;
  return approval;
}

export async function listPendingApprovals(projectId: string) {
  return prisma.workflowAutomationApproval.findMany({
    where: { status: "PENDING", run: { projectId } },
    include: { run: { include: { automation: { select: { id: true, name: true } }, workflow: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Decides a pending approval (spec section 20) — approve resumes the SAME
 * run through the real bridge (never a shortcut), reject/changes-requested
 * end the run honestly, never silently pretend success. A user can never
 * approve their own automation's gate on someone else's behalf — the
 * caller (thin action) already resolved `decidedById` from the real
 * session before calling here.
 */
export async function decideApproval(projectId: string, approvalId: string, decidedById: string, decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED", comment?: string): Promise<DecideApprovalResult> {
  const approval = await getOwnedApproval(projectId, approvalId);
  if (!approval) return automationError("AUTOMATION_NOT_FOUND", "No se encontró la aprobación indicada.");
  if (approval.status !== "PENDING") return automationError("LOCK_CONFLICT", "Esta aprobación ya fue decidida.");

  const claim = await prisma.workflowAutomationApproval.updateMany({
    where: { id: approvalId, status: "PENDING" },
    data: { status: decision, decidedById, decidedAt: new Date(), comment: comment ?? null },
  });
  if (claim.count === 0) return automationError("LOCK_CONFLICT", "Esta aprobación ya fue decidida.");

  if (decision === "APPROVED") {
    if (approval.run.status === "WAITING_FOR_APPROVAL") {
      await prisma.workflowAutomationRun.update({ where: { id: approval.runId }, data: { status: "QUEUED" } });
      await startAutomationRun(approval.runId);
    } else {
      const wait = await prisma.workflowAutomationWait.findFirst({ where: { runId: approval.runId, kind: "APPROVAL", status: "PENDING" } });
      if (wait) {
        await prisma.workflowAutomationWait.update({ where: { id: wait.id }, data: { status: "SATISFIED" } });
        const { advanceAutomationRun } = await import("@/server/services/automation-workflow-bridge");
        await advanceAutomationRun(approval.runId);
      }
    }
  } else {
    if (approval.run.workflowRunId) {
      const actingUserId = approval.run.createdById ?? approval.run.automation.createdById;
      await cancelWorkflowRunCore(actingUserId, projectId, approval.run.workflowRunId).catch(() => undefined);
    }
    await prisma.workflowAutomationWait.updateMany({ where: { runId: approval.runId, status: "PENDING" }, data: { status: "CANCELLED" } });
    await prisma.workflowAutomationRun.update({
      where: { id: approval.runId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        lastErrorMessage: decision === "REJECTED" ? "La aprobación fue rechazada." : "Se solicitaron cambios y la ejecución no continuó automáticamente.",
        lastErrorCategory: "APPROVAL_REJECTED",
      },
    });
  }

  return {};
}

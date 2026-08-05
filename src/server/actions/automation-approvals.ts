"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { decideApprovalSchema } from "@/lib/validation/automations";
import { listPendingApprovals, decideApproval } from "@/server/services/automation-approvals";
import type { WorkflowAutomationErrorCode } from "@/lib/automations/types";

export async function listPendingApprovalsAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listPendingApprovals(projectId);
}

export async function decideApprovalAction(projectId: string, input: unknown): Promise<{ errorCode?: WorkflowAutomationErrorCode; errorMessage?: string }> {
  const parsed = decideApprovalSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await decideApproval(projectId, parsed.data.approvalId, user.id, parsed.data.decision, parsed.data.comment || undefined);
  revalidatePath(`/dashboard/${projectId}/automations`);
  return "error" in result ? { errorCode: result.code, errorMessage: result.error } : {};
}

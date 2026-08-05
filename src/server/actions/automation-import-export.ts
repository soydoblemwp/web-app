"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { createAutomationSchema } from "@/lib/validation/automations";
import { exportAutomation, importAutomation, type AutomationExport } from "@/server/services/automation-catalog";
import type { WorkflowAutomationErrorCode } from "@/lib/automations/types";

export async function exportAutomationAction(projectId: string, automationId: string): Promise<AutomationExport | null> {
  await requireProjectAccess(projectId, "VIEWER");
  return exportAutomation(projectId, automationId);
}

const importSchema = createAutomationSchema.omit({ workflowId: true });

export interface ImportAutomationResult {
  id?: string;
  errorCode?: WorkflowAutomationErrorCode;
  errorMessage?: string;
}

/** Import always requires the target workflow to be chosen explicitly in this project — an exported file never carries a workflowId (it's an internal, project-scoped ID). Lands DRAFT; never auto-executes. */
export async function importAutomationAction(projectId: string, workflowId: string, data: unknown): Promise<ImportAutomationResult> {
  const parsed = importSchema.safeParse(data);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "El archivo importado no es válido." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await importAutomation(projectId, user.id, workflowId, { ...parsed.data, workflowId });
  if (!result.errorCode) revalidatePath(`/dashboard/${projectId}/automations`);
  return result;
}

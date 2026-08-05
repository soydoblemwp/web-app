"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { skipNextOccurrence, rescheduleNextOccurrence, runAutomationNow } from "@/server/services/automation-catalog";
import type { WorkflowAutomationErrorCode } from "@/lib/automations/types";

export interface ScheduleActionResult {
  errorCode?: WorkflowAutomationErrorCode;
  errorMessage?: string;
}

export async function skipNextOccurrenceAction(projectId: string, automationId: string): Promise<ScheduleActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await skipNextOccurrence(projectId, automationId, user.id);
  revalidatePath(`/dashboard/${projectId}/automations/${automationId}`);
  return "error" in result ? { errorCode: result.code, errorMessage: result.error } : {};
}

export async function rescheduleNextOccurrenceAction(projectId: string, automationId: string, newDateIso: string): Promise<ScheduleActionResult> {
  const newDate = new Date(newDateIso);
  if (Number.isNaN(newDate.getTime())) return { errorMessage: "Fecha no válida." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await rescheduleNextOccurrence(projectId, automationId, user.id, newDate);
  revalidatePath(`/dashboard/${projectId}/automations/${automationId}`);
  return "error" in result ? { errorCode: result.code, errorMessage: result.error } : {};
}

export async function runAutomationNowAction(projectId: string, automationId: string): Promise<{ runId?: string; blocked?: boolean; reason?: string; errorCode?: WorkflowAutomationErrorCode; errorMessage?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await runAutomationNow(projectId, automationId, user.id);
  revalidatePath(`/dashboard/${projectId}/automations/${automationId}`);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  return result;
}

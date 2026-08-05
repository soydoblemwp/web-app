"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { manualTriggerSchema } from "@/lib/validation/automations";
import { listAutomationRuns, getAutomationRunDetail, cancelAutomationRunOwned, listUpcomingOccurrences, type RunListFilters } from "@/server/services/automation-catalog";
import { activateAutomation } from "@/server/services/automation-orchestrator";
import { prisma } from "@/lib/db/prisma";
import type { WorkflowAutomationErrorCode } from "@/lib/automations/types";

export async function listAutomationRunsAction(projectId: string, filters: RunListFilters = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return listAutomationRuns(projectId, filters);
}

export async function getAutomationRunDetailAction(projectId: string, runId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getAutomationRunDetail(projectId, runId);
}

export async function listUpcomingOccurrencesAction(projectId: string, windowDays?: number) {
  await requireProjectAccess(projectId, "VIEWER");
  return listUpcomingOccurrences(projectId, windowDays);
}

export async function cancelAutomationRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await cancelAutomationRunOwned(projectId, runId);
  if ("error" in result) return { error: result.error };
  revalidatePath(`/dashboard/${projectId}/automations/runs/${runId}`);
  return {};
}

export interface ManualTriggerResult {
  runId?: string;
  blocked?: boolean;
  reason?: string;
  errorCode?: WorkflowAutomationErrorCode;
  errorMessage?: string;
}

/**
 * Manual execution (spec section 5) — funnels through the exact same
 * `activateAutomation` every scheduled/event/webhook trigger uses. No
 * simplified alternate path: it creates a real, persisted
 * WorkflowAutomationRun, subject to the same idempotency/loop/approval
 * rules as anything else.
 */
export async function triggerAutomationManuallyAction(projectId: string, input: unknown): Promise<ManualTriggerResult> {
  const parsed = manualTriggerSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const automation = await prisma.workflowAutomation.findUnique({ where: { id: parsed.data.automationId }, include: { trigger: true } });
  if (!automation || automation.projectId !== projectId) return { errorCode: "AUTOMATION_NOT_FOUND", errorMessage: "No se encontró la automatización indicada." };
  if (automation.status === "ARCHIVED") return { errorCode: "AUTOMATION_INACTIVE", errorMessage: "Esta automatización está archivada." };

  const activation = await activateAutomation({
    automation,
    triggerType: "MANUAL",
    triggerSnapshot: { manual: true, triggeredBy: user.id },
    staticInputs: parsed.data.inputs ?? {},
    idempotencyKey: parsed.data.idempotencyKey,
    createdById: user.id,
  });

  revalidatePath(`/dashboard/${projectId}/automations/${automation.id}`);
  if (activation.blocked) return { blocked: true, reason: activation.reason };
  return { runId: activation.runId };
}

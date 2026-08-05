"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { createAutomationSchema, updateAutomationSchema } from "@/lib/validation/automations";
import {
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  setAutomationStatus,
  deleteAutomation,
  duplicateAutomation,
  rotateWebhookSecret,
  updateWorkflowPin,
  listAutomationsForWorkflow,
} from "@/server/services/automation-catalog";
import type { WorkflowAutomationErrorCode } from "@/lib/automations/types";

export interface AutomationActionResult {
  id?: string;
  errorCode?: WorkflowAutomationErrorCode;
  errorMessage?: string;
}

export async function listAutomationsAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listAutomations(projectId);
}

export async function getAutomationAction(projectId: string, automationId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getAutomation(projectId, automationId);
}

export async function createAutomationAction(projectId: string, input: unknown): Promise<AutomationActionResult> {
  const parsed = createAutomationSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createAutomation(projectId, user.id, parsed.data);
  if (!result.errorCode) revalidatePath(`/dashboard/${projectId}/automations`);
  return result;
}

export async function updateAutomationAction(projectId: string, automationId: string, input: unknown): Promise<AutomationActionResult> {
  const parsed = updateAutomationSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await requireProjectAccess(projectId, "EDITOR");
  const result = await updateAutomation(projectId, automationId, parsed.data);
  if (!result.errorCode) {
    revalidatePath(`/dashboard/${projectId}/automations`);
    revalidatePath(`/dashboard/${projectId}/automations/${automationId}`);
  }
  return result;
}

async function changeStatus(projectId: string, automationId: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED", reason?: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await setAutomationStatus(projectId, automationId, status, reason);
  revalidatePath(`/dashboard/${projectId}/automations`);
  revalidatePath(`/dashboard/${projectId}/automations/${automationId}`);
  return "error" in result ? { errorCode: result.code, errorMessage: result.error } : {};
}

export async function activateAutomationAction(projectId: string, automationId: string): Promise<AutomationActionResult> {
  return changeStatus(projectId, automationId, "ACTIVE");
}

export async function pauseAutomationAction(projectId: string, automationId: string, reason?: string): Promise<AutomationActionResult> {
  return changeStatus(projectId, automationId, "PAUSED", reason);
}

export async function archiveAutomationAction(projectId: string, automationId: string): Promise<AutomationActionResult> {
  return changeStatus(projectId, automationId, "ARCHIVED");
}

export async function deleteAutomationAction(projectId: string, automationId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const ok = await deleteAutomation(projectId, automationId);
  if (!ok) return { error: "No se encontró la automatización." };
  revalidatePath(`/dashboard/${projectId}/automations`);
  return {};
}

export async function duplicateAutomationAction(projectId: string, automationId: string): Promise<AutomationActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await duplicateAutomation(projectId, user.id, automationId);
  if (!result.errorCode) revalidatePath(`/dashboard/${projectId}/automations`);
  return result;
}

/** Returns the new secret in plaintext exactly once — never persisted, never re-readable afterward (spec section 12). */
export async function rotateWebhookSecretAction(projectId: string, automationId: string): Promise<{ secret?: string; error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const secret = await rotateWebhookSecret(projectId, automationId);
  if (!secret) return { error: "Esta automatización no tiene un webhook configurado." };
  return { secret };
}

export async function updateWorkflowPinAction(projectId: string, automationId: string, pinnedWorkflowRevisionId: string | null): Promise<AutomationActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await updateWorkflowPin(projectId, automationId, pinnedWorkflowRevisionId);
  return "error" in result ? { errorCode: result.code, errorMessage: result.error } : {};
}

/** Used by the AI Workflows editor (spec section 41) to show "N automatizaciones usan este workflow" and warn before archiving. */
export async function listAutomationsForWorkflowAction(projectId: string, workflowId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listAutomationsForWorkflow(projectId, workflowId);
}

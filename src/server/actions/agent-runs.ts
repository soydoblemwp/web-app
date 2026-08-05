"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { createAgentRunSchema, updateAgentRunInputSchema } from "@/lib/validation/agents";
import {
  createDraftRun,
  updateRunInput,
  confirmRun,
  startRun,
  cancelRun,
  resumeRun,
  retryFailedStep,
  duplicateRun,
  archiveRun,
} from "@/server/services/agent-orchestrator";

export async function createAgentRunAction(projectId: string, input: unknown): Promise<{ error?: string; id?: string }> {
  const parsed = createAgentRunSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  if (!parsed.data.officialAgentKey && !parsed.data.customAgentId && !parsed.data.teamId) {
    return { error: "Selecciona un agente o un equipo." };
  }
  const user = await requireProjectAccess(projectId, "EDITOR");
  return createDraftRun(projectId, user.id, parsed.data.idempotencyKey, parsed.data);
}

export async function updateAgentRunInputAction(projectId: string, runId: string, input: unknown): Promise<{ error?: string }> {
  const parsed = updateAgentRunInputSchema.safeParse(input);
  if (!parsed.success) return { error: "No se pudo guardar la entrada." };
  await requireProjectAccess(projectId, "EDITOR");
  return updateRunInput(projectId, runId, parsed.data.values, parsed.data.context ?? {});
}

export async function confirmAgentRunAction(projectId: string, runId: string): Promise<{ error?: string; requiresApproval?: boolean }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return confirmRun(projectId, runId, user.id);
}

export async function startAgentRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return startRun(projectId, runId, user.id);
}

export async function cancelAgentRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return cancelRun(projectId, runId);
}

export async function resumeAgentRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return resumeRun(projectId, runId, user.id);
}

export async function retryAgentRunStepAction(projectId: string, runId: string, stepOrder: number): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return retryFailedStep(projectId, runId, user.id, stepOrder);
}

export async function duplicateAgentRunAction(projectId: string, runId: string): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return duplicateRun(projectId, user.id, runId);
}

export async function archiveAgentRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return archiveRun(projectId, runId);
}

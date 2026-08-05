"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { marketingBrainBriefingSchema, marketingBrainStagesConfigSchema, createMarketingBrainRunSchema } from "@/lib/validation/marketing-brain";
import type { StagesConfig } from "@/lib/marketing-brain/types";
import {
  createDraftRun,
  updateRunBriefing,
  updateRunStagesConfig,
  computePlanPreview,
  confirmRunPlan,
  startRun,
  cancelRun,
  resumeRun,
  retryFailedStep,
  retryFailedItem,
  duplicateRun,
  archiveRun,
} from "@/server/services/marketing-brain-orchestrator";
import { prisma } from "@/lib/db/prisma";
import type { MarketingBrainStepKey } from "@/generated/prisma/enums";

export async function createMarketingBrainRunAction(projectId: string, input: unknown): Promise<{ error?: string; id?: string }> {
  const parsed = createMarketingBrainRunSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos." };
  const user = await requireProjectAccess(projectId, "EDITOR");
  return createDraftRun(projectId, user.id, parsed.data.idempotencyKey);
}

export async function updateMarketingBrainBriefingAction(projectId: string, runId: string, patch: unknown): Promise<{ error?: string }> {
  const parsed = marketingBrainBriefingSchema.partial().safeParse(patch);
  if (!parsed.success) return { error: "No se pudo guardar el briefing." };
  const user = await requireProjectAccess(projectId, "EDITOR");
  return updateRunBriefing(projectId, runId, user.id, parsed.data);
}

export async function updateMarketingBrainStagesConfigAction(projectId: string, runId: string, config: unknown): Promise<{ error?: string }> {
  const parsed = marketingBrainStagesConfigSchema.safeParse(config);
  if (!parsed.success) return { error: "Configuración de etapas no válida." };
  const user = await requireProjectAccess(projectId, "EDITOR");
  return updateRunStagesConfig(projectId, runId, user.id, parsed.data as unknown as StagesConfig);
}

export async function previewMarketingBrainPlanAction(projectId: string, runId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const run = await prisma.marketingBrainRun.findUnique({ where: { id: runId } });
  if (!run || run.projectId !== projectId) return null;
  return computePlanPreview(run);
}

export async function confirmMarketingBrainPlanAction(projectId: string, runId: string): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await confirmRunPlan(projectId, runId, user.id);
  return "error" in result && result.error ? { error: result.error } : {};
}

export async function startMarketingBrainRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return startRun(projectId, runId);
}

export async function cancelMarketingBrainRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return cancelRun(projectId, runId);
}

export async function resumeMarketingBrainRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return resumeRun(projectId, runId);
}

export async function retryMarketingBrainStepAction(projectId: string, runId: string, stepKey: MarketingBrainStepKey): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return retryFailedStep(projectId, runId, user.id, stepKey);
}

export async function retryMarketingBrainItemAction(
  projectId: string,
  runId: string,
  stepKey: MarketingBrainStepKey,
  itemKey: string
): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return retryFailedItem(projectId, runId, user.id, stepKey, itemKey);
}

export async function duplicateMarketingBrainRunAction(projectId: string, runId: string): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return duplicateRun(projectId, runId, user.id);
}

export async function archiveMarketingBrainRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return archiveRun(projectId, runId);
}

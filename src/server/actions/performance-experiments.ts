"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { createExperimentSchema, createVariantSchema, decideExperimentWinnerSchema } from "@/lib/validation/performance";
import {
  createExperiment,
  listExperiments,
  getExperimentDetail,
  createVariant,
  transitionExperimentStatus,
  analyzeExperiment,
  decideExperimentWinner,
} from "@/server/services/performance-experiments";
import type { PerformanceErrorCode } from "@/lib/performance/types";

export interface ExperimentActionResult {
  id?: string;
  errorCode?: PerformanceErrorCode;
  errorMessage?: string;
}

function revalidateExperiments(projectId: string, experimentId?: string) {
  revalidatePath(`/dashboard/${projectId}/performance/experiments`);
  if (experimentId) revalidatePath(`/dashboard/${projectId}/performance/experiments/${experimentId}`);
}

export async function createExperimentAction(projectId: string, input: unknown): Promise<ExperimentActionResult> {
  const parsed = createExperimentSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createExperiment(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateExperiments(projectId);
  return { id: result.id };
}

export async function listExperimentsAction(projectId: string, filters: { status?: string; campaignId?: string } = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return listExperiments(projectId, filters);
}

export async function getExperimentDetailAction(projectId: string, experimentId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getExperimentDetail(projectId, experimentId);
}

export async function createVariantAction(projectId: string, input: unknown): Promise<ExperimentActionResult> {
  const parsed = createVariantSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createVariant(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateExperiments(projectId, parsed.data.experimentId);
  return { id: result.id };
}

export async function transitionExperimentStatusAction(projectId: string, experimentId: string, nextStatus: string): Promise<ExperimentActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await transitionExperimentStatus(projectId, experimentId, nextStatus);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateExperiments(projectId, experimentId);
  return { id: result.id };
}

export async function analyzeExperimentAction(projectId: string, experimentId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return analyzeExperiment(projectId, experimentId);
}

export async function decideExperimentWinnerAction(projectId: string, input: unknown): Promise<ExperimentActionResult> {
  const parsed = decideExperimentWinnerSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await requireProjectAccess(projectId, "EDITOR");
  const result = await decideExperimentWinner(projectId, parsed.data.experimentId, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidateExperiments(projectId, parsed.data.experimentId);
  return { id: result.id };
}

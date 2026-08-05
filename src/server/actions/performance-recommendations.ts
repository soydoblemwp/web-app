"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { decideRecommendationSchema, createRecommendationActionSchema } from "@/lib/validation/performance";
import { generateRecommendations, listRecommendations, getRecommendationDetail, decideRecommendation, applyRecommendationAction } from "@/server/services/performance-recommendations";
import type { PerformanceErrorCode } from "@/lib/performance/types";

export interface RecommendationActionResult {
  id?: string;
  createdResourceId?: string;
  errorCode?: PerformanceErrorCode | string;
  errorMessage?: string;
}

export async function generateRecommendationsAction(projectId: string): Promise<{ generated: number }> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await generateRecommendations(projectId);
  revalidatePath(`/dashboard/${projectId}/performance/recommendations`);
  return result;
}

export async function listRecommendationsAction(projectId: string, filters: { status?: string; category?: string; limit?: number } = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return listRecommendations(projectId, filters);
}

export async function getRecommendationDetailAction(projectId: string, recommendationId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getRecommendationDetail(projectId, recommendationId);
}

export async function decideRecommendationAction(projectId: string, input: unknown): Promise<RecommendationActionResult> {
  const parsed = decideRecommendationSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await requireProjectAccess(projectId, "EDITOR");
  const result = await decideRecommendation(projectId, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance/recommendations`);
  return { id: result.id };
}

/** The confirmed step (spec section 29) — the UI must already have shown a preview before calling this. */
export async function applyRecommendationActionAction(projectId: string, input: unknown): Promise<RecommendationActionResult> {
  const parsed = createRecommendationActionSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await applyRecommendationAction(projectId, user.id, parsed.data);
  revalidatePath(`/dashboard/${projectId}/performance/recommendations`);
  return result;
}

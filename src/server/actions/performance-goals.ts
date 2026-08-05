"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { createGoalSchema, createBenchmarkSchema } from "@/lib/validation/performance";
import { createGoal, listGoals, evaluateGoal, archiveGoal, createBenchmark, listBenchmarks } from "@/server/services/performance-goals";
import type { PerformanceErrorCode } from "@/lib/performance/types";

export interface GoalActionResult {
  id?: string;
  errorCode?: PerformanceErrorCode;
  errorMessage?: string;
}

export async function createGoalAction(projectId: string, input: unknown): Promise<GoalActionResult> {
  const parsed = createGoalSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createGoal(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance`);
  return { id: result.id };
}

export async function listGoalsAction(projectId: string, filters: { campaignId?: string; contentItemId?: string; status?: string } = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return listGoals(projectId, filters);
}

export async function evaluateGoalAction(projectId: string, goalId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return evaluateGoal(projectId, goalId);
}

export async function archiveGoalAction(projectId: string, goalId: string): Promise<GoalActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await archiveGoal(projectId, goalId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance`);
  return { id: result.id };
}

export async function createBenchmarkAction(projectId: string, input: unknown): Promise<GoalActionResult> {
  const parsed = createBenchmarkSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createBenchmark(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance`);
  return { id: result.id };
}

export async function listBenchmarksAction(projectId: string, metricKey?: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listBenchmarks(projectId, metricKey);
}

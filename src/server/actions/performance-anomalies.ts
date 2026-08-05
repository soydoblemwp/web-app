"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { decideAnomalySchema } from "@/lib/validation/performance";
import { detectAnomaliesForProject, listAnomalies, decideAnomaly, explainAnomaly } from "@/server/services/performance-anomalies";
import type { PerformanceErrorCode } from "@/lib/performance/types";

export interface AnomalyActionResult {
  id?: string;
  errorCode?: PerformanceErrorCode;
  errorMessage?: string;
}

export async function detectAnomaliesAction(projectId: string): Promise<{ detected: number }> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await detectAnomaliesForProject(projectId);
  revalidatePath(`/dashboard/${projectId}/performance`);
  return result;
}

export async function listAnomaliesAction(projectId: string, filters: { status?: string; limit?: number } = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return listAnomalies(projectId, filters);
}

export async function decideAnomalyAction(projectId: string, input: unknown): Promise<AnomalyActionResult> {
  const parsed = decideAnomalySchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await requireProjectAccess(projectId, "EDITOR");
  const result = await decideAnomaly(projectId, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance`);
  return { id: result.id };
}

export async function explainAnomalyAction(projectId: string, anomalyId: string, explanation: string): Promise<AnomalyActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await explainAnomaly(projectId, anomalyId, explanation);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance`);
  return { id: result.id };
}

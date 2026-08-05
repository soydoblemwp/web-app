"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { processNextStage, retrySourceStage, cancelSourceProcessing, type ProcessStageResult } from "@/server/services/knowledge-processing";
import type { KnowledgeProcessingStage } from "@/lib/knowledge/types";

function revalidateSource(projectId: string, sourceId: string) {
  revalidatePath(`/dashboard/${projectId}/knowledge/sources/${sourceId}`);
  revalidatePath(`/dashboard/${projectId}/knowledge`);
}

/** Advances processing by exactly one stage — the client calls this repeatedly (same "driving loop" pattern as AI Agent Studio/Marketing Brain) until `done` is true. Never one long request for the whole pipeline (spec section 30). */
export async function processSourceStageAction(projectId: string, sourceId: string): Promise<ProcessStageResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await processNextStage(projectId, sourceId);
  if (result.done) revalidateSource(projectId, sourceId);
  return result;
}

export async function retrySourceStageAction(projectId: string, sourceId: string, fromStage?: KnowledgeProcessingStage) {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await retrySourceStage(projectId, sourceId, fromStage);
  if (result.ok) revalidateSource(projectId, sourceId);
  return result;
}

export async function cancelSourceProcessingAction(projectId: string, sourceId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const ok = await cancelSourceProcessing(projectId, sourceId);
  revalidateSource(projectId, sourceId);
  return { ok };
}

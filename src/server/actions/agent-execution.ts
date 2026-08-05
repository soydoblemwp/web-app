"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { prepareNextStep, completeAiStep, failAiStep, type ExecutorState } from "@/server/services/agent-orchestrator";

/**
 * Advances the run by exactly one step. Never runs the whole pipeline in one
 * HTTP request: the client calls this repeatedly, running any returned
 * prompt through the browser's local engine (useLocalAI) before calling
 * completeAgentRunStepAction — same round-trip shape as Marketing Brain/AI
 * Workflows, since this codebase has no server-side AI provider.
 */
export async function prepareAgentRunStepAction(projectId: string, runId: string): Promise<ExecutorState> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return prepareNextStep(projectId, runId, user.id);
}

export async function completeAgentRunStepAction(projectId: string, runId: string, output: string, executionToken: string): Promise<ExecutorState> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return completeAiStep(projectId, runId, user.id, output, executionToken);
}

export async function failAgentRunStepAction(projectId: string, runId: string, executionToken: string, errorMessage: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return failAiStep(projectId, runId, executionToken, errorMessage);
}

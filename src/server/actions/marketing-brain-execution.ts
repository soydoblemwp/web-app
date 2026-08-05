"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { prepareNextStep, completeAiStep, failAiStep, type ExecutorState } from "@/server/services/marketing-brain-orchestrator";

/**
 * Advances the run by exactly one unit of work — a whole deterministic
 * stage, or the next AI item within an AI stage. Never runs the whole
 * pipeline in one HTTP request (spec section 9): the client calls this
 * repeatedly, running any returned prompt through the browser's local
 * engine (useLocalAI) before calling completeMarketingBrainStepAction.
 */
export async function prepareMarketingBrainStepAction(projectId: string, runId: string): Promise<ExecutorState> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return prepareNextStep(projectId, runId, user.id);
}

/** Only ever called after the browser's local engine really generated `output` for the AI item prepareMarketingBrainStepAction just requested. */
export async function completeMarketingBrainStepAction(
  projectId: string,
  runId: string,
  output: string,
  executionToken: string
): Promise<ExecutorState> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return completeAiStep(projectId, runId, user.id, output, executionToken);
}

/** Called when the browser's local engine itself fails/is cancelled mid-item. */
export async function failMarketingBrainStepAction(
  projectId: string,
  runId: string,
  executionToken: string,
  errorMessage: string
): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return failAiStep(projectId, runId, user.id, executionToken, errorMessage);
}

import type { AiAgentRunStatusValue, AiAgentRunStepStatusValue } from "@/lib/agents/types";

const TERMINAL_RUN_STATUSES: AiAgentRunStatusValue[] = ["COMPLETED", "FAILED", "CANCELLED", "ARCHIVED"];

export function isRunTerminal(status: AiAgentRunStatusValue): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

export function canEditInput(status: AiAgentRunStatusValue): boolean {
  return status === "DRAFT" || status === "READY";
}

export function canStartRun(status: AiAgentRunStatusValue): boolean {
  return status === "READY";
}

export function canExecuteNextStep(status: AiAgentRunStatusValue): boolean {
  return status === "RUNNING";
}

export function canCancelRun(status: AiAgentRunStatusValue): boolean {
  return !isRunTerminal(status);
}

/** Only a FAILED step can be retried directly (spec section 9: "no reintentar mientras está ejecutándose"). */
export function canRetryStep(stepStatus: AiAgentRunStepStatusValue): boolean {
  return stepStatus === "FAILED";
}

export function canDecideApproval(stepStatus: AiAgentRunStepStatusValue): boolean {
  return stepStatus === "WAITING_FOR_APPROVAL";
}

/** A run can only reach COMPLETED when every non-skipped step is COMPLETED — never with a FAILED step outstanding. */
export function canCompleteRun(stepStatuses: AiAgentRunStepStatusValue[]): boolean {
  return stepStatuses.every((s) => s === "COMPLETED" || s === "SKIPPED");
}

/** True when at least one step recorded an item-level failure inside an otherwise-successful step (independent branches, spec section 23). */
export function shouldBePartiallyCompleted(stepFailedItemCounts: number[]): boolean {
  return stepFailedItemCounts.some((n) => n > 0);
}

export function nextRunStatusAfterAllSteps(stepStatuses: AiAgentRunStepStatusValue[], stepFailedItemCounts: number[]): AiAgentRunStatusValue {
  if (!canCompleteRun(stepStatuses)) return "FAILED";
  return shouldBePartiallyCompleted(stepFailedItemCounts) ? "PARTIALLY_COMPLETED" : "COMPLETED";
}

import type { MarketingBrainRunStatusValue, MarketingBrainStepStatusValue } from "@/lib/marketing-brain/types";

/** A terminal run can never execute another step, be cancelled, or be resumed — only duplicated into a fresh draft (spec section 8/20). */
const TERMINAL_RUN_STATUSES: MarketingBrainRunStatusValue[] = ["COMPLETED", "FAILED", "CANCELLED", "ARCHIVED"];

export function isRunTerminal(status: MarketingBrainRunStatusValue): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

export function canEditBriefing(status: MarketingBrainRunStatusValue): boolean {
  return status === "DRAFT" || status === "READY";
}

export function canStartRun(status: MarketingBrainRunStatusValue): boolean {
  return status === "READY";
}

export function canExecuteNextStep(status: MarketingBrainRunStatusValue): boolean {
  return status === "RUNNING";
}

export function canCancelRun(status: MarketingBrainRunStatusValue): boolean {
  return !isRunTerminal(status);
}

/** Only a FAILED run's specific step can be retried directly; a RUNNING run with a stale/orphaned step must go through resumeRun first (spec: "no reintentar un paso ya ejecutándose"). */
export function canRetryStep(stepStatus: MarketingBrainStepStatusValue): boolean {
  return stepStatus === "FAILED";
}

export function canApproveOrRejectStep(stepStatus: MarketingBrainStepStatusValue): boolean {
  return stepStatus === "WAITING_FOR_APPROVAL";
}

/** A run can only reach COMPLETED when every non-skipped step is COMPLETED — never with a FAILED step outstanding (spec section 8). */
export function canCompleteRun(stepStatuses: MarketingBrainStepStatusValue[]): boolean {
  return stepStatuses.every((s) => s === "COMPLETED" || s === "SKIPPED");
}

/** Whether the run should land on PARTIALLY_COMPLETED instead of COMPLETED once every step has resolved — true when any step recorded at least one item-level failure inside an otherwise-successful step (spec section 21: a failed item never blocks the other independent items). */
export function shouldBePartiallyCompleted(stepFailedItemCounts: number[]): boolean {
  return stepFailedItemCounts.some((n) => n > 0);
}

export function nextRunStatusAfterAllSteps(stepStatuses: MarketingBrainStepStatusValue[], stepFailedItemCounts: number[]): MarketingBrainRunStatusValue {
  if (!canCompleteRun(stepStatuses)) return "FAILED";
  return shouldBePartiallyCompleted(stepFailedItemCounts) ? "PARTIALLY_COMPLETED" : "COMPLETED";
}

/** Statuses safe to bulk-mark SKIPPED when a run fails mid-pipeline — never touches a step that already resolved. */
export function isStepPending(status: MarketingBrainStepStatusValue): boolean {
  return status === "PENDING";
}

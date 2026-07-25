/**
 * Centralized, server-enforced safety limits for real Workflow execution.
 * Every real-execution action imports these — never a hardcoded number
 * scattered across files, and never a UI-only limit: the client's own
 * "Ejecutar workflow" form may mirror these for a nicer error message, but
 * the authoritative check always happens in the server action.
 */
export const WORKFLOW_EXECUTION_LIMITS = {
  /** A workflow with more steps than this can be saved/edited, but a real run refuses to start. */
  MAX_STEPS_PER_RUN: 20,
  /** Per-step resolved input (a single field's rendered value, or a step's rendered inputTemplate). */
  MAX_STEP_INPUT_CHARS: 8_000,
  /** Running total across every step's resolved input + output within one run. */
  MAX_ACCUMULATED_CHARS: 60_000,
  /** Any single persisted result (a step's output, or the run's finalOutput) — longer text is truncated, never rejected outright, since the generation already happened. */
  MAX_RESULT_CHARS: 20_000,
  /** How many runs a single user may have PENDING/VALIDATING/RUNNING at once. */
  MAX_CONCURRENT_RUNS_PER_USER: 3,
  /** Logical wall-clock ceiling for one run, measured from WorkflowRun.startedAt — enforced server-side on every step boundary, never trusted from client-reported elapsed time. */
  MAX_RUN_DURATION_MS: 10 * 60 * 1000,
  /** How many levels of "workflow" step nesting a single run may reach — root run is depth 0, its child (SubWorkflow) run is depth 1, etc. A "workflow" step that would create a child run past this depth fails that step (and, per stopOnError, the run) with a clear message rather than starting it. Bounds resource usage even for a legitimately acyclic but deep chain (cycles themselves are separately blocked outright, at publish time and again at run time — see src/lib/ai-workflows/workflow-graph.ts). */
  MAX_WORKFLOW_NESTING_DEPTH: 5,
} as const;

export function exceedsMaxNestingDepth(depth: number): boolean {
  return depth > WORKFLOW_EXECUTION_LIMITS.MAX_WORKFLOW_NESTING_DEPTH;
}

export const TRUNCATION_SUFFIX = "\n\n[... resultado truncado por límite de tamaño ...]";

/** Truncates persisted text at MAX_RESULT_CHARS, leaving a clear, visible marker — never a silent cut. */
export function truncateForPersistence(text: string): string {
  if (text.length <= WORKFLOW_EXECUTION_LIMITS.MAX_RESULT_CHARS) return text;
  return text.slice(0, WORKFLOW_EXECUTION_LIMITS.MAX_RESULT_CHARS) + TRUNCATION_SUFFIX;
}

export function exceedsMaxSteps(stepCount: number): boolean {
  return stepCount > WORKFLOW_EXECUTION_LIMITS.MAX_STEPS_PER_RUN;
}

export function exceedsStepInputLimit(text: string): boolean {
  return text.length > WORKFLOW_EXECUTION_LIMITS.MAX_STEP_INPUT_CHARS;
}

export function exceedsAccumulatedLimit(accumulatedChars: number, nextChunk: string): boolean {
  return accumulatedChars + nextChunk.length > WORKFLOW_EXECUTION_LIMITS.MAX_ACCUMULATED_CHARS;
}

export function exceedsConcurrentRunLimit(activeRunCount: number): boolean {
  return activeRunCount >= WORKFLOW_EXECUTION_LIMITS.MAX_CONCURRENT_RUNS_PER_USER;
}

/** `startedAt` is always the server-recorded WorkflowRun.startedAt — never a client-supplied timestamp. */
export function isRunDurationExceeded(startedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - startedAt.getTime() > WORKFLOW_EXECUTION_LIMITS.MAX_RUN_DURATION_MS;
}

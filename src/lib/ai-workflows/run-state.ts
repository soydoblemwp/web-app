import type { WorkflowRunStatus, WorkflowStepRunStatus } from "@/generated/prisma/enums";
import { isLeaseActive, type LeaseFields } from "@/lib/ai-workflows/lease";

/**
 * Pure state-machine rules for real Workflow execution — every transition
 * the server actions perform is checked against these tables first, so a
 * stale/duplicate/out-of-order client call can never move a run or step
 * into an invalid state. The client never sends a status directly; it only
 * ever triggers an action (start/prepare/complete/fail/cancel), and the
 * server decides the resulting status using these rules.
 */

const RUN_TRANSITIONS: Record<WorkflowRunStatus, WorkflowRunStatus[]> = {
  // PENDING -> RUNNING and VALIDATING -> RUNNING (direct) only ever happen
  // via resumeWorkflowRunAction's crash-recovery path — a run that never
  // made it past its own creation call (e.g. the server died between the
  // upsert and the follow-up status flip) is still safely resumable, per
  // spec, without re-running validation a second time (the snapshot already
  // captured a structurally valid workflow).
  PENDING: ["VALIDATING", "RUNNING", "CANCELLED"],
  VALIDATING: ["RUNNING", "FAILED", "CANCELLED"],
  RUNNING: ["COMPLETED", "FAILED", "CANCELLED", "INTERRUPTED"],
  // INTERRUPTED is reached only by detection (lease expired on a RUNNING
  // run), never client-requested — see isRunAbandoned. From there, a run is
  // only ever resumed (back to RUNNING) or cancelled/retried; it is never
  // auto-continued.
  INTERRUPTED: ["RUNNING", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionRun(from: WorkflowRunStatus, to: WorkflowRunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

/** True once a run has reached any terminal status — no further step may start, no further transition is valid. */
export function isRunTerminal(status: WorkflowRunStatus): boolean {
  return RUN_TRANSITIONS[status].length === 0;
}

const STEP_TRANSITIONS: Record<WorkflowStepRunStatus, WorkflowStepRunStatus[]> = {
  PENDING: ["RUNNING", "SKIPPED", "CANCELLED"],
  RUNNING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  SKIPPED: [],
  CANCELLED: [],
};

export function canTransitionStep(from: WorkflowStepRunStatus, to: WorkflowStepRunStatus): boolean {
  return STEP_TRANSITIONS[from].includes(to);
}

/**
 * RUNNING -> PENDING is not in STEP_TRANSITIONS (no client action may ever
 * request it directly — canTransitionStep correctly rejects it). It exists
 * ONLY as an internal effect of resumeWorkflowRunAction reclaiming a step
 * whose previous attempt was abandoned mid-flight (browser closed/lease
 * lost before it could complete or fail) — never for a step that already
 * reached a terminal status, so a real result is never discarded.
 */
export function canReclaimStep(status: WorkflowStepRunStatus): boolean {
  return status === "RUNNING";
}

export function isStepTerminal(status: WorkflowStepRunStatus): boolean {
  return STEP_TRANSITIONS[status].length === 0;
}

/**
 * A run may only accept a "prepare step N" call when it's RUNNING and step N
 * is genuinely the next PENDING step in order — this is what makes
 * "no permitir referencias hacia pasos futuros" / strictly sequential
 * execution a server-enforced fact, not just a client convention.
 */
export function isNextRunnableStepIndex(
  runStatus: WorkflowRunStatus,
  stepStatuses: WorkflowStepRunStatus[],
  requestedIndex: number
): boolean {
  if (runStatus !== "RUNNING") return false;
  const nextIndex = stepStatuses.findIndex((status) => status === "PENDING");
  return nextIndex !== -1 && nextIndex === requestedIndex;
}

/** A run is only safe to retry (as a fresh run) once it has reached a terminal, non-successful state, or is currently interrupted (the user may prefer a clean retry over resuming). */
export function isRetryableRunStatus(status: WorkflowRunStatus): boolean {
  return status === "FAILED" || status === "CANCELLED" || status === "INTERRUPTED";
}

/**
 * Every non-terminal status is, by construction, "reanudable" per the spec's
 * own table (pending/validating/running/interrupted) — only a run that has
 * already reached an outcome (completed/failed/cancelled) cannot be resumed;
 * failed still requires an explicit full retry, never a resume.
 */
export function isRunRecoverable(status: WorkflowRunStatus): boolean {
  return !isRunTerminal(status) && status !== "FAILED";
}

/**
 * A RUNNING run whose lease has expired with nobody actively holding it is
 * abandoned — detected lazily wherever a client happens to look (page open,
 * history, or a resume attempt), never by a background job. This is the
 * ONLY condition that turns RUNNING into INTERRUPTED.
 */
export function isRunAbandoned(run: LeaseFields & { status: WorkflowRunStatus }, now: Date = new Date()): boolean {
  return run.status === "RUNNING" && !isLeaseActive(run, now);
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

/** Client-generated idempotency keys must look like a real opaque token (e.g. crypto.randomUUID()) — never trusted blindly, always shape-checked before it's used in a uniqueness query. */
export function isValidIdempotencyKey(key: string): boolean {
  return IDEMPOTENCY_KEY_RE.test(key);
}

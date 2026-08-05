/** Parses a positive-integer env var, falling back to `fallback` when unset/invalid — never lets a malformed env var silently become 0/NaN in a limit that guards against runaway loops. */
function envInt(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env[name] : undefined;
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Central, technical (never commercial) limits for AI Automation Center
 * (spec section 30). This project has no paid plans — these exist purely to
 * protect the system (runaway loops, huge webhook bodies, unbounded
 * recurrences), never to gate a "plan". When one is hit, the UI must explain
 * the restriction and offer to pause/delete — never mention upgrading.
 * A handful are overridable via `.env` (see .env.example) for operators who
 * need to tune batch size/window/limits per environment; everything else is
 * a fixed code constant so the safety floor can't be configured away.
 */
export const WORKFLOW_AUTOMATION_LIMITS = {
  MAX_CONDITION_GROUPS: 10,
  MAX_CONDITIONS_PER_GROUP: 20,
  MAX_CONDITION_VALUE_CHARS: 500,
  MAX_CONDITION_DEPTH: 3,
  MAX_ACTIVE_RECURRING_PER_PROJECT: 25,
  MAX_CONCURRENT_RUNS_PER_PROJECT: 10,
  MAX_WEBHOOK_BODY_BYTES: envInt("AUTOMATION_MAX_WEBHOOK_BODY_BYTES", 256 * 1024),
  MAX_RETRY_ATTEMPTS: 10,
  /** The infrastructure (cron batch cadence) can't reliably guarantee anything tighter — never let a user configure a faster recurrence than this (spec section 7: "la frecuencia mínima debe estar definida centralmente y probada"). */
  MIN_SCHEDULE_INTERVAL_MINUTES: envInt("AUTOMATION_MIN_SCHEDULE_INTERVAL_MINUTES", 5),
  MAX_EVENTS_PER_BATCH: envInt("AUTOMATION_PROCESSING_BATCH_SIZE", 50),
  MAX_SCHEDULES_PER_BATCH: envInt("AUTOMATION_PROCESSING_BATCH_SIZE", 50),
  MAX_RUN_DURATION_MS: 30 * 60 * 1000,
  MAX_AUTOMATIONS_PER_EVENT_TYPE: 100,
  MAX_CHAIN_DEPTH: 5,
  /** Sliding window used by loop detection (spec section 31) — the same automation firing on the same resource+event more than once inside this window is suspicious. */
  LOOP_DETECTION_WINDOW_MS: 5 * 60 * 1000,
  MAX_INPUT_MAPPINGS: 40,
  MAX_TEMPLATE_OUTPUT_CHARS: 8000,
  LOCK_DURATION_MS: 2 * 60 * 1000,
  WEBHOOK_SIGNING_WINDOW_SECONDS: envInt("AUTOMATION_WEBHOOK_SIGNING_WINDOW_SECONDS", 300),
  /** Bounds how many future occurrences the upcoming-executions view/calendar will precompute per recurring trigger — never an infinite copy of the recurrence (spec section 34). */
  MAX_UPCOMING_OCCURRENCES_PER_TRIGGER: 20,
} as const;

export function exceedsActiveRecurringLimit(count: number): boolean {
  return count >= WORKFLOW_AUTOMATION_LIMITS.MAX_ACTIVE_RECURRING_PER_PROJECT;
}

export function exceedsConcurrentAutomationRunsLimit(count: number): boolean {
  return count >= WORKFLOW_AUTOMATION_LIMITS.MAX_CONCURRENT_RUNS_PER_PROJECT;
}

export function exceedsWebhookBodyLimit(bytes: number): boolean {
  return bytes > WORKFLOW_AUTOMATION_LIMITS.MAX_WEBHOOK_BODY_BYTES;
}

export function clampRetryAttempts(value: number): number {
  return Math.max(1, Math.min(value, WORKFLOW_AUTOMATION_LIMITS.MAX_RETRY_ATTEMPTS));
}

export function isScheduleIntervalTooShort(intervalMinutes: number): boolean {
  return intervalMinutes < WORKFLOW_AUTOMATION_LIMITS.MIN_SCHEDULE_INTERVAL_MINUTES;
}

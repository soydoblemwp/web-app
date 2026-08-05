/**
 * Central, technical-only limits for AI Agent Governance (Fase 37 spec
 * section 8) — never a commercial/plan gate (Plan/Subscription are a
 * separate, workspace-level billing concern this phase never touches). Safe
 * defaults apply when a policy field is left unset; every configurable
 * value still has a real, enforced ceiling so a policy can never be saved
 * with a negative or absurdly large limit.
 */
export const GOVERNANCE_LIMITS = {
  MAX_RUNS_PER_DAY: 1000,
  MAX_RUNS_PER_MONTH: 20_000,
  MAX_CONCURRENT_RUNS_PER_PROJECT: 50,
  MAX_CONCURRENT_RUNS_PER_AGENT: 20,
  MAX_RETRIES: 10,
  MAX_DURATION_SECONDS: 3600,
  MAX_STEPS: 50,
  MAX_CONTEXT_CHARS: 200_000,
  MAX_OUTPUT_CHARS: 200_000,
  DEFAULT_APPROVAL_EXPIRY_HOURS: 48,
  MAX_APPROVAL_EXPIRY_HOURS: 24 * 30,
  MAX_POLICY_COMMENT_LENGTH: 2000,
  MAX_DISABLED_AGENT_REFS: 200,
  MAX_RULES_PER_POLICY: 200,
  MAX_BULK_CANCEL: 200,
  MAX_SANITIZED_INPUT_BYTES: 20_000,
  /** Fase 38: impact analysis never scans the whole run history in one call (spec section 17). */
  MAX_IMPACT_ANALYSIS_RUNS: 500,
  DEFAULT_IMPACT_ANALYSIS_RUNS: 200,
  /** Fase 38: mass simulation bound — a matrix cell per agent x mode, never unbounded. */
  MAX_MASS_SIMULATION_CELLS: 300,
  MAX_ROLLOUT_SCOPE_ENTRIES: 100,
} as const;

/**
 * Per-field-type option ceilings for AgentInputFieldSpec (Fase 37 spec
 * section 21 — replaces Fase 36's single flat `.max(80)` that applied to
 * every field type, including ones that never need more than a handful of
 * options). `select` stays modest (a simple dropdown); `multiselect` is
 * raised enough to hold the full Performance Center metric catalog (56
 * entries) without an indiscriminate ceiling on every other field.
 */
export const AGENT_FIELD_OPTION_LIMITS = {
  select: 40,
  multiselect: 120,
} as const;

/** How many multiselect options render before the user must type a search query (Fase 37 spec section 22) — never renders an unbounded list. */
export const MULTISELECT_VISIBLE_WITHOUT_SEARCH = 20;
/** How many matching options are shown at once even while searching — "carga progresiva" via a simple, dependency-free windowed slice. */
export const MULTISELECT_MAX_VISIBLE_RESULTS = 50;
/** Shared with `agentInputSchemaArray`'s multiselect value-array cap in dynamic-form.ts — kept as ONE constant so the UI's selection limit and the server's validation limit can never silently drift apart. */
export const MULTISELECT_MAX_SELECTIONS = 30;

export function clampNonNegative(value: number | null | undefined, max: number): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.min(Math.max(0, Math.trunc(value)), max);
}

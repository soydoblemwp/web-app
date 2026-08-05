/**
 * Purely technical ceilings for the Google Integrations Hub (Fase 39) —
 * never a commercial/plan-based limit, same convention as
 * src/lib/agents/governance-limits.ts and PERFORMANCE_LIMITS.
 */
export const GOOGLE_INTEGRATION_LIMITS = {
  OAUTH_STATE_TTL_MINUTES: 10,
  MAX_SELECTED_RESOURCES: 25,
  /** Initial-import window ceiling, in days (spec section 11/19: "no permitas rangos ilimitados"). */
  MAX_INITIAL_PERIOD_DAYS: 400,
  DEFAULT_INITIAL_PERIOD_DAYS: 90,
  /** Manual resync window ceiling, in days. */
  MAX_RESYNC_PERIOD_DAYS: 90,
  /** How many days of "late adjustment" re-fetch on every incremental sync (spec section 19). */
  INCREMENTAL_LOOKBACK_DAYS: 3,
  /** GA4 Data API / Search Console API request page size. */
  API_PAGE_SIZE: 200,
  /** Extra breakdown dimensions (query/page/device/country) are opt-in and capped (spec section 15). */
  MAX_EXTRA_DIMENSION_ROWS: 5000,
  MAX_CONCURRENT_SYNCS_PER_PROJECT: 3,
  SYNC_LOCK_DURATION_MS: 5 * 60_000,
  MAX_SYNC_RETRIES: 3,
  HTTP_TIMEOUT_MS: 20_000,
  MAX_SAFE_ERROR_MESSAGE_LENGTH: 500,
} as const;

/** The three GA4/GSC read-only scopes plus identity — never write/edit/admin scopes (spec section 5). */
export const GOOGLE_OAUTH_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/webmasters.readonly"] as const;

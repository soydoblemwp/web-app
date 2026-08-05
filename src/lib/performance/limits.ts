/**
 * Central, technical (never commercial) limits for Performance Intelligence
 * Center (spec section 51). No commercial plans exist — these exist purely
 * to protect the system (huge files, runaway comparisons, unbounded JSON
 * nesting), never to gate a "plan". When one is hit, the UI must explain the
 * restriction and let the user reduce their selection — never mention
 * upgrading or paying.
 */

function envInt(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env[name] : undefined;
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const PERFORMANCE_LIMITS = {
  MAX_CSV_BYTES: envInt("PERFORMANCE_MAX_CSV_BYTES", 10 * 1024 * 1024),
  MAX_JSON_BYTES: envInt("PERFORMANCE_MAX_JSON_BYTES", 5 * 1024 * 1024),
  MAX_IMPORT_ROWS: envInt("PERFORMANCE_MAX_IMPORT_ROWS", 20_000),
  MAX_METRICS_PER_ROW: 40,
  MAX_CONCURRENT_IMPORTS_PER_PROJECT: 5,
  MAX_COMPARISON_RESOURCES: 20,
  MAX_EXPERIMENT_VARIANTS: 12,
  MAX_JSON_DEPTH: 8,
  MAX_JSON_STRING_LENGTH: 20_000,
  MAX_REPORTS_PER_BATCH: 20,
  MAX_PERIOD_DAYS: 366 * 2,
  MAX_RESOURCES_PER_ANALYSIS: 500,
  MAX_CHART_POINTS: 366,
  IMPORT_BATCH_SIZE: 200,
  LOCK_DURATION_MS: 2 * 60 * 1000,
  /** Minimum sample size per variant before an experiment can honestly declare a winner (spec section 22) — below this, results stay INCONCLUSIVE regardless of the raw difference observed. */
  MIN_EXPERIMENT_SAMPLE_SIZE: 30,
  /** Minimum number of data points a trend classification requires — a single point is never a trend (spec section 38). */
  MIN_TREND_POINTS: 3,
  /** Minimum number of historical points an anomaly detector needs before it will flag anything (spec section 39). */
  MIN_ANOMALY_HISTORY_POINTS: 5,
} as const;

export function exceedsCsvSizeLimit(bytes: number): boolean {
  return bytes > PERFORMANCE_LIMITS.MAX_CSV_BYTES;
}

export function exceedsJsonSizeLimit(bytes: number): boolean {
  return bytes > PERFORMANCE_LIMITS.MAX_JSON_BYTES;
}

export function exceedsImportRowLimit(count: number): boolean {
  return count > PERFORMANCE_LIMITS.MAX_IMPORT_ROWS;
}

export function exceedsComparisonLimit(count: number): boolean {
  return count > PERFORMANCE_LIMITS.MAX_COMPARISON_RESOURCES;
}

export function exceedsExperimentVariantLimit(count: number): boolean {
  return count > PERFORMANCE_LIMITS.MAX_EXPERIMENT_VARIANTS;
}

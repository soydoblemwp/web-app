import { PERFORMANCE_LIMITS } from "@/lib/performance/limits";

/**
 * Central, technical-only limits for the Marketing Brain performance-context
 * selection and optimization loop (Fase 35 spec section 5). Reuses
 * Performance Center's own ceilings (period length, chart points, comparison
 * resources) wherever the concept is identical — never a commercial/plan
 * gate, only a real protection against unbounded selections/context size.
 */
export const MB_OPTIMIZATION_LIMITS = {
  MAX_CONTEXT_METRICS: 12,
  MAX_CONTEXT_RESOURCES: PERFORMANCE_LIMITS.MAX_COMPARISON_RESOURCES,
  MAX_CONTEXT_GOALS: 8,
  MAX_CONTEXT_BENCHMARKS: 8,
  MAX_CONTEXT_EXPERIMENTS: 5,
  MAX_CONTEXT_RECOMMENDATIONS: 8,
  MAX_CONTEXT_REPORTS: 3,
  MAX_PERIOD_DAYS: PERFORMANCE_LIMITS.MAX_PERIOD_DAYS,
  MAX_CHART_POINTS: PERFORMANCE_LIMITS.MAX_CHART_POINTS,
  /** Ceiling on the serialized (facts+derived+signals+hypotheses+constraints+missingData) snapshot size — protects both the local-model prompt and the DB row. */
  MAX_CONTEXT_BYTES: 60_000,
  MAX_SCENARIO_ACTIONS_PER_SCENARIO: 8,
  MAX_SECONDARY_METRICS_PER_PLAN: 5,
} as const;

export function exceedsContextSizeLimit(bytes: number): boolean {
  return bytes > MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_BYTES;
}
export function exceedsContextMetricLimit(count: number): boolean {
  return count > MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_METRICS;
}
export function exceedsContextResourceLimit(count: number): boolean {
  return count > MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_RESOURCES;
}
export function exceedsPeriodDaysLimit(days: number): boolean {
  return days > MB_OPTIMIZATION_LIMITS.MAX_PERIOD_DAYS || days <= 0;
}

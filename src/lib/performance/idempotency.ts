import type { PerformanceMetricOrigin, PerformanceResourceType } from "@/lib/performance/types";

/**
 * Stable dedup keys (spec sections 15/46) — computed the exact same way
 * everywhere a metric/anomaly/recommendation could be created twice
 * (manual form, CSV row, JSON row, internal recompute, outbox retry), and
 * enforced as a real DB unique constraint — never solely a prior-SELECT
 * check.
 */

export interface MetricIdempotencyInput {
  projectId: string;
  resourceType: PerformanceResourceType;
  resourceId: string | null | undefined;
  platform: string | null | undefined;
  metricKey: string;
  measuredAt: Date;
  periodStart: Date;
  periodEnd: Date;
  externalReference: string | null | undefined;
  source: PerformanceMetricOrigin;
}

const EMPTY = "∅";

export function computeMetricIdempotencyKey(input: MetricIdempotencyInput): string {
  return [
    input.projectId,
    input.resourceType,
    input.resourceId ?? EMPTY,
    input.platform ?? EMPTY,
    input.metricKey,
    input.measuredAt.toISOString(),
    input.periodStart.toISOString(),
    input.periodEnd.toISOString(),
    input.externalReference ?? EMPTY,
    input.source,
  ].join("::");
}

export function computeAnomalyIdempotencyKey(projectId: string, metricKey: string, resourceId: string | null | undefined, measuredAt: Date): string {
  return ["anomaly", projectId, metricKey, resourceId ?? EMPTY, measuredAt.toISOString()].join("::");
}

export function computeRecommendationIdempotencyKey(projectId: string, ruleKey: string, resourceId: string | null | undefined, periodKey: string): string {
  return ["recommendation", projectId, ruleKey, resourceId ?? EMPTY, periodKey].join("::");
}

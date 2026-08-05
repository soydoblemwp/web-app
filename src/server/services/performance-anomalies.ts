import "server-only";
import { prisma } from "@/lib/db/prisma";
import { performanceError, type PerformanceActionError } from "@/lib/performance/types";
import { detectValueAnomaly } from "@/lib/performance/anomalies";
import { computeAnomalyIdempotencyKey } from "@/lib/performance/idempotency";
import { PERFORMANCE_LIMITS } from "@/lib/performance/limits";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { DecideAnomalyInput } from "@/lib/validation/performance";

/**
 * Anomaly detection (spec section 39) — purely statistical (STDDEV/IQR/
 * percent-change, see src/lib/performance/anomalies.ts); the AI layer is
 * only ever allowed to EXPLAIN an anomaly already detected here, never to
 * decide whether one exists.
 */

interface ResourceMetricSeries {
  resourceType: string;
  contentItemId?: string | null;
  campaignId?: string | null;
  socialPostId?: string | null;
  metricKey: string;
  platform?: string | null;
}

/** Scans every (resource, metric) combination that has at least MIN_ANOMALY_HISTORY_POINTS+1 recent measurements, and flags the most recent point if it's anomalous relative to its own history. Idempotent per (project, metric, resource, measuredAt). */
export async function detectAnomaliesForProject(projectId: string, limit = 200): Promise<{ detected: number }> {
  const groups = await prisma.performanceMetricRecord.groupBy({
    by: ["metricKey", "resourceType", "contentItemId", "campaignId", "socialPostId", "platform"],
    where: { projectId, isArchived: false },
    _count: true,
    having: { metricKey: { _count: { gte: PERFORMANCE_LIMITS.MIN_ANOMALY_HISTORY_POINTS + 1 } } },
    orderBy: { metricKey: "asc" },
    take: limit,
  });

  let detected = 0;
  for (const group of groups) {
    const series: ResourceMetricSeries = { resourceType: group.resourceType, contentItemId: group.contentItemId, campaignId: group.campaignId, socialPostId: group.socialPostId, metricKey: group.metricKey, platform: group.platform };
    const records = await prisma.performanceMetricRecord.findMany({
      where: { projectId, metricKey: series.metricKey, resourceType: series.resourceType as never, contentItemId: series.contentItemId, campaignId: series.campaignId, socialPostId: series.socialPostId, platform: series.platform, isArchived: false },
      orderBy: { measuredAt: "asc" },
      select: { value: true, measuredAt: true },
    });
    if (records.length < PERFORMANCE_LIMITS.MIN_ANOMALY_HISTORY_POINTS + 1) continue;

    const latest = records[records.length - 1];
    const history = records.slice(0, -1).map((r) => Number(r.value));
    const result = detectValueAnomaly(history, Number(latest.value));
    if (!result) continue;

    const resourceId = series.contentItemId ?? series.campaignId ?? series.socialPostId ?? null;
    const idempotencyKey = computeAnomalyIdempotencyKey(projectId, series.metricKey, resourceId, latest.measuredAt);
    const existing = await prisma.performanceAnomaly.findUnique({ where: { idempotencyKey } });
    if (existing) continue;

    const created = await prisma.performanceAnomaly.create({
      data: {
        projectId,
        metricKey: series.metricKey,
        resourceType: series.resourceType as never,
        contentItemId: series.contentItemId,
        campaignId: series.campaignId,
        socialPostId: series.socialPostId,
        platform: series.platform,
        measuredAt: latest.measuredAt,
        value: result.value,
        expectedValue: result.expectedValue,
        method: result.method,
        severity: result.severity,
        idempotencyKey,
      },
    });
    await publishAutomationEvent({
      projectId,
      eventKey: "PERFORMANCE_ANOMALY_DETECTED",
      resourceId: created.id,
      payload: { id: created.id, metricKey: series.metricKey, severity: result.severity, method: result.method },
      idempotencyKey: `PERFORMANCE_ANOMALY_DETECTED:${created.id}`,
    });
    detected++;
  }
  return { detected };
}

export async function listAnomalies(projectId: string, filters: { status?: string; limit?: number } = {}) {
  return prisma.performanceAnomaly.findMany({
    where: { projectId, ...(filters.status ? { status: filters.status as never } : {}) },
    include: { contentItem: { select: { id: true, title: true } }, campaign: { select: { id: true, name: true } }, socialPost: { select: { id: true, platform: true } } },
    orderBy: { detectedAt: "desc" },
    take: filters.limit ?? 100,
  });
}

export async function decideAnomaly(projectId: string, input: DecideAnomalyInput): Promise<{ id: string } | PerformanceActionError> {
  const row = await prisma.performanceAnomaly.findUnique({ where: { id: input.anomalyId } });
  if (!row || row.projectId !== projectId) return performanceError("ANOMALY_NOT_FOUND");
  await prisma.performanceAnomaly.update({ where: { id: input.anomalyId }, data: { status: input.status } });
  return { id: input.anomalyId };
}

export async function explainAnomaly(projectId: string, anomalyId: string, explanation: string): Promise<{ id: string } | PerformanceActionError> {
  const row = await prisma.performanceAnomaly.findUnique({ where: { id: anomalyId } });
  if (!row || row.projectId !== projectId) return performanceError("ANOMALY_NOT_FOUND");
  await prisma.performanceAnomaly.update({ where: { id: anomalyId }, data: { explanation } });
  return { id: anomalyId };
}

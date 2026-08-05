import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { computeMetricIdempotencyKey } from "@/lib/performance/idempotency";
import { findMetricDefinition } from "@/lib/performance/metrics-catalog";
import { createMetricRecordCore } from "@/server/services/performance-metric-records";
import { runGa4Report, querySearchConsole, GoogleApiError } from "@/lib/integrations/google-api-client";
import { getValidAccessToken } from "@/server/services/google-connection";
import { GOOGLE_INTEGRATION_LIMITS } from "@/lib/integrations/google-limits";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { logIntegrationAction } from "@/server/services/google-audit";
import { notifyGoogleSyncFailed, notifyGoogleSyncPartial, notifyGoogleResourceLostAccess, notifyGoogleDataStale } from "@/server/services/google-notifications";

/**
 * The real Google sync engine (Fase 39 spec sections 14-15, 18-20) — every
 * metric point lands in the EXACT SAME `PerformanceMetricRecord` table
 * every other source uses, via the SAME `createMetricRecordCore` funnel
 * CSV/JSON imports use (no second metrics store, no second upsert path).
 */

const GA4_METRIC_MAP: Record<string, string> = {
  "ga4.active_users": "activeUsers",
  "ga4.new_users": "newUsers",
  "ga4.sessions": "sessions",
  "ga4.page_views": "screenPageViews",
  "ga4.engagement_rate": "engagementRate",
  "ga4.average_session_duration": "averageSessionDuration",
  "ga4.event_count": "eventCount",
  "ga4.key_events": "keyEvents",
  "ga4.total_revenue": "totalRevenue",
};
/** GA4's API returns these as a 0-1 fraction — persisted x100 to match this catalog's PERCENTAGE convention (documented in metrics-catalog.ts). */
const GA4_FRACTION_TO_PERCENT_KEYS = new Set(["ga4.engagement_rate"]);

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayBounds(dateStr: string): { measuredAt: Date; periodStart: Date; periodEnd: Date } {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return { measuredAt: d, periodStart: d, periodEnd: d };
}

interface PersistCounts {
  created: number;
  updated: number;
  skipped: number;
}

async function persistPoint(params: {
  projectId: string;
  createdById: string;
  metricKey: string;
  unit: string;
  value: number;
  currency?: string | null;
  dateStr: string;
  provider: "ga4" | "gsc";
  externalReference: string;
}): Promise<"created" | "updated" | "skipped"> {
  if (!Number.isFinite(params.value)) return "skipped";
  const { measuredAt, periodStart, periodEnd } = dayBounds(params.dateStr);

  const idempotencyKey = computeMetricIdempotencyKey({
    projectId: params.projectId,
    resourceType: "PROJECT",
    resourceId: null,
    platform: params.provider,
    metricKey: params.metricKey,
    measuredAt,
    periodStart,
    periodEnd,
    externalReference: params.externalReference,
    source: "EXTERNAL_PROVIDER",
  });
  const existedBefore = await prisma.performanceMetricRecord.findUnique({ where: { idempotencyKey }, select: { id: true, value: true } });

  const result = await createMetricRecordCore({
    projectId: params.projectId,
    createdById: params.createdById,
    source: "EXTERNAL_PROVIDER",
    method: "google_sync",
    metricKey: params.metricKey,
    resourceType: "PROJECT",
    platform: params.provider,
    value: params.value,
    unit: params.unit,
    currency: params.currency ?? null,
    measuredAt,
    periodStart,
    periodEnd,
    granularity: "DAY",
    provider: params.provider,
    externalReference: params.externalReference,
    duplicatePolicy: "REPLACE",
  });
  if ("error" in result) return "skipped";
  if (!existedBefore) return "created";
  return Number(existedBefore.value) === params.value ? "skipped" : "updated";
}

/** Creates PENDING sync runs for the given resources — idempotent per (resourceId, periodStart, periodEnd, syncType) via `idempotencyKey`. */
export async function createSyncRuns(projectId: string, userId: string | null, resourceIds: string[], syncType: "INITIAL" | "INCREMENTAL" | "MANUAL" | "RESYNC", periodStart: Date, periodEnd: Date) {
  const resources = await prisma.googleIntegrationResource.findMany({ where: { id: { in: resourceIds }, projectId, active: true } });
  const runs = [];
  for (const resource of resources) {
    const idempotencyKey = `google-sync:${resource.id}:${syncType}:${periodStart.toISOString()}:${periodEnd.toISOString()}`;
    const run = await prisma.googleIntegrationSyncRun.upsert({
      where: { idempotencyKey },
      create: {
        projectId,
        connectionId: resource.connectionId,
        resourceId: resource.id,
        syncType,
        status: "PENDING",
        periodStart,
        periodEnd,
        startedById: userId,
        idempotencyKey,
      },
      update: {},
    });
    runs.push(run);
  }
  return runs;
}

/** Atomically claims a PENDING run — never a plain findUnique + update (spec section 35). */
async function claimRun(runId: string): Promise<boolean> {
  const token = randomUUID();
  const claim = await prisma.googleIntegrationSyncRun.updateMany({
    where: { id: runId, status: "PENDING", lockedAt: null },
    data: { status: "RUNNING", startedAt: new Date(), lockedAt: new Date(), lockExpiresAt: new Date(Date.now() + GOOGLE_INTEGRATION_LIMITS.SYNC_LOCK_DURATION_MS), executionToken: token },
  });
  return claim.count > 0;
}

/** Processes exactly one sync run to completion. Safe to call repeatedly — a non-PENDING run is a no-op. */
export async function processSyncRun(runId: string): Promise<void> {
  const claimed = await claimRun(runId);
  if (!claimed) return;

  const run = await prisma.googleIntegrationSyncRun.findUniqueOrThrow({ where: { id: runId }, include: { resource: true, connection: true } });
  const projectId = run.projectId;
  const actorId = run.startedById ?? run.connection.connectedById;

  await publishAutomationEvent({
    projectId,
    eventKey: "integration.sync_started",
    resourceId: run.id,
    actorId,
    payload: { provider: run.resource.type === "GA4_PROPERTY" ? "ga4" : "gsc", resourceId: run.resourceId },
    idempotencyKey: `integration.sync_started:${run.id}`,
  }).catch(() => null);

  const tokenResult = await getValidAccessToken(projectId);
  if ("error" in tokenResult) {
    await failRun(run.id, tokenResult.error, "AUTH");
    if (tokenResult.reauthRequired) await notifyGoogleResourceLostAccess(projectId, run.resource.name).catch(() => null);
    return;
  }

  const startDate = isoDate(run.periodStart);
  const endDate = isoDate(run.periodEnd);
  const counts: PersistCounts = { created: 0, updated: 0, skipped: 0 };
  let rowsReceived = 0;
  let limited = false;

  try {
    if (run.resource.type === "GA4_PROPERTY") {
      const metricEntries = Object.entries(GA4_METRIC_MAP);
      const rows = await runGa4Report(tokenResult.accessToken, run.resource.externalId, metricEntries.map(([, apiName]) => apiName), startDate, endDate);
      rowsReceived = rows.length;
      for (const row of rows) {
        if (!row.date) continue;
        for (const [catalogKey, apiName] of metricEntries) {
          const raw = row.metrics[apiName];
          if (raw === undefined) continue;
          const value = GA4_FRACTION_TO_PERCENT_KEYS.has(catalogKey) ? raw * 100 : raw;
          const outcome = await persistPoint({
            projectId,
            createdById: actorId,
            metricKey: catalogKey,
            unit: findMetricDefinition(catalogKey)?.unit ?? "COUNT",
            value,
            currency: catalogKey === "ga4.total_revenue" ? "USD" : null,
            dateStr: row.date,
            provider: "ga4",
            externalReference: run.resource.externalId,
          });
          counts[outcome]++;
        }
      }
    } else {
      const { rows, limited: gscLimited } = await querySearchConsole(tokenResult.accessToken, run.resource.externalId, startDate, endDate);
      rowsReceived = rows.length;
      limited = gscLimited;
      const metricFieldMap: [string, "gsc.clicks" | "gsc.impressions" | "gsc.ctr" | "gsc.average_position"][] = [
        ["clicks", "gsc.clicks"],
        ["impressions", "gsc.impressions"],
        ["ctr", "gsc.ctr"],
        ["position", "gsc.average_position"],
      ];
      for (const row of rows) {
        if (!row.date) continue;
        for (const [field, catalogKey] of metricFieldMap) {
          const raw = (row as unknown as Record<string, number>)[field];
          const value = catalogKey === "gsc.ctr" ? raw * 100 : raw;
          const outcome = await persistPoint({
            projectId,
            createdById: actorId,
            metricKey: catalogKey,
            unit: findMetricDefinition(catalogKey)?.unit ?? "COUNT",
            value,
            dateStr: row.date,
            provider: "gsc",
            externalReference: run.resource.externalId,
          });
          counts[outcome]++;
        }
      }
    }
  } catch (err) {
    const message = err instanceof GoogleApiError ? err.message : "Error al sincronizar con Google.";
    const isNotAccessible = err instanceof GoogleApiError && (err.category === "NOT_ACCESSIBLE" || err.category === "SCOPE_INSUFFICIENT");
    await failRun(run.id, message, err instanceof GoogleApiError ? err.category : "TEMPORARY");
    if (isNotAccessible) await notifyGoogleResourceLostAccess(projectId, run.resource.name).catch(() => null);
    else await notifyGoogleSyncFailed(projectId, run.resource.name).catch(() => null);
    await publishAutomationEvent({
      projectId,
      eventKey: "integration.sync_failed",
      resourceId: run.id,
      payload: { provider: run.resource.type === "GA4_PROPERTY" ? "ga4" : "gsc", resourceId: run.resourceId },
      idempotencyKey: `integration.sync_failed:${run.id}`,
    }).catch(() => null);
    return;
  }

  const totalPoints = counts.created + counts.updated;
  const status = limited || counts.skipped > totalPoints ? "PARTIAL" : "COMPLETED";

  await prisma.$transaction([
    prisma.googleIntegrationSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        completedAt: new Date(),
        rowsReceived,
        pointsCreated: counts.created,
        pointsUpdated: counts.updated,
        pointsSkipped: counts.skipped,
        lockedAt: null,
        lockExpiresAt: null,
      },
    }),
    prisma.googleIntegrationResource.update({ where: { id: run.resourceId }, data: { lastSyncedAt: new Date() } }),
  ]);

  await logIntegrationAction(projectId, actorId, status === "PARTIAL" ? "integration.sync_partial" : "integration.sync_completed", "GoogleIntegrationSyncRun", run.id, { rowsReceived, pointsCreated: counts.created, pointsUpdated: counts.updated, pointsSkipped: counts.skipped });
  await publishAutomationEvent({
    projectId,
    eventKey: status === "PARTIAL" ? "integration.sync_partial" : "integration.sync_completed",
    resourceId: run.id,
    payload: { provider: run.resource.type === "GA4_PROPERTY" ? "ga4" : "gsc", resourceId: run.resourceId, rowsReceived, pointsCreated: counts.created },
    idempotencyKey: `${status === "PARTIAL" ? "integration.sync_partial" : "integration.sync_completed"}:${run.id}`,
  });
  if (status === "PARTIAL") await notifyGoogleSyncPartial(projectId, run.resource.name).catch(() => null);
}

async function failRun(runId: string, message: string, category: string) {
  await prisma.googleIntegrationSyncRun.update({
    where: { id: runId },
    data: { status: "FAILED", completedAt: new Date(), errorMessage: message.slice(0, GOOGLE_INTEGRATION_LIMITS.MAX_SAFE_ERROR_MESSAGE_LENGTH), errorCategory: category, lockedAt: null, lockExpiresAt: null },
  });
}

/** Releases runs stuck in RUNNING past their lock expiry (a crashed batch) — never auto-marks them as successful. */
export async function reconcileStaleGoogleSyncLocks(): Promise<number> {
  const result = await prisma.googleIntegrationSyncRun.updateMany({
    where: { status: "RUNNING", lockExpiresAt: { lt: new Date() } },
    data: { status: "FAILED", errorMessage: "La sincronización se interrumpió inesperadamente.", errorCategory: "TEMPORARY", completedAt: new Date(), lockedAt: null, lockExpiresAt: null },
  });
  return result.count;
}

/** The cron/batch entry point (spec section 24) — one incremental sync per active resource whose connection is CONNECTED, bounded per invocation. */
export async function processPendingGoogleSyncs(limit = 20): Promise<{ created: number; processed: number }> {
  const resources = await prisma.googleIntegrationResource.findMany({
    where: { active: true, connection: { status: "CONNECTED" } },
    include: { connection: true },
    take: limit,
  });

  const now = new Date();
  const periodEnd = now;
  let created = 0;
  const runIds: string[] = [];
  for (const resource of resources) {
    const lookback = new Date((resource.lastSyncedAt ?? new Date(now.getTime() - GOOGLE_INTEGRATION_LIMITS.DEFAULT_INITIAL_PERIOD_DAYS * 86_400_000)).getTime() - GOOGLE_INTEGRATION_LIMITS.INCREMENTAL_LOOKBACK_DAYS * 86_400_000);
    const runs = await createSyncRuns(resource.projectId, null, [resource.id], resource.lastSyncedAt ? "INCREMENTAL" : "INITIAL", lookback, periodEnd);
    created += runs.length;
    runIds.push(...runs.map((r) => r.id));
  }

  let processed = 0;
  for (const runId of runIds) {
    try {
      await processSyncRun(runId);
      processed++;
    } catch {
      // One resource's failure never blocks the rest of the batch (matches runPerformanceCronCycle's per-project isolation).
    }
  }

  await detectStaleGoogleResources();

  return { created, processed };
}

/** Flags active resources that haven't synced in a while (spec sections 27/29/30: "datos desactualizados") — read-only detection, never alters any metric data. */
const STALE_THRESHOLD_DAYS = 3;
export async function detectStaleGoogleResources(): Promise<number> {
  const threshold = new Date(Date.now() - STALE_THRESHOLD_DAYS * 86_400_000);
  const staleResources = await prisma.googleIntegrationResource.findMany({
    where: { active: true, connection: { status: "CONNECTED" }, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: threshold } }] },
    include: { connection: true },
  });
  for (const resource of staleResources) {
    const daysStale = resource.lastSyncedAt ? Math.floor((Date.now() - resource.lastSyncedAt.getTime()) / 86_400_000) : STALE_THRESHOLD_DAYS;
    await publishAutomationEvent({
      projectId: resource.projectId,
      eventKey: "integration.data_stale",
      resourceId: resource.id,
      payload: { provider: resource.type === "GA4_PROPERTY" ? "ga4" : "gsc", resourceId: resource.id, daysStale },
      idempotencyKey: `integration.data_stale:${resource.id}:${new Date().toISOString().slice(0, 10)}`,
    }).catch(() => null);
    await notifyGoogleDataStale(resource.projectId, resource.name, daysStale).catch(() => null);
  }
  return staleResources.length;
}

interface ResourceImportConfig {
  periodDays?: number;
}

/** "Sincronizar ahora" (spec section 23) — drives the created run(s) to completion synchronously so the UI gets an immediate result; bounded by MAX_SELECTED_RESOURCES resources per call. */
export async function triggerManualSync(projectId: string, userId: string, resourceIds: string[]): Promise<{ runIds: string[] } | { error: string }> {
  const resources = await prisma.googleIntegrationResource.findMany({ where: { id: { in: resourceIds }, projectId, active: true } });
  if (resources.length === 0) return { error: "No hay propiedades activas seleccionadas para sincronizar." };

  const now = new Date();
  const runIds: string[] = [];
  for (const resource of resources) {
    const config = (resource.importConfig as unknown as ResourceImportConfig | null) ?? {};
    const periodStart = resource.lastSyncedAt
      ? new Date(resource.lastSyncedAt.getTime() - GOOGLE_INTEGRATION_LIMITS.INCREMENTAL_LOOKBACK_DAYS * 86_400_000)
      : new Date(now.getTime() - (config.periodDays ?? GOOGLE_INTEGRATION_LIMITS.DEFAULT_INITIAL_PERIOD_DAYS) * 86_400_000);
    const runs = await createSyncRuns(projectId, userId, [resource.id], resource.lastSyncedAt ? "MANUAL" : "INITIAL", periodStart, now);
    runIds.push(...runs.map((r) => r.id));
  }

  for (const runId of runIds) {
    await processSyncRun(runId);
  }
  return { runIds };
}

/** A user-requested resync of an explicit, bounded date range (spec sections 19, 25) — never an unlimited range (enforced by resyncRangeSchema). */
export async function resyncCustomRange(projectId: string, userId: string, resourceId: string, startDate: Date, endDate: Date): Promise<{ runId: string } | { error: string }> {
  const runs = await createSyncRuns(projectId, userId, [resourceId], "RESYNC", startDate, endDate);
  if (runs.length === 0) return { error: "La propiedad indicada no está activa o no existe." };
  await processSyncRun(runs[0].id);
  return { runId: runs[0].id };
}

export async function listSyncHistory(projectId: string, filter: { provider?: "ga4" | "gsc"; resourceId?: string; status?: string; manualOnly?: boolean; cursor?: string; limit: number }) {
  const where: Record<string, unknown> = { projectId };
  if (filter.resourceId) where.resourceId = filter.resourceId;
  if (filter.status) where.status = filter.status;
  if (filter.manualOnly) where.syncType = { in: ["MANUAL", "RESYNC"] };
  if (filter.provider) where.resource = { type: filter.provider === "ga4" ? "GA4_PROPERTY" : "SEARCH_CONSOLE_SITE" };

  const rows = await prisma.googleIntegrationSyncRun.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: { resource: true, startedBy: { select: { id: true, name: true, email: true } } },
  });
  const hasMore = rows.length > filter.limit;
  const page = hasMore ? rows.slice(0, filter.limit) : rows;
  return { runs: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

export async function getSyncRunDetail(projectId: string, runId: string) {
  const run = await prisma.googleIntegrationSyncRun.findUnique({ where: { id: runId }, include: { resource: true, startedBy: { select: { id: true, name: true, email: true } } } });
  if (!run || run.projectId !== projectId) return null;
  return run;
}

export interface ProviderOverview {
  activeResourceCount: number;
  lastSyncedAt: Date | null;
  lastRunStatus: string | null;
}

/** Per-provider summary for the Integrations index cards (spec section 4) — real counts/timestamps, never placeholders. */
export async function getGoogleProviderOverviews(projectId: string): Promise<{ ga4: ProviderOverview; gsc: ProviderOverview }> {
  async function overviewFor(type: "GA4_PROPERTY" | "SEARCH_CONSOLE_SITE"): Promise<ProviderOverview> {
    const [activeResourceCount, lastResource, lastRun] = await Promise.all([
      prisma.googleIntegrationResource.count({ where: { projectId, type, active: true } }),
      prisma.googleIntegrationResource.findFirst({ where: { projectId, type, lastSyncedAt: { not: null } }, orderBy: { lastSyncedAt: "desc" }, select: { lastSyncedAt: true } }),
      prisma.googleIntegrationSyncRun.findFirst({ where: { projectId, resource: { type } }, orderBy: { createdAt: "desc" }, select: { status: true } }),
    ]);
    return { activeResourceCount, lastSyncedAt: lastResource?.lastSyncedAt ?? null, lastRunStatus: lastRun?.status ?? null };
  }

  const [ga4, gsc] = await Promise.all([overviewFor("GA4_PROPERTY"), overviewFor("SEARCH_CONSOLE_SITE")]);
  return { ga4, gsc };
}

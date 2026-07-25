import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkflowRunStatus } from "@/generated/prisma/enums";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";
import type { AnalyticsFiltersInput, PaginationInput } from "@/lib/validation/workflow-analytics";
import { pickGranularity, bucketRows, type AnalyticsGranularity } from "@/lib/ai-workflows/analytics-time";
import { percentile, safeDivide } from "@/lib/ai-workflows/analytics-stats";
import { normalizedErrorLabel } from "@/lib/ai-workflows/error-normalization";
import { buildCsv, buildCsvFilename } from "@/lib/ai-workflows/csv";
import { WORKFLOW_EXECUTION_LIMITS } from "@/lib/ai-workflows/limits";

/**
 * AI Workflows analytics — read-only aggregation over the existing sources
 * of truth (WorkflowRun, WorkflowStepRun, AIUsage). Never duplicates a run's
 * data into a separate analytics table; every function here is a query
 * (aggregate/groupBy/count/minimal-select findMany), never a full load of
 * outputs/snapshots. Every function requires an explicit, server-derived
 * `AnalyticsScope` (userId + projectId) — never a client-supplied userId —
 * so results are always isolated to the caller's own data.
 */

export interface AnalyticsScope {
  userId: string;
  projectId: string;
}

export interface AnalyticsPeriod {
  from: Date;
  to: Date;
}

const DEFAULT_TOP_LIMIT = 10;
/** Bounds the in-memory duration list used for the median/p90 approximation — never "all rows ever," always period-bounded and additionally capped here. */
const MAX_DURATION_SAMPLE = 5000;
const MAX_EXPORT_ROWS = 5000;

function runWhere(scope: AnalyticsScope, filters: AnalyticsFiltersInput, period: AnalyticsPeriod): Prisma.WorkflowRunWhereInput {
  return {
    userId: scope.userId,
    projectId: scope.projectId,
    createdAt: { gte: period.from, lte: period.to },
    ...(filters.workflowId ? { workflowId: filters.workflowId } : {}),
    ...(filters.version ? { workflowVersion: filters.version } : {}),
    ...(filters.status ? { status: filters.status as WorkflowRunStatus } : {}),
    ...(filters.executionMode ? { executionMode: filters.executionMode } : {}),
    ...(filters.stepType ? { steps: { some: { stepType: filters.stepType } } } : {}),
    ...(filters.toolSlug ? { aiUsageEvents: { some: { toolSlug: filters.toolSlug } } } : {}),
    ...(filters.favoritesOnly || filters.activeOnly
      ? {
          workflow: {
            ...(filters.favoritesOnly ? { isFavorite: true } : {}),
            ...(filters.activeOnly ? { isActive: true } : {}),
          },
        }
      : {}),
  };
}

function usageWhere(scope: AnalyticsScope, filters: AnalyticsFiltersInput, period: AnalyticsPeriod): Prisma.AIUsageWhereInput {
  return {
    userId: scope.userId,
    projectId: scope.projectId,
    createdAt: { gte: period.from, lte: period.to },
    workflowRunId: { not: null },
    ...(filters.workflowId ? { workflowId: filters.workflowId } : {}),
    ...(filters.version ? { workflowVersion: filters.version } : {}),
    ...(filters.executionMode ? { executionMode: filters.executionMode } : {}),
    ...(filters.toolSlug ? { toolSlug: filters.toolSlug } : {}),
  };
}

// ---------------------------------------------------------------------------
// Global / per-workflow summary
// ---------------------------------------------------------------------------

export interface AnalyticsSummary {
  totalRuns: number;
  completed: number;
  failed: number;
  cancelled: number;
  interrupted: number;
  pending: number;
  running: number;
  successRate: number;
  failureRate: number;
  cancellationRate: number;
  interruptionRate: number;
  avgDurationMs: number | null;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  medianDurationMs: number | null;
  p90DurationMs: number | null;
  avgStepsPerRun: number;
  avgAiStepsPerRun: number;
  totalAiUsage: number;
  avgAiUsagePerRun: number;
}

/** Works both globally (no workflowId filter) and scoped to one workflow (filters.workflowId set) — the same aggregation either way. */
export async function getAnalyticsSummary(
  scope: AnalyticsScope,
  filters: AnalyticsFiltersInput,
  period: AnalyticsPeriod
): Promise<AnalyticsSummary> {
  const where = runWhere(scope, filters, period);

  const [statusGroups, aggregate, aiStepsCount, totalSteps, aiUsageCount, durationSample] = await Promise.all([
    prisma.workflowRun.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.workflowRun.aggregate({ where, _count: { _all: true }, _avg: { durationMs: true }, _min: { durationMs: true }, _max: { durationMs: true } }),
    prisma.workflowStepRun.count({ where: { stepType: "ai_tool", workflowRun: where } }),
    prisma.workflowStepRun.count({ where: { workflowRun: where } }),
    prisma.aIUsage.count({ where: usageWhere(scope, filters, period) }),
    prisma.workflowRun.findMany({ where: { ...where, durationMs: { not: null } }, select: { durationMs: true }, take: MAX_DURATION_SAMPLE }),
  ]);

  const statusCounts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const total = aggregate._count._all;
  const completed = statusCounts.COMPLETED ?? 0;
  const failed = statusCounts.FAILED ?? 0;
  const cancelled = statusCounts.CANCELLED ?? 0;
  const interrupted = statusCounts.INTERRUPTED ?? 0;
  const pending = (statusCounts.PENDING ?? 0) + (statusCounts.VALIDATING ?? 0);
  const running = statusCounts.RUNNING ?? 0;

  const sortedDurations = durationSample.map((d) => d.durationMs!).sort((a, b) => a - b);

  return {
    totalRuns: total,
    completed,
    failed,
    cancelled,
    interrupted,
    pending,
    running,
    successRate: safeDivide(completed, total),
    failureRate: safeDivide(failed, total),
    cancellationRate: safeDivide(cancelled, total),
    interruptionRate: safeDivide(interrupted, total),
    avgDurationMs: aggregate._avg.durationMs,
    minDurationMs: aggregate._min.durationMs,
    maxDurationMs: aggregate._max.durationMs,
    medianDurationMs: percentile(sortedDurations, 0.5),
    p90DurationMs: percentile(sortedDurations, 0.9),
    avgStepsPerRun: safeDivide(totalSteps, total),
    avgAiStepsPerRun: safeDivide(aiStepsCount, total),
    totalAiUsage: aiUsageCount,
    avgAiUsagePerRun: safeDivide(aiUsageCount, total),
  };
}

// ---------------------------------------------------------------------------
// Per-workflow table (for the global dashboard)
// ---------------------------------------------------------------------------

export interface WorkflowTableRow {
  workflowId: string;
  name: string;
  version: number;
  isFavorite: boolean;
  isActive: boolean;
  totalRuns: number;
  completed: number;
  failed: number;
  successRate: number;
  avgDurationMs: number | null;
  aiUsage: number;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  mostExecutedVersion: number | null;
}

export async function getWorkflowsTable(
  scope: AnalyticsScope,
  filters: AnalyticsFiltersInput,
  period: AnalyticsPeriod
): Promise<WorkflowTableRow[]> {
  const workflows = await prisma.workflow.findMany({
    where: {
      userId: scope.userId,
      OR: [{ projectId: scope.projectId }, { projectId: null }],
      ...(filters.favoritesOnly ? { isFavorite: true } : {}),
      ...(filters.activeOnly ? { isActive: true } : {}),
      ...(filters.workflowId ? { id: filters.workflowId } : {}),
    },
    select: { id: true, name: true, version: true, isFavorite: true, isActive: true },
  });
  if (workflows.length === 0) return [];
  const workflowIds = workflows.map((w) => w.id);

  const where: Prisma.WorkflowRunWhereInput = { ...runWhere(scope, filters, period), workflowId: { in: workflowIds } };

  const [byWorkflow, completedByWorkflow, lastSuccessByWorkflow, usageByWorkflow, byWorkflowVersion] = await Promise.all([
    prisma.workflowRun.groupBy({ by: ["workflowId"], where, _count: { _all: true }, _avg: { durationMs: true }, _max: { createdAt: true } }),
    prisma.workflowRun.groupBy({ by: ["workflowId"], where: { ...where, status: "COMPLETED" }, _count: { _all: true } }),
    prisma.workflowRun.groupBy({ by: ["workflowId"], where: { ...where, status: "COMPLETED" }, _max: { completedAt: true } }),
    prisma.aIUsage.groupBy({
      by: ["workflowId"],
      where: { userId: scope.userId, projectId: scope.projectId, workflowId: { in: workflowIds }, createdAt: { gte: period.from, lte: period.to } },
      _count: { _all: true },
    }),
    prisma.workflowRun.groupBy({ by: ["workflowId", "workflowVersion"], where, _count: { _all: true } }),
  ]);

  return workflows
    .map((w): WorkflowTableRow => {
      const base = byWorkflow.find((b) => b.workflowId === w.id);
      const completed = completedByWorkflow.find((b) => b.workflowId === w.id)?._count._all ?? 0;
      const total = base?._count._all ?? 0;
      const versionsForWorkflow = byWorkflowVersion.filter((v) => v.workflowId === w.id);
      const mostExecutedVersion =
        versionsForWorkflow.length > 0
          ? versionsForWorkflow.reduce((best, cur) => (cur._count._all > best._count._all ? cur : best)).workflowVersion
          : null;
      return {
        workflowId: w.id,
        name: w.name,
        version: w.version,
        isFavorite: w.isFavorite,
        isActive: w.isActive,
        totalRuns: total,
        completed,
        failed: 0, // filled below to avoid a 5th groupBy call
        successRate: safeDivide(completed, total),
        avgDurationMs: base?._avg.durationMs ?? null,
        aiUsage: usageByWorkflow.find((u) => u.workflowId === w.id)?._count._all ?? 0,
        lastRunAt: base?._max.createdAt ?? null,
        lastSuccessAt: lastSuccessByWorkflow.find((b) => b.workflowId === w.id)?._max.completedAt ?? null,
        mostExecutedVersion,
      };
    })
    .filter((row) => row.totalRuns > 0 || !filters.workflowId); // an explicit single-workflow lookup still returns the row even with zero runs; the global table hides zero-run noise only when not explicitly filtered
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

export interface TimeSeriesPoint {
  bucketStart: string;
  total: number;
  completed: number;
  failed: number;
  interrupted: number;
  cancelled: number;
  avgDurationMs: number | null;
  aiUsage: number;
}

export interface TimeSeriesResult {
  granularity: AnalyticsGranularity;
  points: TimeSeriesPoint[];
}

/** Fetches only scalar fields needed for bucketing (never outputs/snapshots) — bounded to the selected period, which is itself capped (see periodSchema). */
export async function getTimeSeries(scope: AnalyticsScope, filters: AnalyticsFiltersInput, period: AnalyticsPeriod): Promise<TimeSeriesResult> {
  const granularity = pickGranularity(period.from, period.to);
  const where = runWhere(scope, filters, period);

  const [runs, usageEvents] = await Promise.all([
    prisma.workflowRun.findMany({ where, select: { createdAt: true, status: true, durationMs: true } }),
    prisma.aIUsage.findMany({ where: usageWhere(scope, filters, period), select: { createdAt: true } }),
  ]);

  const runBuckets = bucketRows(runs, (r) => r.createdAt, period.from, period.to, granularity, (bucket) => {
    const durations = bucket.map((r) => r.durationMs).filter((d): d is number => d !== null);
    return {
      total: bucket.length,
      completed: bucket.filter((r) => r.status === "COMPLETED").length,
      failed: bucket.filter((r) => r.status === "FAILED").length,
      interrupted: bucket.filter((r) => r.status === "INTERRUPTED").length,
      cancelled: bucket.filter((r) => r.status === "CANCELLED").length,
      avgDurationMs: durations.length > 0 ? durations.reduce((s, v) => s + v, 0) / durations.length : null,
    };
  });
  const usageBuckets = bucketRows(usageEvents, (e) => e.createdAt, period.from, period.to, granularity, (bucket) => bucket.length);

  const points: TimeSeriesPoint[] = runBuckets.map((b, i) => ({
    bucketStart: b.bucketStart,
    ...b.value,
    aiUsage: usageBuckets[i]?.value ?? 0,
  }));

  return { granularity, points };
}

// ---------------------------------------------------------------------------
// Per-version comparison
// ---------------------------------------------------------------------------

export interface VersionMetricsRow {
  version: number;
  totalRuns: number;
  completed: number;
  failed: number;
  interrupted: number;
  successRate: number;
  avgDurationMs: number | null;
  aiUsage: number;
  tools: { toolSlug: string; label: string; count: number }[];
  firstRunAt: Date | null;
  lastRunAt: Date | null;
  successRateChangeVsPrevious: number | null;
}

/** Every version this Workflow has ever run under still appears here, even if the Workflow's live version has since moved on — sourced entirely from WorkflowRun.workflowVersion, never from the current Workflow.version. */
export async function getVersionMetrics(scope: AnalyticsScope, workflowId: string, period: AnalyticsPeriod): Promise<VersionMetricsRow[]> {
  const owned = await prisma.workflow.findUnique({ where: { id: workflowId }, select: { userId: true } });
  if (!owned || owned.userId !== scope.userId) return [];

  const where: Prisma.WorkflowRunWhereInput = {
    workflowId,
    userId: scope.userId,
    projectId: scope.projectId,
    createdAt: { gte: period.from, lte: period.to },
  };
  const usageWhereClause: Prisma.AIUsageWhereInput = {
    workflowId,
    userId: scope.userId,
    projectId: scope.projectId,
    createdAt: { gte: period.from, lte: period.to },
  };

  const [byVersion, byVersionStatus, usageByVersion, toolsByVersion] = await Promise.all([
    prisma.workflowRun.groupBy({ by: ["workflowVersion"], where, _count: { _all: true }, _avg: { durationMs: true }, _min: { createdAt: true }, _max: { createdAt: true } }),
    prisma.workflowRun.groupBy({ by: ["workflowVersion", "status"], where, _count: { _all: true } }),
    prisma.aIUsage.groupBy({ by: ["workflowVersion"], where: usageWhereClause, _count: { _all: true } }),
    prisma.aIUsage.groupBy({ by: ["workflowVersion", "toolSlug"], where: { ...usageWhereClause, toolSlug: { not: null } }, _count: { _all: true } }),
  ]);

  const versions = byVersion.map((v) => v.workflowVersion!).filter((v): v is number => v !== null).sort((a, b) => a - b);

  const rows: VersionMetricsRow[] = versions.map((version) => {
    const base = byVersion.find((v) => v.workflowVersion === version)!;
    const statuses = byVersionStatus.filter((s) => s.workflowVersion === version);
    const completed = statuses.find((s) => s.status === "COMPLETED")?._count._all ?? 0;
    const failed = statuses.find((s) => s.status === "FAILED")?._count._all ?? 0;
    const interrupted = statuses.find((s) => s.status === "INTERRUPTED")?._count._all ?? 0;
    const total = base._count._all;
    const tools = toolsByVersion
      .filter((t) => t.workflowVersion === version)
      .map((t) => ({ toolSlug: t.toolSlug!, label: findToolDefinition(t.toolSlug!)?.label ?? t.toolSlug!, count: t._count._all }));
    return {
      version,
      totalRuns: total,
      completed,
      failed,
      interrupted,
      successRate: safeDivide(completed, total),
      avgDurationMs: base._avg.durationMs,
      aiUsage: usageByVersion.find((u) => u.workflowVersion === version)?._count._all ?? 0,
      tools,
      firstRunAt: base._min.createdAt,
      lastRunAt: base._max.createdAt,
      successRateChangeVsPrevious: null,
    };
  });

  return rows.map((row, index) => ({
    ...row,
    successRateChangeVsPrevious: index > 0 ? row.successRate - rows[index - 1].successRate : null,
  }));
}

// ---------------------------------------------------------------------------
// Per step-type (and, when scoped to one workflow, per stepIndex) metrics
// ---------------------------------------------------------------------------

export interface StepTypeMetricsRow {
  stepType: string;
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  failureRate: number;
  avgDurationMs: number | null;
  avgAttempts: number | null;
  topError: { code: string; label: string; count: number } | null;
}

export interface StepIndexMetricsRow {
  stepIndex: number;
  stepType: string;
  total: number;
  failed: number;
  failureRate: number;
  avgDurationMs: number | null;
  avgAttempts: number | null;
}

export interface StepMetricsResult {
  byType: StepTypeMetricsRow[];
  byIndex: StepIndexMetricsRow[] | null;
  slowestStepType: string | null;
  mostFailedStepType: string | null;
  mostRetriedStepType: string | null;
}

export async function getStepMetrics(scope: AnalyticsScope, filters: AnalyticsFiltersInput, period: AnalyticsPeriod): Promise<StepMetricsResult> {
  const stepWhere: Prisma.WorkflowStepRunWhereInput = {
    workflowRun: runWhere(scope, filters, period),
    ...(filters.stepType ? { stepType: filters.stepType } : {}),
  };

  const [byType, byTypeStatus, errorsByType] = await Promise.all([
    prisma.workflowStepRun.groupBy({ by: ["stepType"], where: stepWhere, _count: { _all: true }, _avg: { durationMs: true, attemptNumber: true } }),
    prisma.workflowStepRun.groupBy({ by: ["stepType", "status"], where: stepWhere, _count: { _all: true } }),
    prisma.workflowStepRun.groupBy({
      by: ["stepType", "normalizedErrorCode"],
      where: { ...stepWhere, status: "FAILED", normalizedErrorCode: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const byTypeRows: StepTypeMetricsRow[] = byType.map((t) => {
    const statuses = byTypeStatus.filter((s) => s.stepType === t.stepType);
    const completed = statuses.find((s) => s.status === "COMPLETED")?._count._all ?? 0;
    const failed = statuses.find((s) => s.status === "FAILED")?._count._all ?? 0;
    const cancelled = statuses.find((s) => s.status === "CANCELLED")?._count._all ?? 0;
    const skipped = statuses.find((s) => s.status === "SKIPPED")?._count._all ?? 0;
    const total = t._count._all;
    const topErrorForType = errorsByType
      .filter((e) => e.stepType === t.stepType)
      .reduce<{ normalizedErrorCode: string | null; _count: { _all: number } } | null>(
        (best, cur) => (!best || cur._count._all > best._count._all ? cur : best),
        null
      );
    return {
      stepType: t.stepType,
      total,
      completed,
      failed,
      cancelled,
      skipped,
      failureRate: safeDivide(failed, total),
      avgDurationMs: t._avg.durationMs,
      avgAttempts: t._avg.attemptNumber,
      topError: topErrorForType?.normalizedErrorCode
        ? { code: topErrorForType.normalizedErrorCode, label: normalizedErrorLabel(topErrorForType.normalizedErrorCode), count: topErrorForType._count._all }
        : null,
    };
  });

  let byIndexRows: StepIndexMetricsRow[] | null = null;
  if (filters.workflowId) {
    const [byIndex, byIndexStatus] = await Promise.all([
      prisma.workflowStepRun.groupBy({ by: ["stepIndex", "stepType"], where: stepWhere, _count: { _all: true }, _avg: { durationMs: true, attemptNumber: true } }),
      prisma.workflowStepRun.groupBy({ by: ["stepIndex", "status"], where: stepWhere, _count: { _all: true } }),
    ]);
    byIndexRows = byIndex
      .sort((a, b) => a.stepIndex - b.stepIndex)
      .map((i) => {
        const failed = byIndexStatus.find((s) => s.stepIndex === i.stepIndex && s.status === "FAILED")?._count._all ?? 0;
        return {
          stepIndex: i.stepIndex,
          stepType: i.stepType,
          total: i._count._all,
          failed,
          failureRate: safeDivide(failed, i._count._all),
          avgDurationMs: i._avg.durationMs,
          avgAttempts: i._avg.attemptNumber,
        };
      });
  }

  const slowest = byTypeRows.reduce<StepTypeMetricsRow | null>((best, cur) => ((cur.avgDurationMs ?? -1) > (best?.avgDurationMs ?? -1) ? cur : best), null);
  const mostFailed = byTypeRows.reduce<StepTypeMetricsRow | null>((best, cur) => (cur.failed > (best?.failed ?? -1) ? cur : best), null);
  const mostRetried = byTypeRows.reduce<StepTypeMetricsRow | null>((best, cur) => ((cur.avgAttempts ?? 0) > (best?.avgAttempts ?? 0) ? cur : best), null);

  return {
    byType: byTypeRows,
    byIndex: byIndexRows,
    slowestStepType: slowest?.stepType ?? null,
    mostFailedStepType: mostFailed && mostFailed.failed > 0 ? mostFailed.stepType : null,
    mostRetriedStepType: mostRetried?.stepType ?? null,
  };
}

// ---------------------------------------------------------------------------
// Top tools / frequent errors
// ---------------------------------------------------------------------------

export interface TopToolRow {
  toolSlug: string;
  label: string;
  count: number;
}

export async function getTopTools(
  scope: AnalyticsScope,
  filters: AnalyticsFiltersInput,
  period: AnalyticsPeriod,
  limit: number = DEFAULT_TOP_LIMIT
): Promise<TopToolRow[]> {
  const where = usageWhere(scope, filters, period);
  const grouped = await prisma.aIUsage.groupBy({
    by: ["toolSlug"],
    where: { ...where, toolSlug: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { toolSlug: "desc" } },
    take: limit,
  });
  return grouped.map((g) => ({ toolSlug: g.toolSlug!, label: findToolDefinition(g.toolSlug!)?.label ?? g.toolSlug!, count: g._count._all }));
}

export interface FrequentErrorRow {
  code: string;
  label: string;
  count: number;
  lastSeenAt: Date | null;
  affectedWorkflowCount: number;
}

export async function getFrequentErrors(
  scope: AnalyticsScope,
  filters: AnalyticsFiltersInput,
  period: AnalyticsPeriod,
  limit: number = DEFAULT_TOP_LIMIT
): Promise<FrequentErrorRow[]> {
  const where: Prisma.WorkflowRunWhereInput = { ...runWhere(scope, filters, period), normalizedErrorCode: { not: null } };
  const grouped = await prisma.workflowRun.groupBy({
    by: ["normalizedErrorCode"],
    where,
    _count: { _all: true },
    _max: { completedAt: true },
    orderBy: { _count: { normalizedErrorCode: "desc" } },
    take: limit,
  });

  const results: FrequentErrorRow[] = [];
  for (const g of grouped) {
    const affected = await prisma.workflowRun.findMany({
      where: { ...where, normalizedErrorCode: g.normalizedErrorCode },
      select: { workflowId: true },
      distinct: ["workflowId"],
    });
    results.push({
      code: g.normalizedErrorCode!,
      label: normalizedErrorLabel(g.normalizedErrorCode),
      count: g._count._all,
      lastSeenAt: g._max.completedAt,
      affectedWorkflowCount: affected.length,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Recent runs (paginated, list-safe fields only — never outputs/snapshots)
// ---------------------------------------------------------------------------

export interface RecentRunRow {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  workflowVersion: number;
  executionMode: string;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  normalizedErrorCode: string | null;
  retryOfRunId: string | null;
  createdAt: Date;
}

export interface RecentRunsResult {
  rows: RecentRunRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getRecentRuns(
  scope: AnalyticsScope,
  filters: AnalyticsFiltersInput,
  period: AnalyticsPeriod,
  pagination: PaginationInput
): Promise<RecentRunsResult> {
  const where = runWhere(scope, filters, period);
  const [total, rows] = await Promise.all([
    prisma.workflowRun.count({ where }),
    prisma.workflowRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: {
        id: true,
        workflowId: true,
        status: true,
        workflowVersion: true,
        executionMode: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        normalizedErrorCode: true,
        retryOfRunId: true,
        createdAt: true,
        workflow: { select: { name: true } },
      },
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      workflowId: r.workflowId,
      workflowName: r.workflow.name,
      status: r.status,
      workflowVersion: r.workflowVersion,
      executionMode: r.executionMode,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      durationMs: r.durationMs,
      normalizedErrorCode: r.normalizedErrorCode,
      retryOfRunId: r.retryOfRunId,
      createdAt: r.createdAt,
    })),
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

// ---------------------------------------------------------------------------
// Run detail — analytics-only additions (duration, usage, retries, timeline)
// layered on top of the existing ownership-checked run lookup. Never selects
// leaseId/leaseOwner/executionToken; the caller (UI) additionally must not
// render workflowSnapshot's system prompts verbatim — see the run-detail
// component.
// ---------------------------------------------------------------------------

export interface WorkflowRunAnalyticsDetail {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  workflowVersion: number;
  executionMode: string;
  stopOnError: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  resumedAt: Date | null;
  createdAt: Date;
  durationMs: number | null;
  errorMessage: string | null;
  normalizedErrorCode: string | null;
  normalizedErrorLabel: string | null;
  interruptionReason: string | null;
  retryOfRun: { id: string; status: string; createdAt: Date; workflowVersion: number } | null;
  retries: { id: string; status: string; createdAt: Date; workflowVersion: number }[];
  savedToWorkspaceCount: number;
  steps: {
    id: string;
    stepIndex: number;
    stepType: string;
    outputVariable: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
    attemptNumber: number;
    errorMessage: string | null;
    normalizedErrorCode: string | null;
  }[];
  aiUsageEvents: {
    id: string;
    workflowStepRunId: string | null;
    toolSlug: string | null;
    provider: string;
    model: string;
    createdAt: Date;
    wasError: boolean;
  }[];
}

/**
 * The analytics-focused run detail — explicit `select` throughout, never a
 * blanket `include`, so leaseId/leaseOwner/executionToken and the full
 * workflowSnapshot (which can contain system prompts) are never fetched
 * here at all, let alone returned to the client. Step/run OUTPUT text is
 * likewise excluded — viewing full results remains WorkflowRunHistory's
 * existing job; this is metrics/timeline only.
 */
export async function getWorkflowRunAnalyticsDetail(scope: AnalyticsScope, runId: string): Promise<WorkflowRunAnalyticsDetail | null> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      workflowId: true,
      userId: true,
      projectId: true,
      status: true,
      workflowVersion: true,
      executionMode: true,
      stopOnError: true,
      startedAt: true,
      completedAt: true,
      cancelledAt: true,
      resumedAt: true,
      createdAt: true,
      durationMs: true,
      errorMessage: true,
      normalizedErrorCode: true,
      interruptionReason: true,
      workflow: { select: { name: true } },
      retryOfRun: { select: { id: true, status: true, createdAt: true, workflowVersion: true } },
      retries: { select: { id: true, status: true, createdAt: true, workflowVersion: true }, orderBy: { createdAt: "asc" } },
      steps: {
        orderBy: { stepIndex: "asc" },
        select: {
          id: true,
          stepIndex: true,
          stepType: true,
          outputVariable: true,
          status: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
          attemptNumber: true,
          errorMessage: true,
          normalizedErrorCode: true,
        },
      },
      aiUsageEvents: {
        select: { id: true, workflowStepRunId: true, toolSlug: true, provider: true, model: true, createdAt: true, wasError: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!run || run.userId !== scope.userId || run.projectId !== scope.projectId) return null;

  const savedToWorkspaceCount = await prisma.contentItem.count({
    where: { projectId: scope.projectId, authorId: scope.userId, sourceTool: { startsWith: `workflow-run:${run.workflowId}:${run.id}` } },
  });

  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflow.name,
    status: run.status,
    workflowVersion: run.workflowVersion,
    executionMode: run.executionMode,
    stopOnError: run.stopOnError,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    cancelledAt: run.cancelledAt,
    resumedAt: run.resumedAt,
    createdAt: run.createdAt,
    durationMs: run.durationMs,
    errorMessage: run.errorMessage,
    normalizedErrorCode: run.normalizedErrorCode,
    normalizedErrorLabel: run.normalizedErrorCode ? normalizedErrorLabel(run.normalizedErrorCode) : null,
    interruptionReason: run.interruptionReason,
    retryOfRun: run.retryOfRun,
    retries: run.retries,
    savedToWorkspaceCount,
    steps: run.steps,
    aiUsageEvents: run.aiUsageEvents,
  };
}

// ---------------------------------------------------------------------------
// SubWorkflow composition — own vs inherited (children's) duration, and
// direct vs inherited (children's) AI usage, for one specific run. Never a
// new usage-accounting system: durations are read straight off the existing
// WorkflowRun.durationMs of this run and its descendants, and AI usage is
// read straight off the existing AIUsage.workflowRunId correlation — this
// just SUMS/GROUPS what's already there, the same way every other function
// in this file does.
// ---------------------------------------------------------------------------

export interface WorkflowRunCompositionDetail {
  runId: string;
  /** This run's own duration minus every direct child run's duration — the time THIS run's own steps (not any SubWorkflow it called) actually spent. Null when the run (or a child still in flight) hasn't finished timing yet. */
  ownDurationMs: number | null;
  /** WorkflowRun.durationMs as persisted — includes every nested SubWorkflow's time. */
  totalDurationMs: number | null;
  /** Sum of every DIRECT child run's durationMs (grandchildren are already folded into their own parent's durationMs, so summing only direct children is correct and never double-counts). */
  childrenDurationMs: number;
  /** AIUsage rows attributed directly to this run's own steps. */
  directAiUsage: number;
  /** AIUsage rows attributed to any descendant (child, grandchild, ...) run — real AI calls made "on behalf of" this run by a nested SubWorkflow. */
  inheritedAiUsage: number;
  totalAiUsage: number;
  descendantRunCount: number;
}

/** Every descendant run id (children, grandchildren, ...) of `runId`, breadth-first — depth-bounded by the same MAX_WORKFLOW_NESTING_DEPTH real execution itself enforces, so a well-formed tree is always fully walked and a malformed one can never loop unbounded. */
async function collectDescendantRunIds(scope: AnalyticsScope, runId: string): Promise<string[]> {
  const ids: string[] = [];
  let frontier = [runId];
  for (let depth = 0; depth < WORKFLOW_EXECUTION_LIMITS.MAX_WORKFLOW_NESTING_DEPTH + 1 && frontier.length > 0; depth++) {
    const children = await prisma.workflowRun.findMany({
      where: { parentRunId: { in: frontier }, userId: scope.userId, projectId: scope.projectId },
      select: { id: true },
    });
    if (children.length === 0) break;
    const childIds = children.map((c) => c.id);
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

export async function getWorkflowRunComposition(scope: AnalyticsScope, runId: string): Promise<WorkflowRunCompositionDetail | null> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: { id: true, userId: true, projectId: true, durationMs: true },
  });
  if (!run || run.userId !== scope.userId || run.projectId !== scope.projectId) return null;

  const [directChildren, descendantIds] = await Promise.all([
    prisma.workflowRun.findMany({ where: { parentRunId: runId }, select: { durationMs: true } }),
    collectDescendantRunIds(scope, runId),
  ]);
  const childrenDurationMs = directChildren.reduce((sum, c) => sum + (c.durationMs ?? 0), 0);
  const ownDurationMs = run.durationMs !== null ? Math.max(0, run.durationMs - childrenDurationMs) : null;

  const [directAiUsage, inheritedAiUsage] = await Promise.all([
    prisma.aIUsage.count({ where: { workflowRunId: runId } }),
    descendantIds.length > 0 ? prisma.aIUsage.count({ where: { workflowRunId: { in: descendantIds } } }) : Promise.resolve(0),
  ]);

  return {
    runId,
    ownDurationMs,
    totalDurationMs: run.durationMs,
    childrenDurationMs,
    directAiUsage,
    inheritedAiUsage,
    totalAiUsage: directAiUsage + inheritedAiUsage,
    descendantRunCount: descendantIds.length,
  };
}

// ---------------------------------------------------------------------------
// CSV export — server-side only, period always required, rows always capped.
// ---------------------------------------------------------------------------

export interface CsvExportResult {
  filename: string;
  csv: string;
  rowCount: number;
  truncated: boolean;
}

export async function exportWorkflowsSummaryCsv(scope: AnalyticsScope, filters: AnalyticsFiltersInput, period: AnalyticsPeriod): Promise<CsvExportResult> {
  const rows = (await getWorkflowsTable(scope, filters, period)).slice(0, MAX_EXPORT_ROWS);
  const csv = buildCsv(
    [
      { key: "workflowId", header: "workflow_id" },
      { key: "name", header: "nombre" },
      { key: "version", header: "version_actual" },
      { key: "totalRuns", header: "ejecuciones" },
      { key: "completed", header: "completadas" },
      { key: "successRate", header: "tasa_exito" },
      { key: "avgDurationMs", header: "duracion_media_ms" },
      { key: "aiUsage", header: "uso_ia" },
      { key: "mostExecutedVersion", header: "version_mas_ejecutada" },
    ],
    rows
  );
  return { filename: buildCsvFilename("workflows-summary", period.from, period.to), csv, rowCount: rows.length, truncated: rows.length >= MAX_EXPORT_ROWS };
}

export async function exportRunsCsv(
  scope: AnalyticsScope,
  filters: AnalyticsFiltersInput,
  period: AnalyticsPeriod
): Promise<CsvExportResult> {
  const where = runWhere(scope, filters, period);
  const rows = await prisma.workflowRun.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_EXPORT_ROWS,
    select: {
      id: true,
      workflowId: true,
      status: true,
      workflowVersion: true,
      executionMode: true,
      durationMs: true,
      normalizedErrorCode: true,
      retryOfRunId: true,
      createdAt: true,
      workflow: { select: { name: true } },
    },
  });
  const flat = rows.map((r) => ({
    id: r.id,
    workflowId: r.workflowId,
    workflowName: r.workflow.name,
    status: r.status,
    workflowVersion: r.workflowVersion,
    executionMode: r.executionMode,
    durationMs: r.durationMs ?? "",
    normalizedErrorCode: r.normalizedErrorCode ?? "",
    retryOfRunId: r.retryOfRunId ?? "",
    createdAt: r.createdAt.toISOString(),
  }));
  const csv = buildCsv(
    [
      { key: "id", header: "run_id" },
      { key: "workflowId", header: "workflow_id" },
      { key: "workflowName", header: "workflow_nombre" },
      { key: "status", header: "estado" },
      { key: "workflowVersion", header: "version" },
      { key: "executionMode", header: "modo" },
      { key: "durationMs", header: "duracion_ms" },
      { key: "normalizedErrorCode", header: "error_codigo" },
      { key: "retryOfRunId", header: "reintento_de" },
      { key: "createdAt", header: "fecha" },
    ],
    flat
  );
  return { filename: buildCsvFilename("runs", period.from, period.to), csv, rowCount: flat.length, truncated: flat.length >= MAX_EXPORT_ROWS };
}

export async function exportVersionMetricsCsv(scope: AnalyticsScope, workflowId: string, period: AnalyticsPeriod): Promise<CsvExportResult> {
  const rows = (await getVersionMetrics(scope, workflowId, period)).slice(0, MAX_EXPORT_ROWS);
  const flat = rows.map((r) => ({ ...r, tools: r.tools.map((t) => t.toolSlug).join("|") }));
  const csv = buildCsv(
    [
      { key: "version", header: "version" },
      { key: "totalRuns", header: "ejecuciones" },
      { key: "successRate", header: "tasa_exito" },
      { key: "failed", header: "fallidas" },
      { key: "interrupted", header: "interrumpidas" },
      { key: "avgDurationMs", header: "duracion_media_ms" },
      { key: "aiUsage", header: "uso_ia" },
      { key: "tools", header: "herramientas" },
    ],
    flat
  );
  return { filename: buildCsvFilename(`version-metrics-${workflowId}`, period.from, period.to), csv, rowCount: flat.length, truncated: false };
}

export async function exportStepMetricsCsv(scope: AnalyticsScope, filters: AnalyticsFiltersInput, period: AnalyticsPeriod): Promise<CsvExportResult> {
  const result = await getStepMetrics(scope, filters, period);
  const rows = result.byType.slice(0, MAX_EXPORT_ROWS).map((r) => ({ ...r, topError: r.topError?.code ?? "" }));
  const csv = buildCsv(
    [
      { key: "stepType", header: "tipo_paso" },
      { key: "total", header: "total" },
      { key: "completed", header: "completados" },
      { key: "failed", header: "fallidos" },
      { key: "failureRate", header: "tasa_fallo" },
      { key: "avgDurationMs", header: "duracion_media_ms" },
      { key: "avgAttempts", header: "intentos_medios" },
      { key: "topError", header: "error_mas_frecuente" },
    ],
    rows
  );
  return { filename: buildCsvFilename("step-metrics", period.from, period.to), csv, rowCount: rows.length, truncated: false };
}

export async function exportErrorsCsv(scope: AnalyticsScope, filters: AnalyticsFiltersInput, period: AnalyticsPeriod): Promise<CsvExportResult> {
  const rows = (await getFrequentErrors(scope, filters, period, MAX_EXPORT_ROWS)).map((r) => ({
    ...r,
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : "",
  }));
  const csv = buildCsv(
    [
      { key: "code", header: "codigo" },
      { key: "label", header: "descripcion" },
      { key: "count", header: "ocurrencias" },
      { key: "lastSeenAt", header: "ultima_aparicion" },
      { key: "affectedWorkflowCount", header: "workflows_afectados" },
    ],
    rows
  );
  return { filename: buildCsvFilename("errors", period.from, period.to), csv, rowCount: rows.length, truncated: false };
}

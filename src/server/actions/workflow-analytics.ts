"use server";

import { requireProjectAccess } from "@/lib/permissions";
import {
  analyticsFiltersSchema,
  periodSchema,
  paginationSchema,
  exportParamsSchema,
  type AnalyticsFiltersInput,
  type PeriodSchemaInput,
} from "@/lib/validation/workflow-analytics";
import { resolvePeriod } from "@/lib/ai-workflows/analytics-time";
import {
  getAnalyticsSummary,
  getWorkflowsTable,
  getTimeSeries,
  getVersionMetrics,
  type VersionMetricsRow,
  getStepMetrics,
  getTopTools,
  getFrequentErrors,
  getRecentRuns,
  getWorkflowRunAnalyticsDetail,
  type WorkflowRunAnalyticsDetail,
  getWorkflowRunComposition,
  type WorkflowRunCompositionDetail,
  exportWorkflowsSummaryCsv,
  exportRunsCsv,
  exportVersionMetricsCsv,
  exportStepMetricsCsv,
  exportErrorsCsv,
  type AnalyticsScope,
} from "@/server/services/workflow-analytics";

/**
 * Every action here does the same three things, in order, before touching
 * any data: (1) requireProjectAccess — real auth + project membership, (2)
 * Zod-validate every filter/period/pagination input, (3) build the
 * AnalyticsScope from the SERVER-resolved user id, never a client-supplied
 * one. No action accepts a userId parameter at all.
 */

function buildScope(userId: string, projectId: string): AnalyticsScope {
  return { userId, projectId };
}

async function resolveFiltersAndPeriod(rawFilters: unknown, rawPeriod: unknown): Promise<{ filters: AnalyticsFiltersInput; period: { from: Date; to: Date } } | { error: string }> {
  const filtersParsed = analyticsFiltersSchema.safeParse(rawFilters ?? {});
  if (!filtersParsed.success) return { error: filtersParsed.error.issues[0]?.message ?? "Filtros inválidos." };
  const periodParsed = periodSchema.safeParse(rawPeriod);
  if (!periodParsed.success) return { error: periodParsed.error.issues[0]?.message ?? "Periodo inválido." };
  return { filters: filtersParsed.data, period: resolvePeriod(periodParsed.data as PeriodSchemaInput) };
}

export async function getAnalyticsSummaryAction(projectId: string, rawFilters: unknown, rawPeriod: unknown) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const resolved = await resolveFiltersAndPeriod(rawFilters, rawPeriod);
  if ("error" in resolved) return resolved;
  return { data: await getAnalyticsSummary(buildScope(user.id, projectId), resolved.filters, resolved.period) };
}

export async function getWorkflowsTableAction(projectId: string, rawFilters: unknown, rawPeriod: unknown) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const resolved = await resolveFiltersAndPeriod(rawFilters, rawPeriod);
  if ("error" in resolved) return resolved;
  return { data: await getWorkflowsTable(buildScope(user.id, projectId), resolved.filters, resolved.period) };
}

export async function getTimeSeriesAction(projectId: string, rawFilters: unknown, rawPeriod: unknown) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const resolved = await resolveFiltersAndPeriod(rawFilters, rawPeriod);
  if ("error" in resolved) return resolved;
  return { data: await getTimeSeries(buildScope(user.id, projectId), resolved.filters, resolved.period) };
}

export async function getVersionMetricsAction(
  projectId: string,
  workflowId: string,
  rawPeriod: unknown
): Promise<{ error: string } | { data: VersionMetricsRow[] }> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const periodParsed = periodSchema.safeParse(rawPeriod);
  if (!periodParsed.success) return { error: periodParsed.error.issues[0]?.message ?? "Periodo inválido." };
  const period = resolvePeriod(periodParsed.data as PeriodSchemaInput);
  return { data: await getVersionMetrics(buildScope(user.id, projectId), workflowId, period) };
}

export async function getStepMetricsAction(projectId: string, rawFilters: unknown, rawPeriod: unknown) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const resolved = await resolveFiltersAndPeriod(rawFilters, rawPeriod);
  if ("error" in resolved) return resolved;
  return { data: await getStepMetrics(buildScope(user.id, projectId), resolved.filters, resolved.period) };
}

export async function getTopToolsAction(projectId: string, rawFilters: unknown, rawPeriod: unknown) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const resolved = await resolveFiltersAndPeriod(rawFilters, rawPeriod);
  if ("error" in resolved) return resolved;
  return { data: await getTopTools(buildScope(user.id, projectId), resolved.filters, resolved.period) };
}

export async function getFrequentErrorsAction(projectId: string, rawFilters: unknown, rawPeriod: unknown) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const resolved = await resolveFiltersAndPeriod(rawFilters, rawPeriod);
  if ("error" in resolved) return resolved;
  return { data: await getFrequentErrors(buildScope(user.id, projectId), resolved.filters, resolved.period) };
}

export async function getRecentRunsAction(projectId: string, rawFilters: unknown, rawPeriod: unknown, rawPagination: unknown) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const resolved = await resolveFiltersAndPeriod(rawFilters, rawPeriod);
  if ("error" in resolved) return resolved;
  const paginationParsed = paginationSchema.safeParse(rawPagination ?? {});
  if (!paginationParsed.success) return { error: paginationParsed.error.issues[0]?.message ?? "Paginación inválida." };
  return { data: await getRecentRuns(buildScope(user.id, projectId), resolved.filters, resolved.period, paginationParsed.data) };
}

/** Analytics-only extension of the run detail — duration/attempts/AI usage/retries/timeline. Never returns leaseId/leaseOwner/executionToken (getWorkflowRunAnalyticsDetail's own select never fetches them for aiUsageEvents, and the run row's lease fields, while present on the Prisma result, are never read by the UI layer that consumes this — see workflow-run-detail.tsx). */
export async function getWorkflowRunAnalyticsDetailAction(
  projectId: string,
  runId: string
): Promise<{ error: string } | { data: WorkflowRunAnalyticsDetail }> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const run = await getWorkflowRunAnalyticsDetail(buildScope(user.id, projectId), runId);
  if (!run) return { error: "Ejecución no encontrada." };
  return { data: run };
}

/** SubWorkflow composition for one run — own vs children's duration, direct vs inherited AI usage. See getWorkflowRunComposition for how "inherited" is derived (never a new usage-accounting system). */
export async function getWorkflowRunCompositionAction(
  projectId: string,
  runId: string
): Promise<{ error: string } | { data: WorkflowRunCompositionDetail }> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const composition = await getWorkflowRunComposition(buildScope(user.id, projectId), runId);
  if (!composition) return { error: "Ejecución no encontrada." };
  return { data: composition };
}

export interface ExportAnalyticsCsvInput {
  type: unknown;
  period: unknown;
  filters?: unknown;
  /** Required only for the "version_metrics" export type. */
  workflowId?: string;
}

export async function exportWorkflowAnalyticsCsvAction(projectId: string, input: ExportAnalyticsCsvInput) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const parsed = exportParamsSchema.safeParse({ type: input.type, period: input.period, filters: input.filters });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Parámetros de exportación inválidos." };

  const scope = buildScope(user.id, projectId);
  const period = resolvePeriod(parsed.data.period);
  const filters = parsed.data.filters ?? {};

  switch (parsed.data.type) {
    case "workflows_summary":
      return { data: await exportWorkflowsSummaryCsv(scope, filters, period) };
    case "runs":
      return { data: await exportRunsCsv(scope, filters, period) };
    case "version_metrics": {
      const workflowId = filters.workflowId ?? input.workflowId;
      if (!workflowId) return { error: "Selecciona un workflow para exportar sus métricas por versión." };
      return { data: await exportVersionMetricsCsv(scope, workflowId, period) };
    }
    case "step_metrics":
      return { data: await exportStepMetricsCsv(scope, filters, period) };
    case "errors":
      return { data: await exportErrorsCsv(scope, filters, period) };
    default:
      return { error: "Tipo de exportación no soportado." };
  }
}

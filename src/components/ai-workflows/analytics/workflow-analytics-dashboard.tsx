"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import {
  getAnalyticsSummaryAction,
  getWorkflowsTableAction,
  getTimeSeriesAction,
  getVersionMetricsAction,
  getStepMetricsAction,
  getTopToolsAction,
  getFrequentErrorsAction,
  getRecentRunsAction,
  exportWorkflowAnalyticsCsvAction,
} from "@/server/actions/workflow-analytics";
import type { ANALYTICS_PERIOD_PRESETS } from "@/lib/ai-workflows/analytics-time";
import type {
  AnalyticsSummary,
  WorkflowTableRow,
  TimeSeriesResult,
  VersionMetricsRow,
  StepMetricsResult,
  TopToolRow,
  FrequentErrorRow,
  RecentRunsResult,
} from "@/server/services/workflow-analytics";
import { TimeSeriesChart } from "@/components/ai-workflows/analytics/time-series-chart";
import { RunDetailPanel } from "@/components/ai-workflows/analytics/run-detail-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type Preset = (typeof ANALYTICS_PERIOD_PRESETS)[number];
const PRESET_LABELS: Record<Preset, string> = { "24h": "Últimas 24 horas", "7d": "Últimos 7 días", "30d": "Últimos 30 días", "90d": "Últimos 90 días" };
const ALL_VALUE = "__all__";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  VALIDATING: "Validando",
  RUNNING: "En curso",
  INTERRUPTED: "Interrumpida",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  CANCELLED: "Cancelada",
};
const EXECUTION_MODE_LABELS: Record<string, string> = {
  PUBLISHED: "Publicada (producción)",
  DRAFT_TEST: "Prueba de borrador",
  RETRY_ORIGINAL_SNAPSHOT: "Reintento (snapshot)",
  RETRY_CURRENT_VERSION: "Reintento (v. actual)",
  NEW: "Nueva (legado)",
};

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

interface WorkflowOption {
  id: string;
  name: string;
}

export function WorkflowAnalyticsDashboard({ projectId, workflows }: { projectId: string; workflows: WorkflowOption[] }) {
  const [preset, setPreset] = useState<Preset>("7d");
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [workflowsTable, setWorkflowsTable] = useState<WorkflowTableRow[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesResult | null>(null);
  const [versionMetrics, setVersionMetrics] = useState<VersionMetricsRow[]>([]);
  const [stepMetrics, setStepMetrics] = useState<StepMetricsResult | null>(null);
  const [topTools, setTopTools] = useState<TopToolRow[]>([]);
  const [frequentErrors, setFrequentErrors] = useState<FrequentErrorRow[]>([]);
  const [recentRuns, setRecentRuns] = useState<RecentRunsResult | null>(null);

  const period = useMemo(() => ({ preset }), [preset]);
  const filters = useMemo(
    () => ({
      workflowId: workflowId ?? undefined,
      status: status ?? undefined,
      executionMode: executionMode ?? undefined,
      favoritesOnly: favoritesOnly || undefined,
      activeOnly: activeOnly || undefined,
    }),
    [workflowId, status, executionMode, favoritesOnly, activeOnly]
  );

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      setLoading(true);
      setErrorMessage(null);

      const [s, wt, ts, vm, sm, tt, fe, rr] = await Promise.all([
        getAnalyticsSummaryAction(projectId, filters, period),
        getWorkflowsTableAction(projectId, filters, period),
        getTimeSeriesAction(projectId, filters, period),
        workflowId
          ? getVersionMetricsAction(projectId, workflowId, period)
          : Promise.resolve<{ data: VersionMetricsRow[] }>({ data: [] }),
        getStepMetricsAction(projectId, filters, period),
        getTopToolsAction(projectId, filters, period),
        getFrequentErrorsAction(projectId, filters, period),
        getRecentRunsAction(projectId, filters, period, { page, pageSize: 10 }),
      ]);
      if (cancelled) return;

      const firstError = [s, wt, ts, vm, sm, tt, fe, rr].find((r) => "error" in r) as { error: string } | undefined;
      if (firstError) {
        setErrorMessage(firstError.error);
        setLoading(false);
        return;
      }
      setSummary("data" in s ? s.data : null);
      setWorkflowsTable("data" in wt ? wt.data : []);
      setTimeSeries("data" in ts ? ts.data : null);
      setVersionMetrics("data" in vm ? vm.data : []);
      setStepMetrics("data" in sm ? sm.data : null);
      setTopTools("data" in tt ? tt.data : []);
      setFrequentErrors("data" in fe ? fe.data : []);
      setRecentRuns("data" in rr ? rr.data : null);
      setLoading(false);
    }

    refresh();

    return () => {
      cancelled = true;
    };
  }, [projectId, filters, period, page, workflowId]);

  async function handleExport(type: "workflows_summary" | "runs" | "version_metrics" | "step_metrics" | "errors") {
    const result = await exportWorkflowAnalyticsCsvAction(projectId, { type, period, filters, workflowId: workflowId ?? undefined });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.data.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    if (result.data.truncated) toast.info(`Se exportaron las primeras ${result.data.rowCount} filas (límite de exportación).`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PRESET_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={workflowId ?? ALL_VALUE} onValueChange={(v) => setWorkflowId(v === ALL_VALUE ? null : v)}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder="Todos los workflows" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los workflows</SelectItem>
            {workflows.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status ?? ALL_VALUE} onValueChange={(v) => setStatus(v === ALL_VALUE ? null : v)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los estados</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={executionMode ?? ALL_VALUE} onValueChange={(v) => setExecutionMode(v === ALL_VALUE ? null : v)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Todos los modos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los modos</SelectItem>
            {Object.entries(EXECUTION_MODE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button type="button" variant={favoritesOnly ? "secondary" : "outline"} size="sm" onClick={() => setFavoritesOnly((v) => !v)}>
          Favoritos
        </Button>
        <Button type="button" variant={activeOnly ? "secondary" : "outline"} size="sm" onClick={() => setActiveOnly((v) => !v)}>
          Solo activos
        </Button>
      </div>

      {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

      {loading && !summary ? (
        <p className="text-sm text-muted-foreground">Cargando analítica...</p>
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Ejecuciones totales" value={summary.totalRuns} />
            <Kpi label="Tasa de éxito" value={formatPct(summary.successRate)} />
            <Kpi label="Tasa de fallo" value={formatPct(summary.failureRate)} />
            <Kpi label="Tasa de interrupción" value={formatPct(summary.interruptionRate)} />
            <Kpi label="Duración media" value={formatMs(summary.avgDurationMs)} />
            <Kpi label="Duración mediana" value={formatMs(summary.medianDurationMs)} />
            <Kpi label="Pasos IA medios" value={summary.avgAiStepsPerRun.toFixed(1)} />
            <Kpi label="Uso de IA total" value={summary.totalAiUsage} sub="operaciones IA registradas" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ejecuciones en el tiempo</CardTitle>
            </CardHeader>
            <CardContent>{timeSeries ? <TimeSeriesChart points={timeSeries.points} granularity={timeSeries.granularity} /> : null}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribución por estado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <StatusBar label="Completadas" count={summary.completed} total={summary.totalRuns} className="bg-emerald-500" />
              <StatusBar label="Fallidas" count={summary.failed} total={summary.totalRuns} className="bg-destructive" />
              <StatusBar label="Canceladas" count={summary.cancelled} total={summary.totalRuns} className="bg-muted-foreground" />
              <StatusBar label="Interrumpidas" count={summary.interrupted} total={summary.totalRuns} className="bg-amber-500" />
              <StatusBar label="En curso / pendientes" count={summary.running + summary.pending} total={summary.totalRuns} className="bg-primary" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Workflows</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => handleExport("workflows_summary")}>
                <Download className="size-3.5" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              {workflowsTable.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin ejecuciones en este periodo.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Workflow</TableHead>
                        <TableHead>Versión</TableHead>
                        <TableHead>Ejecuciones</TableHead>
                        <TableHead>Éxito</TableHead>
                        <TableHead>Duración media</TableHead>
                        <TableHead>Uso IA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workflowsTable.map((row) => (
                        <TableRow key={row.workflowId}>
                          <TableCell className="font-medium">
                            {row.name} {row.isFavorite ? <Badge variant="outline">★</Badge> : null}
                          </TableCell>
                          <TableCell>v{row.version}</TableCell>
                          <TableCell>{row.totalRuns}</TableCell>
                          <TableCell>{formatPct(row.successRate)}</TableCell>
                          <TableCell>{formatMs(row.avgDurationMs)}</TableCell>
                          <TableCell>{row.aiUsage}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {workflowId ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Versiones</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => handleExport("version_metrics")}>
                  <Download className="size-3.5" /> CSV
                </Button>
              </CardHeader>
              <CardContent>
                {versionMetrics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin ejecuciones de este workflow en este periodo.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Versión</TableHead>
                          <TableHead>Ejecuciones</TableHead>
                          <TableHead>Éxito</TableHead>
                          <TableHead>Cambio</TableHead>
                          <TableHead>Duración media</TableHead>
                          <TableHead>Uso IA</TableHead>
                          <TableHead>Última ejecución</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {versionMetrics.map((row) => (
                          <TableRow key={row.version}>
                            <TableCell>v{row.version}</TableCell>
                            <TableCell>{row.totalRuns}</TableCell>
                            <TableCell>{formatPct(row.successRate)}</TableCell>
                            <TableCell>
                              {row.successRateChangeVsPrevious === null
                                ? "—"
                                : `${row.successRateChangeVsPrevious >= 0 ? "+" : ""}${formatPct(row.successRateChangeVsPrevious)}`}
                            </TableCell>
                            <TableCell>{formatMs(row.avgDurationMs)}</TableCell>
                            <TableCell>{row.aiUsage}</TableCell>
                            <TableCell>{row.lastRunAt ? new Date(row.lastRunAt).toLocaleDateString("es-ES") : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Pasos problemáticos</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => handleExport("step_metrics")}>
                  <Download className="size-3.5" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {!stepMetrics || stepMetrics.byType.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  stepMetrics.byType.map((row) => (
                    <div key={row.stepType} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <div>
                        <p className="font-medium">{row.stepType}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.total} ejecuciones · {formatPct(row.failureRate)} fallo · {formatMs(row.avgDurationMs)}
                        </p>
                      </div>
                      {row.topError ? <Badge variant="destructive">{row.topError.label}</Badge> : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Herramientas más usadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topTools.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin uso de IA en este periodo.</p>
                ) : (
                  topTools.map((tool) => (
                    <div key={tool.toolSlug} className="flex items-center justify-between text-sm">
                      <span>{tool.label}</span>
                      <Badge variant="outline">{tool.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Errores frecuentes</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => handleExport("errors")}>
                <Download className="size-3.5" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {frequentErrors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin errores en este periodo.</p>
              ) : (
                frequentErrors.map((err) => (
                  <div key={err.code} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <div>
                      <p className="font-medium">{err.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {err.count} ocurrencias · {err.affectedWorkflowCount} workflows afectados
                      </p>
                    </div>
                    <Badge variant="outline">{err.code}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Ejecuciones recientes</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => handleExport("runs")}>
                <Download className="size-3.5" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {!recentRuns || recentRuns.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin ejecuciones en este periodo.</p>
              ) : (
                <>
                  {recentRuns.rows.map((run) => {
                    const open = expandedRunId === run.id;
                    return (
                      <div key={run.id} className="rounded-lg border">
                        <button
                          type="button"
                          onClick={() => setExpandedRunId(open ? null : run.id)}
                          className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant={run.status === "COMPLETED" ? "default" : run.status === "FAILED" ? "destructive" : "outline"}>
                              {STATUS_LABELS[run.status] ?? run.status}
                            </Badge>
                            <span className="font-medium">{run.workflowName}</span>
                            <Badge variant="outline">v{run.workflowVersion}</Badge>
                            <span className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString("es-ES")}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {formatMs(run.durationMs)}
                            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                          </div>
                        </button>
                        {open ? <RunDetailPanel projectId={projectId} runId={run.id} /> : null}
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-2">
                    <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      Anterior
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Página {recentRuns.page} de {Math.max(1, Math.ceil(recentRuns.total / recentRuns.pageSize))}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page * recentRuns.pageSize >= recentRuns.total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub ? <p className="text-[11px] text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function StatusBar({ label, count, total, className }: { label: string; count: number; total: number; className: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {count} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

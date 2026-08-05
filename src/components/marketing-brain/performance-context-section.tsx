"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataQualityPanel } from "@/components/performance/data-quality-panel";
import { MetricOriginBadge } from "@/components/performance/metric-origin-badge";
import { PERFORMANCE_METRIC_DEFINITIONS } from "@/lib/performance/metrics-catalog";
import { listContentItemsForSelectAction, listCampaignsForSelectAction, listSocialPostsForSelectAction } from "@/server/actions/performance-select";
import { listGoalsAction } from "@/server/actions/performance-goals";
import { listBenchmarksAction } from "@/server/actions/performance-goals";
import { listExperimentsAction } from "@/server/actions/performance-experiments";
import { listRecommendationsAction } from "@/server/actions/performance-recommendations";
import { listReportsAction } from "@/server/actions/performance-reports";
import { previewPerformanceContextAction, createOptimizationSessionAction, updateSessionSelectionAction } from "@/server/actions/marketing-brain-optimization";
import type { PerformanceContextSelectionInput, PerformanceContextBundle } from "@/lib/marketing-brain/performance-context-types";

interface PerformanceContextSectionProps {
  projectId: string;
  runId: string;
  campaignId: string | null;
  selection: PerformanceContextSelectionInput;
  onChange: (next: PerformanceContextSelectionInput) => void;
}

const RESOURCE_TYPE_LABELS: Record<string, string> = { CONTENT_ITEM: "Contenido", CAMPAIGN: "Campaña", SOCIAL_POST: "Publicación", PROJECT: "Proyecto (sin recurso específico)" };
const EVIDENCE_LABELS: Record<string, string> = { STRONG: "Sólida", MODERATE: "Moderada", WEAK: "Débil", INSUFFICIENT: "Insuficiente" };

export function PerformanceContextSection({ projectId, runId, campaignId, selection, onChange }: PerformanceContextSectionProps) {
  const router = useRouter();
  const mode = selection.mode ?? "NONE";
  const resourceType = selection.resourceType ?? "CAMPAIGN";

  const [resourceOptions, setResourceOptions] = useState<{ id: string; label: string }[]>([]);
  const [goalOptions, setGoalOptions] = useState<{ id: string; metricKey: string }[]>([]);
  const [benchmarkOptions, setBenchmarkOptions] = useState<{ id: string; metricKey: string; label: string | null }[]>([]);
  const [experimentOptions, setExperimentOptions] = useState<{ id: string; name: string }[]>([]);
  const [recommendationOptions, setRecommendationOptions] = useState<{ id: string; title: string }[]>([]);
  const [reportOptions, setReportOptions] = useState<{ id: string; title: string }[]>([]);
  const [preview, setPreview] = useState<{ bundle: PerformanceContextBundle; periodStart: string; periodEnd: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (mode === "NONE") return;
    (async () => {
      if (resourceType === "CONTENT_ITEM") setResourceOptions((await listContentItemsForSelectAction(projectId)).map((i) => ({ id: i.id, label: i.title })));
      else if (resourceType === "CAMPAIGN") setResourceOptions((await listCampaignsForSelectAction(projectId)).map((c) => ({ id: c.id, label: c.name })));
      else if (resourceType === "SOCIAL_POST") setResourceOptions((await listSocialPostsForSelectAction(projectId)).map((p) => ({ id: p.id, label: `${p.platform} — ${p.internalTitle || p.text.slice(0, 30)}` })));
      else setResourceOptions([]);
    })();
  }, [projectId, resourceType, mode]);

  useEffect(() => {
    if (mode !== "MANUAL") return;
    (async () => {
      const [goals, benchmarks, experiments, recommendations, reports] = await Promise.all([
        listGoalsAction(projectId, { campaignId: campaignId ?? undefined, status: "ACTIVE" }),
        listBenchmarksAction(projectId),
        listExperimentsAction(projectId, { campaignId: campaignId ?? undefined }),
        listRecommendationsAction(projectId, { limit: 50 }),
        listReportsAction(projectId),
      ]);
      setGoalOptions(goals.map((g) => ({ id: g.id, metricKey: g.metricKey })));
      setBenchmarkOptions(benchmarks.map((b) => ({ id: b.id, metricKey: b.metricKey, label: b.label })));
      setExperimentOptions(experiments.map((e) => ({ id: e.id, name: e.name })));
      setRecommendationOptions(recommendations.map((r) => ({ id: r.id, title: r.title })));
      setReportOptions(reports.map((r) => ({ id: r.id, title: r.title })));
    })();
  }, [projectId, campaignId, mode]);

  function patch(next: Partial<PerformanceContextSelectionInput>) {
    onChange({ ...selection, ...next });
    setPreview(null);
  }

  function toggleId(field: keyof PerformanceContextSelectionInput, id: string) {
    const current = (selection[field] as string[] | undefined) ?? [];
    patch({ [field]: current.includes(id) ? current.filter((v) => v !== id) : [...current, id] } as Partial<PerformanceContextSelectionInput>);
  }

  async function handlePreview() {
    setLoadingPreview(true);
    const result = await previewPerformanceContextAction(projectId, campaignId, selection);
    setLoadingPreview(false);
    if ("errorMessage" in result) {
      toast.error(result.errorMessage);
      return;
    }
    setPreview(result);
  }

  async function handleStartAnalysis() {
    setStarting(true);
    const created = await createOptimizationSessionAction(projectId, { idempotencyKey: `mb-run:${runId}:${Date.now()}`, campaignId });
    if (created.errorMessage || !created.id) {
      toast.error(created.errorMessage ?? "No se pudo crear la sesión.");
      setStarting(false);
      return;
    }
    const updated = await updateSessionSelectionAction(projectId, created.id, selection);
    setStarting(false);
    if (updated.errorMessage) {
      toast.error(updated.errorMessage);
      return;
    }
    router.push(`/dashboard/${projectId}/marketing-brain/optimization/${created.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Usar contexto de rendimiento real</Label>
        <div className="flex flex-wrap gap-3 text-sm">
          {(["NONE", "RECOMMENDED", "MANUAL"] as const).map((m) => (
            <label key={m} className="flex items-center gap-1.5">
              <input type="radio" name="mb-context-mode" checked={mode === m} onChange={() => patch({ mode: m })} />
              {m === "NONE" ? "No usar (comportamiento anterior)" : m === "RECOMMENDED" ? "Recomendado (automático)" : "Selección manual"}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Marketing Brain sigue funcionando sin datos de rendimiento — esta sección es completamente opcional.</p>
      </div>

      {mode !== "NONE" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha inicial del periodo</Label>
              <Input type="date" value={selection.periodStart?.slice(0, 10) ?? ""} onChange={(e) => patch({ periodStart: e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : undefined })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha final del periodo</Label>
              <Input type="date" value={selection.periodEnd?.slice(0, 10) ?? ""} onChange={(e) => patch({ periodEnd: e.target.value ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString() : undefined })} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox checked={selection.compareToPreviousPeriod ?? false} onCheckedChange={(v) => patch({ compareToPreviousPeriod: v === true })} />
              <span className="text-xs">Comparar contra el periodo anterior equivalente</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de recurso</Label>
              <Select value={resourceType} onValueChange={(v) => v && patch({ resourceType: v as typeof resourceType, resourceIds: [] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RESOURCE_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === "MANUAL" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Recursos</Label>
                <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {resourceOptions.length === 0 ? <p className="text-xs text-muted-foreground">Sin elementos disponibles.</p> : null}
                  {resourceOptions.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={(selection.resourceIds ?? []).includes(r.id)} onCheckedChange={() => toggleId("resourceIds", r.id)} />
                      <span className="truncate">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Métricas</Label>
                <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {PERFORMANCE_METRIC_DEFINITIONS.filter((d) => d.compatibleResourceTypes.includes(resourceType)).map((d) => (
                    <label key={d.key} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={(selection.metricKeys ?? []).includes(d.key)} onCheckedChange={() => toggleId("metricKeys", d.key)} />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Objetivos</Label>
                <div className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {goalOptions.length === 0 ? <p className="text-xs text-muted-foreground">Sin objetivos activos.</p> : null}
                  {goalOptions.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={(selection.goalIds ?? []).includes(g.id)} onCheckedChange={() => toggleId("goalIds", g.id)} />
                      {g.metricKey}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Benchmarks</Label>
                <div className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {benchmarkOptions.length === 0 ? <p className="text-xs text-muted-foreground">Sin benchmarks.</p> : null}
                  {benchmarkOptions.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={(selection.benchmarkIds ?? []).includes(b.id)} onCheckedChange={() => toggleId("benchmarkIds", b.id)} />
                      {b.label ?? b.metricKey}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Experimentos</Label>
                <div className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {experimentOptions.length === 0 ? <p className="text-xs text-muted-foreground">Sin experimentos concluidos.</p> : null}
                  {experimentOptions.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={(selection.experimentIds ?? []).includes(e.id)} onCheckedChange={() => toggleId("experimentIds", e.id)} />
                      {e.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Recomendaciones</Label>
                <div className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {recommendationOptions.length === 0 ? <p className="text-xs text-muted-foreground">Sin recomendaciones.</p> : null}
                  {recommendationOptions.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={(selection.recommendationIds ?? []).includes(r.id)} onCheckedChange={() => toggleId("recommendationIds", r.id)} />
                      <span className="truncate">{r.title}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Informes de rendimiento existentes</Label>
                <div className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {reportOptions.length === 0 ? <p className="text-xs text-muted-foreground">Sin informes guardados.</p> : null}
                  {reportOptions.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={(selection.reportIds ?? []).includes(r.id)} onCheckedChange={() => toggleId("reportIds", r.id)} />
                      {r.title}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              En modo recomendado, el sistema selecciona de forma determinista los recursos, métricas, objetivos, benchmarks, experimentos y recomendaciones más relevantes — sin usar IA para decidir qué incluir.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={loadingPreview || !selection.periodStart || !selection.periodEnd} onClick={handlePreview}>
              {loadingPreview ? <Loader2 className="size-3.5 animate-spin" /> : null} Vista previa del contexto
            </Button>
          </div>

          {preview ? (
            <Card>
              <CardContent className="space-y-3 py-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Periodo: {preview.periodStart.slice(0, 10)} — {preview.periodEnd.slice(0, 10)}
                  </p>
                  <DataQualityPanel score={preview.bundle.dataQualityScore} level={preview.bundle.dataQualityLevel} compact />
                  <span className="text-xs">Solidez de evidencia: <strong>{EVIDENCE_LABELS[preview.bundle.evidenceStrength] ?? preview.bundle.evidenceStrength}</strong></span>
                </div>

                {preview.bundle.facts.metrics.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Datos incluidos ({preview.bundle.facts.metrics.length} métricas)</p>
                    {preview.bundle.facts.metrics.map((m) => (
                      <div key={m.key} className="flex items-center justify-between gap-2 text-xs">
                        <span>
                          {m.label}: <strong>{m.value}</strong>
                          {m.unit === "PERCENTAGE" ? "%" : ""} (n={m.sampleSize})
                        </span>
                        <MetricOriginBadge source={m.origin} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-400">No se encontraron métricas con datos reales para esta selección — el aviso de &quot;datos insuficientes&quot; se mostrará en la generación.</p>
                )}

                {preview.bundle.missingData.length > 0 ? (
                  <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                    <p className="font-medium">Datos excluidos / ausentes:</p>
                    {preview.bundle.missingData.map((m, i) => (
                      <p key={i}>{m}</p>
                    ))}
                  </div>
                ) : null}

                {preview.bundle.constraints.length > 0 ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="font-medium">Limitaciones:</p>
                    {preview.bundle.constraints.map((c, i) => (
                      <p key={i}>{c}</p>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Button type="button" disabled={starting} onClick={handleStartAnalysis}>
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Analizar rendimiento y generar estrategia
          </Button>
        </>
      ) : null}
    </div>
  );
}

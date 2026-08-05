"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, Loader2, Check, X, Archive, RefreshCw } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { StartPerformanceStrategistRunButton } from "@/components/agents/start-performance-strategist-run-button";
import { DataQualityPanel } from "@/components/performance/data-quality-panel";
import { MetricOriginBadge } from "@/components/performance/metric-origin-badge";
import { formatMetricValue } from "@/components/performance/labels";
import { PERFORMANCE_METRIC_DEFINITIONS } from "@/lib/performance/metrics-catalog";
import {
  prepareOptimizationGenerationAction,
  completeOptimizationGenerationAction,
  failOptimizationGenerationAction,
  selectScenarioAction,
  decideOptimizationSessionAction,
  archiveOptimizationSessionAction,
  createOptimizationSessionVersionAction,
  convertScenarioActionAction,
  createMeasurementPlanAction,
  generateMeasurementReviewAction,
} from "@/server/actions/marketing-brain-optimization";

const STATUS_LABELS: Record<string, string> = { DRAFT: "Borrador", READY_FOR_REVIEW: "Lista para revisión", APPROVED: "Aprobada", REJECTED: "Rechazada", ARCHIVED: "Archivada" };
const STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = { DRAFT: "outline", READY_FOR_REVIEW: "secondary", APPROVED: "secondary", REJECTED: "destructive", ARCHIVED: "outline" };
const SCENARIO_LABELS: Record<string, string> = { CONSERVATIVE: "Conservador", BALANCED: "Equilibrado", EXPANSIVE: "Expansivo" };
const ACTION_TYPE_LABELS: Record<string, string> = { CAMPAIGN_CONTENT_PIECE: "Pieza de campaña (borrador)", CONTENT_ITEM: "Contenido (borrador)", SOCIAL_POST: "Publicación social (borrador)", AGENT_RUN: "Ejecución de AI Agent (borrador)", KNOWLEDGE_QUERY: "Consulta a Knowledge Base", TASK: "Marcar como tarea" };
const GOAL_OUTCOME_LABELS: Record<string, string> = { REACHED: "Alcanzado", NOT_REACHED: "No alcanzado", INDETERMINATE: "Indeterminado" };
const CAUSALITY_LABELS: Record<string, string> = { OBSERVED_DURING_PERIOD: "Cambio observado durante el periodo", EXPERIMENT_BACKED: "Respaldado por un experimento concluido", CANNOT_CONFIRM: "No se puede confirmar causalidad" };

interface ScenarioActionView {
  id: string;
  order: number;
  title: string;
  description: string;
  channel: string | null;
  actionType: string;
  convertedAt: string | null;
  createdResourceId: string | null;
}

interface ScenarioView {
  id: string;
  kind: "CONSERVATIVE" | "BALANCED" | "EXPANSIVE";
  objective: string;
  intensity: string;
  timeframe: string;
  measurementMethod: string;
  risks: string[];
  kpis: string[];
  preconditions: string[];
  constraints: string[];
  resourcesRequired: string[];
  selected: boolean;
  actions: ScenarioActionView[];
}

interface ReviewView {
  id: string;
  initialValue: number | null;
  currentValue: number | null;
  percentDiff: number | null;
  initialQuality: string | null;
  currentQuality: string | null;
  goalOutcome: string;
  causalityStatement: string;
  limitations: string[];
  conclusion: string;
  generatedAt: string;
}

interface MeasurementPlanView {
  id: string;
  primaryMetricKey: string;
  status: string;
  trackingStart: string;
  trackingEnd: string;
  baselineValue: number | null;
  baselineQuality: string | null;
  reviews: ReviewView[];
}

interface StrategyBriefView {
  executiveSummary: string;
  observedSituation: string;
  dataBackedFindings: string[];
  dataLimitations: string[];
  objectives: string[];
  opportunities: string[];
  risks: string[];
  hypotheses: string[];
  recommendedStrategy: string;
  channels: string[];
  kpis: string[];
  successSignals: string[];
  deteriorationSignals: string[];
  measurementPlan: string;
  reviewConditions: string[];
}

interface SnapshotView {
  periodStart: string;
  periodEnd: string;
  dataQualityScore: number;
  dataQualityLevel: string;
  evidenceStrength: string;
  facts: { metrics: { key: string; label: string; value: number; unit?: string; origin: string; sampleSize?: number }[] };
  missingData: string[];
  constraints: string[];
}

export interface OptimizationSessionViewProps {
  projectId: string;
  sessionId: string;
  status: string;
  contextMode: string;
  campaignId: string | null;
  lastErrorMessage: string | null;
  snapshot: SnapshotView | null;
  brief: StrategyBriefView | null;
  scenarios: ScenarioView[];
  measurementPlans: MeasurementPlanView[];
  contentItems: { id: string; label: string }[];
  campaigns: { id: string; label: string }[];
  socialPosts: { id: string; label: string }[];
  goals: { id: string; metricKey: string }[];
}

export function OptimizationSessionView(props: OptimizationSessionViewProps) {
  const { projectId, sessionId } = props;
  const router = useRouter();
  const ai = useLocalAI();

  const [generating, setGenerating] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [convertTarget, setConvertTarget] = useState<ScenarioActionView | null>(null);
  const [convertType, setConvertType] = useState<string>("TASK");
  const [convertPlatform, setConvertPlatform] = useState("");
  const [converting, setConverting] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const [planMetricKey, setPlanMetricKey] = useState(PERFORMANCE_METRIC_DEFINITIONS[0]?.key ?? "");
  const [planResourceType, setPlanResourceType] = useState<"CONTENT_ITEM" | "CAMPAIGN" | "SOCIAL_POST">("CAMPAIGN");
  const [planResourceId, setPlanResourceId] = useState("");
  const [planGoalId, setPlanGoalId] = useState("");
  const [planTrackingStart, setPlanTrackingStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [planTrackingEnd, setPlanTrackingEnd] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [generatingReviewFor, setGeneratingReviewFor] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const prepared = await prepareOptimizationGenerationAction(projectId, sessionId);
      if (prepared.error) {
        toast.error(prepared.error);
        return;
      }
      if (!prepared.ai) return;
      const { systemPrompt, userPrompt, executionToken } = prepared.ai;
      toast.message("Generando estrategia con el modelo local…");
      const text = await ai.generate({ system: systemPrompt, prompt: userPrompt, maxTokens: 3072 });
      if (!text) {
        await failOptimizationGenerationAction(projectId, sessionId, executionToken, ai.error ?? "La generación falló o se canceló.");
        toast.error(ai.error ?? "La generación falló.");
        return;
      }
      const completed = await completeOptimizationGenerationAction(projectId, sessionId, text, executionToken);
      if (completed.error) {
        toast.error(completed.error);
        return;
      }
      if (completed.hasSuspiciousNumericClaims) toast.message("Aviso: la generación incluye cifras que no provienen directamente de los datos — revísalas como hipótesis.");
      toast.success(`Se generaron ${completed.scenarioCount} escenario(s).`);
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function handleSelectScenario(kind: "CONSERVATIVE" | "BALANCED" | "EXPANSIVE") {
    setSelecting(true);
    const result = await selectScenarioAction(projectId, sessionId, kind);
    setSelecting(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    router.refresh();
  }

  async function handleDecide() {
    if (!decisionDialog) return;
    if (decisionDialog === "APPROVED" && !decisionComment.trim()) {
      toast.error("Añade un comentario explicando la decisión.");
      return;
    }
    setDeciding(true);
    const selectedKind = props.scenarios.find((s) => s.selected)?.kind;
    const result = await decideOptimizationSessionAction(projectId, { sessionId, decision: decisionDialog, comment: decisionComment || undefined, selectedScenarioKind: selectedKind });
    setDeciding(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success(decisionDialog === "APPROVED" ? "Estrategia aprobada." : "Estrategia rechazada.");
    setDecisionDialog(null);
    setDecisionComment("");
    router.refresh();
  }

  async function handleArchive() {
    const result = await archiveOptimizationSessionAction(projectId, sessionId);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Sesión archivada.");
    router.refresh();
  }

  async function handleNewVersion() {
    const result = await createOptimizationSessionVersionAction(projectId, sessionId, `mb-opt-version:${sessionId}:${Date.now()}`);
    if (result.errorMessage || !result.id) {
      toast.error(result.errorMessage ?? "No se pudo crear una nueva versión.");
      return;
    }
    router.push(`/dashboard/${projectId}/marketing-brain/optimization/${result.id}`);
  }

  async function handleConvert() {
    if (!convertTarget) return;
    setConverting(true);
    const result = await convertScenarioActionAction(projectId, { scenarioActionId: convertTarget.id, actionType: convertType as never, parameters: convertPlatform ? { platform: convertPlatform } : undefined });
    setConverting(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Acción convertida en un recurso real (borrador).");
    setConvertTarget(null);
    router.refresh();
  }

  async function handleCreatePlan() {
    if (!planResourceId) {
      toast.error("Selecciona un recurso a seguir.");
      return;
    }
    setCreatingPlan(true);
    const result = await createMeasurementPlanAction(projectId, {
      sessionId,
      primaryMetricKey: planMetricKey,
      resourceType: planResourceType,
      contentItemId: planResourceType === "CONTENT_ITEM" ? planResourceId : undefined,
      campaignId: planResourceType === "CAMPAIGN" ? planResourceId : undefined,
      socialPostId: planResourceType === "SOCIAL_POST" ? planResourceId : undefined,
      goalId: planGoalId || undefined,
      trackingStart: new Date(`${planTrackingStart}T00:00:00.000Z`).toISOString(),
      trackingEnd: new Date(`${planTrackingEnd}T23:59:59.999Z`).toISOString(),
    });
    setCreatingPlan(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Plan de seguimiento creado con línea base real.");
    router.refresh();
  }

  async function handleGenerateReview(planId: string) {
    setGeneratingReviewFor(planId);
    const result = await generateMeasurementReviewAction(projectId, planId);
    setGeneratingReviewFor(null);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Revisión posterior generada.");
    router.refresh();
  }

  const resourceOptionsForPlan = planResourceType === "CONTENT_ITEM" ? props.contentItems : planResourceType === "CAMPAIGN" ? props.campaigns : props.socialPosts;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Sesión de optimización</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_TONE[props.status] ?? "outline"}>{STATUS_LABELS[props.status] ?? props.status}</Badge>
              {props.status !== "ARCHIVED" ? (
                <Button size="sm" variant="outline" onClick={() => setArchiveConfirmOpen(true)}>
                  <Archive className="size-3.5" /> Archivar
                </Button>
              ) : null}
              {(props.status === "APPROVED" || props.status === "REJECTED") ? (
                <Button size="sm" variant="outline" onClick={handleNewVersion}>
                  <RefreshCw className="size-3.5" /> Crear nueva versión
                </Button>
              ) : null}
              {props.status !== "ARCHIVED" ? (
                <StartPerformanceStrategistRunButton
                  projectId={projectId}
                  prefill={{ mode: "REVIEW_EXISTING", optimizationSessionId: sessionId, campaignId: props.campaignId ?? undefined }}
                  label="Revisar con AI Agent"
                />
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {props.lastErrorMessage ? <p className="text-xs text-destructive">{props.lastErrorMessage}</p> : null}

          {props.snapshot ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Periodo: {props.snapshot.periodStart.slice(0, 10)} — {props.snapshot.periodEnd.slice(0, 10)}
                </span>
                <DataQualityPanel score={props.snapshot.dataQualityScore} level={props.snapshot.dataQualityLevel} compact />
                <span className="text-xs">Solidez de evidencia: <strong>{props.snapshot.evidenceStrength}</strong></span>
              </div>
              {props.snapshot.facts.metrics.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {props.snapshot.facts.metrics.map((m) => (
                    <span key={m.key} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                      {m.label}: {formatMetricValue(m.value, m.unit)}
                      <MetricOriginBadge source={m.origin} />
                    </span>
                  ))}
                </div>
              ) : null}
              {props.snapshot.missingData.length > 0 ? (
                <div className="space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {props.snapshot.missingData.map((m, i) => (
                    <p key={i}>{m}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin contexto de rendimiento congelado todavía (modo: {props.contextMode}).</p>
          )}

          {props.status === "DRAFT" ? (
            <Button type="button" disabled={generating} onClick={handleGenerate}>
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Generar estrategia con IA local
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {props.brief ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen estratégico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Resumen ejecutivo:</span> {props.brief.executiveSummary || "—"}
            </p>
            <p>
              <span className="font-medium">Situación observada:</span> {props.brief.observedSituation || "—"}
            </p>
            {props.brief.dataBackedFindings.length > 0 ? (
              <div>
                <p className="text-xs font-medium">Hallazgos respaldados por datos</p>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {props.brief.dataBackedFindings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {props.brief.dataLimitations.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Limitaciones de los datos</p>
                <ul className="list-inside list-disc text-xs text-amber-700 dark:text-amber-400">
                  {props.brief.dataLimitations.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p>
              <span className="font-medium">Estrategia recomendada:</span> {props.brief.recommendedStrategy || "—"}
            </p>
            {props.brief.hypotheses.length > 0 ? (
              <div>
                <p className="text-xs font-medium">Hipótesis (no confirmadas)</p>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {props.brief.hypotheses.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">Plan de medición sugerido: {props.brief.measurementPlan || "—"}</p>
          </CardContent>
        </Card>
      ) : null}

      {props.scenarios.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {props.scenarios.map((scenario) => (
            <Card key={scenario.id} className={scenario.selected ? "border-primary" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{SCENARIO_LABELS[scenario.kind] ?? scenario.kind}</CardTitle>
                  {scenario.selected ? <Badge>Seleccionado</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <p>
                  <span className="font-medium">Objetivo:</span> {scenario.objective}
                </p>
                <p>
                  <span className="font-medium">Intensidad:</span> {scenario.intensity} · <span className="font-medium">Plazo:</span> {scenario.timeframe}
                </p>
                {scenario.actions.length > 0 ? (
                  <div>
                    <p className="font-medium">Acciones propuestas</p>
                    <ul className="list-inside list-disc">
                      {scenario.actions.map((a) => (
                        <li key={a.id}>{a.title}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {scenario.kpis.length > 0 ? <p><span className="font-medium">KPIs:</span> {scenario.kpis.join(", ")}</p> : null}
                {scenario.risks.length > 0 ? <p><span className="font-medium">Riesgos:</span> {scenario.risks.join(", ")}</p> : null}
                {props.status === "READY_FOR_REVIEW" ? (
                  <Button size="sm" variant={scenario.selected ? "secondary" : "outline"} disabled={selecting} onClick={() => handleSelectScenario(scenario.kind)}>
                    {scenario.selected ? "Elegido para avanzar" : "Elegir este escenario"}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {props.status === "READY_FOR_REVIEW" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDecisionDialog("APPROVED")}>
            <Check className="size-3.5" /> Aprobar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDecisionDialog("REJECTED")}>
            <X className="size-3.5" /> Rechazar
          </Button>
        </div>
      ) : null}

      {props.status === "APPROVED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convertir acciones en recursos reales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {props.scenarios
              .find((s) => s.selected)
              ?.actions.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                  </div>
                  {a.convertedAt ? (
                    <Badge variant="secondary">Convertida ({ACTION_TYPE_LABELS[a.actionType] ?? a.actionType})</Badge>
                  ) : (
                    <Button size="sm" onClick={() => { setConvertTarget(a); setConvertType("TASK"); setConvertPlatform(a.channel ?? ""); }}>
                      Convertir en recurso
                    </Button>
                  )}
                </div>
              )) ?? <p className="text-xs text-muted-foreground">Selecciona un escenario antes de aprobar para ver sus acciones aquí.</p>}
          </CardContent>
        </Card>
      ) : null}

      {props.status === "APPROVED" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Medición posterior</CardTitle>
              <div className="flex flex-wrap gap-2">
                <StartPerformanceStrategistRunButton projectId={projectId} prefill={{ mode: "PREPARE_MEASUREMENT", optimizationSessionId: sessionId }} label="Preparar plan con AI Agent" />
                {props.measurementPlans.length > 0 ? (
                  <StartPerformanceStrategistRunButton projectId={projectId} prefill={{ mode: "PREPARE_REVIEW", optimizationSessionId: sessionId }} label="Preparar revisión con AI Agent" />
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Métrica principal</Label>
                <Select value={planMetricKey} onValueChange={(v) => v && setPlanMetricKey(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERFORMANCE_METRIC_DEFINITIONS.map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de recurso</Label>
                <Select value={planResourceType} onValueChange={(v) => { if (v) { setPlanResourceType(v as typeof planResourceType); setPlanResourceId(""); } }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAMPAIGN">Campaña</SelectItem>
                    <SelectItem value="CONTENT_ITEM">Contenido</SelectItem>
                    <SelectItem value="SOCIAL_POST">Publicación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Recurso a seguir</Label>
                <Select value={planResourceId} onValueChange={(v) => v && setPlanResourceId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona uno" />
                  </SelectTrigger>
                  <SelectContent>
                    {resourceOptionsForPlan.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Objetivo asociado (opcional)</Label>
                <Select value={planGoalId || "__none"} onValueChange={(v) => setPlanGoalId(v === "__none" ? "" : v ?? "")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Ninguno</SelectItem>
                    {props.goals.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.metricKey}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Inicio de seguimiento</Label>
                <Input type="date" value={planTrackingStart} onChange={(e) => setPlanTrackingStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fin de seguimiento</Label>
                <Input type="date" value={planTrackingEnd} onChange={(e) => setPlanTrackingEnd(e.target.value)} />
              </div>
            </div>
            <Button size="sm" disabled={creatingPlan} onClick={handleCreatePlan}>
              {creatingPlan ? "Creando…" : "Crear plan de seguimiento (captura línea base real)"}
            </Button>

            {props.measurementPlans.map((plan) => (
              <div key={plan.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{plan.primaryMetricKey}</p>
                  <Badge variant="outline">{plan.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Línea base: {plan.baselineValue !== null ? formatMetricValue(plan.baselineValue) : "sin datos"} ({plan.baselineQuality ?? "—"}) · Seguimiento: {plan.trackingStart.slice(0, 10)} — {plan.trackingEnd.slice(0, 10)}
                </p>
                <Button size="sm" variant="outline" disabled={generatingReviewFor === plan.id} onClick={() => handleGenerateReview(plan.id)}>
                  {generatingReviewFor === plan.id ? "Generando…" : "Generar revisión posterior"}
                </Button>
                {plan.reviews.map((r) => (
                  <div key={r.id} className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
                    <p>
                      Valor inicial: {formatMetricValue(r.initialValue)} → actual: {formatMetricValue(r.currentValue)} {r.percentDiff !== null ? `(${r.percentDiff > 0 ? "+" : ""}${Math.round(r.percentDiff)}%)` : ""}
                    </p>
                    <p>
                      Objetivo: <strong>{GOAL_OUTCOME_LABELS[r.goalOutcome] ?? r.goalOutcome}</strong> · Causalidad: {CAUSALITY_LABELS[r.causalityStatement] ?? r.causalityStatement}
                    </p>
                    <p>{r.conclusion}</p>
                    {r.limitations.length > 0 ? <p className="text-amber-700 dark:text-amber-400">{r.limitations.join(" ")}</p> : null}
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {props.status === "APPROVED" ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/dashboard/${projectId}/performance`} className="text-xs text-muted-foreground underline">
            Abrir Performance Center
          </Link>
          <Link href={`/dashboard/${projectId}/performance/experiments/new`} className="text-xs text-muted-foreground underline">
            Crear un nuevo experimento
          </Link>
          <Link href={`/dashboard/${projectId}/performance/recommendations`} className="text-xs text-muted-foreground underline">
            Ver recomendaciones
          </Link>
        </div>
      ) : null}

      <ConfirmDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen} title="Archivar sesión" description="La sesión y su historial se conservan, pero dejará de aparecer como activa." confirmLabel="Archivar" onConfirm={handleArchive} />

      <Dialog open={Boolean(decisionDialog)} onOpenChange={(open) => !open && setDecisionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decisionDialog === "APPROVED" ? "Aprobar estrategia" : "Rechazar estrategia"}</DialogTitle>
            <DialogDescription>Esta decisión es exclusivamente humana — ningún agente, automatización o workflow puede tomarla.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Comentario {decisionDialog === "APPROVED" ? "(obligatorio)" : "(opcional)"}</Label>
            <Textarea value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog(null)}>
              Cancelar
            </Button>
            <Button disabled={deciding} onClick={handleDecide}>
              {deciding ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(convertTarget)} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convertir en recurso real</DialogTitle>
            <DialogDescription>{convertTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de recurso</Label>
              <Select value={convertType} onValueChange={(v) => v && setConvertType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {convertType === "SOCIAL_POST" || convertType === "CAMPAIGN_CONTENT_PIECE" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Plataforma</Label>
                <Input value={convertPlatform} onChange={(e) => setConvertPlatform(e.target.value)} />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">Se creará un recurso real en estado borrador — deberás revisarlo y confirmarlo en su propio módulo. Nunca se publica, programa ni envía automáticamente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertTarget(null)}>
              Cancelar
            </Button>
            <Button disabled={converting} onClick={handleConvert}>
              {converting ? "Convirtiendo…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

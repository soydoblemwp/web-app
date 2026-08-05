"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink, Lightbulb, FlaskConical } from "lucide-react";
import { createCampaignMetricGoalAction, updateCampaignMetricValueAction, deleteCampaignMetricGoalAction } from "@/server/actions/campaign-metrics";
import { CAMPAIGN_METRIC_TYPE_VALUES, CAMPAIGN_METRIC_TYPE_LABELS, computeMetricProgress } from "@/lib/campaign-studio/metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listRecommendationsAction } from "@/server/actions/performance-recommendations";
import { listExperimentsAction } from "@/server/actions/performance-experiments";
import { StartPerformanceStrategistRunButton } from "@/components/agents/start-performance-strategist-run-button";
import type { CampaignDetailData, MetricGoalData } from "@/components/campaign-studio/types";

const STATUS_LABEL = { "on-track": "En camino", behind: "Retrasado", achieved: "Logrado", "no-target": "Sin objetivo" } as const;
const STATUS_VARIANT = { "on-track": "secondary", behind: "outline", achieved: "secondary", "no-target": "outline" } as const;

export function PerformanceTab({
  projectId,
  campaign,
  metricGoals,
}: {
  projectId: string;
  campaign: CampaignDetailData;
  metricGoals: MetricGoalData[];
}) {
  const router = useRouter();
  const [newMetricType, setNewMetricType] = useState<string | null>(null);
  const [newTarget, setNewTarget] = useState("");
  const [adding, setAdding] = useState(false);
  const [recommendations, setRecommendations] = useState<{ id: string; title: string; priority: string }[]>([]);
  const [experiments, setExperiments] = useState<{ id: string; name: string; status: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listRecommendationsAction(projectId, { status: "NEW", category: "CAMPAIGN", limit: 5 }),
      listExperimentsAction(projectId, { campaignId: campaign.id }),
    ]).then(([recs, exps]) => {
      if (cancelled) return;
      setRecommendations(recs.filter((r) => r.campaign?.id === campaign.id).map((r) => ({ id: r.id, title: r.title, priority: r.priority })));
      setExperiments(exps.map((e) => ({ id: e.id, name: e.name, status: e.status })));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, campaign.id]);

  const availableTypes = CAMPAIGN_METRIC_TYPE_VALUES.filter((t) => !metricGoals.some((g) => g.metricType === t));

  async function handleAdd() {
    if (!newMetricType || !newTarget) return;
    setAdding(true);
    const result = await createCampaignMetricGoalAction(projectId, campaign.id, { metricType: newMetricType, targetValue: Number(newTarget) });
    setAdding(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setNewMetricType(null);
    setNewTarget("");
    router.refresh();
  }

  async function handleUpdateValue(metricGoalId: string, value: string) {
    const result = await updateCampaignMetricValueAction(projectId, campaign.id, { metricGoalId, currentValue: Number(value) || 0 });
    if (result.error) toast.error(result.error);
    else router.refresh();
  }

  async function handleDelete(metricGoalId: string) {
    const result = await deleteCampaignMetricGoalAction(projectId, campaign.id, metricGoalId);
    if (result.error) toast.error(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Los resultados se registran manualmente — esta fase no conecta APIs externas de redes sociales.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Métrica</Label>
          <Select value={newMetricType ?? undefined} onValueChange={setNewMetricType}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Elige una métrica" />
            </SelectTrigger>
            <SelectContent>
              {availableTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {CAMPAIGN_METRIC_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Objetivo</Label>
          <Input type="number" min={0} value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="w-32" />
        </div>
        <Button type="button" disabled={adding || !newMetricType || !newTarget} onClick={handleAdd}>
          <Plus className="size-4" /> Añadir métrica
        </Button>
      </div>

      {metricGoals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin métricas objetivo definidas todavía.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {metricGoals.map((goal) => {
            const progress = computeMetricProgress(goal.targetValue, goal.currentValue);
            return (
              <Card key={goal.id}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{CAMPAIGN_METRIC_TYPE_LABELS[goal.metricType as keyof typeof CAMPAIGN_METRIC_TYPE_LABELS]}</p>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={STATUS_VARIANT[progress.status]}>{STATUS_LABEL[progress.status]}</Badge>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => handleDelete(goal.id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <Progress value={Math.min(100, progress.percent)} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {goal.currentValue} / {goal.targetValue} ({progress.percent}%)
                    </span>
                    <span>{new Date(goal.updatedAt).toLocaleDateString("es-ES")}</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    defaultValue={goal.currentValue}
                    onBlur={(e) => handleUpdateValue(goal.id, e.target.value)}
                    className="h-8"
                    placeholder="Registrar valor actual"
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Performance Intelligence</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/dashboard/${projectId}/marketing-brain/optimization/new?campaignId=${campaign.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Crear estrategia con estos datos
            </Link>
            <StartPerformanceStrategistRunButton projectId={projectId} prefill={{ mode: "PREPARE_STRATEGY", campaignId: campaign.id }} label="Preparar con AI Agent" variant="ghost" />
            <Link href={`/dashboard/${projectId}/performance/campaigns`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Abrir Performance Center <ExternalLink className="size-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Métricas reales, comparaciones, experimentos y recomendaciones para esta campaña viven en Performance Center — aquí solo un resumen, nunca una copia completa.
          </p>

          {recommendations.length > 0 ? (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <Lightbulb className="size-3.5" /> Recomendaciones pendientes
              </p>
              {recommendations.map((r) => (
                <Link key={r.id} href={`/dashboard/${projectId}/performance/recommendations`} className="block rounded-md border p-2 text-xs hover:bg-accent/50">
                  <Badge variant="outline" className="mr-1.5">{r.priority}</Badge>
                  {r.title}
                </Link>
              ))}
            </div>
          ) : null}

          {experiments.length > 0 ? (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <FlaskConical className="size-3.5" /> Experimentos
              </p>
              {experiments.map((e) => (
                <Link key={e.id} href={`/dashboard/${projectId}/performance/experiments/${e.id}`} className="block rounded-md border p-2 text-xs hover:bg-accent/50">
                  {e.name} — {e.status}
                </Link>
              ))}
            </div>
          ) : null}

          {recommendations.length === 0 && experiments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin recomendaciones activas ni experimentos para esta campaña todavía.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

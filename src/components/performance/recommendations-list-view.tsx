"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { RefreshCw, BrainCircuit } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RECOMMENDATION_STATUS_LABELS, RECOMMENDATION_STATUS_TONE, PRIORITY_LABELS, PRIORITY_TONE } from "@/components/performance/labels";
import { generateRecommendationsAction, decideRecommendationAction, applyRecommendationActionAction } from "@/server/actions/performance-recommendations";
import { PERFORMANCE_RECOMMENDATION_ACTION_TYPES } from "@/lib/performance/types";

const ACTION_TYPE_LABELS: Record<string, string> = {
  INTERNAL_TASK: "Marcar como tarea interna",
  AGENT_RUN: "Ejecutar con AI Agent (borrador)",
  AGENT_TEAM_RUN: "Ejecutar con equipo de agentes (borrador)",
  WORKFLOW_RUN: "Ejecutar un AI Workflow",
  WORKFLOW_AUTOMATION: "Ejecutar una automatización",
  EXPERIMENT: "Crear experimento (borrador)",
  CONTENT_VERSION: "Duplicar como nueva versión de contenido",
  CAMPAIGN_CONTENT_PIECE: "Crear pieza de campaña (idea)",
  SOCIAL_POST: "Crear publicación social (borrador)",
  CONTENT_UPDATE: "Marcar para actualización de contenido",
  KNOWLEDGE_QUERY: "Consultar Knowledge Base",
};

const PARAM_FIELD: Record<string, { key: string; label: string; multiline?: boolean } | null> = {
  INTERNAL_TASK: null,
  AGENT_RUN: { key: "officialAgentKey", label: "Clave del agente (opcional)" },
  AGENT_TEAM_RUN: { key: "teamId", label: "ID del equipo de agentes" },
  WORKFLOW_RUN: { key: "workflowId", label: "ID del workflow" },
  WORKFLOW_AUTOMATION: { key: "automationId", label: "ID de la automatización" },
  EXPERIMENT: null,
  CONTENT_VERSION: null,
  CAMPAIGN_CONTENT_PIECE: { key: "platform", label: "Plataforma (opcional)" },
  SOCIAL_POST: { key: "platform", label: "Plataforma (opcional)" },
  CONTENT_UPDATE: null,
  KNOWLEDGE_QUERY: { key: "question", label: "Pregunta para Knowledge Base", multiline: true },
};

export interface RecommendationRow {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  confidence: number;
  rationale: string;
  actionProposed: string;
  contentItem: { id: string; title: string } | null;
  campaign: { id: string; name: string } | null;
  socialPost: { id: string; platform: string } | null;
}

export function RecommendationsListView({ projectId, initialRecommendations }: { projectId: string; initialRecommendations: RecommendationRow[] }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("NEW");
  const [dialogTarget, setDialogTarget] = useState<RecommendationRow | null>(null);
  const [actionType, setActionType] = useState<(typeof PERFORMANCE_RECOMMENDATION_ACTION_TYPES)[number]>("INTERNAL_TASK");
  const [paramValue, setParamValue] = useState("");
  const [applying, setApplying] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    const result = await generateRecommendationsAction(projectId);
    setGenerating(false);
    toast.success(`${result.generated} recomendación(es) nueva(s) generada(s).`);
    router.refresh();
  }

  async function handleDecide(id: string, status: string) {
    const result = await decideRecommendationAction(projectId, { recommendationId: id, status });
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Actualizado.");
    router.refresh();
  }

  function openApplyDialog(rec: RecommendationRow) {
    setDialogTarget(rec);
    setActionType("INTERNAL_TASK");
    setParamValue("");
  }

  async function handleApply() {
    if (!dialogTarget) return;
    const field = PARAM_FIELD[actionType];
    const parameters = field && paramValue ? { [field.key]: paramValue } : undefined;
    setApplying(true);
    const result = await applyRecommendationActionAction(projectId, { recommendationId: dialogTarget.id, actionType, parameters });
    setApplying(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Acción creada a partir de la recomendación.");
    setDialogTarget(null);
    router.refresh();
  }

  const filtered = statusFilter === "__all" ? initialRecommendations : initialRecommendations.filter((r) => r.status === statusFilter);
  const field = dialogTarget ? PARAM_FIELD[actionType] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los estados</SelectItem>
            {Object.entries(RECOMMENDATION_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={generating} onClick={handleGenerate}>
          <RefreshCw className="size-3.5" /> {generating ? "Generando…" : "Generar recomendaciones"}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="max-w-md text-sm text-muted-foreground">No hay recomendaciones para este filtro. Genera recomendaciones a partir de los datos reales del proyecto.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((rec) => (
            <Card key={rec.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{rec.title}</p>
                    <p className="text-sm text-muted-foreground">{rec.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={PRIORITY_TONE[rec.priority] ?? "outline"}>{PRIORITY_LABELS[rec.priority] ?? rec.priority}</Badge>
                    <Badge variant={RECOMMENDATION_STATUS_TONE[rec.status] ?? "outline"}>{RECOMMENDATION_STATUS_LABELS[rec.status] ?? rec.status}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{rec.rationale}</p>
                <p className="text-xs">
                  <span className="font-medium">Acción propuesta:</span> {rec.actionProposed}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {rec.status === "NEW" || rec.status === "REVIEWING" ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleDecide(rec.id, "ACCEPTED")}>
                        Aceptar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDecide(rec.id, "REJECTED")}>
                        Rechazar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDecide(rec.id, "DISMISSED")}>
                        Descartar
                      </Button>
                    </>
                  ) : null}
                  {rec.status !== "APPLIED" && rec.status !== "ARCHIVED" ? (
                    <Button size="sm" onClick={() => openApplyDialog(rec)}>
                      Convertir en acción
                    </Button>
                  ) : null}
                  <Link
                    href={`/dashboard/${projectId}/marketing-brain/optimization/new?recommendationId=${rec.id}${rec.campaign ? `&campaignId=${rec.campaign.id}` : ""}`}
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  >
                    <BrainCircuit className="size-3.5" /> Usar en Marketing Brain
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(dialogTarget)} onOpenChange={(open) => !open && setDialogTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convertir recomendación en acción</DialogTitle>
            <DialogDescription>{dialogTarget?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de acción</Label>
              <Select value={actionType} onValueChange={(v) => v && setActionType(v as typeof actionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFORMANCE_RECOMMENDATION_ACTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACTION_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {field ? (
              <div className="space-y-1.5">
                <Label className="text-xs">{field.label}</Label>
                {field.multiline ? <Textarea value={paramValue} onChange={(e) => setParamValue(e.target.value)} rows={3} /> : <Input value={paramValue} onChange={(e) => setParamValue(e.target.value)} />}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">Esto crea un recurso real en borrador que deberás revisar y confirmar en su propio módulo — nunca ejecuta nada destructivo automáticamente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogTarget(null)}>
              Cancelar
            </Button>
            <Button disabled={applying} onClick={handleApply}>
              {applying ? "Aplicando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

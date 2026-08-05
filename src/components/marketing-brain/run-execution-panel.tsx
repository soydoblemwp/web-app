"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  Pause,
  X,
  RotateCcw,
  Loader2,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  ExternalLink,
} from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import {
  prepareMarketingBrainStepAction,
  completeMarketingBrainStepAction,
  failMarketingBrainStepAction,
} from "@/server/actions/marketing-brain-execution";
import { decideMarketingBrainApprovalAction } from "@/server/actions/marketing-brain-approvals";
import { cancelMarketingBrainRunAction, resumeMarketingBrainRunAction, retryMarketingBrainStepAction, retryMarketingBrainItemAction } from "@/server/actions/marketing-brain";
import { STAGE_DEFINITIONS } from "@/lib/marketing-brain/plan";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MarketingBrainRunDetailData, MarketingBrainStepData } from "@/components/marketing-brain/types";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  RUNNING: "En curso",
  COMPLETED: "Completado",
  FAILED: "Falló",
  SKIPPED: "Omitido",
  CANCELLED: "Cancelado",
  WAITING_FOR_APPROVAL: "Esperando aprobación",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  RUNNING: "En progreso",
  WAITING_FOR_APPROVAL: "Esperando aprobación",
  PARTIALLY_COMPLETED: "Parcialmente completado",
  COMPLETED: "Completado",
  FAILED: "Con errores",
  CANCELLED: "Cancelado",
  ARCHIVED: "Archivado",
};

function stageLabel(key: string) {
  return STAGE_DEFINITIONS.find((d) => d.key === key)?.label ?? key;
}

export function RunExecutionPanel({ projectId, run }: { projectId: string; run: MarketingBrainRunDetailData }) {
  const router = useRouter();
  const ai = useLocalAI();
  const [steps, setSteps] = useState<MarketingBrainStepData[]>(run.steps);
  const [driving, setDriving] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const waitingApproval = run.status === "WAITING_FOR_APPROVAL";
  const gateStepKey = steps.find((s) => s.status === "WAITING_FOR_APPROVAL")?.key ?? run.currentStepKey;
  const canDrive = run.status === "RUNNING";
  const canRetryRun = run.status === "FAILED";

  async function driveLoop() {
    if (driving) return;
    setDriving(true);
    cancelledRef.current = false;

    try {
      while (true) {
        if (cancelledRef.current) break;
        const prepared = await prepareMarketingBrainStepAction(projectId, run.id);

        if (prepared.error) {
          toast.error(prepared.error);
          break;
        }
        if (prepared.waitingForApproval) {
          toast.message(`Esperando aprobación: ${stageLabel(prepared.waitingForApproval.stepKey)}`);
          break;
        }
        if (prepared.done) {
          if (prepared.runFinalStatus) {
            toast.success(RUN_STATUS_LABELS[prepared.runFinalStatus] ?? "Ejecución finalizada.");
            break;
          }
          router.refresh();
          continue;
        }
        if (prepared.ai) {
          const { stepKey, systemPrompt, userPrompt, executionToken, itemLabel, itemIndex, itemsTotal } = prepared.ai;
          setSteps((prev) => prev.map((s) => (s.key === stepKey ? { ...s, status: "RUNNING" } : s)));
          toast.message(`Generando: ${itemLabel}${itemsTotal > 1 ? ` (${itemIndex + 1}/${itemsTotal})` : ""}`);

          const text = await ai.generate({ system: systemPrompt, prompt: userPrompt, maxTokens: 2048 });
          if (cancelledRef.current) break;

          if (!text) {
            await failMarketingBrainStepAction(projectId, run.id, executionToken, ai.error ?? "La generación falló o se canceló.");
            toast.error(ai.error ?? "La generación falló.");
            break;
          }

          const completed = await completeMarketingBrainStepAction(projectId, run.id, text, executionToken);
          if (completed.error) {
            toast.error(completed.error);
            break;
          }
          continue;
        }
        break;
      }
    } finally {
      setDriving(false);
      router.refresh();
    }
  }

  function handlePause() {
    cancelledRef.current = true;
    setDriving(false);
  }

  async function handleCancel() {
    const result = await cancelMarketingBrainRunAction(projectId, run.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Ejecución cancelada.");
      router.refresh();
    }
  }

  async function handleResume() {
    const result = await resumeMarketingBrainRunAction(projectId, run.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Ejecución reanudada.");
      router.refresh();
    }
  }

  async function handleRetryStep(stepKey: string) {
    const result = await retryMarketingBrainStepAction(projectId, run.id, stepKey as never);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Reintentando...");
      router.refresh();
    }
  }

  async function handleRetryItem(stepKey: string, itemKey: string) {
    const result = await retryMarketingBrainItemAction(projectId, run.id, stepKey as never, itemKey);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Reintentando el elemento fallido...");
      router.refresh();
    }
  }

  async function handleDecision(decision: "APPROVED" | "REJECTED") {
    if (!gateStepKey) return;
    const result = await decideMarketingBrainApprovalAction(projectId, run.id, { stepKey: gateStepKey, decision, comment: approvalComment });
    if (result.error) toast.error(result.error);
    else {
      toast.success(decision === "APPROVED" ? "Etapa aprobada." : "Etapa rechazada.");
      setApprovalComment("");
      router.refresh();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {waitingApproval && gateStepKey ? (
          <Card className="border-amber-500/40">
            <CardContent className="space-y-2 py-3">
              <p className="text-sm font-medium">Esperando tu aprobación: {stageLabel(gateStepKey)}</p>
              <Textarea placeholder="Comentario (opcional)" value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)} rows={2} />
              <div className="flex gap-1.5">
                <Button type="button" size="sm" onClick={() => handleDecision("APPROVED")}>
                  <Check className="size-3.5" /> Aprobar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => handleDecision("REJECTED")}>
                  <X className="size-3.5" /> Rechazar
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {run.lastErrorMessage ? (
          <Card className="border-destructive/40">
            <CardContent className="flex items-start gap-2 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {run.lastErrorMessage}
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-1.5">
          {steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              expanded={expanded === step.id}
              onToggle={() => setExpanded(expanded === step.id ? null : step.id)}
              onRetryStep={() => handleRetryStep(step.key)}
              onRetryItem={(itemKey) => handleRetryItem(step.key, itemKey)}
              canRetryRun={canRetryRun}
            />
          ))}
        </div>

        {run.resources.length > 0 ? (
          <Card>
            <CardContent className="space-y-1.5 py-3">
              <p className="text-xs font-medium text-muted-foreground">Recursos creados por esta ejecución ({run.resources.length})</p>
              <ul className="max-h-64 space-y-1 overflow-auto text-xs">
                {run.resources.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded border p-1.5">
                    <span className="truncate">
                      {r.type.replace(/_/g, " ")}: {r.campaign?.name ?? r.pillar?.name ?? r.piece?.title ?? r.contentItem?.title ?? r.socialPost?.internalTitle ?? r.id}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {r.action === "CREATED" ? "Creado" : "Reutilizado"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-3">
        <Card>
          <CardContent className="space-y-2 py-3">
            <p className="text-xs text-muted-foreground">Estado</p>
            <Badge variant="secondary">{RUN_STATUS_LABELS[run.status] ?? run.status}</Badge>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${run.progressPercent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{run.progressPercent}%</p>
          </CardContent>
        </Card>

        {ai.status === "unsupported" ? (
          <Card className="border-amber-500/40">
            <CardContent className="py-3 text-xs text-amber-700 dark:text-amber-400">
              Este navegador no admite el motor de IA local (WebGPU). Puedes seguir revisando y aprobando, pero no generar contenido aquí.
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-1.5">
          {canDrive ? (
            driving ? (
              <Button type="button" variant="outline" className="w-full" onClick={handlePause}>
                <Pause className="size-4" /> Pausar
              </Button>
            ) : (
              <Button type="button" className="w-full" onClick={driveLoop}>
                <Play className="size-4" /> Continuar ejecución
              </Button>
            )
          ) : null}
          {run.status === "RUNNING" || run.status === "WAITING_FOR_APPROVAL" ? (
            <Button type="button" variant="outline" className="w-full" onClick={handleResume}>
              <RotateCcw className="size-4" /> Reanudar (desbloquear paso)
            </Button>
          ) : null}
          {!["COMPLETED", "FAILED", "CANCELLED", "ARCHIVED"].includes(run.status) ? (
            <Button type="button" variant="outline" className="w-full text-destructive" onClick={handleCancel}>
              <X className="size-4" /> Cancelar ejecución
            </Button>
          ) : null}
        </div>

        <Card>
          <CardContent className="space-y-1.5 py-3 text-xs">
            <p className="font-medium text-muted-foreground">Enlaces</p>
            {run.campaign ? (
              <Link href={`/dashboard/${projectId}/campaign-studio/${run.campaign.id}`} className="flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="size-3" /> Campaign Studio
              </Link>
            ) : null}
            <Link href={`/dashboard/${projectId}/publishing`} className="flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="size-3" /> Publishing Hub
            </Link>
            <Link href={`/dashboard/${projectId}/calendar`} className="flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="size-3" /> Calendario
            </Link>
            <Link href={`/dashboard/${projectId}/agents`} className="flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="size-3" /> AI Agent Studio (agentes especializados)
            </Link>
            <Link href={`/dashboard/${projectId}/knowledge`} className="flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="size-3" /> Knowledge Base (fuentes y colecciones)
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StepRow({
  step,
  expanded,
  onToggle,
  onRetryStep,
  onRetryItem,
  canRetryRun,
}: {
  step: MarketingBrainStepData;
  expanded: boolean;
  onToggle: () => void;
  onRetryStep: () => void;
  onRetryItem: (itemKey: string) => void;
  canRetryRun: boolean;
}) {
  const failures = (step.output?.failures as { itemKey: string; label: string; message: string }[] | undefined) ?? [];
  return (
    <Card>
      <CardContent className="py-2.5">
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 text-left text-sm">
          {expanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRightIcon className="size-3.5 shrink-0" />}
          {step.status === "RUNNING" ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          ) : step.status === "COMPLETED" ? (
            <Check className="size-3.5 shrink-0 text-emerald-600" />
          ) : step.status === "FAILED" ? (
            <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
          ) : null}
          <span className="min-w-0 flex-1 truncate font-medium">{stageLabel(step.key)}</span>
          <Badge variant={step.status === "FAILED" ? "destructive" : "outline"} className="shrink-0">
            {STATUS_LABELS[step.status] ?? step.status}
          </Badge>
          {failures.length > 0 ? (
            <Badge variant="destructive" className="shrink-0">
              {failures.length} fallidos
            </Badge>
          ) : null}
        </button>

        {expanded ? (
          <div className={cn("mt-2 space-y-2 border-t pt-2 text-xs text-muted-foreground")}>
            {step.errorMessage ? <p className="text-destructive">{step.errorMessage}</p> : null}
            <p>Intentos: {step.attemptCount}</p>
            {step.status === "FAILED" && canRetryRun ? (
              <Button type="button" size="sm" variant="outline" onClick={onRetryStep}>
                <RotateCcw className="size-3.5" /> Reintentar etapa
              </Button>
            ) : null}
            {failures.length > 0 ? (
              <div className="space-y-1">
                {failures.map((f) => (
                  <div key={f.itemKey} className="flex items-center justify-between gap-2 rounded border border-destructive/30 p-1.5">
                    <span className="truncate">{f.message}</span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onRetryItem(f.itemKey)}>
                      <RotateCcw className="size-3" /> Reintentar
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            {step.output ? (
              <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(step.output, null, 2)}</pre>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

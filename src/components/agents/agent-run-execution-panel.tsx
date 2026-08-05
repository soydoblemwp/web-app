"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Pause, X, RotateCcw, Loader2, Check, AlertTriangle, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { prepareAgentRunStepAction, completeAgentRunStepAction, failAgentRunStepAction } from "@/server/actions/agent-execution";
import { decideAgentApprovalAction } from "@/server/actions/agent-approvals";
import { cancelAgentRunAction, resumeAgentRunAction, retryAgentRunStepAction } from "@/server/actions/agent-runs";
import { findAgentDefinition } from "@/lib/agents/registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AgentIcon } from "@/components/agents/agent-icon";
import { StepResultPanel } from "@/components/agents/step-result-panel";
import { cn } from "@/lib/utils";
import type { AgentRunDetailData, AgentRunStepData } from "@/components/agents/types";

const STEP_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  RUNNING: "En curso",
  WAITING_FOR_APPROVAL: "Esperando aprobación",
  COMPLETED: "Completado",
  FAILED: "Falló",
  SKIPPED: "Omitido",
  CANCELLED: "Cancelado",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  RUNNING: "En progreso",
  WAITING_FOR_APPROVAL: "Esperando aprobación",
  COMPLETED: "Completado",
  PARTIALLY_COMPLETED: "Parcialmente completado",
  FAILED: "Con errores",
  CANCELLED: "Cancelado",
  ARCHIVED: "Archivado",
};

function agentLabel(agentRef: string): string {
  return findAgentDefinition(agentRef)?.name ?? agentRef;
}

export function AgentRunExecutionPanel({ projectId, run }: { projectId: string; run: AgentRunDetailData }) {
  const router = useRouter();
  const ai = useLocalAI();
  const [steps, setSteps] = useState<AgentRunStepData[]>(run.steps);
  const [driving, setDriving] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  const waitingApproval = run.status === "WAITING_FOR_APPROVAL";
  const gateStep = steps.find((s) => s.status === "WAITING_FOR_APPROVAL");
  const canDrive = run.status === "RUNNING";
  const canRetryRun = run.status === "FAILED" || run.status === "PARTIALLY_COMPLETED";

  const campaignId = (run.input.values.campaignId as string | undefined) ?? null;

  async function driveLoop() {
    if (driving) return;
    setDriving(true);
    cancelledRef.current = false;

    try {
      while (true) {
        if (cancelledRef.current) break;
        const prepared = await prepareAgentRunStepAction(projectId, run.id);

        if (prepared.error) {
          toast.error(prepared.error);
          break;
        }
        if (prepared.waitingForApproval) {
          toast.message(`Esperando aprobación: ${agentLabel(prepared.waitingForApproval.agentRef)}`);
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
          const { stepOrder, systemPrompt, userPrompt, executionToken } = prepared.ai;
          setSteps((prev) => prev.map((s) => (s.order === stepOrder ? { ...s, status: "RUNNING" } : s)));
          toast.message(`Generando: ${agentLabel(steps.find((s) => s.order === stepOrder)?.agentRef ?? "")}`);

          const text = await ai.generate({ system: systemPrompt, prompt: userPrompt, maxTokens: 2048 });
          if (cancelledRef.current) break;

          if (!text) {
            await failAgentRunStepAction(projectId, run.id, executionToken, ai.error ?? "La generación falló o se canceló.");
            toast.error(ai.error ?? "La generación falló.");
            break;
          }

          const completed = await completeAgentRunStepAction(projectId, run.id, text, executionToken);
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
    const result = await cancelAgentRunAction(projectId, run.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Ejecución cancelada.");
      router.refresh();
    }
  }

  async function handleResume() {
    const result = await resumeAgentRunAction(projectId, run.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Ejecución reanudada.");
      router.refresh();
    }
  }

  async function handleRetryStep(stepOrder: number) {
    const result = await retryAgentRunStepAction(projectId, run.id, stepOrder);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Reintentando...");
      router.refresh();
    }
  }

  async function handleDecision(decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") {
    if (!gateStep) return;
    const result = await decideAgentApprovalAction(projectId, run.id, { stepOrder: gateStep.order, decision, comment: approvalComment });
    if (result.error) toast.error(result.error);
    else {
      toast.success(decision === "APPROVED" ? "Paso aprobado." : decision === "REJECTED" ? "Paso rechazado." : "Se solicitaron cambios.");
      setApprovalComment("");
      router.refresh();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        {waitingApproval && gateStep ? (
          <Card className="border-amber-500/40">
            <CardContent className="space-y-2 py-3">
              <p className="text-sm font-medium">Esperando tu aprobación: {agentLabel(gateStep.agentRef)}</p>
              {gateStep.output ? (
                <pre className="max-h-60 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(gateStep.output, null, 2)}</pre>
              ) : null}
              <Textarea placeholder="Comentario (opcional)" value={approvalComment} onChange={(e) => setApprovalComment(e.target.value)} rows={2} />
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" onClick={() => handleDecision("APPROVED")}>
                  <Check className="size-3.5" /> Aprobar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => handleDecision("CHANGES_REQUESTED")}>
                  <RotateCcw className="size-3.5" /> Solicitar cambios
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
            <Card key={step.id}>
              <CardContent className="py-2.5">
                <button type="button" onClick={() => setExpanded(expanded === step.order ? null : step.order)} className="flex w-full items-center gap-2 text-left text-sm">
                  {expanded === step.order ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRightIcon className="size-3.5 shrink-0" />}
                  {step.status === "RUNNING" ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                  ) : step.status === "COMPLETED" ? (
                    <Check className="size-3.5 shrink-0 text-emerald-600" />
                  ) : step.status === "FAILED" ? (
                    <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                  ) : (
                    <AgentIcon agentRef={step.agentRef} className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{agentLabel(step.agentRef)}</span>
                  <Badge variant={step.status === "FAILED" ? "destructive" : "outline"} className="shrink-0">
                    {STEP_STATUS_LABELS[step.status] ?? step.status}
                  </Badge>
                </button>

                {expanded === step.order ? (
                  <div className={cn("mt-2 space-y-2 border-t pt-2 text-xs text-muted-foreground")}>
                    {step.errorMessage ? <p className="text-destructive">{step.errorMessage}</p> : null}
                    <p>Intentos: {step.attemptCount}</p>
                    {step.status === "FAILED" && canRetryRun ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => handleRetryStep(step.order)}>
                        <RotateCcw className="size-3.5" /> Reintentar paso
                      </Button>
                    ) : null}
                    {step.output ? <pre className="max-h-60 overflow-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(step.output, null, 2)}</pre> : null}
                    <StepResultPanel projectId={projectId} runId={run.id} step={step} campaignId={campaignId} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>

        {run.resources.length > 0 ? (
          <Card>
            <CardContent className="space-y-1.5 py-3">
              <p className="text-xs font-medium text-muted-foreground">Recursos creados por esta ejecución ({run.resources.length})</p>
              <ul className="max-h-52 space-y-1 overflow-auto text-xs">
                {run.resources.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded border p-1.5">
                    <span className="truncate">
                      {r.type.replace(/_/g, " ")}: {r.contentItem?.title ?? r.campaign?.name ?? r.pillar?.name ?? r.piece?.title ?? r.socialPost?.internalTitle ?? r.fileAsset?.displayName ?? r.id}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {r.action === "CREATED" ? "Creado" : r.action === "REUSED" ? "Reutilizado" : "Contexto"}
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
          {!["COMPLETED", "FAILED", "CANCELLED", "ARCHIVED", "PARTIALLY_COMPLETED"].includes(run.status) ? (
            <Button type="button" variant="outline" className="w-full text-destructive" onClick={handleCancel}>
              <X className="size-4" /> Cancelar ejecución
            </Button>
          ) : null}
        </div>

        <Card>
          <CardContent className="space-y-1.5 py-3 text-xs">
            <p className="font-medium text-muted-foreground">Enlaces</p>
            <Link href={`/dashboard/${projectId}/agents`} className="text-primary hover:underline">
              Volver a AI Agent Studio
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

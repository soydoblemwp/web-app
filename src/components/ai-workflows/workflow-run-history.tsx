"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { listWorkflowRunsAction, saveWorkflowRunResultToWorkspaceAction } from "@/server/actions/workflow-execution";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { UniversalResultViewer } from "@/components/workspace/universal-result-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type WorkflowRunSummary = Awaited<ReturnType<typeof listWorkflowRunsAction>>[number];

const RUN_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  VALIDATING: "Validando",
  RUNNING: "En curso",
  INTERRUPTED: "Interrumpida",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  CANCELLED: "Cancelada",
};

const EXECUTION_MODE_LABELS: Record<string, string> = {
  PUBLISHED: "Publicada",
  DRAFT_TEST: "Prueba de borrador",
  RETRY_ORIGINAL_SNAPSHOT: "Reintento (snapshot original)",
  RETRY_CURRENT_VERSION: "Reintento (versión actual)",
  NEW: "Ejecución nueva (legado)",
};

const RECOVERABLE_STATUSES = new Set(["PENDING", "VALIDATING", "RUNNING", "INTERRUPTED"]);
const RETRYABLE_STATUSES = new Set(["FAILED", "CANCELLED", "INTERRUPTED"]);

const STEP_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  RUNNING: "En curso",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  SKIPPED: "Omitido",
  CANCELLED: "Cancelado",
};

function formatDuration(startedAt: Date | null, completedAt: Date | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = completedAt.getTime() - startedAt.getTime();
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * "Historial de ejecuciones" — every REAL run of this workflow the caller
 * has started, most recent first. Every row here is, by construction, a
 * real execution (previews are never persisted) — labeled explicitly so
 * there's no ambiguity with the separate simulated-plan save path from
 * Phase 20. Reuses UniversalResultViewer for every result, never a second
 * renderer.
 *
 * Deliberately read-only for resume/retry: actually driving either one
 * requires the browser's local AI engine loop, which only
 * WorkflowExecutionPanel runs (and whose lease/tab identity a run must be
 * resumed under). Rather than duplicate that loop here under a second,
 * conflicting tab identity, a recoverable/retryable row's action just hands
 * off to the "Ejecutar" tab, where the same run is picked up and the
 * explicit resume/retry confirmation happens for real.
 */
export function WorkflowRunHistory({
  projectId,
  workflowId,
  currentWorkflowVersion,
  onRequestExecute,
  initialOpenRunId,
}: {
  projectId: string;
  workflowId: string;
  currentWorkflowVersion: number;
  onRequestExecute?: () => void;
  /** Pre-opens this specific run's row — used by Workspace/analytics "ir a la ejecución padre/hijo" navigation links. */
  initialOpenRunId?: string;
}) {
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(initialOpenRunId ?? null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWorkflowRunsAction(projectId, workflowId).then((result) => {
      if (cancelled) return;
      setRuns(result);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, workflowId]);

  async function handleSaveFinal(runId: string) {
    setSaving(runId);
    const result = await saveWorkflowRunResultToWorkspaceAction({ projectId, runId });
    setSaving(null);
    if (result.error) toast.error(result.error);
    else toast.success("Resultado guardado en el Workspace.");
  }

  if (!loaded) return null;
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay ejecuciones reales de este workflow.</p>;
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const open = openRunId === run.id;
        const inputVariables = run.inputVariables as Record<string, string>;
        return (
          <div key={run.id} className="rounded-lg border">
            <button
              type="button"
              onClick={() => setOpenRunId(open ? null : run.id)}
              className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={run.status === "COMPLETED" ? "default" : run.status === "FAILED" ? "destructive" : "outline"}>
                  {RUN_STATUS_LABELS[run.status] ?? run.status}
                </Badge>
                <Badge variant="outline">Ejecución real</Badge>
                <Badge variant="outline">v{run.workflowVersion}</Badge>
                {run.workflowVersion !== currentWorkflowVersion ? (
                  <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                    El Workflow cambió (ahora v{currentWorkflowVersion})
                  </Badge>
                ) : null}
                {run.executionMode && run.executionMode !== "NEW" ? (
                  <Badge variant="secondary">{EXECUTION_MODE_LABELS[run.executionMode] ?? run.executionMode}</Badge>
                ) : null}
                <span className="text-muted-foreground">{run.createdAt.toLocaleString("es-ES")}</span>
              </div>
              <span className="text-xs text-muted-foreground">Duración: {formatDuration(run.startedAt, run.completedAt)}</span>
            </button>

            {open ? (
              <div className="space-y-3 border-t p-3">
                {run.retryOfRunId ? (
                  <p className="text-xs text-muted-foreground">Reintento de la ejecución #{run.retryOfRunId.slice(-8)}.</p>
                ) : null}
                {run.resumedAt ? (
                  <p className="text-xs text-muted-foreground">Reanudada el {run.resumedAt.toLocaleString("es-ES")}.</p>
                ) : null}
                {run.interruptionReason ? <p className="text-xs text-amber-700 dark:text-amber-400">{run.interruptionReason}</p> : null}

                {(RECOVERABLE_STATUSES.has(run.status) || RETRYABLE_STATUSES.has(run.status)) && onRequestExecute ? (
                  <Button type="button" variant="outline" size="sm" onClick={onRequestExecute}>
                    {RECOVERABLE_STATUSES.has(run.status) ? "Ir a Ejecutar para reanudar" : "Ir a Ejecutar para reintentar"}
                  </Button>
                ) : null}

                {Object.keys(inputVariables).length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Variables de entrada</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(inputVariables).map(([name, value]) => (
                        <Badge key={name} variant="outline">
                          {name}: {value || "(vacío)"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs font-medium">Pasos ejecutados</p>
                  {run.steps.map((step) => (
                    <div key={step.id} className="space-y-1 rounded-md border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          Paso {step.stepIndex + 1} · {step.stepType}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {step.attemptNumber > 1 ? <Badge variant="outline">Intento {step.attemptNumber}</Badge> : null}
                          <Badge
                            variant={step.status === "COMPLETED" ? "default" : step.status === "FAILED" ? "destructive" : "outline"}
                          >
                            {STEP_STATUS_LABELS[step.status] ?? step.status}
                          </Badge>
                        </div>
                      </div>
                      {step.errorMessage ? <p className="text-destructive">{step.errorMessage}</p> : null}
                      {step.output ? (
                        <div className="rounded bg-muted/30 p-2">
                          <UniversalResultViewer blocks={parseResultBlocks(step.output)} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {run.errorMessage ? (
                  <p className="text-xs text-destructive">Error de la ejecución: {run.errorMessage}</p>
                ) : null}

                {run.finalOutput ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Resultado final</p>
                    <div className="rounded-lg border bg-muted/30 p-2">
                      <UniversalResultViewer blocks={parseResultBlocks(run.finalOutput)} />
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={saving === run.id} onClick={() => handleSaveFinal(run.id)}>
                      <Save className="size-3.5" /> Guardar en Workspace
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

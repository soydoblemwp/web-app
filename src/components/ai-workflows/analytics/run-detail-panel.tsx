"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getWorkflowRunAnalyticsDetailAction, getWorkflowRunCompositionAction } from "@/server/actions/workflow-analytics";
import { getRunNavigationInfoAction } from "@/server/actions/workflow-execution";
import type { WorkflowRunAnalyticsDetail, WorkflowRunCompositionDetail } from "@/server/services/workflow-analytics";
import type { RunNavigationInfo } from "@/server/services/workflow-runs";
import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  VALIDATING: "Validando",
  RUNNING: "En curso",
  INTERRUPTED: "Interrumpida",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  CANCELLED: "Cancelada",
  SKIPPED: "Omitido",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("es-ES");
}

/**
 * "Detalle de ejecución" — analytics view only: duration, per-step timing,
 * attempts, correlated AI usage, retry lineage, and a status timeline.
 * Deliberately never fetches or renders leaseId/leaseOwner/executionToken
 * or the workflow snapshot's system prompts — see
 * getWorkflowRunAnalyticsDetail's explicit `select` server-side. Full step
 * output remains WorkflowRunHistory's job.
 */
export function RunDetailPanel({ projectId, runId }: { projectId: string; runId: string }) {
  const [detail, setDetail] = useState<WorkflowRunAnalyticsDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composition, setComposition] = useState<WorkflowRunCompositionDetail | null>(null);
  const [navigation, setNavigation] = useState<RunNavigationInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      setDetail(null);
      setError(null);
      setComposition(null);
      setNavigation(null);
      const [detailResult, compositionResult, navigationResult] = await Promise.all([
        getWorkflowRunAnalyticsDetailAction(projectId, runId),
        getWorkflowRunCompositionAction(projectId, runId),
        getRunNavigationInfoAction(projectId, runId),
      ]);
      if (cancelled) return;
      if ("error" in detailResult) setError(detailResult.error);
      else setDetail(detailResult.data);
      if (!("error" in compositionResult)) setComposition(compositionResult.data);
      setNavigation(navigationResult);
    }
    refresh();
    return () => {
      cancelled = true;
    };
  }, [projectId, runId]);

  function workflowNavHref(workflowId: string, targetRunId: string) {
    return `/dashboard/${projectId}/ai-workflows?openWorkflow=${workflowId}&openRun=${targetRunId}`;
  }

  if (error) return <p className="p-3 text-sm text-destructive">{error}</p>;
  if (!detail) return <p className="p-3 text-sm text-muted-foreground">Cargando detalle...</p>;

  const timeline = [
    detail.createdAt ? { label: "Creada", at: detail.createdAt } : null,
    detail.startedAt ? { label: "Iniciada", at: detail.startedAt } : null,
    detail.resumedAt ? { label: "Reanudada", at: detail.resumedAt } : null,
    detail.cancelledAt ? { label: "Cancelada", at: detail.cancelledAt } : null,
    detail.completedAt ? { label: "Finalizada", at: detail.completedAt } : null,
  ].filter((e): e is { label: string; at: Date } => e !== null);

  return (
    <div className="space-y-4 border-t p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Estado" value={<Badge variant={detail.status === "COMPLETED" ? "default" : detail.status === "FAILED" ? "destructive" : "outline"}>{STATUS_LABELS[detail.status] ?? detail.status}</Badge>} />
        <Field label="Versión" value={`v${detail.workflowVersion}`} />
        <Field label="Duración total" value={formatDuration(detail.durationMs)} />
        <Field label="Guardado en Workspace" value={detail.savedToWorkspaceCount > 0 ? `Sí (${detail.savedToWorkspaceCount})` : "No"} />
      </div>

      {detail.errorMessage ? <Field label="Motivo de fallo" value={detail.errorMessage} /> : null}
      {detail.interruptionReason ? <Field label="Motivo de interrupción" value={detail.interruptionReason} /> : null}

      {composition && (composition.childrenDurationMs > 0 || composition.inheritedAiUsage > 0) ? (
        <div className="space-y-1.5 rounded-lg border p-3">
          <p className="text-xs font-medium">Composición (propio vs. sub-workflows)</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Duración propia" value={formatDuration(composition.ownDurationMs)} />
            <Field label="Duración de sub-workflows" value={formatDuration(composition.childrenDurationMs)} />
            <Field label="Uso de IA directo" value={String(composition.directAiUsage)} />
            <Field label="Uso de IA heredado" value={String(composition.inheritedAiUsage)} />
          </div>
        </div>
      ) : null}

      {navigation && (navigation.parent || navigation.children.length > 0) ? (
        <div className="space-y-1.5 rounded-lg border p-3">
          <p className="text-xs font-medium">Navegación entre workflows</p>
          {navigation.parent ? (
            <p className="text-xs">
              Workflow padre:{" "}
              <Link
                href={workflowNavHref(navigation.parent.workflowId, navigation.parent.runId)}
                className="font-medium underline underline-offset-2"
              >
                {navigation.parent.workflowName} (ejecución padre)
              </Link>
            </p>
          ) : null}
          {navigation.children.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Sub-workflows ejecutados por este paso:</p>
              {navigation.children.map((child) => (
                <p key={child.runId} className="text-xs">
                  <Link href={workflowNavHref(child.workflowId, child.runId)} className="font-medium underline underline-offset-2">
                    {child.workflowName}
                  </Link>{" "}
                  <Badge variant={child.status === "COMPLETED" ? "default" : child.status === "FAILED" ? "destructive" : "outline"}>
                    {STATUS_LABELS[child.status] ?? child.status}
                  </Badge>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {detail.retryOfRun ? (
        <p className="text-xs text-muted-foreground">
          Reintento de la ejecución #{detail.retryOfRun.id.slice(-8)} ({STATUS_LABELS[detail.retryOfRun.status] ?? detail.retryOfRun.status}, v
          {detail.retryOfRun.workflowVersion}).
        </p>
      ) : null}
      {detail.retries.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Reintentada {detail.retries.length} {detail.retries.length === 1 ? "vez" : "veces"}: {detail.retries.map((r) => `#${r.id.slice(-8)}`).join(", ")}.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Timeline</p>
        <ol className="space-y-1 text-xs text-muted-foreground">
          {timeline.map((event) => (
            <li key={event.label} className="flex justify-between gap-2">
              <span>{event.label}</span>
              <span>{formatDate(event.at)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Pasos</p>
        <div className="space-y-1">
          {detail.steps.map((step) => (
            <div key={step.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
              <span className="font-medium">
                Paso {step.stepIndex + 1} · {step.stepType}
              </span>
              <div className="flex items-center gap-1.5">
                {step.attemptNumber > 1 ? <Badge variant="outline">Intento {step.attemptNumber}</Badge> : null}
                <Badge variant={step.status === "COMPLETED" ? "default" : step.status === "FAILED" ? "destructive" : "outline"}>
                  {STATUS_LABELS[step.status] ?? step.status}
                </Badge>
                <span className="text-muted-foreground">{formatDuration(step.durationMs)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {detail.aiUsageEvents.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Uso de IA relacionado</p>
          <div className="space-y-1">
            {detail.aiUsageEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <span>{event.toolSlug ?? "—"}</span>
                <span className="text-muted-foreground">{formatDate(event.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div>{value}</div>
    </div>
  );
}

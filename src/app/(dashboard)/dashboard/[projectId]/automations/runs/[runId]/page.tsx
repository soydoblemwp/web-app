import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getAutomationRunDetailAction } from "@/server/actions/automation-runs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RunDetailActions } from "@/components/automations/run-detail-actions";
import { RUN_STATUS_LABELS, RUN_STATUS_TONE, APPROVAL_STATUS_LABELS, formatDateTime } from "@/components/automations/labels";

export const metadata: Metadata = { title: "Ejecución de automatización" };

export default async function AutomationRunDetailPage({ params }: { params: Promise<{ projectId: string; runId: string }> }) {
  const { projectId, runId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const run = await getAutomationRunDetailAction(projectId, runId);
  if (!run) notFound();

  const pendingApproval = run.approvals.find((a) => a.status === "PENDING") ?? null;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/dashboard/${projectId}/automations/${run.automationId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {run.automation.name}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Ejecución</h1>
            <Badge variant={RUN_STATUS_TONE[run.status] ?? "outline"}>{RUN_STATUS_LABELS[run.status] ?? run.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Disparador: {run.triggerType} · Creada: {formatDateTime(run.createdAt.toISOString())}
          </p>
        </div>
        <RunDetailActions projectId={projectId} runId={run.id} status={run.status} pendingApprovalId={pendingApproval?.id ?? null} />
      </div>

      {run.lastErrorMessage ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{run.lastErrorMessage}</p>
            {run.lastErrorCategory ? <p className="text-xs text-muted-foreground">Categoría: {run.lastErrorCategory}</p> : null}
            {run.status === "RETRY_SCHEDULED" && run.nextRetryAt ? <p className="text-xs text-muted-foreground">Próximo reintento: {formatDateTime(run.nextRetryAt.toISOString())} (intento {run.attempt})</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Link href={`/dashboard/${projectId}/ai-workflows`} className="font-medium hover:underline">
              {run.workflow.name}
            </Link>
            {run.workflowRunId ? (
              <p className="text-xs text-muted-foreground">
                Ejecución de AI Workflows: <span className="font-mono">{run.workflowRunId}</span> — ábrela desde AI Workflows para ver o continuar sus pasos.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Todavía no se inició ninguna ejecución del workflow.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tiempos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Iniciada: {formatDateTime(run.startedAt ? run.startedAt.toISOString() : null)}</p>
            <p>Completada: {formatDateTime(run.completedAt ? run.completedAt.toISOString() : null)}</p>
            <p>Duración: {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entradas usadas</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(run.inputs, null, 2)}</pre>
        </CardContent>
      </Card>

      {run.event ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evento que originó la ejecución</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              {run.event.type} · {run.event.resourceType} {run.event.resourceId ? `(${run.event.resourceId})` : ""}
            </p>
            <p className="text-xs text-muted-foreground">Ocurrió: {formatDateTime(run.event.occurredAt.toISOString())}</p>
          </CardContent>
        </Card>
      ) : null}

      {run.approvals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aprobaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.approvals.map((approval) => (
              <div key={approval.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>{approval.stepLabel ?? "Aprobación"}</span>
                  <Badge variant="outline">{APPROVAL_STATUS_LABELS[approval.status] ?? approval.status}</Badge>
                </div>
                {approval.decidedBy ? <p className="text-xs text-muted-foreground">Decidida por {approval.decidedBy.name ?? approval.decidedBy.email} — {formatDateTime(approval.decidedAt ? approval.decidedAt.toISOString() : null)}</p> : null}
                {approval.comment ? <p className="text-xs text-muted-foreground">&ldquo;{approval.comment}&rdquo;</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {run.waits.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Esperas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.waits.map((wait) => (
              <div key={wait.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{wait.kind}</span>
                <Badge variant="outline">{wait.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {run.attempts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial de intentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.attempts.map((attempt) => (
              <div key={attempt.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Intento {attempt.attemptNumber}</span>
                  <Badge variant={attempt.status === "FAILED" ? "destructive" : "outline"}>{attempt.status}</Badge>
                </div>
                {attempt.errorMessage ? <p className="text-xs text-muted-foreground">{attempt.errorMessage}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

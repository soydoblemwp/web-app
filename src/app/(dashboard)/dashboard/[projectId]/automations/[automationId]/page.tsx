import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getAutomationAction } from "@/server/actions/automations";
import { listAutomationRunsAction } from "@/server/actions/automation-runs";
import { getWebhookConfigAction } from "@/server/actions/automation-webhooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutomationDetailActions } from "@/components/automations/automation-detail-actions";
import { WebhookPanel } from "@/components/automations/webhook-panel";
import { ExportAutomationButton } from "@/components/automations/export-button";
import { AUTOMATION_STATUS_LABELS, AUTOMATION_STATUS_TONE, RUN_STATUS_LABELS, RUN_STATUS_TONE, TRIGGER_TYPE_LABELS, ERROR_POLICY_LABELS, formatDateTime } from "@/components/automations/labels";

export const metadata: Metadata = { title: "Automatización" };

function renderConditionSummary(group: { operator: string; conditions: { field: string; operator: string; value: unknown }[]; childGroups?: unknown[] } | null): string {
  if (!group || (group.conditions.length === 0 && (!group.childGroups || group.childGroups.length === 0))) return "Sin condiciones — se ejecuta siempre que el disparador ocurre.";
  const parts = group.conditions.map((c) => `${c.field} ${c.operator} ${c.value != null ? JSON.stringify(c.value) : ""}`.trim());
  return `${parts.join(` ${group.operator} `)}${group.childGroups && group.childGroups.length > 0 ? ` (+ ${group.childGroups.length} subgrupo(s))` : ""}`;
}

export default async function AutomationDetailPage({ params }: { params: Promise<{ projectId: string; automationId: string }> }) {
  const { projectId, automationId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const automation = await getAutomationAction(projectId, automationId);
  if (!automation) notFound();

  const [runs, webhookConfig] = await Promise.all([
    listAutomationRunsAction(projectId, { automationId, limit: 15 }),
    automation.trigger?.type === "WEBHOOK" ? getWebhookConfigAction(projectId, automationId) : Promise.resolve(null),
  ]);

  const rootGroup = automation.conditionGroups[0] ?? null;

  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/dashboard/${projectId}/automations`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Automation Center
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{automation.name}</h1>
            <Badge variant={AUTOMATION_STATUS_TONE[automation.status] ?? "outline"}>{AUTOMATION_STATUS_LABELS[automation.status] ?? automation.status}</Badge>
          </div>
          {automation.description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{automation.description}</p> : null}
          {automation.pausedBySystem && automation.pausedReason ? (
            <p className="mt-1 text-sm text-destructive">Pausada automáticamente: {automation.pausedReason}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <AutomationDetailActions
            projectId={projectId}
            automationId={automationId}
            status={automation.status}
            isRecurring={automation.trigger?.type === "SCHEDULE_RECURRING"}
            hasUpcomingOccurrence={Boolean(automation.trigger?.nextFiredAt)}
          />
          <ExportAutomationButton projectId={projectId} automationId={automationId} name={automation.name} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Link href={`/dashboard/${projectId}/ai-workflows`} className="font-medium hover:underline">
              {automation.workflow.name}
            </Link>
            <p className="text-xs text-muted-foreground">
              Estado: {automation.workflow.status} · Versión publicada: {automation.workflow.publishedVersion ?? "—"}
              {automation.pinnedRevision ? ` · Fijada en v${automation.pinnedRevision.version}` : " · Usa siempre la última versión activa"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disparador</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{automation.trigger ? TRIGGER_TYPE_LABELS[automation.trigger.type] ?? automation.trigger.type : "—"}</p>
            <p className="text-xs text-muted-foreground">
              Última ejecución: {formatDateTime(automation.lastRunAt)} · Próxima: {formatDateTime(automation.nextRunAt)}
            </p>
          </CardContent>
        </Card>
      </div>

      {webhookConfig ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Webhook</CardTitle>
          </CardHeader>
          <CardContent>
            <WebhookPanel projectId={projectId} automationId={automationId} publicId={webhookConfig.publicId} receivedCount={webhookConfig.receivedCount} lastReceivedAt={webhookConfig.lastReceivedAt ? webhookConfig.lastReceivedAt.toISOString() : null} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Condiciones</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{renderConditionSummary(rootGroup)}</p>
        </CardContent>
      </Card>

      {automation.inputMappings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entradas del workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {automation.inputMappings.map((m) => (
              <p key={m.id} className="text-sm">
                <span className="font-mono text-xs">{m.targetVariable}</span> ← {m.sourceKind.toLowerCase()}: <span className="font-mono text-xs">{m.sourceExpression}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Políticas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Ante error: {ERROR_POLICY_LABELS[automation.errorPolicy] ?? automation.errorPolicy}</p>
          {automation.errorPolicy === "RETRY" ? <p>Máximo de reintentos: {automation.maxRetryAttempts}</p> : null}
          <p>Requiere aprobación: {automation.requireApprovalBeforeStart ? "Sí" : "No"}</p>
          <p>Notificar al completarse: {automation.notifyOnCompletion ? "Sí" : "No"}</p>
          <p>Notificar al fallar: {automation.notifyOnFailure ? "Sí" : "No"}</p>
          <p>Zona horaria: {automation.timezone}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ejecuciones recientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay ejecuciones.</p>
          ) : (
            runs.map((run) => (
              <Link key={run.id} href={`/dashboard/${projectId}/automations/runs/${run.id}`} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm hover:bg-accent/50">
                <div className="flex items-center gap-2">
                  <Badge variant={RUN_STATUS_TONE[run.status] ?? "outline"}>{RUN_STATUS_LABELS[run.status] ?? run.status}</Badge>
                  <span className="text-xs text-muted-foreground">{run.triggerType}</span>
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(run.createdAt.toISOString())}</span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

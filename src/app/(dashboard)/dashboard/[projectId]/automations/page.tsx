import type { Metadata } from "next";
import Link from "next/link";
import { Zap, Plus, Clock, ShieldCheck } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { listAutomationsAction } from "@/server/actions/automations";
import { listPendingApprovalsAction } from "@/server/actions/automation-approvals";
import { listUpcomingOccurrencesAction } from "@/server/actions/automation-runs";
import { listEligibleWorkflowsForAutomationAction } from "@/server/actions/automation-select";
import { AutomationHub, type AutomationListItem } from "@/components/automations/automation-hub";
import { ImportAutomationDialog } from "@/components/automations/import-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/components/automations/labels";

export const metadata: Metadata = { title: "Automation Center" };

export default async function AutomationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const [automations, pendingApprovals, upcoming, workflows] = await Promise.all([
    listAutomationsAction(projectId),
    listPendingApprovalsAction(projectId),
    listUpcomingOccurrencesAction(projectId, 14),
    listEligibleWorkflowsForAutomationAction(projectId),
  ]);

  const items: AutomationListItem[] = automations.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    triggerType: a.trigger?.type ?? null,
    workflowName: a.workflow.name,
    lastRunAt: a.lastRunAt ? a.lastRunAt.toISOString() : null,
    nextRunAt: a.nextRunAt ? a.nextRunAt.toISOString() : null,
    consecutiveFailureCount: a.consecutiveFailureCount,
    pausedBySystem: a.pausedBySystem,
    pausedReason: a.pausedReason,
    runCount: a._count.runs,
  }));

  const stats = {
    active: automations.filter((a) => a.status === "ACTIVE").length,
    paused: automations.filter((a) => a.status === "PAUSED").length,
    error: automations.filter((a) => a.status === "ERROR" || a.pausedBySystem).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Zap className="size-6" /> Automation Center
          </h1>
          <p className="text-sm text-muted-foreground">Decide cuándo y por qué se ejecuta un workflow de AI Workflows — programado, por evento, por webhook o manualmente.</p>
        </div>
        <div className="flex gap-2">
          <ImportAutomationDialog projectId={projectId} workflows={workflows} />
          <Link href={`/dashboard/${projectId}/automations/new`} className={cn(buttonVariants())}>
            <Plus className="size-4" /> Nueva automatización
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Activas</p>
            <p className="text-2xl font-semibold">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Pausadas</p>
            <p className="text-2xl font-semibold">{stats.paused}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Con error / pausadas automáticamente</p>
            <p className="text-2xl font-semibold">{stats.error}</p>
          </CardContent>
        </Card>
      </div>

      {pendingApprovals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Aprobaciones pendientes ({pendingApprovals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingApprovals.slice(0, 5).map((approval) => (
              <div key={approval.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{approval.run.automation.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{approval.stepLabel ?? "Aprobación requerida"}</p>
                </div>
                <Link href={`/dashboard/${projectId}/automations/runs/${approval.runId}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                  Revisar
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" /> Próximas ejecuciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.slice(0, 8).map((occurrence, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                <Link href={`/dashboard/${projectId}/automations/${occurrence.automationId}`} className="truncate hover:underline">
                  {occurrence.automationName}
                </Link>
                <Badge variant="outline">{formatDateTime(occurrence.occurrenceAt)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <AutomationHub projectId={projectId} automations={items} />
    </div>
  );
}

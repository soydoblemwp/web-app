import type { Metadata } from "next";
import { TrendingUp } from "lucide-react";
import { requireProjectAccess, getProjectRole } from "@/lib/permissions";
import { getGoogleIntegrationStatusAction, listGoogleSyncHistoryAction } from "@/server/actions/google-integrations";
import { GoogleIntegrationConsole } from "@/components/integrations/google-integration-console";

export const metadata: Metadata = { title: "Google — Integraciones" };

export default async function GoogleIntegrationPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { projectId } = await params;
  const { error, connected } = await searchParams;
  const user = await requireProjectAccess(projectId, "VIEWER");
  const role = await getProjectRole(user.id, projectId);
  const isManager = role === "MANAGER" || role === "OWNER";

  const [status, history] = await Promise.all([getGoogleIntegrationStatusAction(projectId), listGoogleSyncHistoryAction(projectId, { limit: 20 })]);

  const connection = status.connection
    ? {
        id: status.connection.id,
        googleEmail: status.connection.googleEmail,
        status: status.connection.status,
        scopes: status.connection.scopes,
        connectedAt: status.connection.connectedAt ? status.connection.connectedAt.toISOString() : null,
        tokenExpiresAt: status.connection.tokenExpiresAt ? status.connection.tokenExpiresAt.toISOString() : null,
        lastError: status.connection.lastError,
      }
    : null;

  const resources = status.resources.map((r) => ({
    id: r.id,
    type: r.type,
    externalId: r.externalId,
    name: r.name,
    accountName: r.accountName,
    permissionLevel: r.permissionLevel,
    active: r.active,
    lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
  }));

  const historyRuns = "error" in history ? [] : history.runs.map((r) => ({
    id: r.id,
    resourceName: r.resource.name,
    resourceType: r.resource.type,
    syncType: r.syncType,
    status: r.status,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    rowsReceived: r.rowsReceived,
    pointsCreated: r.pointsCreated,
    pointsUpdated: r.pointsUpdated,
    pointsSkipped: r.pointsSkipped,
    errorMessage: r.errorMessage,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    startedBy: r.startedBy ? { name: r.startedBy.name, email: r.startedBy.email } : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Google — Analytics 4 &amp; Search Console</h1>
          <p className="text-sm text-muted-foreground">Conexión OAuth de solo lectura, selección de propiedades y sincronización real hacia Performance Center.</p>
        </div>
      </div>

      <GoogleIntegrationConsole
        projectId={projectId}
        isManager={isManager}
        configured={status.configured}
        connection={connection}
        resources={resources}
        initialHistory={historyRuns}
        initialHistoryCursor={"error" in history ? null : history.nextCursor}
        urlError={error ?? null}
        justConnected={connected === "1"}
      />
    </div>
  );
}

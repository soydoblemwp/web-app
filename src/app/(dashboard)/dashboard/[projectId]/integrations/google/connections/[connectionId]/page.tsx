import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getGoogleConnectionDetailAction } from "@/server/actions/google-integrations";
import { listGoogleSyncHistoryAction } from "@/server/actions/google-integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/components/automations/labels";
import { GOOGLE_CONNECTION_STATUS_LABELS, GOOGLE_CONNECTION_STATUS_TONE, GOOGLE_SYNC_STATUS_LABELS, GOOGLE_SYNC_STATUS_TONE, GOOGLE_RESOURCE_TYPE_LABELS } from "@/components/integrations/google-labels";

export const metadata: Metadata = { title: "Conexión de Google" };

/**
 * Connection-scoped detail/audit view (Fase 39 spec section 1) — distinct
 * from /integrations/google's configuration tabs: a focused, deep-linkable
 * record of exactly this connection and its full sync history, useful from
 * notifications/audit links. Configuration changes still happen on the main
 * /integrations/google page (this route never duplicates that logic).
 */
export default async function GoogleConnectionDetailPage({ params }: { params: Promise<{ projectId: string; connectionId: string }> }) {
  const { projectId, connectionId } = await params;
  await requireProjectAccess(projectId, "VIEWER");

  const [detailResult, historyResult] = await Promise.all([
    getGoogleConnectionDetailAction(projectId, connectionId),
    listGoogleSyncHistoryAction(projectId, { limit: 50 }),
  ]);
  if ("error" in detailResult) notFound();
  const { connection } = detailResult;
  const history = "error" in historyResult ? [] : historyResult.runs;

  return (
    <div className="space-y-6">
      <Link href={`/dashboard/${projectId}/integrations/google`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
        <ArrowLeft className="size-4" /> Volver a la configuración de Google
      </Link>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{connection.googleEmail ?? "Conexión de Google"}</CardTitle>
          <Badge variant={GOOGLE_CONNECTION_STATUS_TONE[connection.status] ?? "outline"}>{GOOGLE_CONNECTION_STATUS_LABELS[connection.status] ?? connection.status}</Badge>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          <p>Conectado: {formatDateTime(connection.connectedAt)}</p>
          <p>Desconectado: {formatDateTime(connection.disconnectedAt)}</p>
          <p>Último uso: {formatDateTime(connection.lastUsedAt)}</p>
          <p>Propiedades guardadas: {connection.resources.length}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Propiedades de esta conexión</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {connection.resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se seleccionó ninguna propiedad.</p>
          ) : (
            connection.resources.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{r.name}</span>
                <Badge variant="outline">{GOOGLE_RESOURCE_TYPE_LABELS[r.type] ?? r.type}</Badge>
                <Badge variant={r.active ? "secondary" : "outline"}>{r.active ? "Activa" : "Inactiva"}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">Última sync: {formatDateTime(r.lastSyncedAt)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial completo de sincronización</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin sincronizaciones registradas.</p>
          ) : (
            history.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-b-0">
                <span>{run.resource.name}</span>
                <Badge variant="outline">{run.syncType}</Badge>
                <Badge variant={GOOGLE_SYNC_STATUS_TONE[run.status] ?? "outline"}>{GOOGLE_SYNC_STATUS_LABELS[run.status] ?? run.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {run.pointsCreated} creados · {run.pointsUpdated} actualizados · {run.pointsSkipped} omitidos
                </span>
                {run.errorMessage ? <span className="text-xs text-destructive">{run.errorMessage}</span> : null}
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(run.startedAt)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

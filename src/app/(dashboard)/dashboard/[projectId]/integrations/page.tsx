import type { Metadata } from "next";
import Link from "next/link";
import { Plug, TrendingUp, Search as SearchIcon, ArrowRight } from "lucide-react";
import { requireProjectAccess, getProjectRole } from "@/lib/permissions";
import { getGoogleIntegrationStatusAction, getGoogleProviderOverviewsAction } from "@/server/actions/google-integrations";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/components/automations/labels";
import { GOOGLE_CONNECTION_STATUS_LABELS, GOOGLE_CONNECTION_STATUS_TONE, GOOGLE_SYNC_STATUS_LABELS } from "@/components/integrations/google-labels";

export const metadata: Metadata = { title: "Integraciones" };

export default async function IntegrationsHubPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireProjectAccess(projectId, "VIEWER");
  const role = await getProjectRole(user.id, projectId);
  const isManager = role === "MANAGER" || role === "OWNER";

  const [status, overviews] = await Promise.all([getGoogleIntegrationStatusAction(projectId), getGoogleProviderOverviewsAction(projectId)]);
  const { connection } = status;

  const connectedCount = connection && connection.status !== "DISCONNECTED" && connection.status !== "NOT_CONFIGURED" ? 1 : 0;
  const needsAttention = connection?.status === "REAUTH_REQUIRED" || connection?.status === "ERROR" ? 1 : 0;
  const lastSyncedAt = [overviews.ga4.lastSyncedAt, overviews.gsc.lastSyncedAt].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Plug className="size-6" /> Integraciones
          </h1>
          <p className="text-sm text-muted-foreground">Conecta fuentes de datos externas reales y sincroniza sus métricas dentro de Performance Center.</p>
        </div>
        <Link href={`/dashboard/${projectId}/integrations`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Actualizar estado
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Conexiones activas</p>
            <p className="text-xl font-semibold">{connectedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Requieren atención</p>
            <p className={`text-xl font-semibold ${needsAttention > 0 ? "text-destructive" : ""}`}>{needsAttention}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Última sincronización</p>
            <p className="text-xl font-semibold">{lastSyncedAt ? formatDateTime(lastSyncedAt.toISOString()) : "Nunca"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ProviderCard
          projectId={projectId}
          icon={<TrendingUp className="size-5" />}
          title="Google Analytics 4"
          connectionStatus={status.configured ? (connection?.status ?? "NOT_CONFIGURED") : "NOT_CONFIGURED"}
          configured={status.configured}
          activeCount={overviews.ga4.activeResourceCount}
          lastSyncedAt={overviews.ga4.lastSyncedAt}
          lastRunStatus={overviews.ga4.lastRunStatus}
          isManager={isManager}
        />
        <ProviderCard
          projectId={projectId}
          icon={<SearchIcon className="size-5" />}
          title="Google Search Console"
          connectionStatus={status.configured ? (connection?.status ?? "NOT_CONFIGURED") : "NOT_CONFIGURED"}
          configured={status.configured}
          activeCount={overviews.gsc.activeResourceCount}
          lastSyncedAt={overviews.gsc.lastSyncedAt}
          lastRunStatus={overviews.gsc.lastRunStatus}
          isManager={isManager}
        />
      </div>
    </div>
  );
}

function ProviderCard({
  projectId,
  icon,
  title,
  connectionStatus,
  configured,
  activeCount,
  lastSyncedAt,
  lastRunStatus,
  isManager,
}: {
  projectId: string;
  icon: React.ReactNode;
  title: string;
  connectionStatus: string;
  configured: boolean;
  activeCount: number;
  lastSyncedAt: Date | null;
  lastRunStatus: string | null;
  isManager: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <Badge variant={GOOGLE_CONNECTION_STATUS_TONE[connectionStatus] ?? "outline"}>{GOOGLE_CONNECTION_STATUS_LABELS[connectionStatus] ?? connectionStatus}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {!configured ? (
          <CardDescription>La integración con Google no está configurada en este entorno todavía (faltan credenciales OAuth). Contacta a quien administra el despliegue.</CardDescription>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{activeCount} propiedad(es) activa(s)</p>
            <p className="text-sm text-muted-foreground">Última sincronización: {lastSyncedAt ? formatDateTime(lastSyncedAt.toISOString()) : "nunca"}</p>
            {lastRunStatus ? <p className="text-sm text-muted-foreground">Último resultado: {GOOGLE_SYNC_STATUS_LABELS[lastRunStatus] ?? lastRunStatus}</p> : null}
            {connectionStatus === "REAUTH_REQUIRED" ? <p className="text-sm font-medium text-destructive">La autorización venció — reconecta la cuenta de Google.</p> : null}
          </>
        )}
        <div className="pt-2">
          <Link href={`/dashboard/${projectId}/integrations/google`} className={cn(buttonVariants({ size: "sm" }))}>
            {configured && connectionStatus !== "NOT_CONFIGURED" && connectionStatus !== "DISCONNECTED" ? (isManager ? "Configurar" : "Ver estado") : "Conectar con Google"} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

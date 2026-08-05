import type { Metadata } from "next";
import Link from "next/link";
import { LineChart, FlaskConical, Lightbulb, AlertTriangle, Upload, Target, Plug } from "lucide-react";
import { requireProjectAccess } from "@/lib/permissions";
import { getInternalMetricsSnapshotAction } from "@/server/actions/performance-select";
import { listGoalsAction } from "@/server/actions/performance-goals";
import { listRecommendationsAction } from "@/server/actions/performance-recommendations";
import { listAnomaliesAction } from "@/server/actions/performance-anomalies";
import { listExperimentsAction } from "@/server/actions/performance-experiments";
import { listImportsAction } from "@/server/actions/performance-imports";
import { listCampaignsForSelectAction } from "@/server/actions/performance-select";
import { getGoogleIntegrationStatusAction, getGoogleProviderOverviewsAction } from "@/server/actions/google-integrations";
import { getPeriodBounds } from "@/lib/performance/periods";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RECOMMENDATION_STATUS_TONE, PRIORITY_LABELS, EXPERIMENT_STATUS_LABELS, EXPERIMENT_STATUS_TONE, IMPORT_STATUS_LABELS, IMPORT_STATUS_TONE, formatDateTime } from "@/components/performance/labels";
import { GOOGLE_CONNECTION_STATUS_LABELS, GOOGLE_CONNECTION_STATUS_TONE } from "@/components/integrations/google-labels";

export const metadata: Metadata = { title: "Performance Intelligence" };

export default async function PerformanceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ period?: string; campaignId?: string }>;
}) {
  const { projectId } = await params;
  const { period = "30", campaignId } = await searchParams;
  await requireProjectAccess(projectId, "VIEWER");

  const bounds = getPeriodBounds("DAY", new Date(), "UTC")!;
  const now = new Date().getTime();
  const periodDays = Number(period) || 30;
  const periodStart = new Date(bounds.end.getTime() - periodDays * 86_400_000);

  const [snapshot, goals, recommendations, anomalies, experiments, imports, campaigns, googleStatus, googleOverviews] = await Promise.all([
    getInternalMetricsSnapshotAction(projectId, { start: periodStart.toISOString(), end: bounds.end.toISOString() }),
    listGoalsAction(projectId, { campaignId, status: "ACTIVE" }),
    listRecommendationsAction(projectId, { status: "NEW", limit: 6 }),
    listAnomaliesAction(projectId, { status: "OPEN", limit: 6 }),
    listExperimentsAction(projectId, { status: "RUNNING" }),
    listImportsAction(projectId),
    listCampaignsForSelectAction(projectId),
    getGoogleIntegrationStatusAction(projectId),
    getGoogleProviderOverviewsAction(projectId),
  ]);

  const hasAnyData = snapshot.content.itemsCreated + snapshot.campaign.created + snapshot.social.created + snapshot.automation.workflowAutomationRunsCompleted + snapshot.knowledge.queriesCount > 0;
  const recentImports = imports.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LineChart className="size-6" /> Performance Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">Mide, compara e interpreta todo el contenido de la plataforma — con origen de dato siempre visible.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/${projectId}/performance/imports`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Upload className="size-3.5" /> Importar métricas
          </Link>
          <Link href={`/dashboard/${projectId}/performance/experiments/new`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <FlaskConical className="size-3.5" /> Nuevo experimento
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" action={`/dashboard/${projectId}/performance`}>
        <Select name="period" defaultValue={String(periodDays)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
            <SelectItem value="365">Último año</SelectItem>
          </SelectContent>
        </Select>
        <Select name="campaignId" defaultValue={campaignId ?? "__all"}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Todas las campañas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas las campañas</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Aplicar filtros
        </button>
      </form>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="size-4" /> Fuentes conectadas
          </CardTitle>
          <Link href={`/dashboard/${projectId}/integrations/google`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Configurar Google
          </Link>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { label: "Google Analytics 4", overview: googleOverviews.ga4 },
              { label: "Google Search Console", overview: googleOverviews.gsc },
            ] as const
          ).map(({ label, overview }) => {
            const status = googleStatus.configured ? (googleStatus.connection?.status ?? "NOT_CONFIGURED") : "NOT_CONFIGURED";
            const isStale = overview.lastSyncedAt ? now - overview.lastSyncedAt.getTime() > 3 * 86_400_000 : overview.activeResourceCount > 0;
            return (
              <div key={label} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {overview.activeResourceCount} propiedad(es) · última sync: {overview.lastSyncedAt ? formatDateTime(overview.lastSyncedAt.toISOString()) : "nunca"}
                    {isStale && overview.activeResourceCount > 0 ? " · desactualizado" : ""}
                  </p>
                </div>
                <Badge variant={GOOGLE_CONNECTION_STATUS_TONE[status] ?? "outline"}>{GOOGLE_CONNECTION_STATUS_LABELS[status] ?? status}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {!hasAnyData ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <LineChart className="size-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              Todavía no hay datos internos ni mediciones registradas para este periodo. Crea contenido/campañas/publicaciones, registra una métrica manual, o importa un CSV/JSON para empezar a ver resultados aquí.
            </p>
            <div className="flex gap-2">
              <Link href={`/dashboard/${projectId}/performance/content`} className={cn(buttonVariants({ size: "sm" }))}>
                Registrar una métrica
              </Link>
              <Link href={`/dashboard/${projectId}/performance/imports`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Importar datos
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Contenido creado</p>
                <p className="text-2xl font-semibold">{snapshot.content.itemsCreated}</p>
                <p className="text-xs text-muted-foreground">{snapshot.content.versionsCreated} revisiones</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Campañas activas</p>
                <p className="text-2xl font-semibold">{snapshot.campaign.active}</p>
                <p className="text-xs text-muted-foreground">{snapshot.campaign.piecesCompleted}/{snapshot.campaign.piecesPlanned} piezas completadas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Publicaciones</p>
                <p className="text-2xl font-semibold">{snapshot.social.created}</p>
                <p className="text-xs text-muted-foreground">{snapshot.social.published} publicadas internamente</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Automatización</p>
                <p className="text-2xl font-semibold">{snapshot.automation.workflowAutomationRunsCompleted}</p>
                <p className="text-xs text-muted-foreground">{snapshot.automation.workflowAutomationRunsFailed} fallidas</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {goals.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="size-4" /> Objetivos activos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {goals.slice(0, 6).map((g) => (
                    <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <span>{g.metricKey}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{g.type}</Badge>
                        <Link href={`/dashboard/${projectId}/marketing-brain/optimization/new?goalId=${g.id}`} className="text-xs text-muted-foreground underline">
                          Crear estrategia
                        </Link>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {recommendations.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Lightbulb className="size-4" /> Recomendaciones pendientes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recommendations.map((r) => (
                    <Link key={r.id} href={`/dashboard/${projectId}/performance/recommendations`} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm hover:bg-accent/50">
                      <span className="truncate">{r.title}</span>
                      <Badge variant={RECOMMENDATION_STATUS_TONE[r.status] ?? "outline"}>{PRIORITY_LABELS[r.priority] ?? r.priority}</Badge>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {anomalies.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="size-4" /> Anomalías detectadas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {anomalies.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span>{a.metricKey}</span>
                      <Badge variant="destructive">{a.severity}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {experiments.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FlaskConical className="size-4" /> Experimentos activos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {experiments.map((e) => (
                    <Link key={e.id} href={`/dashboard/${projectId}/performance/experiments/${e.id}`} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm hover:bg-accent/50">
                      <span className="truncate">{e.name}</span>
                      <Badge variant={EXPERIMENT_STATUS_TONE[e.status] ?? "outline"}>{EXPERIMENT_STATUS_LABELS[e.status] ?? e.status}</Badge>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {recentImports.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Importaciones recientes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentImports.map((imp) => (
                  <Link key={imp.id} href={`/dashboard/${projectId}/performance/imports/${imp.id}`} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm hover:bg-accent/50">
                    <span>
                      {imp.kind} · {imp.importedRows}/{imp.totalRows} filas
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant={IMPORT_STATUS_TONE[imp.status] ?? "outline"}>{IMPORT_STATUS_LABELS[imp.status] ?? imp.status}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(imp.createdAt.toISOString())}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`/dashboard/${projectId}/performance/content`} className={cn(buttonVariants({ variant: "outline" }), "justify-start")}>
          Comparar contenido
        </Link>
        <Link href={`/dashboard/${projectId}/performance/campaigns`} className={cn(buttonVariants({ variant: "outline" }), "justify-start")}>
          Comparar campañas
        </Link>
        <Link href={`/dashboard/${projectId}/performance/social`} className={cn(buttonVariants({ variant: "outline" }), "justify-start")}>
          Comparar publicaciones
        </Link>
      </div>
    </div>
  );
}

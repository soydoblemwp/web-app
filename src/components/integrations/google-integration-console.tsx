"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw, Search as SearchIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { formatDateTime } from "@/components/automations/labels";
import { GOOGLE_CONNECTION_STATUS_LABELS, GOOGLE_CONNECTION_STATUS_TONE, GOOGLE_SYNC_STATUS_LABELS, GOOGLE_SYNC_STATUS_TONE, GOOGLE_RESOURCE_TYPE_LABELS } from "@/components/integrations/google-labels";
import { GOOGLE_INTEGRATION_LIMITS } from "@/lib/integrations/google-limits";
import {
  testGoogleConnectionAction,
  setGooglePausedAction,
  disconnectGoogleAction,
  listLiveGa4PropertiesAction,
  listLiveSearchConsoleSitesAction,
  saveSelectedGoogleResourcesAction,
  setGoogleResourceActiveAction,
  triggerManualGoogleSyncAction,
  resyncGoogleRangeAction,
  listGoogleSyncHistoryAction,
  getGoogleSyncRunDetailAction,
} from "@/server/actions/google-integrations";

interface ConnectionData {
  id: string;
  googleEmail: string | null;
  status: string;
  scopes: string[];
  connectedAt: string | null;
  tokenExpiresAt: string | null;
  lastError: string | null;
}

interface ResourceData {
  id: string;
  type: "GA4_PROPERTY" | "SEARCH_CONSOLE_SITE";
  externalId: string;
  name: string;
  accountName: string | null;
  permissionLevel: string | null;
  active: boolean;
  lastSyncedAt: string | null;
}

interface HistoryRun {
  id: string;
  resourceName: string;
  resourceType: string;
  syncType: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  rowsReceived: number;
  pointsCreated: number;
  pointsUpdated: number;
  pointsSkipped: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  startedBy: { name: string | null; email: string } | null;
}

export function GoogleIntegrationConsole({
  projectId,
  isManager,
  configured,
  connection,
  resources,
  initialHistory,
  initialHistoryCursor,
  urlError,
  justConnected,
}: {
  projectId: string;
  isManager: boolean;
  configured: boolean;
  connection: ConnectionData | null;
  resources: ResourceData[];
  initialHistory: HistoryRun[];
  initialHistoryCursor: string | null;
  urlError: string | null;
  justConnected: boolean;
}) {
  useEffect(() => {
    if (urlError) toast.error(decodeURIComponent(urlError));
    if (justConnected) toast.success("Cuenta de Google conectada — selecciona las propiedades a sincronizar.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!configured) {
    return (
      <Card className="border-dashed">
        <CardContent className="space-y-2 py-10 text-center">
          <p className="font-medium">Configuración pendiente</p>
          <p className="text-sm text-muted-foreground">
            Este entorno todavía no tiene configuradas las credenciales OAuth de Google (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI). No se simula ninguna conexión — pide a quien administra el despliegue que las configure.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isConnected = connection && connection.status !== "DISCONNECTED" && connection.status !== "NOT_CONFIGURED";

  return (
    <Tabs defaultValue="account">
      <TabsList>
        <TabsTrigger value="account">Cuenta</TabsTrigger>
        <TabsTrigger value="ga4">Google Analytics 4</TabsTrigger>
        <TabsTrigger value="gsc">Search Console</TabsTrigger>
        <TabsTrigger value="history">Historial</TabsTrigger>
      </TabsList>

      <TabsContent value="account" className="mt-4">
        <AccountTab projectId={projectId} isManager={isManager} connection={connection} />
      </TabsContent>
      <TabsContent value="ga4" className="mt-4">
        {isConnected ? (
          <PropertyTab projectId={projectId} isManager={isManager} type="GA4_PROPERTY" resources={resources.filter((r) => r.type === "GA4_PROPERTY")} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Conecta una cuenta de Google primero.</p>
        )}
      </TabsContent>
      <TabsContent value="gsc" className="mt-4">
        {isConnected ? (
          <PropertyTab projectId={projectId} isManager={isManager} type="SEARCH_CONSOLE_SITE" resources={resources.filter((r) => r.type === "SEARCH_CONSOLE_SITE")} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Conecta una cuenta de Google primero.</p>
        )}
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        <HistoryTab projectId={projectId} initialRuns={initialHistory} initialCursor={initialHistoryCursor} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

function AccountTab({ projectId, isManager, connection }: { projectId: string; isManager: boolean; connection: ConnectionData | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  function test() {
    startTransition(async () => {
      const result = await testGoogleConnectionAction(projectId);
      if (result.ok) toast.success("La conexión con Google funciona correctamente.");
      else toast.error(result.error ?? "No se pudo verificar la conexión.");
    });
  }
  function togglePause(paused: boolean) {
    startTransition(async () => {
      const result = await setGooglePausedAction(projectId, { paused });
      if ("error" in result && result.error) toast.error(result.error);
      else router.refresh();
    });
  }
  function disconnect() {
    startTransition(async () => {
      const result = await disconnectGoogleAction(projectId);
      if ("error" in result && result.error) toast.error(result.error);
      else {
        toast.success("Cuenta de Google desconectada. El historial de métricas ya importadas se conserva.");
        router.refresh();
      }
    });
  }

  if (!connection || connection.status === "NOT_CONFIGURED" || connection.status === "DISCONNECTED") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin conexión</CardTitle>
          <CardDescription>Conecta una cuenta de Google con permisos de solo lectura sobre Analytics y Search Console.</CardDescription>
        </CardHeader>
        <CardContent>
          {isManager ? (
            <Button render={<a href={`/api/integrations/google/connect?projectId=${projectId}`} />}>Conectar con Google</Button>
          ) : (
            <p className="text-sm text-muted-foreground">Solo un MANAGER del proyecto puede conectar Google.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{connection.googleEmail ?? "Cuenta de Google"}</CardTitle>
        <Badge variant={GOOGLE_CONNECTION_STATUS_TONE[connection.status] ?? "outline"}>{GOOGLE_CONNECTION_STATUS_LABELS[connection.status] ?? connection.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          <p>Conectado: {formatDateTime(connection.connectedAt)}</p>
          <p>Expiración conocida del token: {formatDateTime(connection.tokenExpiresAt)}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {connection.scopes.map((scope) => (
            <Badge key={scope} variant="outline" className="font-mono text-[10px]">
              {scope.replace("https://www.googleapis.com/auth/", "")}
            </Badge>
          ))}
        </div>
        {connection.status === "REAUTH_REQUIRED" ? <p className="text-sm font-medium text-destructive">La autorización venció — reconecta la cuenta.</p> : null}
        {connection.lastError ? <p className="text-sm text-destructive">Último error: {connection.lastError}</p> : null}

        {isManager ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={test}>
              Probar conexión
            </Button>
            {connection.status === "REAUTH_REQUIRED" ? (
              <Button size="sm" render={<a href={`/api/integrations/google/connect?projectId=${projectId}`} />}>
                Reconectar
              </Button>
            ) : (
              <Button size="sm" variant="outline" render={<a href={`/api/integrations/google/connect?projectId=${projectId}`} />}>
                Reconectar
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => togglePause(connection.status !== "PAUSED")}>
              {connection.status === "PAUSED" ? "Reanudar sincronización" : "Pausar sincronización"}
            </Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => setConfirmDisconnect(true)}>
              Desconectar
            </Button>
          </div>
        ) : null}
        <div className="pt-1">
          <a href={`/dashboard/${projectId}/integrations/google/connections/${connection.id}`} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Ver detalle y auditoría completa de esta conexión
          </a>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Desconectar Google"
        description="Se revocará el acceso y se eliminarán las credenciales guardadas. El historial de métricas ya importadas se conserva. No podrás sincronizar de nuevo hasta reconectar."
        confirmLabel="Desconectar"
        destructive
        onConfirm={disconnect}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// GA4 / Search Console property selection + sync
// ---------------------------------------------------------------------------

interface LiveProperty {
  externalId: string;
  name: string;
  accountName?: string;
  permissionLevel?: string;
}

function PropertyTab({ projectId, isManager, type, resources }: { projectId: string; isManager: boolean; type: "GA4_PROPERTY" | "SEARCH_CONSOLE_SITE"; resources: ResourceData[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [live, setLive] = useState<LiveProperty[] | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(resources.filter((r) => r.active).map((r) => r.externalId)));
  const [initialPeriodDays, setInitialPeriodDays] = useState(String(GOOGLE_INTEGRATION_LIMITS.DEFAULT_INITIAL_PERIOD_DAYS));
  const [confirmSync, setConfirmSync] = useState(false);

  function loadLive() {
    setLoadingLive(true);
    const action = type === "GA4_PROPERTY" ? listLiveGa4PropertiesAction : listLiveSearchConsoleSitesAction;
    action(projectId)
      .then((result) => {
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setLive(result.map((p) => ("accountName" in p ? { externalId: p.externalId, name: p.name, accountName: p.accountName } : { externalId: p.externalId, name: p.name, permissionLevel: p.permissionLevel })));
      })
      .finally(() => setLoadingLive(false));
  }

  const filtered = (live ?? []).filter((p) => !query.trim() || p.name.toLowerCase().includes(query.toLowerCase()) || p.externalId.toLowerCase().includes(query.toLowerCase()));

  function toggle(externalId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId);
      else if (next.size < GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES) next.add(externalId);
      else toast.error(`No puedes seleccionar más de ${GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES} propiedades.`);
      return next;
    });
  }

  function save() {
    if (!live) return;
    const chosen = live.filter((p) => selected.has(p.externalId));
    startTransition(async () => {
      const result = await saveSelectedGoogleResourcesAction(projectId, {
        resources: chosen.map((p) => ({ type, externalId: p.externalId, name: p.name, accountName: "accountName" in p ? p.accountName : undefined, permissionLevel: "permissionLevel" in p ? p.permissionLevel : undefined })),
        initialPeriodDays: Number(initialPeriodDays) || GOOGLE_INTEGRATION_LIMITS.DEFAULT_INITIAL_PERIOD_DAYS,
      });
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Propiedades guardadas.");
        router.refresh();
      }
    });
  }

  function toggleSavedActive(resourceId: string, active: boolean) {
    startTransition(async () => {
      const result = await setGoogleResourceActiveAction(projectId, { resourceId, active });
      if ("error" in result && result.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function syncNow() {
    const activeIds = resources.filter((r) => r.active).map((r) => r.id);
    if (activeIds.length === 0) {
      toast.error("No hay propiedades activas para sincronizar.");
      return;
    }
    startTransition(async () => {
      const result = await triggerManualGoogleSyncAction(projectId, { resourceIds: activeIds });
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Sincronización completada — revisa el historial para el detalle.");
        router.refresh();
      }
    });
  }

  const [resyncResourceId, setResyncResourceId] = useState<string>("");
  const [resyncStart, setResyncStart] = useState("");
  const [resyncEnd, setResyncEnd] = useState("");
  function resync() {
    if (!resyncResourceId || !resyncStart || !resyncEnd) {
      toast.error("Selecciona una propiedad y un rango de fechas.");
      return;
    }
    startTransition(async () => {
      const result = await resyncGoogleRangeAction(projectId, { resourceId: resyncResourceId, startDate: resyncStart, endDate: resyncEnd });
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Resincronización completada.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {resources.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Propiedades guardadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {resources.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Checkbox checked={r.active} onCheckedChange={(c) => toggleSavedActive(r.id, c === true)} disabled={!isManager || pending} aria-label={`Activar ${r.name}`} />
                <span>{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.externalId}</span>
                <span className="ml-auto text-xs text-muted-foreground">Última sync: {formatDateTime(r.lastSyncedAt)}</span>
              </div>
            ))}
            <div className="pt-2">
              <Button size="sm" disabled={pending} onClick={() => setConfirmSync(true)}>
                <RefreshCw className="size-3.5" /> Sincronizar ahora
              </Button>
            </div>

            {isManager ? (
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs">Resincronizar un rango específico (máx. {GOOGLE_INTEGRATION_LIMITS.MAX_RESYNC_PERIOD_DAYS} días)</Label>
                <div className="flex flex-wrap items-end gap-2">
                  <Select value={resyncResourceId} onValueChange={(v) => v && setResyncResourceId(v)}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Propiedad" />
                    </SelectTrigger>
                    <SelectContent>
                      {resources.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={resyncStart} onChange={(e) => setResyncStart(e.target.value)} className="w-40" />
                  <Input type="date" value={resyncEnd} onChange={(e) => setResyncEnd(e.target.value)} className="w-40" />
                  <Button size="sm" variant="outline" disabled={pending} onClick={resync}>
                    Resincronizar rango
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isManager ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seleccionar propiedades de {GOOGLE_RESOURCE_TYPE_LABELS[type]}</CardTitle>
            <CardDescription>Se revalida en el servidor que cada propiedad siga siendo accesible antes de guardar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button size="sm" variant="outline" disabled={loadingLive} onClick={loadLive}>
              {loadingLive ? "Cargando…" : "Cargar propiedades disponibles"}
            </Button>

            {live !== null ? (
              <div className="space-y-2">
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
                  <Input placeholder="Buscar…" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {selected.size} de {GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES} seleccionadas · {filtered.length} resultado(s)
                </p>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                  {filtered.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Sin resultados.</p> : null}
                  {filtered.map((p) => (
                    <label key={p.externalId} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                      <Checkbox checked={selected.has(p.externalId)} onCheckedChange={() => toggle(p.externalId)} />
                      <span>{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.externalId}</span>
                      {p.accountName ? <span className="ml-auto text-xs text-muted-foreground">{p.accountName}</span> : null}
                      {p.permissionLevel ? <span className="ml-auto text-xs text-muted-foreground">{p.permissionLevel}</span> : null}
                    </label>
                  ))}
                </div>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Periodo inicial (días)</Label>
                    <Input type="number" className="w-32" value={initialPeriodDays} onChange={(e) => setInitialPeriodDays(e.target.value)} max={GOOGLE_INTEGRATION_LIMITS.MAX_INITIAL_PERIOD_DAYS} />
                  </div>
                  <Button size="sm" disabled={pending} onClick={save}>
                    <CheckCircle2 className="size-3.5" /> Guardar y sincronizar
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmSync}
        onOpenChange={setConfirmSync}
        title="Sincronizar ahora"
        description={`Se sincronizarán ${resources.filter((r) => r.active).length} propiedad(es) activa(s) de ${GOOGLE_RESOURCE_TYPE_LABELS[type]}. Esto puede tardar unos segundos.`}
        confirmLabel="Sincronizar"
        onConfirm={syncNow}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistoryTab({ projectId, initialRuns, initialCursor }: { projectId: string; initialRuns: HistoryRun[]; initialCursor: string | null }) {
  const [runs, setRuns] = useState(initialRuns);
  const [cursor, setCursor] = useState(initialCursor);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [providerFilter, setProviderFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  function load(reset: boolean) {
    setLoading(true);
    listGoogleSyncHistoryAction(projectId, {
      limit: 20,
      cursor: reset ? undefined : (cursor ?? undefined),
      status: statusFilter === "ALL" ? undefined : statusFilter,
      provider: providerFilter === "ALL" ? undefined : (providerFilter as "ga4" | "gsc"),
    })
      .then((result) => {
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        const mapped = result.runs.map((r) => ({
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
        setRuns(reset ? mapped : [...runs, ...mapped]);
        setCursor(result.nextCursor);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void Promise.resolve().then(() => load(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, providerFilter]);

  function openDetail(runId: string) {
    getGoogleSyncRunDetailAction(projectId, runId).then((result) => {
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setDetail(result.detail as unknown as Record<string, unknown>);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={providerFilter} onValueChange={(v) => v && setProviderFilter(v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los proveedores</SelectItem>
            <SelectItem value="ga4">Google Analytics 4</SelectItem>
            <SelectItem value="gsc">Search Console</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            {Object.entries(GOOGLE_SYNC_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {runs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{loading ? "Cargando…" : "Sin sincronizaciones registradas todavía."}</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <Card key={run.id} className="cursor-pointer" onClick={() => openDetail(run.id)}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span>{run.resourceName}</span>
                <Badge variant="outline">{GOOGLE_RESOURCE_TYPE_LABELS[run.resourceType] ?? run.resourceType}</Badge>
                <Badge variant="outline">{run.syncType}</Badge>
                <Badge variant={GOOGLE_SYNC_STATUS_TONE[run.status] ?? "outline"}>{GOOGLE_SYNC_STATUS_LABELS[run.status] ?? run.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {run.pointsCreated} creados · {run.pointsUpdated} actualizados · {run.pointsSkipped} omitidos
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(run.startedAt)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {cursor ? (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => load(false)}>
          Cargar más
        </Button>
      ) : null}

      {detail ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDetail(null)}
          title="Detalle de sincronización"
          description={String(detail.errorMessage ?? `${detail.rowsReceived ?? 0} filas recibidas · ${detail.pointsCreated ?? 0} puntos creados · ${detail.pointsUpdated ?? 0} actualizados · ${detail.pointsSkipped ?? 0} omitidos.`)}
          confirmLabel="Cerrar"
          onConfirm={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

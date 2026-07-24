"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { useGuestProject } from "@/hooks/use-guest-project";
import { checkMonitorNow, createMonitor, deleteMonitor, listMonitorsByProject } from "@/lib/guest-storage/monitors";
import type { LocalMonitor } from "@/lib/guest-storage/types";
import { GuestProjectSelect } from "@/components/guest/guest-project-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_STYLES: Record<LocalMonitor["status"], string> = {
  UNKNOWN: "text-muted-foreground",
  OK: "text-emerald-600",
  CHANGED: "text-amber-600",
  ERROR: "text-destructive",
};

const STATUS_LABELS: Record<LocalMonitor["status"], string> = {
  UNKNOWN: "Sin comprobar",
  OK: "Sin cambios",
  CHANGED: "Cambios detectados",
  ERROR: "Error",
};

export function GuestMonitoringManager() {
  const { projects, selectedId, selectProject, refresh: refreshProjects, isLoading: isLoadingProjects } =
    useGuestProject();
  const [monitors, setMonitors] = useState<LocalMonitor[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [checkingId, setCheckingId] = useState<string | null>(null);

  async function refreshMonitors(projectId: string | null) {
    setMonitors(projectId ? await listMonitorsByProject(projectId) : []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshMonitors(selectedId);
  }, [selectedId]);

  async function handleCreate() {
    if (!selectedId || !url.trim()) return;
    await createMonitor({ projectId: selectedId, name: name || url, url });
    setName("");
    setUrl("");
    await refreshMonitors(selectedId);
  }

  async function handleCheck(id: string) {
    setCheckingId(id);
    await checkMonitorNow(id);
    setCheckingId(null);
    await refreshMonitors(selectedId);
  }

  async function handleDelete(id: string) {
    await deleteMonitor(id);
    await refreshMonitors(selectedId);
  }

  if (isLoadingProjects) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <GuestProjectSelect
        projects={projects}
        selectedId={selectedId}
        onSelect={selectProject}
        onCreated={async (p) => {
          await refreshProjects();
          selectProject(p.id);
        }}
      />

      <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        El monitor comprueba la URL directamente desde tu navegador, sin servidor. Solo funciona con sitios que
        permitan solicitudes desde otro origen (CORS); si un sitio lo bloquea, verás un error explicándolo — es una
        limitación del navegador, no un fallo de la aplicación.
      </p>

      {selectedId ? (
        <>
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Mi web" />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ejemplo.com" />
                </div>
              </div>
              <Button type="button" onClick={handleCreate} disabled={!url.trim()}>
                Añadir monitor
              </Button>
            </CardContent>
          </Card>

          {monitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay monitores en este proyecto.</p>
          ) : (
            <div className="space-y-3">
              {monitors.map((monitor) => (
                <Card key={monitor.id}>
                  <CardHeader className="flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">{monitor.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{monitor.url}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Comprobar ahora"
                        onClick={() => handleCheck(monitor.id)}
                        disabled={checkingId === monitor.id}
                      >
                        <RefreshCw className={checkingId === monitor.id ? "size-3.5 animate-spin" : "size-3.5"} />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar" onClick={() => handleDelete(monitor.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <Badge variant="outline" className={STATUS_STYLES[monitor.status]}>
                      {STATUS_LABELS[monitor.status]}
                    </Badge>
                    {monitor.lastCheckedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Última comprobación: {new Date(monitor.lastCheckedAt).toLocaleString()}
                      </p>
                    ) : null}
                    {monitor.lastError ? <p className="text-xs text-destructive">{monitor.lastError}</p> : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Crea un proyecto para añadir monitores.</p>
      )}
    </div>
  );
}

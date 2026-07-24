"use client";

import { useEffect, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { useGuestProject } from "@/hooks/use-guest-project";
import {
  createAutomation,
  deleteAutomation,
  listAutomationRuns,
  listAutomationsByProject,
  runAutomationNow,
  runDueAutomations,
  setAutomationEnabled,
} from "@/lib/guest-storage/automations";
import { listMonitorsByProject } from "@/lib/guest-storage/monitors";
import type {
  LocalAutomation,
  LocalAutomationAction,
  LocalAutomationRun,
  LocalAutomationTrigger,
  LocalMonitor,
} from "@/lib/guest-storage/types";
import { GuestProjectSelect } from "@/components/guest/guest-project-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TRIGGER_LABELS: Record<LocalAutomationTrigger, string> = {
  MANUAL: "Manual",
  SCHEDULE_DAILY: "Diaria",
  SCHEDULE_WEEKLY: "Semanal",
};

const ACTION_LABELS: Record<LocalAutomationAction, string> = {
  CREATE_REMINDER: "Crear recordatorio",
  CHECK_MONITOR: "Comprobar monitor",
};

export function GuestAutomationsManager() {
  const { projects, selectedId, selectProject, refresh: refreshProjects, isLoading: isLoadingProjects } =
    useGuestProject();
  const [automations, setAutomations] = useState<LocalAutomation[]>([]);
  const [monitors, setMonitors] = useState<LocalMonitor[]>([]);
  const [runsByAutomation, setRunsByAutomation] = useState<Record<string, LocalAutomationRun[]>>({});
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<LocalAutomationTrigger>("SCHEDULE_DAILY");
  const [action, setAction] = useState<LocalAutomationAction>("CREATE_REMINDER");
  const [message, setMessage] = useState("");
  const [justRan, setJustRan] = useState<LocalAutomationRun[]>([]);

  async function refreshAll(projectId: string | null) {
    if (!projectId) {
      setAutomations([]);
      setMonitors([]);
      return;
    }
    const [automationList, monitorList] = await Promise.all([
      listAutomationsByProject(projectId),
      listMonitorsByProject(projectId),
    ]);
    setAutomations(automationList);
    setMonitors(monitorList);
    const runsEntries = await Promise.all(
      automationList.map(async (a) => [a.id, await listAutomationRuns(a.id)] as const)
    );
    setRunsByAutomation(Object.fromEntries(runsEntries));
  }

  // Automations only ever execute here, on mount, while the guest has this
  // page open — there is no cron, no server function, no background timer.
  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const due = await runDueAutomations(selectedId);
      if (due.length > 0) setJustRan(due);
      await refreshAll(selectedId);
    })();
  }, [selectedId]);

  async function handleCreate() {
    if (!selectedId || !name.trim()) return;
    await createAutomation({
      projectId: selectedId,
      name,
      trigger,
      action,
      message,
      monitorId: action === "CHECK_MONITOR" ? (monitors[0]?.id ?? null) : null,
    });
    setName("");
    setMessage("");
    await refreshAll(selectedId);
  }

  async function handleToggle(id: string, enabled: boolean) {
    await setAutomationEnabled(id, enabled);
    await refreshAll(selectedId);
  }

  async function handleRunNow(id: string) {
    await runAutomationNow(id);
    await refreshAll(selectedId);
  }

  async function handleDelete(id: string) {
    await deleteAutomation(id);
    await refreshAll(selectedId);
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

      {justRan.length > 0 ? (
        <Card className="border-dashed bg-muted/40">
          <CardContent className="space-y-1 py-3 text-sm">
            <p className="font-medium">Se ejecutaron {justRan.length} automatización(es) al abrir esta página:</p>
            {justRan.map((run) => (
              <p key={run.id} className="text-muted-foreground">
                {run.message}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {selectedId ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nueva automatización</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nombre</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label>Frecuencia</Label>
                  <Select value={trigger} onValueChange={(v) => v && setTrigger(v as LocalAutomationTrigger)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Acción</Label>
                  <Select value={action} onValueChange={(v) => v && setAction(v as LocalAutomationAction)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CREATE_REMINDER">{ACTION_LABELS.CREATE_REMINDER}</SelectItem>
                      <SelectItem value="CHECK_MONITOR" disabled={monitors.length === 0}>
                        {ACTION_LABELS.CHECK_MONITOR} {monitors.length === 0 ? "(crea un monitor primero)" : ""}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Mensaje del recordatorio</Label>
                  <Input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="Revisar el calendario de esta semana" />
                </div>
              </div>
              <Button type="button" onClick={handleCreate} disabled={!name.trim()}>
                Crear automatización
              </Button>
              {trigger !== "MANUAL" ? (
                <p className="text-xs text-muted-foreground">
                  Esta automatización se ejecutará cuando abras la aplicación. No usa cron ni servidores: solo se
                  comprueba cuando visitas esta página.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {automations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay automatizaciones en este proyecto.</p>
          ) : (
            <div className="space-y-3">
              {automations.map((automation) => (
                <Card key={automation.id}>
                  <CardHeader className="flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">{automation.name}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {TRIGGER_LABELS[automation.trigger]} · {ACTION_LABELS[automation.action]}
                        {automation.trigger !== "MANUAL" ? " · se ejecutará cuando abras la aplicación" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={automation.isEnabled} onCheckedChange={(checked) => handleToggle(automation.id, checked)} />
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Ejecutar ahora" onClick={() => handleRunNow(automation.id)}>
                        <Play className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar" onClick={() => handleDelete(automation.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {automation.lastRunAt ? (
                      <p className="text-xs text-muted-foreground">
                        Última ejecución: {new Date(automation.lastRunAt).toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Todavía no se ha ejecutado.</p>
                    )}
                    {(runsByAutomation[automation.id] ?? []).slice(0, 3).map((run) => (
                      <p key={run.id} className="mt-1 text-sm">
                        {run.message}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Crea un proyecto para configurar automatizaciones.</p>
      )}
    </div>
  );
}

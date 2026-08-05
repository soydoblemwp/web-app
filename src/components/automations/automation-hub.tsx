"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Zap, Play, Pause, Copy, Archive, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AUTOMATION_STATUS_LABELS, AUTOMATION_STATUS_TONE, TRIGGER_TYPE_LABELS, formatDateTime } from "@/components/automations/labels";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import {
  activateAutomationAction,
  pauseAutomationAction,
  archiveAutomationAction,
  deleteAutomationAction,
  duplicateAutomationAction,
} from "@/server/actions/automations";
import { runAutomationNowAction } from "@/server/actions/automation-schedules";

export interface AutomationListItem {
  id: string;
  name: string;
  status: string;
  triggerType: string | null;
  workflowName: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  consecutiveFailureCount: number;
  pausedBySystem: boolean;
  pausedReason: string | null;
  runCount: number;
}

export function AutomationHub({ projectId, automations }: { projectId: string; automations: AutomationListItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationListItem | null>(null);

  const filtered = useMemo(() => {
    return automations.filter((a) => {
      if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [automations, search, statusFilter]);

  async function withPending(id: string, fn: () => Promise<{ errorCode?: string; errorMessage?: string } | { error?: string } | void>) {
    setPendingId(id);
    try {
      const result = await fn();
      const message = result && "errorMessage" in result ? result.errorMessage : result && "error" in result ? result.error : undefined;
      if (message) toast.error(message);
      else router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (automations.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Zap className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Todavía no hay automatizaciones en este proyecto.</p>
          <Link href={`/dashboard/${projectId}/automations/new`} className={cn(buttonVariants({ size: "sm" }))}>
            Crear la primera automatización
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar automatización…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            {Object.entries(AUTOMATION_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Ninguna automatización coincide con el filtro.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((automation) => (
            <Card key={automation.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/${projectId}/automations/${automation.id}`} className="truncate font-medium hover:underline">
                      {automation.name}
                    </Link>
                    <Badge variant={AUTOMATION_STATUS_TONE[automation.status] ?? "outline"}>{AUTOMATION_STATUS_LABELS[automation.status] ?? automation.status}</Badge>
                    {automation.triggerType ? <Badge variant="outline">{TRIGGER_TYPE_LABELS[automation.triggerType] ?? automation.triggerType}</Badge> : null}
                    {automation.pausedBySystem ? <Badge variant="destructive">Pausada automáticamente</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">Workflow: {automation.workflowName}</p>
                  <p className="text-xs text-muted-foreground">
                    Última ejecución: {formatDateTime(automation.lastRunAt)} · Próxima: {formatDateTime(automation.nextRunAt)} · {automation.runCount} ejecuciones
                  </p>
                  {automation.pausedReason ? <p className="text-xs text-destructive">{automation.pausedReason}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendingId === automation.id || automation.status === "ARCHIVED"}
                    onClick={() => withPending(automation.id, () => runAutomationNowAction(projectId, automation.id))}
                  >
                    <Play className="size-3.5" /> Ejecutar
                  </Button>
                  {automation.status === "ACTIVE" ? (
                    <Button size="sm" variant="outline" disabled={pendingId === automation.id} onClick={() => withPending(automation.id, () => pauseAutomationAction(projectId, automation.id))}>
                      <Pause className="size-3.5" /> Pausar
                    </Button>
                  ) : automation.status !== "ARCHIVED" ? (
                    <Button size="sm" variant="outline" disabled={pendingId === automation.id} onClick={() => withPending(automation.id, () => activateAutomationAction(projectId, automation.id))}>
                      <Play className="size-3.5" /> Activar
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" disabled={pendingId === automation.id} onClick={() => withPending(automation.id, () => duplicateAutomationAction(projectId, automation.id))}>
                    <Copy className="size-3.5" /> Duplicar
                  </Button>
                  {automation.status !== "ARCHIVED" ? (
                    <Button size="sm" variant="outline" disabled={pendingId === automation.id} onClick={() => withPending(automation.id, () => archiveAutomationAction(projectId, automation.id))}>
                      <Archive className="size-3.5" /> Archivar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pendingId === automation.id} onClick={() => setDeleteTarget(automation)}>
                      <Trash2 className="size-3.5" /> Eliminar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Eliminar "${deleteTarget?.name ?? ""}"`}
        description="Esta acción no se puede deshacer. Se eliminará la automatización, su historial de ejecuciones y su configuración de disparador."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => deleteTarget && withPending(deleteTarget.id, () => deleteAutomationAction(projectId, deleteTarget.id))}
      />
    </div>
  );
}

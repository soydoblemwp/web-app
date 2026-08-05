"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Pause, Copy, Archive, Trash2, Pencil, SkipForward } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { activateAutomationAction, pauseAutomationAction, archiveAutomationAction, deleteAutomationAction, duplicateAutomationAction } from "@/server/actions/automations";
import { runAutomationNowAction, skipNextOccurrenceAction } from "@/server/actions/automation-schedules";

interface AutomationDetailActionsProps {
  projectId: string;
  automationId: string;
  status: string;
  isRecurring: boolean;
  hasUpcomingOccurrence: boolean;
}

export function AutomationDetailActions({ projectId, automationId, status, isRecurring, hasUpcomingOccurrence }: AutomationDetailActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  function run<T extends { errorCode?: string; errorMessage?: string; error?: string }>(action: () => Promise<T>, successMessage?: string) {
    startTransition(async () => {
      const result = await action();
      const message = result.errorMessage ?? result.error;
      if (message) toast.error(message);
      else {
        if (successMessage) toast.success(successMessage);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending || status === "ARCHIVED"} onClick={() => run(() => runAutomationNowAction(projectId, automationId), "Ejecución iniciada.")}>
        <Play className="size-4" /> Ejecutar ahora
      </Button>
      {status === "ACTIVE" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => pauseAutomationAction(projectId, automationId), "Automatización pausada.")}>
          <Pause className="size-4" /> Pausar
        </Button>
      ) : status !== "ARCHIVED" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => activateAutomationAction(projectId, automationId), "Automatización activada.")}>
          <Play className="size-4" /> Activar
        </Button>
      ) : null}
      {isRecurring && hasUpcomingOccurrence ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => skipNextOccurrenceAction(projectId, automationId), "Se omitirá la próxima ejecución.")}>
          <SkipForward className="size-4" /> Omitir próxima
        </Button>
      ) : null}
      <Link href={`/dashboard/${projectId}/automations/${automationId}/edit`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
        <Pencil className="size-4" /> Editar
      </Link>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await duplicateAutomationAction(projectId, automationId);
            if (result.errorMessage) toast.error(result.errorMessage);
            else if (result.id) {
              toast.success("Automatización duplicada como borrador.");
              router.push(`/dashboard/${projectId}/automations/${result.id}`);
            }
          })
        }
      >
        <Copy className="size-4" /> Duplicar
      </Button>
      {status !== "ARCHIVED" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => archiveAutomationAction(projectId, automationId), "Automatización archivada.")}>
          <Archive className="size-4" /> Archivar
        </Button>
      ) : (
        <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" /> Eliminar
        </Button>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar automatización"
        description="Esta acción no se puede deshacer. Se eliminará permanentemente junto con su historial de ejecuciones."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() =>
          run(async () => {
            const result = await deleteAutomationAction(projectId, automationId);
            if (!result.error) router.push(`/dashboard/${projectId}/automations`);
            return result;
          })
        }
      />
    </div>
  );
}

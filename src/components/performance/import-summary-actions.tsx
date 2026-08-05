"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { continueImportAction, cancelImportAction } from "@/server/actions/performance-imports";

export function ImportSummaryActions({ projectId, importId, status }: { projectId: string; importId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  async function handleContinue() {
    setPending(true);
    const result = await continueImportAction(projectId, importId);
    setPending(false);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success(`Estado: ${result.status}`);
    router.refresh();
  }

  async function handleCancel() {
    const result = await cancelImportAction(projectId, importId);
    if (result.errorMessage) {
      toast.error(result.errorMessage);
      return;
    }
    toast.success("Importación cancelada.");
    router.refresh();
  }

  const canContinue = ["IMPORTING", "READY", "VALIDATING"].includes(status);
  const canCancel = !["COMPLETED", "PARTIALLY_COMPLETED", "CANCELLED", "ARCHIVED"].includes(status);

  if (!canContinue && !canCancel) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {canContinue ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={handleContinue}>
          {pending ? "Procesando…" : "Continuar procesamiento"}
        </Button>
      ) : null}
      {canCancel ? (
        <Button size="sm" variant="destructive" onClick={() => setConfirmCancelOpen(true)}>
          Cancelar importación
        </Button>
      ) : null}
      <ConfirmDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen} title="Cancelar importación" description="No se revertirán las métricas ya importadas, pero no se procesará ninguna fila pendiente." confirmLabel="Cancelar importación" destructive onConfirm={handleCancel} />
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XCircle, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/automations/confirm-dialog";
import { cancelAutomationRunAction } from "@/server/actions/automation-runs";
import { decideApprovalAction } from "@/server/actions/automation-approvals";

interface RunDetailActionsProps {
  projectId: string;
  runId: string;
  status: string;
  pendingApprovalId: string | null;
}

const CANCELLABLE = new Set(["QUEUED", "WAITING_FOR_SCHEDULE", "WAITING_FOR_CONDITION", "WAITING_FOR_APPROVAL", "RUNNING", "RETRY_SCHEDULED"]);

export function RunDetailActions({ projectId, runId, status, pendingApprovalId }: RunDetailActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [comment, setComment] = useState("");

  function decide(decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED") {
    if (!pendingApprovalId) return;
    startTransition(async () => {
      const result = await decideApprovalAction(projectId, { approvalId: pendingApprovalId, decision, comment });
      if (result.errorMessage) toast.error(result.errorMessage);
      else {
        toast.success("Decisión registrada.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {pendingApprovalId ? (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Esta ejecución espera tu aprobación</p>
          <Textarea placeholder="Comentario (opcional)" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => decide("APPROVED")}>
              <CheckCircle2 className="size-4" /> Aprobar
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("CHANGES_REQUESTED")}>
              <AlertCircle className="size-4" /> Solicitar cambios
            </Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => decide("REJECTED")}>
              <XCircle className="size-4" /> Rechazar
            </Button>
          </div>
        </div>
      ) : null}

      {CANCELLABLE.has(status) ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setCancelOpen(true)}>
          <XCircle className="size-4" /> Cancelar ejecución
        </Button>
      ) : null}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar esta ejecución"
        description="La ejecución se marcará como cancelada. Cualquier recurso ya creado permanece — cancelar nunca deshace pasos ya completados."
        confirmLabel="Cancelar ejecución"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const result = await cancelAutomationRunAction(projectId, runId);
            if (result.error) toast.error(result.error);
            else {
              toast.success("Ejecución cancelada.");
              router.refresh();
            }
          })
        }
      />
    </div>
  );
}

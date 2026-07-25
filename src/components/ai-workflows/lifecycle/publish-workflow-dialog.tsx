"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  validateWorkflowForPublishAction,
  compareDraftToPublishedAction,
  publishWorkflowAction,
} from "@/server/actions/workflow-lifecycle";
import type { PublishValidationResult } from "@/lib/ai-workflows/publish-validation";
import type { WorkflowDiffResult } from "@/lib/ai-workflows/workflow-diff";
import { WorkflowDiffView } from "@/components/ai-workflows/lifecycle/workflow-diff-view";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Publicar versión" — shows the full validation report (errors block,
 * warnings/info never do), the structural diff against the currently active
 * published revision, an optional release-notes field, and requires an
 * explicit confirmation before actually calling publishWorkflowAction.
 * Reuses the exact same validation/diff the server itself uses at publish
 * time — this dialog can never show "no errors" and then have the server
 * reject the publish for a reason the user never saw.
 */
export function PublishWorkflowDialog({
  projectId,
  workflowId,
  open,
  onOpenChange,
  onPublished,
}: {
  projectId: string;
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [validation, setValidation] = useState<PublishValidationResult | null>(null);
  const [diff, setDiff] = useState<WorkflowDiffResult | null>(null);
  const [releaseNotes, setReleaseNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const [validationResult, diffResult] = await Promise.all([
        validateWorkflowForPublishAction(projectId, workflowId),
        compareDraftToPublishedAction(projectId, workflowId),
      ]);
      if (cancelled) return;
      if ("error" in validationResult) setError(validationResult.error);
      else setValidation(validationResult.data);
      if ("data" in diffResult) setDiff(diffResult.data.diff);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, workflowId]);

  async function handlePublish() {
    setPublishing(true);
    const result = await publishWorkflowAction({ projectId, workflowId, releaseNotes });
    setPublishing(false);
    if ("error" in result) {
      toast.error(result.error);
      if (result.validation) setValidation(result.validation);
      return;
    }
    toast.success(`Publicado como versión ${result.data.version}.`);
    onOpenChange(false);
    onPublished();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publicar versión</DialogTitle>
          <DialogDescription>
            Crea una nueva revisión estable e inmutable a partir del borrador actual. Las ejecuciones reales normales
            usarán esta versión hasta que publiques otra.
          </DialogDescription>
        </DialogHeader>

        {loading ? <p className="text-sm text-muted-foreground">Validando...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {validation ? (
          <div className="space-y-3">
            {validation.errors.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-destructive/50 p-3">
                <p className="text-sm font-medium text-destructive">No se puede publicar:</p>
                {validation.errors.map((issue, index) => (
                  <p key={index} className="text-xs text-destructive">
                    {issue.message}
                  </p>
                ))}
              </div>
            ) : null}
            {validation.warnings.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3">
                <p className="text-sm font-medium">Advertencias (no bloquean la publicación):</p>
                {validation.warnings.map((issue, index) => (
                  <p key={index} className="text-xs text-muted-foreground">
                    {issue.message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {diff ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Resumen de cambios respecto a la versión publicada</p>
            <div className="rounded-lg border p-3">
              <WorkflowDiffView diff={diff} />
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="release-notes">Nota de versión (opcional)</Label>
          <Textarea
            id="release-notes"
            value={releaseNotes}
            onChange={(event) => setReleaseNotes(event.target.value)}
            maxLength={2000}
            placeholder="Motivo del cambio..."
            rows={3}
          />
        </div>

        <DialogFooter>
          {validation && !validation.canPublish ? <Badge variant="destructive">Bloqueado por errores</Badge> : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={publishing || loading || !validation?.canPublish} onClick={handlePublish}>
            {publishing ? "Publicando..." : "Confirmar y publicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

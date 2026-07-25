"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star, Play, Zap, History, GitBranch, Archive, ArchiveRestore, Rocket, Eye, Link2 } from "lucide-react";
import {
  updateWorkflowAction,
  deleteWorkflowAction,
  duplicateWorkflowAction,
  toggleFavoriteWorkflowAction,
  toggleActiveWorkflowAction,
} from "@/server/actions/ai-workflows";
import {
  archiveWorkflowAction,
  restoreArchivedWorkflowAction,
  compareDraftToPublishedAction,
  listWorkflowsUsedByAction,
  listWorkflowsThatUseAction,
} from "@/server/actions/workflow-lifecycle";
import type { WorkflowDependencyRow } from "@/server/services/workflow-lifecycle";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import type { WorkflowLike } from "@/lib/ai-workflows/types";
import type { WorkflowStep, WorkflowStepType } from "@/lib/ai-workflows/engine";
import type { WorkflowDiffResult } from "@/lib/ai-workflows/workflow-diff";
import { WorkflowStepEditor } from "@/components/ai-workflows/workflow-step-editor";
import { WorkflowRunPanel } from "@/components/ai-workflows/workflow-run-panel";
import { WorkflowExecutionPanel } from "@/components/ai-workflows/workflow-execution-panel";
import { WorkflowRunHistory } from "@/components/ai-workflows/workflow-run-history";
import { WorkflowVersionsPanel } from "@/components/ai-workflows/lifecycle/workflow-versions-panel";
import { WorkflowDiffView } from "@/components/ai-workflows/lifecycle/workflow-diff-view";
import { PublishWorkflowDialog } from "@/components/ai-workflows/lifecycle/publish-workflow-dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STEP_TYPE_LABELS: Record<WorkflowStepType, string> = {
  ai_tool: "Ejecutar herramienta IA",
  prompt_library: "Usar Prompt Library",
  ai_template: "Usar AI Template",
  brand_kit: "Usar Brand Kit",
  transform: "Transformar salida",
  save_result: "Guardar resultado",
  workflow: "Ejecutar sub-workflow",
};

type WorkflowCardMode = "view" | "preview" | "execute" | "history" | "edit" | "versions" | "dependencies";

/**
 * One entry in AI Workflows — draft/publish lifecycle on top of the
 * existing view/edit/duplicate/delete/favorite pattern. The editable
 * columns on `workflow` are always the DRAFT; a stable, immutable
 * WorkflowRevision (created only by "Publicar versión") is what real
 * "Ejecutar workflow" executions read from. Saving a draft is optimistic-
 * concurrency-protected via `editVersion`, tracked locally and re-synced
 * whenever the server-fetched `workflow` prop changes (after a
 * router.refresh()).
 */
export function WorkflowCard({
  projectId,
  workflow,
  initialMode,
  focusRunId,
}: {
  projectId: string;
  workflow: WorkflowLike;
  /** Set by WorkflowHub when this card is the target of a "workflow padre/hijo" navigation link (see RunDetailPanel) — opens straight to that panel instead of the default "Ver pasos". */
  initialMode?: WorkflowCardMode;
  /** Paired with initialMode="history" — pre-opens this specific run's row inside WorkflowRunHistory. */
  focusRunId?: string;
}) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<WorkflowCardMode>(initialMode ?? "view");
  const [busy, setBusy] = useState(false);
  const [editSteps, setEditSteps] = useState<WorkflowStep[]>(workflow.steps);
  const [editVersion, setEditVersion] = useState(workflow.editVersion);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [diff, setDiff] = useState<WorkflowDiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [dependencies, setDependencies] = useState<{ usesWorkflows: WorkflowDependencyRow[]; usedByWorkflows: WorkflowDependencyRow[] } | null>(null);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<WorkflowDependencyRow[] | null>(null);

  // The server-fetched workflow prop only changes after a router.refresh()
  // (e.g. following a publish/restore/archive) — re-sync local editing state
  // to it so a stale editVersion never causes a false conflict. Adjusted
  // during render (React's own recommended pattern for "reset state when a
  // prop changes") rather than in an effect, so it never costs an extra
  // render pass.
  const [syncedEditVersion, setSyncedEditVersion] = useState(workflow.editVersion);
  if (workflow.editVersion !== syncedEditVersion) {
    setSyncedEditVersion(workflow.editVersion);
    setEditVersion(workflow.editVersion);
    setEditSteps(workflow.steps);
  }

  const isArchived = workflow.status === "ARCHIVED";
  const hasPublishedVersion = workflow.publishedVersion !== null;

  // A "workflow padre/hijo" navigation link lands here with initialMode set
  // — scroll this specific card into view once, on mount, so the user
  // actually sees the panel it just opened instead of landing at the top of
  // a possibly long list.
  useEffect(() => {
    if (initialMode) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleFavorite() {
    setBusy(true);
    const result = await toggleFavoriteWorkflowAction(projectId, workflow.id, !workflow.isFavorite);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  async function handleToggleActive() {
    setBusy(true);
    const result = await toggleActiveWorkflowAction(projectId, workflow.id, !workflow.isActive);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  async function handleDuplicate() {
    setBusy(true);
    const result = await duplicateWorkflowAction(projectId, workflow.id);
    setBusy(false);
    if (result.error) toast.error(result.error);
    else toast.success("Workflow duplicado como nuevo borrador.");
  }

  async function handleDelete() {
    setBusy(true);
    const result = await deleteWorkflowAction(projectId, workflow.id);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  async function doArchive() {
    setBusy(true);
    const result = await archiveWorkflowAction(projectId, workflow.id);
    setBusy(false);
    setArchiveConfirm(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Workflow archivado.");
    router.refresh();
  }

  /** Shows "quién depende de mí" BEFORE archiving, per spec — a workflow with no dependents archives immediately (no friction for the common case); one with dependents requires an explicit second confirmation, since archiving makes it stop resolving for any parent that references it. */
  async function handleArchiveClick() {
    setBusy(true);
    const dependents = await listWorkflowsThatUseAction(projectId, workflow.id);
    setBusy(false);
    if (dependents.length > 0) {
      setArchiveConfirm(dependents);
      return;
    }
    await doArchive();
  }

  async function handleRestoreArchived() {
    setBusy(true);
    const result = await restoreArchivedWorkflowAction(projectId, workflow.id);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Workflow restaurado.");
    router.refresh();
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const result = await updateWorkflowAction(projectId, workflow.id, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      category: String(formData.get("category") ?? ""),
      tags: parseTagsInput(String(formData.get("tags") ?? "")),
      steps: editSteps,
      editVersion,
    });
    setBusy(false);
    if (result.error) {
      if (result.conflict) {
        toast.error("Este workflow se modificó en otra pestaña. Recargando datos actuales...");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      return;
    }
    if (result.editVersion !== undefined) setEditVersion(result.editVersion);
    toast.success("Borrador guardado. Todavía no está publicado.");
    router.refresh();
    setMode("view");
  }

  async function handleToggleDiff() {
    if (showDiff) {
      setShowDiff(false);
      return;
    }
    setShowDiff(true);
    setDiffLoading(true);
    const result = await compareDraftToPublishedAction(projectId, workflow.id);
    setDiffLoading(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setDiff(result.data.diff);
  }

  async function handleShowDependencies() {
    if (mode === "dependencies") {
      setMode("view");
      return;
    }
    setMode("dependencies");
    if (dependencies) return;
    setDependenciesLoading(true);
    const [usesWorkflows, usedByWorkflows] = await Promise.all([
      listWorkflowsUsedByAction(projectId, workflow.id),
      listWorkflowsThatUseAction(projectId, workflow.id),
    ]);
    setDependenciesLoading(false);
    setDependencies({ usesWorkflows, usedByWorkflows });
  }

  return (
    <Card ref={cardRef}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>{workflow.name}</CardTitle>
            {workflow.description ? <p className="text-sm text-muted-foreground">{workflow.description}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5">
              {isArchived ? (
                <Badge variant="outline">Archivado</Badge>
              ) : hasPublishedVersion ? (
                <Badge variant="default">Publicado v{workflow.publishedVersion}</Badge>
              ) : (
                <Badge variant="outline">Borrador</Badge>
              )}
              {workflow.hasUnpublishedChanges && !isArchived ? <Badge variant="secondary">Cambios sin publicar</Badge> : null}
              {!workflow.isActive ? <Badge variant="outline">Inactivo</Badge> : null}
              {workflow.category ? <Badge variant="secondary">{workflow.category}</Badge> : null}
              {workflow.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
              {workflow.variables.map((name) => (
                <Badge key={name} variant="outline">
                  {`{{${name}}}`}
                </Badge>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            onClick={handleToggleFavorite}
            aria-label={workflow.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
          >
            <Star className={workflow.isFavorite ? "size-4 fill-amber-400 text-amber-400" : "size-4"} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isArchived ? (
          <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
            <p>Este workflow está archivado. Consérvalo así, o restáuralo para volver a editarlo, publicarlo o ejecutarlo.</p>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleRestoreArchived}>
              <ArchiveRestore className="size-3.5" /> Restaurar Workflow
            </Button>
          </div>
        ) : null}

        {showDiff ? (
          <div className="space-y-1.5 rounded-lg border p-3">
            <p className="text-sm font-medium">Cambios del borrador respecto a la versión publicada</p>
            {diffLoading ? <p className="text-xs text-muted-foreground">Comparando...</p> : diff ? <WorkflowDiffView diff={diff} /> : null}
          </div>
        ) : null}

        {mode === "edit" ? (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`name-${workflow.id}`}>Nombre</Label>
                <Input id={`name-${workflow.id}`} name="name" defaultValue={workflow.name} maxLength={200} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`category-${workflow.id}`}>Categoría</Label>
                <Input id={`category-${workflow.id}`} name="category" defaultValue={workflow.category ?? ""} maxLength={100} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`description-${workflow.id}`}>Descripción</Label>
              <Input id={`description-${workflow.id}`} name="description" defaultValue={workflow.description ?? ""} maxLength={1000} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`tags-${workflow.id}`}>Etiquetas (separadas por comas)</Label>
              <Input id={`tags-${workflow.id}`} name="tags" defaultValue={workflow.tags.join(", ")} maxLength={400} />
            </div>
            <div className="space-y-1.5">
              <Label>Pasos</Label>
              <WorkflowStepEditor projectId={projectId} workflowId={workflow.id} steps={editSteps} onChange={setEditSteps} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                Guardar borrador
              </Button>
              <Button type="button" variant="outline" onClick={() => setMode("view")}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : mode === "preview" ? (
          <WorkflowRunPanel
            projectId={projectId}
            workflowId={workflow.id}
            workflowName={workflow.name}
            steps={workflow.steps}
            variables={workflow.variables}
          />
        ) : mode === "execute" ? (
          <WorkflowExecutionPanel
            projectId={projectId}
            workflowId={workflow.id}
            workflowName={workflow.name}
            publishedVersion={workflow.publishedVersion}
            variables={workflow.variables}
          />
        ) : mode === "history" ? (
          <WorkflowRunHistory
            projectId={projectId}
            workflowId={workflow.id}
            currentWorkflowVersion={workflow.publishedVersion ?? 0}
            initialOpenRunId={focusRunId}
            onRequestExecute={() => setMode("execute")}
          />
        ) : mode === "versions" ? (
          <WorkflowVersionsPanel projectId={projectId} workflowId={workflow.id} onDraftRestored={() => router.refresh()} />
        ) : mode === "dependencies" ? (
          <div className="space-y-4 text-sm">
            {dependenciesLoading ? <p className="text-muted-foreground">Cargando dependencias...</p> : null}
            {dependencies ? (
              <>
                <div className="space-y-1.5">
                  <p className="font-medium">Usa a: (de qué depende este workflow)</p>
                  {dependencies.usesWorkflows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Este workflow no usa ningún otro workflow como sub-workflow.</p>
                  ) : (
                    <ul className="space-y-1">
                      {dependencies.usesWorkflows.map((w) => (
                        <li key={w.id} className="flex items-center gap-2">
                          <Badge variant="outline">{w.status === "ARCHIVED" ? "Archivado" : w.publishedVersion ? `v${w.publishedVersion}` : "Sin publicar"}</Badge>
                          {w.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium">Usado por: (quién depende de este workflow)</p>
                  {dependencies.usedByWorkflows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ningún otro workflow usa este como sub-workflow todavía.</p>
                  ) : (
                    <ul className="space-y-1">
                      {dependencies.usedByWorkflows.map((w) => (
                        <li key={w.id} className="flex items-center gap-2">
                          <Badge variant="outline">{w.status === "ARCHIVED" ? "Archivado" : w.publishedVersion ? `v${w.publishedVersion}` : "Sin publicar"}</Badge>
                          {w.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {workflow.steps.map((step, index) => (
              <li key={step.id} className="flex items-center gap-2">
                <Badge variant="secondary">{index + 1}</Badge>
                <span className="font-medium">{STEP_TYPE_LABELS[step.type]}:</span> {step.label}
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("view")} disabled={mode === "view"}>
              Ver pasos
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(mode === "preview" ? "view" : "preview")}>
              <Play className="size-3.5" /> Vista previa
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(mode === "execute" ? "view" : "execute")}>
              <Zap className="size-3.5" /> Ejecutar / Probar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(mode === "history" ? "view" : "history")}>
              <History className="size-3.5" /> Historial
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(mode === "versions" ? "view" : "versions")}>
              <GitBranch className="size-3.5" /> Versiones
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleShowDependencies}>
              <Link2 className="size-3.5" /> Dependencias
            </Button>
            {!isArchived && mode !== "edit" ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("edit")}>
                Editar
              </Button>
            ) : null}
            {!isArchived ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleToggleDiff}>
                <Eye className="size-3.5" /> Ver cambios
              </Button>
            ) : null}
            {!isArchived ? (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setPublishDialogOpen(true)}>
                <Rocket className="size-3.5" /> Publicar versión
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" disabled={busy || isArchived} onClick={handleToggleActive}>
              {workflow.isActive ? "Desactivar" : "Activar"}
            </Button>
          </div>
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleDuplicate}>
              Duplicar
            </Button>
            {!isArchived ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleArchiveClick}>
                <Archive className="size-3.5" /> Archivar
              </Button>
            ) : null}
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
              Eliminar
            </Button>
          </div>
        </div>

        {archiveConfirm ? (
          <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">
              {archiveConfirm.length} workflow{archiveConfirm.length === 1 ? "" : "s"} usa{archiveConfirm.length === 1 ? "" : "n"} este como sub-workflow
            </p>
            <ul className="list-inside list-disc text-xs text-muted-foreground">
              {archiveConfirm.map((w) => (
                <li key={w.id}>{w.name}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Archivarlo hará que esos workflows dejen de poder ejecutarse en cuanto intenten usarlo. ¿Archivar de todas formas?
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={doArchive}>
                Archivar de todas formas
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setArchiveConfirm(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>

      <PublishWorkflowDialog
        projectId={projectId}
        workflowId={workflow.id}
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        onPublished={() => router.refresh()}
      />
    </Card>
  );
}

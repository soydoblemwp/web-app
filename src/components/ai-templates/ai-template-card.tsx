"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Star, Eye, Copy } from "lucide-react";
import {
  updateAiTemplateAction,
  deleteAiTemplateAction,
  duplicateAiTemplateAction,
  toggleFavoriteAiTemplateAction,
} from "@/server/actions/ai-templates";
import { renderTemplate } from "@/lib/ai-templates/engine";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { UniversalResultViewer } from "@/components/workspace/universal-result-viewer";
import type { AiTemplateLike } from "@/lib/ai-templates/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * One entry in AI Templates — the AiTemplate equivalent of
 * PromptLibraryCard/WorkspaceResultCard, but with a third mode ("Vista
 * previa") that runs the template through the shared render engine
 * (src/lib/ai-templates/engine.ts) against user-supplied variable values.
 * Reuses UniversalResultViewer for both the raw template and the rendered
 * output — one visual system, never a second renderer.
 *
 * `brandVariables` (from buildBrandProfileTemplateVariables, see
 * src/lib/brand-profiles/context.ts) pre-fills any {{brand_*}} placeholder
 * the template declares — "los templates podrán renderizarse utilizando el
 * Brand Kit." The user can still overwrite any pre-filled value by typing
 * in its field.
 */
export function AiTemplateCard({
  projectId,
  template,
  brandVariables,
}: {
  projectId: string;
  template: AiTemplateLike;
  brandVariables: Record<string, string>;
}) {
  const [mode, setMode] = useState<"view" | "preview" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.variables.filter((name) => brandVariables[name]).map((name) => [name, brandVariables[name]]))
  );

  const blocks = useMemo(() => parseResultBlocks(template.content), [template.content]);
  const render = useMemo(() => renderTemplate(template.content, previewValues), [template.content, previewValues]);
  const renderBlocks = useMemo(() => parseResultBlocks(render.output), [render.output]);

  async function handleToggleFavorite() {
    setBusy(true);
    const result = await toggleFavoriteAiTemplateAction(projectId, template.id, !template.isFavorite);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  async function handleDuplicate() {
    setBusy(true);
    const result = await duplicateAiTemplateAction(projectId, template.id);
    setBusy(false);
    if (result.error) toast.error(result.error);
    else toast.success("Template duplicado.");
  }

  async function handleDelete() {
    setBusy(true);
    const result = await deleteAiTemplateAction(projectId, template.id);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const result = await updateAiTemplateAction(projectId, template.id, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      content: String(formData.get("content") ?? ""),
      category: String(formData.get("category") ?? ""),
      tags: parseTagsInput(String(formData.get("tags") ?? "")),
    });
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Template actualizado.");
    setMode("view");
  }

  function handleCopyRendered() {
    void navigator.clipboard.writeText(render.output);
    toast.success("Resultado copiado al portapapeles.");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>{template.title}</CardTitle>
            {template.description ? <p className="text-sm text-muted-foreground">{template.description}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5">
              {template.category ? <Badge variant="secondary">{template.category}</Badge> : null}
              {template.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
              {template.variables.map((name) => (
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
            aria-label={template.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
          >
            <Star className={template.isFavorite ? "size-4 fill-amber-400 text-amber-400" : "size-4"} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "edit" ? (
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`title-${template.id}`}>Título</Label>
                <Input id={`title-${template.id}`} name="title" defaultValue={template.title} maxLength={200} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`category-${template.id}`}>Categoría</Label>
                <Input id={`category-${template.id}`} name="category" defaultValue={template.category ?? ""} maxLength={100} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`description-${template.id}`}>Descripción</Label>
              <Input id={`description-${template.id}`} name="description" defaultValue={template.description ?? ""} maxLength={500} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`content-${template.id}`}>
                Contenido — usa <code className="rounded bg-muted px-1">{"{{variable}}"}</code> para cada campo dinámico
              </Label>
              <Textarea
                id={`content-${template.id}`}
                name="content"
                defaultValue={template.content}
                rows={8}
                className="font-mono text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`tags-${template.id}`}>Etiquetas (separadas por comas)</Label>
              <Input id={`tags-${template.id}`} name="tags" defaultValue={template.tags.join(", ")} maxLength={400} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                Guardar cambios
              </Button>
              <Button type="button" variant="outline" onClick={() => setMode("view")}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : mode === "preview" ? (
          <div className="space-y-4">
            {template.variables.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este template no tiene variables — el resultado es siempre el mismo.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {template.variables.map((name) => (
                  <div key={name} className="space-y-1.5">
                    <Label htmlFor={`var-${template.id}-${name}`}>{`{{${name}}}`}</Label>
                    <Input
                      id={`var-${template.id}-${name}`}
                      value={previewValues[name] ?? ""}
                      onChange={(event) => setPreviewValues((prev) => ({ ...prev, [name]: event.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}

            {render.missing.length > 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Faltan valores para: {render.missing.map((name) => `{{${name}}}`).join(", ")}
              </p>
            ) : null}

            <div className="rounded-lg border bg-muted/30 p-3">
              <UniversalResultViewer blocks={renderBlocks} />
            </div>

            <Button type="button" variant="outline" size="sm" onClick={handleCopyRendered}>
              <Copy className="size-3.5" /> Copiar resultado
            </Button>
          </div>
        ) : (
          <UniversalResultViewer blocks={blocks} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode(mode === "preview" ? "view" : "preview")}>
              <Eye className="size-3.5" /> {mode === "preview" ? "Ver template" : "Vista previa"}
            </Button>
            {mode !== "edit" ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("edit")}>
                Editar
              </Button>
            ) : null}
          </div>
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={handleDuplicate}>
              Duplicar
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
              Eliminar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Star, Copy } from "lucide-react";
import {
  updateSavedPromptAction,
  deleteSavedPromptAction,
  duplicateSavedPromptAction,
  toggleFavoriteSavedPromptAction,
  recordPromptUseAction,
} from "@/server/actions/prompt-library";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { UniversalResultViewer } from "@/components/workspace/universal-result-viewer";
import type { SavedPromptLike } from "@/lib/prompt-library/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * One entry in the Prompt Library — the SavedPrompt equivalent of
 * WorkspaceResultCard, but for reusable prompt text rather than generated
 * output, so it has its own actions (edit fields, duplicate, delete,
 * favorite, record-use) instead of reusing the ContentItem-specific ones.
 * Reuses UniversalResultViewer for rendering the prompt content — the same
 * single visual system every generated result already renders through.
 *
 * `defaultBrandContext` is the user's default BrandProfile rendered to text
 * (see src/lib/brand-profiles/context.ts) — passed down once from the page,
 * never refetched per card. When a prompt has `useBrandKit` set, "Usar"
 * composes it into what gets copied.
 */
export function PromptLibraryCard({
  projectId,
  prompt,
  defaultBrandContext,
}: {
  projectId: string;
  prompt: SavedPromptLike;
  defaultBrandContext: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [useBrandKit, setUseBrandKit] = useState(prompt.useBrandKit);
  const blocks = parseResultBlocks(prompt.content);

  async function handleUse() {
    const text =
      prompt.useBrandKit && defaultBrandContext ? [prompt.content, defaultBrandContext].join("\n\n") : prompt.content;
    void navigator.clipboard.writeText(text);
    toast.success(
      prompt.useBrandKit && defaultBrandContext ? "Prompt + Brand Kit copiados al portapapeles." : "Prompt copiado al portapapeles."
    );
    await recordPromptUseAction(projectId, prompt.id);
  }

  async function handleToggleFavorite() {
    setBusy(true);
    const result = await toggleFavoriteSavedPromptAction(projectId, prompt.id, !prompt.isFavorite);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  async function handleDuplicate() {
    setBusy(true);
    const result = await duplicateSavedPromptAction(projectId, prompt.id);
    setBusy(false);
    if (result.error) toast.error(result.error);
    else toast.success("Prompt duplicado.");
  }

  async function handleDelete() {
    setBusy(true);
    const result = await deleteSavedPromptAction(projectId, prompt.id);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formData = new FormData(event.currentTarget);
    const result = await updateSavedPromptAction(projectId, prompt.id, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      content: String(formData.get("content") ?? ""),
      category: String(formData.get("category") ?? ""),
      tags: parseTagsInput(String(formData.get("tags") ?? "")),
      useBrandKit,
    });
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Prompt actualizado.");
    setIsEditing(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle>{prompt.title}</CardTitle>
            {prompt.description ? <p className="text-sm text-muted-foreground">{prompt.description}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5">
              {prompt.category ? <Badge variant="secondary">{prompt.category}</Badge> : null}
              {prompt.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
              {prompt.useBrandKit ? <Badge variant="outline">Brand Kit</Badge> : null}
              <span className="text-xs text-muted-foreground">
                Usado {prompt.useCount} {prompt.useCount === 1 ? "vez" : "veces"}
                {prompt.lastUsedAt ? ` · Último uso: ${prompt.lastUsedAt.toLocaleString("es-ES")}` : ""}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            onClick={handleToggleFavorite}
            aria-label={prompt.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
          >
            <Star className={prompt.isFavorite ? "size-4 fill-amber-400 text-amber-400" : "size-4"} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <form onSubmit={handleEditSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`title-${prompt.id}`}>Título</Label>
                <Input id={`title-${prompt.id}`} name="title" defaultValue={prompt.title} maxLength={200} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`category-${prompt.id}`}>Categoría</Label>
                <Input id={`category-${prompt.id}`} name="category" defaultValue={prompt.category ?? ""} maxLength={100} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`description-${prompt.id}`}>Descripción</Label>
              <Input id={`description-${prompt.id}`} name="description" defaultValue={prompt.description ?? ""} maxLength={500} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`content-${prompt.id}`}>Contenido</Label>
              <Textarea
                id={`content-${prompt.id}`}
                name="content"
                defaultValue={prompt.content}
                rows={8}
                className="font-mono text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`tags-${prompt.id}`}>Etiquetas (separadas por comas)</Label>
              <Input id={`tags-${prompt.id}`} name="tags" defaultValue={prompt.tags.join(", ")} maxLength={400} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`use-brand-kit-${prompt.id}`}
                checked={useBrandKit}
                onCheckedChange={(checked) => setUseBrandKit(checked === true)}
              />
              <Label htmlFor={`use-brand-kit-${prompt.id}`} className="font-normal">
                Usar Brand Kit al pulsar &quot;Usar&quot;
              </Label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                Guardar cambios
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <UniversalResultViewer blocks={blocks} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={handleUse}>
              <Copy className="size-3.5" /> Usar
            </Button>
            {!isEditing ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
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

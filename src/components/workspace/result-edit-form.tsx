"use client";

import { updateContentItemAction } from "@/server/actions/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Shared manual-edit form for a ContentItem — used by both the Workspace
 * history card and AiGenerationForm's freshly-generated result, so there is
 * exactly one edit UI/one call site for updateContentItemAction. Only
 * title/body are editable; sourceTool and content type are never touched
 * (updateContentItemAction itself never writes them).
 */
export function ResultEditForm({
  projectId,
  contentItemId,
  title,
  body,
  onSaved,
}: {
  projectId: string;
  contentItemId: string;
  title: string;
  body: string;
  /** Optional — lets a caller holding its own local copy of the text (like AiGenerationForm) refresh it without a page reload. */
  onSaved?: (values: { title: string; body: string }) => void;
}) {
  async function handleAction(formData: FormData) {
    await updateContentItemAction(projectId, formData);
    onSaved?.({
      title: String(formData.get("title") ?? title),
      body: String(formData.get("body") ?? body),
    });
  }

  return (
    <form action={handleAction} className="space-y-3">
      <input type="hidden" name="id" value={contentItemId} />
      <div className="space-y-2">
        <Label htmlFor={`title-${contentItemId}`}>Título</Label>
        <Input id={`title-${contentItemId}`} name="title" defaultValue={title} maxLength={300} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`body-${contentItemId}`}>Contenido</Label>
        <Textarea
          id={`body-${contentItemId}`}
          name="body"
          defaultValue={body}
          rows={10}
          className="font-mono text-sm"
          required
        />
      </div>
      <Button type="submit">Guardar</Button>
    </form>
  );
}

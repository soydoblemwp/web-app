"use client";

import { useRef, useState } from "react";
import { updateContentItemAction } from "@/server/actions/content";
import { RichEditor } from "@/components/editor/rich-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shared manual-edit form for a ContentItem — used by both the Workspace
 * history card and AiGenerationForm's freshly-generated result, so there is
 * exactly one edit UI/one call site for updateContentItemAction. Only
 * title/body are editable; sourceTool and content type are never touched
 * (updateContentItemAction itself never writes them). Uses the official
 * RichEditor (Fase 26) — same editor as the content detail page, never a
 * second/parallel editing surface.
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
  const [titleValue, setTitleValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef(body);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const formData = new FormData();
    formData.set("id", contentItemId);
    formData.set("title", titleValue);
    formData.set("body", bodyRef.current);
    await updateContentItemAction(projectId, formData);
    setSaving(false);
    onSaved?.({ title: titleValue, body: bodyRef.current });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`title-${contentItemId}`}>Título</Label>
        <Input
          id={`title-${contentItemId}`}
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
          maxLength={300}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Contenido</Label>
        <RichEditor projectId={projectId} content={body} onChangeHtml={(html) => (bodyRef.current = html)} />
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}

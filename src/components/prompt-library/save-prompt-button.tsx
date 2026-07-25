"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookmarkPlus } from "lucide-react";
import { saveGeneratedPromptAction } from "@/server/actions/prompt-library";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * The "Guardar Prompt" affordance every AI Center tool gets, via
 * AiGenerationForm — the ONE place this button is defined, so every tool
 * (current and future) gets it automatically instead of each tool building
 * its own. Saves the exact prompt text that was actually sent to the model
 * (`content`), not the generated output — that already has its own save
 * path (saveAiToolResultAction) into the Workspace/content library.
 */
export function SavePromptButton({
  projectId,
  toolSlug,
  defaultTitle,
  content,
}: {
  projectId: string;
  toolSlug: string;
  defaultTitle: string;
  content: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [useBrandKit, setUseBrandKit] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const result = await saveGeneratedPromptAction({
      projectId,
      toolSlug,
      title: String(formData.get("title") ?? defaultTitle),
      content,
      tags: parseTagsInput(String(formData.get("tags") ?? "")),
      useBrandKit,
    });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Prompt guardado en tu Prompt Library.");
    setOpen(false);
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <BookmarkPlus className="size-3.5" /> Guardar Prompt
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
      <div className="space-y-1">
        <Label htmlFor="save-prompt-title" className="text-xs">
          Título
        </Label>
        <Input id="save-prompt-title" name="title" defaultValue={defaultTitle} maxLength={200} required className="h-8 w-48" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="save-prompt-tags" className="text-xs">
          Etiquetas (opcional)
        </Label>
        <Input id="save-prompt-tags" name="tags" maxLength={400} placeholder="ej. cliente-x" className="h-8 w-40" />
      </div>
      <div className="flex items-center gap-1.5 pb-1.5">
        <Checkbox id="save-prompt-use-brand-kit" checked={useBrandKit} onCheckedChange={(checked) => setUseBrandKit(checked === true)} />
        <Label htmlFor="save-prompt-use-brand-kit" className="text-xs font-normal">
          Usar Brand Kit
        </Label>
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Guardando..." : "Guardar"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </form>
  );
}

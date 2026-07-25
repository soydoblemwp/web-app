"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createSavedPromptAction } from "@/server/actions/prompt-library";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * "Nuevo prompt" — the manual creation path for the Prompt Library (as
 * opposed to the "Guardar Prompt" button embedded in AiGenerationForm,
 * see src/components/prompt-library/save-prompt-button.tsx). Both call the
 * same createSavedPromptAction; this is the only place that builds its form.
 */
export function PromptLibraryCreateForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [useBrandKit, setUseBrandKit] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const result = await createSavedPromptAction({
      projectId,
      scope: formData.get("scope") === "global" ? "global" : "project",
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      content: String(formData.get("content") ?? ""),
      category: String(formData.get("category") ?? ""),
      tags: parseTagsInput(String(formData.get("tags") ?? "")),
      useBrandKit,
    });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Prompt guardado en tu biblioteca.");
    event.currentTarget.reset();
    setUseBrandKit(false);
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Nuevo prompt
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-prompt-title">Título</Label>
          <Input id="new-prompt-title" name="title" required maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-prompt-category">Categoría (opcional)</Label>
          <Input id="new-prompt-category" name="category" maxLength={100} placeholder="ej. SEO, YouTube, Email" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-prompt-description">Descripción (opcional)</Label>
        <Input id="new-prompt-description" name="description" maxLength={500} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-prompt-content">Contenido del prompt</Label>
        <Textarea id="new-prompt-content" name="content" required rows={6} className="font-mono text-sm" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-prompt-tags">Etiquetas (separadas por comas, opcional)</Label>
          <Input id="new-prompt-tags" name="tags" maxLength={400} placeholder="ej. blog, ideas, cliente-x" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-prompt-scope">Alcance</Label>
          <Select name="scope" defaultValue="project">
            <SelectTrigger id="new-prompt-scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Solo este proyecto</SelectItem>
              <SelectItem value="global">Todos mis proyectos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="new-prompt-use-brand-kit" checked={useBrandKit} onCheckedChange={(checked) => setUseBrandKit(checked === true)} />
        <Label htmlFor="new-prompt-use-brand-kit" className="font-normal">
          Usar Brand Kit — al pulsar &quot;Usar&quot; se añade el contexto de tu marca predeterminada
        </Label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar prompt"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

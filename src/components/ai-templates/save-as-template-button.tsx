"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LayoutTemplate } from "lucide-react";
import { saveGeneratedAsTemplateAction } from "@/server/actions/ai-templates";
import { analyzeTemplateVariables } from "@/lib/ai-templates/engine";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/**
 * "Guardar como Template": the button every AI Center tool gets, via
 * AiGenerationForm — the ONE place this is defined. Unlike
 * SavePromptButton (Prompt Library, which saves the INPUT prompt), this
 * saves the generated RESULT as the template's content, letting the user
 * turn any occurrence of a fixed value into a `{{variable}}` placeholder
 * before saving — that's what "convertir cualquier generación de IA en una
 * plantilla reutilizable" means in practice.
 */
export function SaveAsTemplateButton({
  projectId,
  toolSlug,
  defaultTitle,
  generatedContent,
}: {
  projectId: string;
  toolSlug: string;
  defaultTitle: string;
  generatedContent: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState(generatedContent);

  const analysis = useMemo(() => analyzeTemplateVariables(content), [content]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const result = await saveGeneratedAsTemplateAction({
      projectId,
      toolSlug,
      title: String(formData.get("title") ?? defaultTitle),
      content,
      tags: parseTagsInput(String(formData.get("tags") ?? "")),
    });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Template guardado en AI Templates.");
    setOpen(false);
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <LayoutTemplate className="size-3.5" /> Guardar como Template
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="save-template-title" className="text-xs">
            Título
          </Label>
          <Input id="save-template-title" name="title" defaultValue={defaultTitle} maxLength={200} required className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="save-template-tags" className="text-xs">
            Etiquetas (opcional)
          </Label>
          <Input id="save-template-tags" name="tags" maxLength={400} placeholder="ej. cliente-x" className="h-8" />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="save-template-content" className="text-xs">
          Contenido — reemplaza los valores fijos por <code className="rounded bg-muted px-1">{"{{variable}}"}</code> para
          convertirlo en plantilla reutilizable
        </Label>
        <Textarea
          id="save-template-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={6}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Variables detectadas:</span>
          {analysis.names.length === 0 ? (
            <span className="text-xs text-muted-foreground">ninguna</span>
          ) : (
            analysis.names.map((name) => (
              <Badge key={name} variant="secondary">
                {`{{${name}}}`}
              </Badge>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

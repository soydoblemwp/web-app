"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { createAiTemplateAction } from "@/server/actions/ai-templates";
import { analyzeTemplateVariables } from "@/lib/ai-templates/engine";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * "Nuevo template" — the manual creation path for AI Templates (as opposed
 * to the "Guardar como Template" button embedded in AiGenerationForm, see
 * src/components/ai-templates/save-as-template-button.tsx). Both call the
 * same createAiTemplateAction. Reuses parseTagsInput from Prompt Library's
 * validation module rather than redefining it.
 */
export function AiTemplateCreateForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState("");

  const analysis = useMemo(() => analyzeTemplateVariables(content), [content]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const result = await createAiTemplateAction({
      projectId,
      scope: formData.get("scope") === "global" ? "global" : "project",
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      content,
      category: String(formData.get("category") ?? ""),
      tags: parseTagsInput(String(formData.get("tags") ?? "")),
    });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Template guardado.");
    event.currentTarget.reset();
    setContent("");
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Nuevo template
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-template-title">Título</Label>
          <Input id="new-template-title" name="title" required maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-template-category">Categoría (opcional)</Label>
          <Input id="new-template-category" name="category" maxLength={100} placeholder="ej. YouTube, SEO, Email" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-template-description">Descripción (opcional)</Label>
        <Input id="new-template-description" name="description" maxLength={500} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-template-content">
          Contenido — usa <code className="rounded bg-muted px-1">{"{{variable}}"}</code> para cada campo dinámico
        </Label>
        <Textarea
          id="new-template-content"
          name="content"
          required
          rows={8}
          className="font-mono text-sm"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={"Título:\n{{titulo}}\n\nAudiencia:\n{{audiencia}}"}
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
          {analysis.invalidTokens.map((token) => (
            <Badge key={token} variant="destructive">
              inválida: {`{{${token}}}`}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-template-tags">Etiquetas (separadas por comas, opcional)</Label>
          <Input id="new-template-tags" name="tags" maxLength={400} placeholder="ej. blog, cliente-x" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-template-scope">Alcance</Label>
          <Select name="scope" defaultValue="project">
            <SelectTrigger id="new-template-scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Solo este proyecto</SelectItem>
              <SelectItem value="global">Todos mis proyectos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar template"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

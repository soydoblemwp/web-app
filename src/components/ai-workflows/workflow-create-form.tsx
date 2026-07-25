"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createWorkflowAction } from "@/server/actions/ai-workflows";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import type { WorkflowStep } from "@/lib/ai-workflows/engine";
import { WorkflowStepEditor } from "@/components/ai-workflows/workflow-step-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** "Nuevo Workflow" — the creation path for AI Workflows. Reuses parseTagsInput from Prompt Library and WorkflowStepEditor (the one shared step builder) instead of redefining either. */
export function WorkflowCreateForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const formData = new FormData(event.currentTarget);
    const result = await createWorkflowAction({
      projectId,
      scope: formData.get("scope") === "global" ? "global" : "project",
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      category: String(formData.get("category") ?? ""),
      tags: parseTagsInput(String(formData.get("tags") ?? "")),
      isActive: formData.get("isActive") !== "false",
      steps,
    });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Workflow guardado.");
    event.currentTarget.reset();
    setSteps([]);
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Nuevo Workflow
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-workflow-name">Nombre</Label>
          <Input id="new-workflow-name" name="name" required maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-workflow-category">Categoría (opcional)</Label>
          <Input id="new-workflow-category" name="category" maxLength={100} placeholder="ej. Marketing, SEO, YouTube" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-workflow-description">Descripción (opcional)</Label>
        <Input id="new-workflow-description" name="description" maxLength={1000} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-workflow-tags">Etiquetas (separadas por comas, opcional)</Label>
          <Input id="new-workflow-tags" name="tags" maxLength={400} placeholder="ej. redes, lanzamiento" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-workflow-scope">Alcance</Label>
          <Select name="scope" defaultValue="project">
            <SelectTrigger id="new-workflow-scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Solo este proyecto</SelectItem>
              <SelectItem value="global">Todos mis proyectos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Pasos del workflow</Label>
        <WorkflowStepEditor projectId={projectId} steps={steps} onChange={setSteps} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar workflow"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

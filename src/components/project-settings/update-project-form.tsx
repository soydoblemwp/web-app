"use client";

import { useActionState } from "react";
import { updateProjectSettingsAction, type ProjectSettingsFormState } from "@/server/actions/project-settings";
import type { Project } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ProjectSettingsFormState = {};

export function UpdateProjectForm({ project }: { project: Project }) {
  const action = updateProjectSettingsAction.bind(null, project.id);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={project.name} required maxLength={120} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" name="description" defaultValue={project.description ?? ""} rows={3} maxLength={2000} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="website">Sitio web</Label>
        <Input id="website" name="website" type="url" defaultValue={project.website ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="industry">Sector</Label>
        <Input id="industry" name="industry" defaultValue={project.industry ?? ""} maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="targetAudience">Público objetivo</Label>
        <Input id="targetAudience" name="targetAudience" defaultValue={project.targetAudience ?? ""} maxLength={300} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tone">Tono</Label>
        <Input id="tone" name="tone" defaultValue={project.tone ?? ""} maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="primaryLanguage">Idioma principal</Label>
        <Input id="primaryLanguage" name="primaryLanguage" defaultValue={project.primaryLanguage} maxLength={10} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="market">Mercado</Label>
        <Input id="market" name="market" defaultValue={project.market ?? ""} maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Zona horaria</Label>
        <Input id="timezone" name="timezone" defaultValue={project.timezone} maxLength={100} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="goals">Objetivos</Label>
        <Textarea id="goals" name="goals" defaultValue={project.goals ?? ""} rows={2} maxLength={1000} />
      </div>
      {state.error ? <p className="text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600 sm:col-span-2">{state.success}</p> : null}
      <Button type="submit" disabled={isPending} className="sm:col-span-2 sm:w-fit">
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}

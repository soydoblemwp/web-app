"use client";

import { useActionState } from "react";
import { createProjectAction, type ProjectFormState } from "@/server/actions/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ProjectFormState = {};

export function CreateProjectForm() {
  const [state, formAction, isPending] = useActionState(createProjectAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Nombre del proyecto</Label>
          <Input id="name" name="name" required maxLength={120} placeholder="Mi marca, cliente o iniciativa" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea id="description" name="description" rows={3} maxLength={2000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Sitio web</Label>
          <Input id="website" name="website" type="url" placeholder="https://" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="industry">Sector</Label>
          <Input id="industry" name="industry" maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="targetAudience">Público objetivo</Label>
          <Input id="targetAudience" name="targetAudience" maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tone">Tono de comunicación</Label>
          <Input id="tone" name="tone" maxLength={200} placeholder="Cercano, profesional, divertido..." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="primaryLanguage">Idioma principal</Label>
          <Input id="primaryLanguage" name="primaryLanguage" defaultValue="es" maxLength={10} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="market">País o mercado</Label>
          <Input id="market" name="market" maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Zona horaria</Label>
          <Input id="timezone" name="timezone" defaultValue="UTC" maxLength={100} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="goals">Objetivos</Label>
          <Textarea id="goals" name="goals" rows={2} maxLength={1000} />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear proyecto"}
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { createCampaignAction, type CampaignFormState } from "@/server/actions/campaign";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: CampaignFormState = {};

export function CreateCampaignForm({ projectId }: { projectId: string }) {
  const action = createCampaignAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" required maxLength={200} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea id="description" name="description" rows={3} maxLength={2000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="objective">Objetivo</Label>
          <Input id="objective" name="objective" maxLength={500} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="audience">Audiencia</Label>
          <Input id="audience" name="audience" maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="startDate">Fecha inicial</Label>
          <Input id="startDate" name="startDate" type="datetime-local" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Fecha final</Label>
          <Input id="endDate" name="endDate" type="datetime-local" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="primaryCTA">CTA principal</Label>
          <Input id="primaryCTA" name="primaryCTA" maxLength={300} />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear campaña"}
      </Button>
    </form>
  );
}

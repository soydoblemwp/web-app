"use client";

import { useActionState } from "react";
import { createCollaborationAction, type CollaborationFormState } from "@/server/actions/collaboration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: CollaborationFormState = {};

export function CreateCollaborationForm({ projectId }: { projectId: string }) {
  const action = createCollaborationAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="brandName">Marca</Label>
          <Input id="brandName" name="brandName" required maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="collaborationType">Tipo de colaboración</Label>
          <Input id="collaborationType" name="collaborationType" maxLength={200} placeholder="Publicación pagada, canje..." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="productReceived">Producto recibido</Label>
          <Input id="productReceived" name="productReceived" maxLength={300} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear colaboración"}
      </Button>
    </form>
  );
}

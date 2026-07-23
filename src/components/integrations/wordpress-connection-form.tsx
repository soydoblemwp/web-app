"use client";

import { useActionState } from "react";
import { saveWordPressConnectionAction, type IntegrationFormState } from "@/server/actions/integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: IntegrationFormState = {};

export function WordPressConnectionForm({ projectId }: { projectId: string }) {
  const action = saveWordPressConnectionAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="siteUrl">URL del sitio</Label>
        <Input id="siteUrl" name="siteUrl" type="url" required placeholder="https://mi-sitio.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Usuario</Label>
        <Input id="username" name="username" required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="appPassword">Contraseña de aplicación</Label>
        <Input id="appPassword" name="appPassword" type="password" required autoComplete="off" />
        <p className="text-xs text-muted-foreground">
          Genera una contraseña de aplicación en tu perfil de usuario de WordPress (Usuarios → Tu perfil →
          Contraseñas de aplicación). Se almacena cifrada y nunca se muestra de nuevo.
        </p>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Conectando..." : "Conectar"}
      </Button>
    </form>
  );
}

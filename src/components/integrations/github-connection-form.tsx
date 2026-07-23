"use client";

import { useActionState } from "react";
import { saveGitHubConnectionAction, type IntegrationFormState } from "@/server/actions/integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: IntegrationFormState = {};

export function GitHubConnectionForm({ projectId }: { projectId: string }) {
  const action = saveGitHubConnectionAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="token">Token de acceso personal</Label>
        <Input id="token" name="token" type="password" required autoComplete="off" placeholder="ghp_..." />
        <p className="text-xs text-muted-foreground">
          Crea un token de acceso personal de solo lectura (repo scope mínimo necesario) en GitHub → Settings →
          Developer settings. Se almacena cifrado.
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

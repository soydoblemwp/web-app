"use client";

import { useActionState } from "react";
import { checkNewLinkAction, type LinkCheckFormState } from "@/server/actions/link-checker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: LinkCheckFormState = {};

export function CheckLinkForm({ projectId }: { projectId: string }) {
  const action = checkNewLinkAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex items-start gap-2">
      <div className="flex-1">
        <Input name="url" type="url" required placeholder="https://ejemplo.com/pagina" />
        {state.error ? <p className="mt-1 text-sm text-destructive">{state.error}</p> : null}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Comprobando..." : "Comprobar"}
      </Button>
    </form>
  );
}

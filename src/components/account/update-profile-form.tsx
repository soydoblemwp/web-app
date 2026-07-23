"use client";

import { useActionState } from "react";
import { updateProfileAction, type AccountFormState } from "@/server/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AccountFormState = {};

export function UpdateProfileForm({
  name,
  timezone,
  locale,
}: {
  name: string | null;
  timezone: string;
  locale: string;
}) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={name ?? ""} required maxLength={100} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="timezone">Zona horaria</Label>
          <Input id="timezone" name="timezone" defaultValue={timezone} maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="locale">Idioma</Label>
          <Input id="locale" name="locale" defaultValue={locale} maxLength={10} />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}

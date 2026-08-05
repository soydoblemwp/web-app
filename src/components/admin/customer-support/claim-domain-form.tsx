"use client";

import { useActionState } from "react";
import { claimPublicSiteAdminAction, type ClaimDomainFormState } from "@/server/actions/admin-customer-support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ClaimDomainFormState = {};

export function ClaimDomainForm({ projectId }: { projectId: string }) {
  const action = claimPublicSiteAdminAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="claim-hostname">Dominio a reclamar</Label>
        <Input id="claim-hostname" name="hostname" required placeholder="web-app-c3gg.vercel.app" className="w-64" />
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Reclamando..." : "Reclamar dominio"}
      </Button>
      {state.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="w-full text-sm text-muted-foreground">Dominio reclamado y activo para este proyecto.</p> : null}
    </form>
  );
}

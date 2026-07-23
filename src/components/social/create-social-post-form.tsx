"use client";

import { useActionState } from "react";
import { createSocialPostAction, type SocialPostFormState } from "@/server/actions/social";
import { socialPlatformValues } from "@/lib/validation/social";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: SocialPostFormState = {};

export function CreateSocialPostForm({ projectId }: { projectId: string }) {
  const action = createSocialPostAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="platform">Plataforma</Label>
          <Select name="platform" defaultValue="INSTAGRAM">
            <SelectTrigger id="platform" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {socialPlatformValues.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="postType">Tipo de publicación</Label>
          <Input id="postType" name="postType" defaultValue="post" maxLength={60} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="internalTitle">Título interno</Label>
          <Input id="internalTitle" name="internalTitle" maxLength={200} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="text">Texto</Label>
          <Textarea id="text" name="text" required rows={5} maxLength={10_000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hashtags">Hashtags (separados por coma)</Label>
          <Input id="hashtags" name="hashtags" maxLength={500} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cta">CTA</Label>
          <Input id="cta" name="cta" maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="link">Enlace</Label>
          <Input id="link" name="link" type="url" placeholder="https://" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheduledAt">Fecha programada</Label>
          <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={2} maxLength={2000} />
        </div>
      </div>

      <p className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
        Esto guarda la publicación en la plataforma. La publicación real en la red social solo estará disponible
        cuando conectes una integración oficial para esa plataforma en Redes sociales → Integraciones (no
        implementado en esta versión) — hasta entonces siempre podrás copiar el texto y programarla manualmente.
      </p>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar publicación"}
      </Button>
    </form>
  );
}

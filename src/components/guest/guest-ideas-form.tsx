"use client";

import { useActionState, useEffect } from "react";
import { generateGuestSocialIdeasAction } from "@/server/actions/guest";
import { socialPlatformValues } from "@/lib/validation/social";
import { useGuestDrafts, GuestDraftsPanel } from "@/components/guest/guest-drafts-panel";
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

export function GuestIdeasForm() {
  const [state, formAction, isPending] = useActionState(generateGuestSocialIdeasAction, {});
  const { drafts, addDraft, removeDraft } = useGuestDrafts("ideas");

  useEffect(() => {
    if (state.text && state.title) addDraft(state.title, state.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.text]);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="platform">Plataforma</Label>
            <Select name="platform" defaultValue="INSTAGRAM">
              <SelectTrigger id="platform" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {socialPlatformValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="count">Número de ideas</Label>
            <Input id="count" name="count" type="number" min={1} max={10} defaultValue={5} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="topic">Tema</Label>
            <Textarea id="topic" name="topic" required rows={2} maxLength={1000} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tone">Tono</Label>
            <Input id="tone" name="tone" defaultValue="Cercano y profesional" maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Idioma</Label>
            <Input id="language" name="language" defaultValue="es" maxLength={10} />
          </div>
        </div>

        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Generando..." : "Generar ideas"}
        </Button>
      </form>

      {state.text ? (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="whitespace-pre-wrap text-sm">{state.text}</p>
        </div>
      ) : null}

      <GuestDraftsPanel drafts={drafts} onDelete={removeDraft} />
    </div>
  );
}

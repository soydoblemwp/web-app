"use client";

import { useActionState, useEffect } from "react";
import { generateGuestContentAdaptationAction } from "@/server/actions/guest";
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

export function GuestAdapterForm() {
  const [state, formAction, isPending] = useActionState(generateGuestContentAdaptationAction, {});
  const { drafts, addDraft, removeDraft } = useGuestDrafts("adapter");

  useEffect(() => {
    if (state.text && state.title) addDraft(state.title, state.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.text]);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="originalContent">Contenido original</Label>
          <Textarea
            id="originalContent"
            name="originalContent"
            required
            rows={8}
            maxLength={8000}
            placeholder="Pega aquí el artículo, guion o publicación que quieres adaptar"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="targetPlatform">Plataforma de destino</Label>
            <Select name="targetPlatform" defaultValue="INSTAGRAM">
              <SelectTrigger id="targetPlatform" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {socialPlatformValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
                <SelectItem value="SHORT_SCRIPT">Guion corto (TikTok/Shorts)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tone">Tono</Label>
            <Input id="tone" name="tone" defaultValue="Igual que el original" maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Idioma</Label>
            <Input id="language" name="language" defaultValue="es" maxLength={10} />
          </div>
        </div>

        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adaptando..." : "Adaptar contenido"}
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

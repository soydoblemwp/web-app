"use client";

import { useActionState, useEffect } from "react";
import { generateGuestReplyAction } from "@/server/actions/guest";
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

export function GuestReplyForm() {
  const [state, formAction, isPending] = useActionState(generateGuestReplyAction, {});
  const { drafts, addDraft, removeDraft } = useGuestDrafts("replies");

  useEffect(() => {
    if (state.text && state.title) addDraft(state.title, state.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.text]);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="context">Mensaje a responder</Label>
          <Textarea id="context" name="context" required rows={4} maxLength={4000} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="replyType">Tipo de mensaje</Label>
            <Select name="replyType" defaultValue="Comentario positivo">
              <SelectTrigger id="replyType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Comentario positivo">Comentario positivo</SelectItem>
                <SelectItem value="Pregunta">Pregunta</SelectItem>
                <SelectItem value="Queja">Queja</SelectItem>
                <SelectItem value="Solicitud de colaboración">Solicitud de colaboración</SelectItem>
                <SelectItem value="Pregunta sobre producto">Pregunta sobre producto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform">Plataforma</Label>
            <Input id="platform" name="platform" defaultValue="Instagram" maxLength={60} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tone">Tono</Label>
            <Input id="tone" name="tone" defaultValue="Cercano y profesional" maxLength={200} />
          </div>
        </div>
        <input type="hidden" name="language" value="es" />

        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Generando..." : "Generar respuesta"}
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

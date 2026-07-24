"use client";

import { useState } from "react";
import { buildReplyPrompt, buildReplySystemPrompt } from "@/lib/ai/prompts/reply";
import { saveGeneratedReplyAction } from "@/server/actions/reply";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
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

export function GenerateReplyForm({
  projectId,
  brandContextText,
}: {
  projectId: string;
  brandContextText: string;
}) {
  const ai = useLocalAI();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = ai.status === "loading" || ai.status === "generating" || saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const context = String(formData.get("context") ?? "").trim();
    if (!context) return setFormError("Pega el mensaje al que quieres responder.");
    if (context.length > 4000) return setFormError("El mensaje es demasiado largo.");

    const platform = String(formData.get("platform") ?? "General");
    const replyType = String(formData.get("replyType") ?? "Comentario");
    const tone = String(formData.get("tone") ?? "Cercano y profesional");
    const language = String(formData.get("language") ?? "es");

    const system = buildReplySystemPrompt(brandContextText);
    const prompt = buildReplyPrompt({ context, replyType, platform, tone, language });

    const text = await ai.generate({ system, prompt });
    if (!text) return;

    setSaving(true);
    const result = await saveGeneratedReplyAction({ projectId, context, platform, body: text, language });
    setSaving(false);
    if (result?.error) setFormError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      <LocalAIStatusPanel ai={ai} />
      <Button type="submit" disabled={busy}>
        {saving ? "Guardando..." : busy ? "Generando..." : "Generar respuesta"}
      </Button>
      <p className="text-xs text-muted-foreground">
        La respuesta se guarda como borrador en la biblioteca de contenido. Nunca se envía automáticamente.
      </p>
    </form>
  );
}

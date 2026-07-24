"use client";

import { useState } from "react";
import { contentTypeValues } from "@/lib/validation/content";
import { buildContentGenerationPrompt, buildContentGenerationSystemPrompt } from "@/lib/ai/prompts/content";
import { GUEST_CONTEXT_NOTE } from "@/lib/ai/prompts/guest";
import { useGuestDrafts, GuestDraftsPanel } from "@/components/guest/guest-drafts-panel";
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
import type { ContentType } from "@/generated/prisma/enums";

const TYPE_LABELS: Record<string, string> = {
  ARTICLE: "Artículo",
  BLOG_POST: "Entrada de blog",
  PRODUCT_DESCRIPTION: "Descripción de producto",
  EMAIL: "Correo electrónico",
  NEWSLETTER: "Boletín",
  VIDEO_SCRIPT: "Guion de video",
  AD: "Anuncio",
  LANDING_PAGE: "Página de venta",
  SERVICE_DESCRIPTION: "Descripción de servicio",
  FAQ: "Preguntas frecuentes",
  CALL_TO_ACTION: "Llamado a la acción",
  SOCIAL_TEXT: "Texto para redes sociales",
  TITLE: "Título",
  INTRO: "Introducción",
  CONCLUSION: "Conclusión",
  SUMMARY: "Resumen",
  OTHER: "Otro",
};

export function GuestContentForm() {
  const ai = useLocalAI();
  const { drafts, addDraft, removeDraft } = useGuestDrafts("content");
  const [result, setResult] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const busy = ai.status === "loading" || ai.status === "generating";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const topic = String(formData.get("topic") ?? "").trim();
    if (!topic) return setFormError("Describe el tema del contenido.");
    if (topic.length > 2000) return setFormError("El tema es demasiado largo.");

    const type = String(formData.get("type") ?? "BLOG_POST") as ContentType;
    const language = String(formData.get("language") ?? "es").trim() || "es";

    const system = buildContentGenerationSystemPrompt(GUEST_CONTEXT_NOTE);
    const prompt = buildContentGenerationPrompt({
      projectId: "guest",
      type,
      topic,
      objective: String(formData.get("objective") ?? ""),
      audience: String(formData.get("audience") ?? ""),
      tone: String(formData.get("tone") ?? ""),
      language,
      keywords: String(formData.get("keywords") ?? ""),
      forbiddenWords: String(formData.get("forbiddenWords") ?? ""),
      cta: String(formData.get("cta") ?? ""),
      useBrandKit: false,
    });

    const text = await ai.generate({ system, prompt });
    if (text) {
      setResult(text);
      addDraft(topic, text);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="type">Tipo de contenido</Label>
            <Select name="type" defaultValue="BLOG_POST">
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contentTypeValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {TYPE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Idioma</Label>
            <Input id="language" name="language" defaultValue="es" maxLength={10} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="topic">Tema</Label>
            <Textarea id="topic" name="topic" required rows={2} maxLength={2000} placeholder="Sobre qué debe tratar el contenido" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="objective">Objetivo</Label>
            <Input id="objective" name="objective" maxLength={500} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audience">Audiencia</Label>
            <Input id="audience" name="audience" maxLength={300} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tone">Tono</Label>
            <Input id="tone" name="tone" maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta">Llamado a la acción</Label>
            <Input id="cta" name="cta" maxLength={300} />
          </div>
        </div>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <LocalAIStatusPanel ai={ai} />
        <Button type="submit" disabled={busy}>
          {busy ? "Generando..." : "Generar con IA"}
        </Button>
      </form>

      {result ? (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="whitespace-pre-wrap text-sm">{result}</p>
        </div>
      ) : null}

      <GuestDraftsPanel drafts={drafts} onDelete={removeDraft} />
    </div>
  );
}

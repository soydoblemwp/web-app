"use client";

import { useState } from "react";
import { socialPlatformValues } from "@/lib/validation/social";
import { buildContentAdapterPrompt, buildContentAdapterSystemPrompt } from "@/lib/ai/prompts/guest";
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

export function GuestAdapterForm() {
  const ai = useLocalAI();
  const { drafts, addDraft, removeDraft } = useGuestDrafts("adapter");
  const [result, setResult] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const busy = ai.status === "loading" || ai.status === "generating";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const originalContent = String(formData.get("originalContent") ?? "").trim();
    if (!originalContent) return setFormError("Pega el contenido original a adaptar.");
    if (originalContent.length > 8000) return setFormError("El contenido original es demasiado largo.");

    const targetPlatform = String(formData.get("targetPlatform") ?? "Instagram");

    const system = buildContentAdapterSystemPrompt();
    const prompt = buildContentAdapterPrompt({
      originalContent,
      targetPlatform,
      tone: String(formData.get("tone") ?? "Igual que el original"),
      language: String(formData.get("language") ?? "es").trim() || "es",
    });

    const text = await ai.generate({ system, prompt });
    if (text) {
      setResult(text);
      addDraft(`Adaptado para ${targetPlatform}`, text);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
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

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <LocalAIStatusPanel ai={ai} />
        <Button type="submit" disabled={busy}>
          {busy ? "Adaptando..." : "Adaptar contenido"}
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

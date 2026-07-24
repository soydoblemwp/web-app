"use client";

import { useState } from "react";
import { socialPlatformValues } from "@/lib/validation/social";
import { buildSocialIdeasPrompt, buildSocialIdeasSystemPrompt } from "@/lib/ai/prompts/guest";
import { saveGeneratedSocialIdeasAction } from "@/server/actions/content";
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

export function GenerateSocialIdeasForm({
  projectId,
  brandContextText,
}: {
  projectId: string;
  brandContextText: string;
}) {
  const ai = useLocalAI();
  const [result, setResult] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = ai.status === "loading" || ai.status === "generating" || saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const topic = String(formData.get("topic") ?? "").trim();
    if (!topic) return setFormError("Describe sobre qué quieres ideas.");
    if (topic.length > 1000) return setFormError("El tema es demasiado largo.");

    const countRaw = Number(formData.get("count") ?? 5);
    const count = Number.isFinite(countRaw) ? Math.min(Math.max(Math.round(countRaw), 1), 10) : 5;
    const platform = String(formData.get("platform") ?? "INSTAGRAM");
    const language = String(formData.get("language") ?? "es").trim() || "es";

    const system = buildSocialIdeasSystemPrompt(brandContextText);
    const prompt = buildSocialIdeasPrompt({
      topic,
      platform,
      tone: String(formData.get("tone") ?? "Cercano y profesional"),
      language,
      count,
    });

    const text = await ai.generate({ system, prompt });
    if (!text) return;

    setResult(text);
    setSaving(true);
    const saveResult = await saveGeneratedSocialIdeasAction({ projectId, topic, platform, body: text, language });
    setSaving(false);
    if (saveResult?.error) setFormError(saveResult.error);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
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

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <LocalAIStatusPanel ai={ai} />
        <Button type="submit" disabled={busy}>
          {saving ? "Guardando..." : busy ? "Generando..." : "Generar ideas"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Las ideas se guardan en la biblioteca de contenido del proyecto.
        </p>
      </form>

      {result ? (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="whitespace-pre-wrap text-sm">{result}</p>
        </div>
      ) : null}
    </div>
  );
}

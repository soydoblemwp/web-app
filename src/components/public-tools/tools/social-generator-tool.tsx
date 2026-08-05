"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { validateAiTextOutput } from "@/lib/public-tools/ai-output-validation";
import { parseLabeledSections } from "@/lib/public-tools/prompts/parse-list";
import { deriveHashtagsFromText, filterHashtagsToContent, parseHashtagLine } from "@/lib/public-tools/hashtags";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_GENERATOR_SECTION_LABELS,
  buildSocialGeneratorSystemPrompt,
  buildSocialGeneratorPrompt,
  type SocialGeneratorInput,
  type SocialPlatform,
} from "@/lib/public-tools/prompts/social-generator";

interface GeneratedSocialContent {
  mainText: string;
  hook: string;
  cta: string;
  hashtags: string[];
  shortVersion: string;
  alternativeVersion: string;
}

export function SocialGeneratorTool() {
  const ai = useLocalAI();
  const [input, setInput] = useState<SocialGeneratorInput>({
    platform: "instagram",
    topic: "",
    goal: "",
    audience: "",
    tone: "cercano",
    length: "media",
    hashtagCount: 5,
    mustInclude: "",
  });
  const [result, setResult] = useState<GeneratedSocialContent | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function set<K extends keyof SocialGeneratorInput>(key: K, value: SocialGeneratorInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function handleGenerate() {
    if (!input.topic.trim()) return;
    setWarning(null);

    const output = await ai.generate({
      system: buildSocialGeneratorSystemPrompt(input),
      prompt: buildSocialGeneratorPrompt(input),
      maxTokens: 900,
    });
    const validation = validateAiTextOutput(output);
    if (!validation.ok || !output) {
      setWarning(validation.warning ?? null);
      return;
    }

    const sections = parseLabeledSections(output, SOCIAL_GENERATOR_SECTION_LABELS);
    const rawHashtags = sections.HASHTAGS ? parseHashtagLine(sections.HASHTAGS) : [];
    const contentForFiltering = `${input.topic} ${sections.TEXTO_PRINCIPAL ?? ""}`;
    let hashtags = filterHashtagsToContent(rawHashtags, contentForFiltering);
    if (hashtags.length === 0) hashtags = deriveHashtagsFromText(contentForFiltering, input.hashtagCount);

    setResult({
      mainText: sections.TEXTO_PRINCIPAL ?? output,
      hook: sections.GANCHO ?? "",
      cta: sections.CTA ?? "",
      hashtags: hashtags.slice(0, input.hashtagCount),
      shortVersion: sections.VERSION_CORTA ?? "",
      alternativeVersion: sections.VERSION_ALTERNATIVA ?? "",
    });
    setWarning(validation.warning ?? null);
  }

  function handleReset() {
    setInput({ platform: "instagram", topic: "", goal: "", audience: "", tone: "cercano", length: "media", hashtagCount: 5, mustInclude: "" });
    setResult(null);
    setWarning(null);
  }

  const fullText = result
    ? [
        `Gancho: ${result.hook}`,
        "",
        result.mainText,
        "",
        `CTA: ${result.cta}`,
        "",
        result.hashtags.join(" "),
      ].join("\n")
    : "";

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Plataforma" className="flex flex-wrap gap-2">
        {SOCIAL_PLATFORMS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={input.platform === p.id ? "default" : "outline"}
            aria-pressed={input.platform === p.id}
            onClick={() => set("platform", p.id as SocialPlatform)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div>
        <Label htmlFor="social-topic" className="mb-1">
          Tema
        </Label>
        <Textarea id="social-topic" value={input.topic} onChange={(e) => set("topic", e.target.value)} placeholder="Describe de qué trata la publicación..." className="min-h-20" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="social-goal" className="mb-1">
            Objetivo
          </Label>
          <Input id="social-goal" value={input.goal} onChange={(e) => set("goal", e.target.value)} placeholder="Ej. generar comentarios" />
        </div>
        <div>
          <Label htmlFor="social-audience" className="mb-1">
            Público
          </Label>
          <Input id="social-audience" value={input.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Ej. emprendedores" />
        </div>
        <div>
          <Label htmlFor="social-tone" className="mb-1">
            Tono
          </Label>
          <Input id="social-tone" value={input.tone} onChange={(e) => set("tone", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="social-length" className="mb-1">
            Longitud
          </Label>
          <Input id="social-length" value={input.length} onChange={(e) => set("length", e.target.value)} placeholder="corta, media, larga" />
        </div>
        <div>
          <Label htmlFor="social-hashtag-count" className="mb-1">
            Cantidad de hashtags
          </Label>
          <Input id="social-hashtag-count" type="number" min={0} max={15} value={input.hashtagCount} onChange={(e) => set("hashtagCount", Number(e.target.value) || 0)} />
        </div>
        <div>
          <Label htmlFor="social-must-include" className="mb-1">
            Información obligatoria (opcional)
          </Label>
          <Input id="social-must-include" value={input.mustInclude ?? ""} onChange={(e) => set("mustInclude", e.target.value)} />
        </div>
      </div>

      <LocalAIStatusPanel ai={ai} />

      {warning ? (
        <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleGenerate} disabled={!input.topic.trim() || ai.status === "loading" || ai.status === "generating"}>
          <Share2 className="size-3.5" /> Generar
        </Button>
        {result ? (
          <Button type="button" variant="outline" onClick={handleGenerate}>
            Regenerar
          </Button>
        ) : null}
        <ResetButton onReset={handleReset} />
      </div>

      {result ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Gancho</p>
            <p className="text-sm">{result.hook}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Texto principal</p>
            <p className="whitespace-pre-wrap text-sm">{result.mainText}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Llamada a la acción</p>
            <p className="text-sm">{result.cta}</p>
          </div>
          {result.hashtags.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Hashtags</p>
              <p className="text-sm">{result.hashtags.join(" ")}</p>
            </div>
          ) : null}
          {result.shortVersion ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Versión corta</p>
              <p className="whitespace-pre-wrap text-sm">{result.shortVersion}</p>
            </div>
          ) : null}
          {result.alternativeVersion ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Versión alternativa</p>
              <p className="whitespace-pre-wrap text-sm">{result.alternativeVersion}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <CopyButton text={fullText} label="Copiar todo" />
            <DownloadButton content={fullText} filename="contenido-redes-sociales.txt" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

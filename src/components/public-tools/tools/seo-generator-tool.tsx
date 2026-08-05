"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { validateAiTextOutput } from "@/lib/public-tools/ai-output-validation";
import { parseNumberedList } from "@/lib/public-tools/prompts/parse-list";
import {
  buildSeoTitlesSystemPrompt,
  buildSeoTitlesPrompt,
  buildSeoMetaDescriptionsSystemPrompt,
  buildSeoMetaDescriptionsPrompt,
  slugifyTopic,
  type SeoGeneratorInput,
} from "@/lib/public-tools/prompts/seo-generator";

const TITLE_MAX = 60;
const META_MIN = 140;
const META_MAX = 160;

function ResultRow({ text, warning }: { text: string; warning?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{text}</p>
        <p className={warning ? "mt-1 text-xs text-amber-600 dark:text-amber-400" : "mt-1 text-xs text-muted-foreground"}>
          {text.length} caracteres{warning ? ` · ${warning}` : ""}
        </p>
      </div>
      <CopyButton text={text} label="Copiar" />
    </div>
  );
}

export function SeoGeneratorTool() {
  const ai = useLocalAI();
  const [input, setInput] = useState<SeoGeneratorInput>({ topic: "", keyword: "", intent: "informativa", audience: "", tone: "profesional", brand: "" });
  const [titles, setTitles] = useState<string[]>([]);
  const [metaDescriptions, setMetaDescriptions] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const slug = slugifyTopic(input.topic, input.keyword);

  function set<K extends keyof SeoGeneratorInput>(key: K, value: SeoGeneratorInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function handleGenerate() {
    if (!input.topic.trim() || !input.keyword.trim()) return;
    setWarning(null);

    const titlesOutput = await ai.generate({ system: buildSeoTitlesSystemPrompt(input), prompt: buildSeoTitlesPrompt(input), maxTokens: 400 });
    const titlesValidation = validateAiTextOutput(titlesOutput);
    if (titlesValidation.ok && titlesOutput) setTitles(parseNumberedList(titlesOutput));
    else setWarning(titlesValidation.warning ?? null);

    const metaOutput = await ai.generate({ system: buildSeoMetaDescriptionsSystemPrompt(input), prompt: buildSeoMetaDescriptionsPrompt(input), maxTokens: 500 });
    const metaValidation = validateAiTextOutput(metaOutput);
    if (metaValidation.ok && metaOutput) setMetaDescriptions(parseNumberedList(metaOutput));
    else setWarning((prev) => prev ?? metaValidation.warning ?? null);
  }

  function handleReset() {
    setInput({ topic: "", keyword: "", intent: "informativa", audience: "", tone: "profesional", brand: "" });
    setTitles([]);
    setMetaDescriptions([]);
    setWarning(null);
  }

  const allResultsText = [
    "Títulos:",
    ...titles.map((t) => `- ${t}`),
    "",
    "Metadescripciones:",
    ...metaDescriptions.map((m) => `- ${m}`),
    "",
    `Slug sugerido: ${slug}`,
  ].join("\n");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="seo-topic" className="mb-1">
            Tema
          </Label>
          <Input id="seo-topic" value={input.topic} onChange={(e) => set("topic", e.target.value)} placeholder="Ej. cómo elegir un CRM para pymes" />
        </div>
        <div>
          <Label htmlFor="seo-keyword" className="mb-1">
            Palabra clave principal
          </Label>
          <Input id="seo-keyword" value={input.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="Ej. crm para pymes" />
        </div>
        <div>
          <Label htmlFor="seo-intent" className="mb-1">
            Intención de búsqueda
          </Label>
          <Input id="seo-intent" value={input.intent} onChange={(e) => set("intent", e.target.value)} placeholder="informativa, transaccional..." />
        </div>
        <div>
          <Label htmlFor="seo-audience" className="mb-1">
            Audiencia
          </Label>
          <Input id="seo-audience" value={input.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Ej. pequeñas empresas" />
        </div>
        <div>
          <Label htmlFor="seo-tone" className="mb-1">
            Tono
          </Label>
          <Input id="seo-tone" value={input.tone} onChange={(e) => set("tone", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="seo-brand" className="mb-1">
            Marca (opcional)
          </Label>
          <Input id="seo-brand" value={input.brand ?? ""} onChange={(e) => set("brand", e.target.value)} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Slug sugerido: <code className="rounded bg-muted px-1.5 py-0.5">{slug || "—"}</code>
      </p>

      <LocalAIStatusPanel ai={ai} />

      {warning ? (
        <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={!input.topic.trim() || !input.keyword.trim() || ai.status === "loading" || ai.status === "generating"}
        >
          <Search className="size-3.5" /> Generar títulos y metadescripciones
        </Button>
        {(titles.length > 0 || metaDescriptions.length > 0) ? (
          <Button type="button" variant="outline" onClick={handleGenerate}>
            Regenerar
          </Button>
        ) : null}
        <ResetButton onReset={handleReset} />
      </div>

      {titles.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">Títulos SEO (orientativo: hasta {TITLE_MAX} caracteres)</h3>
          <div className="space-y-2">
            {titles.map((title, i) => (
              <ResultRow key={i} text={title} warning={title.length > TITLE_MAX ? "supera la longitud orientativa" : undefined} />
            ))}
          </div>
        </div>
      ) : null}

      {metaDescriptions.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">
            Metadescripciones (orientativo: {META_MIN}-{META_MAX} caracteres)
          </h3>
          <div className="space-y-2">
            {metaDescriptions.map((meta, i) => (
              <ResultRow key={i} text={meta} warning={meta.length < META_MIN || meta.length > META_MAX ? "fuera del rango orientativo" : undefined} />
            ))}
          </div>
        </div>
      ) : null}

      {titles.length > 0 || metaDescriptions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <CopyButton text={allResultsText} label="Copiar todo" />
          <DownloadButton content={allResultsText} filename="titulos-y-meta-descripciones.txt" />
        </div>
      ) : null}
    </div>
  );
}

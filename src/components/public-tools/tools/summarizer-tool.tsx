"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileText } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { validateAiTextOutput } from "@/lib/public-tools/ai-output-validation";
import { extractiveSummary, extractKeyPoints, type SummaryMethod } from "@/lib/public-tools/extractive-summary";
import { SUMMARY_MODES, buildSummarizerSystemPrompt, buildSummarizerPrompt, type SummaryMode } from "@/lib/public-tools/prompts/summarizer";
import { isWebGPUSupported } from "@/lib/ai/local/engine";

const MAX_INPUT_LENGTH = 12000;

function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
}

export function SummarizerTool() {
  const ai = useLocalAI();
  const [sourceText, setSourceText] = useState("");
  const [mode, setMode] = useState<SummaryMode>("breve");
  const [maxPoints, setMaxPoints] = useState(5);
  const [preserveNumbers, setPreserveNumbers] = useState(true);
  const [preserveNames, setPreserveNames] = useState(true);
  const [includeConclusion, setIncludeConclusion] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [method, setMethod] = useState<SummaryMethod | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const webGpuSupported = isWebGPUSupported();

  async function handleGenerate() {
    if (!sourceText.trim()) return;
    setWarning(null);

    if (webGpuSupported) {
      const options = { mode, maxPoints, preserveNumbers, preserveNames, includeConclusion };
      const output = await ai.generate({
        system: buildSummarizerSystemPrompt(options),
        prompt: buildSummarizerPrompt(sourceText, mode, maxPoints),
        maxTokens: 800,
      });
      if (output) {
        const validation = validateAiTextOutput(output, { preserveNumbers, sourceText });
        if (validation.ok) {
          setResult(output);
          setMethod("local-ai");
          setWarning(validation.warning ?? null);
          return;
        }
        setWarning(validation.warning ?? null);
        return;
      }
      if (ai.status !== "unsupported") return;
    }

    const fallback =
      mode === "puntos" || mode === "acciones"
        ? extractKeyPoints(sourceText, maxPoints).map((s, i) => `${i + 1}. ${s}`).join("\n")
        : extractiveSummary(sourceText, mode === "breve" ? 3 : 6).summary;
    setResult(fallback || null);
    setMethod("extractive");
  }

  function handleReset() {
    setSourceText("");
    setResult(null);
    setMethod(null);
    setWarning(null);
  }

  const originalWords = wordCount(sourceText);
  const resultWords = result ? wordCount(result) : 0;
  const reduction = originalWords > 0 && result ? Math.round((1 - resultWords / originalWords) * 100) : null;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="summarizer-input" className="mb-1 block text-sm font-medium">
          Texto a resumir
        </label>
        <Textarea
          id="summarizer-input"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value.slice(0, MAX_INPUT_LENGTH))}
          placeholder="Pega el texto que quieres resumir..."
          className="min-h-40"
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Modo de resumen</p>
        <div role="group" aria-label="Modo" className="flex flex-wrap gap-2">
          {SUMMARY_MODES.map((m) => (
            <Button key={m.id} type="button" size="sm" variant={mode === m.id ? "default" : "outline"} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {(mode === "puntos" || mode === "acciones") && (
          <div className="w-32">
            <Label htmlFor="max-points" className="mb-1">
              Máx. de puntos
            </Label>
            <Input id="max-points" type="number" min={1} max={15} value={maxPoints} onChange={(e) => setMaxPoints(Number(e.target.value) || 5)} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <Checkbox id="sum-preserve-numbers" checked={preserveNumbers} onCheckedChange={() => setPreserveNumbers((v) => !v)} />
          <Label htmlFor="sum-preserve-numbers" className="text-sm font-normal">
            Conservar cifras
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="sum-preserve-names" checked={preserveNames} onCheckedChange={() => setPreserveNames((v) => !v)} />
          <Label htmlFor="sum-preserve-names" className="text-sm font-normal">
            Conservar nombres
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="sum-conclusion" checked={includeConclusion} onCheckedChange={() => setIncludeConclusion((v) => !v)} />
          <Label htmlFor="sum-conclusion" className="text-sm font-normal">
            Incluir conclusión
          </Label>
        </div>
      </div>

      {webGpuSupported ? <LocalAIStatusPanel ai={ai} /> : (
        <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Tu navegador no admite la IA local; se usará automáticamente un resumen extractivo determinista (selecciona las oraciones más relevantes del propio texto).
        </p>
      )}

      {warning ? (
        <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleGenerate} disabled={!sourceText.trim() || ai.status === "loading" || ai.status === "generating"}>
          <FileText className="size-3.5" /> Resumir
        </Button>
        {result ? (
          <Button type="button" variant="outline" onClick={handleGenerate}>
            Regenerar
          </Button>
        ) : null}
        <ResetButton onReset={handleReset} />
      </div>

      {result ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">Resultado</h3>
            <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs">
              Método: {method === "local-ai" ? "IA local" : "Resumen extractivo (sin IA)"}
            </span>
          </div>
          <Textarea value={result} readOnly className="min-h-32" />
          {reduction !== null ? (
            <p className="text-xs text-muted-foreground">
              {originalWords} palabras originales → {resultWords} palabras ({reduction >= 0 ? `${reduction}% de reducción` : "más extenso que el original"})
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result} />
            <DownloadButton content={result} filename="resumen.txt" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

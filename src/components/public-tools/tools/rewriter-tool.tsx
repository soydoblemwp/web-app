"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Wand2 } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { validateAiTextOutput } from "@/lib/public-tools/ai-output-validation";
import { REWRITER_TONES, NATURALIZE_DISCLAIMER, buildRewriterSystemPrompt, buildRewriterPrompt, type RewriterTone } from "@/lib/public-tools/prompts/rewriter";

const MAX_INPUT_LENGTH = 8000;

export function RewriterTool() {
  const ai = useLocalAI();
  const [sourceText, setSourceText] = useState("");
  const [tone, setTone] = useState<RewriterTone>("claridad");
  const [preserveNames, setPreserveNames] = useState(true);
  const [preserveNumbers, setPreserveNumbers] = useState(true);
  const [preserveLinks, setPreserveLinks] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  async function handleGenerate() {
    if (!sourceText.trim()) return;
    setWarning(null);
    const options = { tone, preserveNames, preserveNumbers, preserveLinks };
    const output = await ai.generate({
      system: buildRewriterSystemPrompt(options),
      prompt: buildRewriterPrompt(sourceText, tone),
      maxTokens: 1200,
    });
    const validation = validateAiTextOutput(output, { preserveNumbers, sourceText });
    if (!validation.ok) {
      setWarning(validation.warning ?? null);
      return;
    }
    setResult(output);
    setWarning(validation.warning ?? null);
  }

  function handleReset() {
    setSourceText("");
    setResult(null);
    setWarning(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="rewriter-input" className="mb-1 block text-sm font-medium">
          Texto original
        </label>
        <Textarea
          id="rewriter-input"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value.slice(0, MAX_INPUT_LENGTH))}
          placeholder="Pega el texto que quieres reescribir..."
          className="min-h-40"
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Tono o tipo de cambio</p>
        <div role="group" aria-label="Tono" className="flex flex-wrap gap-2">
          {REWRITER_TONES.map((t) => (
            <Button key={t.id} type="button" size="sm" variant={tone === t.id ? "default" : "outline"} aria-pressed={tone === t.id} onClick={() => setTone(t.id)}>
              {t.label}
            </Button>
          ))}
        </div>
        {tone === "naturalizar" ? (
          <p className="mt-2 rounded-lg border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">{NATURALIZE_DISCLAIMER}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Checkbox id="preserve-names" checked={preserveNames} onCheckedChange={() => setPreserveNames((v) => !v)} />
          <Label htmlFor="preserve-names" className="text-sm font-normal">
            Conservar nombres
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="preserve-numbers" checked={preserveNumbers} onCheckedChange={() => setPreserveNumbers((v) => !v)} />
          <Label htmlFor="preserve-numbers" className="text-sm font-normal">
            Conservar cifras
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="preserve-links" checked={preserveLinks} onCheckedChange={() => setPreserveLinks((v) => !v)} />
          <Label htmlFor="preserve-links" className="text-sm font-normal">
            Conservar enlaces
          </Label>
        </div>
      </div>

      <LocalAIStatusPanel ai={ai} />

      {warning ? (
        <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleGenerate} disabled={!sourceText.trim() || ai.status === "loading" || ai.status === "generating"}>
          <Wand2 className="size-3.5" /> Reescribir
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Resultado</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowComparison((v) => !v)}>
              {showComparison ? "Ocultar comparación" : "Comparar con el original"}
            </Button>
          </div>
          {showComparison ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Original</p>
                <Textarea value={sourceText} readOnly className="min-h-40" />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Reescrito</p>
                <Textarea value={result} readOnly className="min-h-40" />
              </div>
            </div>
          ) : (
            <Textarea value={result} readOnly className="min-h-40" />
          )}
          <div className="flex flex-wrap gap-2">
            <CopyButton text={result} />
            <DownloadButton content={result} filename="texto-reescrito.txt" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

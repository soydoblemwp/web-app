"use client";

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SpellCheck } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { validateAiTextOutput } from "@/lib/public-tools/ai-output-validation";
import { applyDeterministicCorrections } from "@/lib/public-tools/deterministic-corrections";
import { buildCorrectorSystemPrompt, buildCorrectorPrompt } from "@/lib/public-tools/prompts/corrector";
import { diffWords, countChanges } from "@/lib/public-tools/text-diff";

const MAX_INPUT_LENGTH = 6000;
/** Above this length, skip the word-level diff render (O(n·m) LCS) to avoid a slow/heavy render — the corrected text is still shown, just without inline highlighting. */
const MAX_DIFF_LENGTH = 4000;

export function CorrectorTool() {
  const ai = useLocalAI();
  const [sourceText, setSourceText] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiAccepted, setAiAccepted] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const deterministic = useMemo(() => applyDeterministicCorrections(sourceText), [sourceText]);
  const currentText = aiAccepted && aiResult ? aiResult : deterministic.correctedText;

  const diffTokens = useMemo(() => {
    if (!aiResult || sourceText.length > MAX_DIFF_LENGTH) return null;
    return diffWords(deterministic.correctedText, aiResult);
  }, [aiResult, deterministic.correctedText, sourceText.length]);

  const changeCounts = diffTokens ? countChanges(diffTokens) : null;

  async function handleAdvancedCorrection() {
    if (!deterministic.correctedText.trim()) return;
    setWarning(null);
    const output = await ai.generate({
      system: buildCorrectorSystemPrompt(),
      prompt: buildCorrectorPrompt(deterministic.correctedText),
      maxTokens: 1200,
    });
    const validation = validateAiTextOutput(output, { sourceText: deterministic.correctedText });
    if (!validation.ok) {
      setWarning(validation.warning ?? null);
      return;
    }
    setAiResult(output);
    setAiAccepted(true);
    setWarning(validation.warning ?? null);
  }

  function handleReset() {
    setSourceText("");
    setAiResult(null);
    setAiAccepted(false);
    setWarning(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="corrector-input" className="mb-1 block text-sm font-medium">
          Texto a corregir
        </label>
        <Textarea
          id="corrector-input"
          value={sourceText}
          onChange={(e) => {
            setSourceText(e.target.value.slice(0, MAX_INPUT_LENGTH));
            setAiResult(null);
            setAiAccepted(false);
          }}
          placeholder="Pega el texto que quieres corregir..."
          className="min-h-40"
        />
      </div>

      {sourceText.trim() ? (
        <div aria-live="polite" className="rounded-lg border p-3 text-sm">
          {deterministic.changes.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {deterministic.changes.map((change) => (
                <li key={change.category}>{change.description}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No se detectaron espacios, puntuación o mayúsculas que corregir automáticamente.</p>
          )}
        </div>
      ) : null}

      <LocalAIStatusPanel ai={ai} />

      {warning ? (
        <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={handleAdvancedCorrection} disabled={!sourceText.trim() || ai.status === "loading" || ai.status === "generating"}>
          <SpellCheck className="size-3.5" /> Mejorar gramática y estilo con IA
        </Button>
        <ResetButton onReset={handleReset} />
      </div>

      {aiResult ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Corrección avanzada con IA</h3>
            {changeCounts ? (
              <span className="text-xs text-muted-foreground">
                {changeCounts.added + changeCounts.removed === 0 ? "Sin cambios detectados" : `${changeCounts.added} añadidos · ${changeCounts.removed} eliminados`}
              </span>
            ) : null}
          </div>
          {diffTokens ? (
            <p className="rounded-md bg-muted/30 p-2 text-sm leading-relaxed">
              {diffTokens.map((token, i) => {
                if (token.type === "equal") return <span key={i}>{token.text}</span>;
                if (token.type === "added")
                  return (
                    <ins key={i} className="rounded bg-emerald-500/15 text-emerald-700 no-underline dark:text-emerald-400">
                      {token.text}
                    </ins>
                  );
                return (
                  <del key={i} className="rounded bg-red-500/15 text-red-700 dark:text-red-400">
                    {token.text}
                  </del>
                );
              })}
            </p>
          ) : (
            <Textarea value={aiResult} readOnly className="min-h-32" />
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={aiAccepted ? "default" : "outline"} onClick={() => setAiAccepted(true)}>
              Aceptar cambios
            </Button>
            <Button type="button" size="sm" variant={!aiAccepted ? "default" : "outline"} onClick={() => setAiAccepted(false)}>
              Rechazar cambios
            </Button>
          </div>
        </div>
      ) : null}

      {sourceText.trim() ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Texto corregido</h3>
          <Textarea value={currentText} readOnly className="min-h-32" />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={currentText} />
            <DownloadButton content={currentText} filename="texto-corregido.txt" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Recycle } from "lucide-react";
import { useLocalAI } from "@/hooks/use-local-ai";
import { LocalAIStatusPanel } from "@/components/ai/local-ai-status";
import { CopyButton, DownloadButton } from "@/components/public-tools/copy-download-actions";
import { SaveToWorkspaceButton } from "@/components/public-tools/save-to-workspace-button";
import { validateAiTextOutput } from "@/lib/public-tools/ai-output-validation";
import {
  REPURPOSE_OUTPUTS,
  buildRepurposerSystemPrompt,
  buildRepurposerPrompt,
  type RepurposeOutput,
} from "@/lib/public-tools/prompts/repurposer";

const MAX_INPUT_LENGTH = 10000;

interface OutputResult {
  output: RepurposeOutput;
  text: string;
  editedText: string;
}

export function RepurposerTool() {
  const ai = useLocalAI();
  const [sourceText, setSourceText] = useState("");
  const [selectedOutputs, setSelectedOutputs] = useState<RepurposeOutput[]>(["instagram-post", "linkedin-post"]);
  const [results, setResults] = useState<OutputResult[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  function toggleOutput(output: RepurposeOutput) {
    setSelectedOutputs((prev) => (prev.includes(output) ? prev.filter((o) => o !== output) : [...prev, output]));
  }

  async function generateOne(output: RepurposeOutput): Promise<OutputResult | null> {
    const text = await ai.generate({
      system: buildRepurposerSystemPrompt(),
      prompt: buildRepurposerPrompt(sourceText, output),
      maxTokens: 700,
    });
    const validation = validateAiTextOutput(text);
    if (!validation.ok || !text) return null;
    return { output, text, editedText: text };
  }

  async function handleGenerateAll() {
    if (!sourceText.trim() || selectedOutputs.length === 0) return;
    setWarning(null);
    setIsGenerating(true);
    const generated: OutputResult[] = [];
    for (const output of selectedOutputs) {
      const result = await generateOne(output);
      if (result) generated.push(result);
    }
    setResults(generated);
    if (generated.length === 0) setWarning("No se pudo generar ninguna salida. Intenta de nuevo.");
    else if (generated.length < selectedOutputs.length) setWarning("Alguna de las salidas seleccionadas no se pudo generar; el resto se muestra abajo.");
    setIsGenerating(false);
  }

  async function handleRegenerateOne(output: RepurposeOutput) {
    const result = await generateOne(output);
    if (!result) return;
    setResults((prev) => prev.map((r) => (r.output === output ? result : r)));
  }

  function handleEdit(output: RepurposeOutput, value: string) {
    setResults((prev) => prev.map((r) => (r.output === output ? { ...r, editedText: value } : r)));
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="repurpose-input" className="mb-1 block text-sm font-medium">
          Contenido original
        </label>
        <Textarea
          id="repurpose-input"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value.slice(0, MAX_INPUT_LENGTH))}
          placeholder="Pega tu artículo, guion, publicación, notas o transcripción..."
          className="min-h-40"
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Formatos de salida</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {REPURPOSE_OUTPUTS.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <Checkbox id={`output-${o.id}`} checked={selectedOutputs.includes(o.id)} onCheckedChange={() => toggleOutput(o.id)} />
              <Label htmlFor={`output-${o.id}`} className="text-sm font-normal">
                {o.label}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>

      <LocalAIStatusPanel ai={ai} />

      {warning ? (
        <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ) : null}

      <Button type="button" onClick={handleGenerateAll} disabled={!sourceText.trim() || selectedOutputs.length === 0 || isGenerating || ai.status === "loading"}>
        <Recycle className="size-3.5" /> {isGenerating ? "Generando..." : "Generar formatos seleccionados"}
      </Button>

      {results.length > 0 ? (
        <div className="space-y-4">
          {results.map((result) => {
            const label = REPURPOSE_OUTPUTS.find((o) => o.id === result.output)?.label ?? result.output;
            return (
              <div key={result.output} className="space-y-2 rounded-lg border p-4">
                <h3 className="text-sm font-medium">{label}</h3>
                <Textarea value={result.editedText} onChange={(e) => handleEdit(result.output, e.target.value)} className="min-h-28" />
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton text={result.editedText} />
                  <DownloadButton content={result.editedText} filename={`${result.output}.txt`} />
                  <Button type="button" variant="outline" size="sm" onClick={() => handleRegenerateOne(result.output)}>
                    Regenerar
                  </Button>
                  <SaveToWorkspaceButton title={label} body={result.editedText} sourceTool="reutilizador-de-contenido" />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

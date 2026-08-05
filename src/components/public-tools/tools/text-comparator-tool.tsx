"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { diffLines, diffChars, diffJson, type DiffOptions } from "@/lib/public-tools/comparison/text-diff";
import { diffWords, countChanges } from "@/lib/public-tools/text-diff";
import { buildUnifiedDiff } from "@/lib/public-tools/comparison/unified-diff";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { COMPARISON_LIMITS } from "@/lib/public-tools/comparison/limits";

type Mode = "lines" | "words" | "chars" | "json";

export function TextComparatorTool() {
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [mode, setMode] = useState<Mode>("lines");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreEmptyLines, setIgnoreEmptyLines] = useState(false);
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computed, setComputed] = useState(false);

  function handleFileA(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (f.size > COMPARISON_LIMITS.maxFileBytes) {
      setError(`El archivo A supera el límite de ${(COMPARISON_LIMITS.maxFileBytes / 1024 / 1024).toFixed(0)} MB.`);
      return;
    }
    f.text().then(setTextA);
  }
  function handleFileB(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (f.size > COMPARISON_LIMITS.maxFileBytes) {
      setError(`El archivo B supera el límite de ${(COMPARISON_LIMITS.maxFileBytes / 1024 / 1024).toFixed(0)} MB.`);
      return;
    }
    f.text().then(setTextB);
  }

  function handleSwap() {
    setTextA(textB);
    setTextB(textA);
  }

  function handleReset() {
    setTextA("");
    setTextB("");
    setError(null);
    setComputed(false);
  }

  const options: DiffOptions = { ignoreCase, ignoreWhitespace, ignoreEmptyLines, normalizeLineEndings: true };

  let lineResult: ReturnType<typeof diffLines> | null = null;
  let wordTokens: ReturnType<typeof diffWords> | null = null;
  let charResult: ReturnType<typeof diffChars> | null = null;
  let computeError: string | null = null;

  if (computed) {
    if (mode === "lines") lineResult = diffLines(textA, textB, options);
    else if (mode === "json") lineResult = diffJson(textA, textB);
    else if (mode === "words") wordTokens = diffWords(textA, textB);
    else if (mode === "chars") charResult = diffChars(textA, textB);

    if (lineResult && !lineResult.ok) computeError = lineResult.error ?? "Error al comparar.";
    if (charResult && !charResult.ok) computeError = charResult.error ?? "Error al comparar.";
  }

  const unifiedDiff = lineResult?.ok && lineResult.lines ? buildUnifiedDiff(lineResult.lines, "texto-a.txt", "texto-b.txt") : "";
  const wordChangeCounts = wordTokens ? countChanges(wordTokens) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="diff-a" className="mb-1">
            Texto A
          </Label>
          <textarea id="diff-a" value={textA} onChange={(e) => setTextA(e.target.value)} rows={10} className="w-full rounded-md border p-2 font-mono text-xs" />
          <FileUploadZone accept=".txt,.md,.json,.csv,text/plain" onFilesSelected={handleFileA} label="o carga el archivo A" hint="" />
        </div>
        <div>
          <Label htmlFor="diff-b" className="mb-1">
            Texto B
          </Label>
          <textarea id="diff-b" value={textB} onChange={(e) => setTextB(e.target.value)} rows={10} className="w-full rounded-md border p-2 font-mono text-xs" />
          <FileUploadZone accept=".txt,.md,.json,.csv,text/plain" onFilesSelected={handleFileB} label="o carga el archivo B" hint="" />
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={handleSwap}>
        Intercambiar A y B
      </Button>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["lines", "Por líneas"],
            ["words", "Por palabras"],
            ["chars", "Por caracteres"],
            ["json", "JSON formateado"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
            {label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={ignoreCase} onCheckedChange={(c) => setIgnoreCase(Boolean(c))} />
          Ignorar mayúsculas
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={ignoreWhitespace} onCheckedChange={(c) => setIgnoreWhitespace(Boolean(c))} />
          Ignorar espacios
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={ignoreEmptyLines} onCheckedChange={(c) => setIgnoreEmptyLines(Boolean(c))} />
          Ignorar líneas vacías
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={showOnlyChanges} onCheckedChange={(c) => setShowOnlyChanges(Boolean(c))} />
          Mostrar solo cambios
        </label>
      </div>

      <Button type="button" onClick={() => setComputed(true)}>
        Comparar
      </Button>

      {error || computeError ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? computeError}
        </p>
      ) : null}

      {computed && mode === "lines" && lineResult?.ok ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <p>Líneas añadidas: {lineResult.linesAdded}</p>
            <p>Líneas eliminadas: {lineResult.linesRemoved}</p>
            <p>Similitud aproximada: {lineResult.similarityPercent}%</p>
          </div>
          <div className="max-h-96 overflow-auto rounded-md border font-mono text-xs">
            {lineResult.lines!
              .filter((l) => !showOnlyChanges || l.type !== "equal")
              .map((line, i) => (
                <div
                  key={i}
                  className={
                    line.type === "added"
                      ? "bg-green-50 pl-2 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                      : line.type === "removed"
                        ? "bg-red-50 pl-2 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                        : "pl-2 text-muted-foreground"
                  }
                >
                  {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
                  {line.text}
                </div>
              ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={unifiedDiff} label="Copiar diff unificado" />
            <Button type="button" variant="outline" size="sm" onClick={() => downloadTextFile("diff-unificado.txt", unifiedDiff)}>
              Descargar diff unificado
            </Button>
          </div>
        </div>
      ) : null}

      {computed && mode === "json" && lineResult && !lineResult.ok ? null : null}

      {computed && mode === "words" && wordTokens ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>Palabras añadidas: {wordChangeCounts?.added}</p>
            <p>Palabras eliminadas: {wordChangeCounts?.removed}</p>
          </div>
          <div className="max-h-96 overflow-auto rounded-md border p-2 text-sm leading-relaxed">
            {wordTokens
              .filter((t) => !showOnlyChanges || t.type !== "equal")
              .map((t, i) => (
                <span
                  key={i}
                  className={t.type === "added" ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" : t.type === "removed" ? "bg-red-100 text-red-800 line-through dark:bg-red-950/40 dark:text-red-300" : ""}
                >
                  {t.text}
                </span>
              ))}
          </div>
        </div>
      ) : null}

      {computed && mode === "chars" && charResult?.ok ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>Caracteres añadidos: {charResult.charsAdded}</p>
            <p>Caracteres eliminados: {charResult.charsRemoved}</p>
          </div>
          <div className="max-h-96 overflow-auto rounded-md border p-2 font-mono text-sm">
            {charResult.chars!
              .filter((t) => !showOnlyChanges || t.type !== "equal")
              .map((t, i) => (
                <span
                  key={i}
                  className={t.type === "added" ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" : t.type === "removed" ? "bg-red-100 text-red-800 line-through dark:bg-red-950/40 dark:text-red-300" : ""}
                >
                  {t.text}
                </span>
              ))}
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}

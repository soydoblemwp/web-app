"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { analyzeTitle } from "@/lib/public-tools/title-analyzer";

export function TitleAnalyzerTool() {
  const [title, setTitle] = useState("");
  const [keyword, setKeyword] = useState("");

  const analysis = useMemo(() => analyzeTitle(title, keyword), [title, keyword]);

  const report = title
    ? [
        `Título: ${title}`,
        `Longitud: ${analysis.length} caracteres, ${analysis.wordCount} palabras`,
        analysis.lengthWarning ?? "",
        analysis.keywordPresent === null ? "" : `Palabra clave presente: ${analysis.keywordPresent ? "sí" : "no"}`,
        analysis.repeatedWords.length > 0 ? `Palabras repetidas: ${analysis.repeatedWords.join(", ")}` : "Sin palabras repetidas",
        ...analysis.suggestions,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="title-input" className="mb-1">
          Título a analizar
        </Label>
        <Input id="title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Escribe el título o titular..." />
      </div>
      <div className="max-w-sm">
        <Label htmlFor="title-keyword" className="mb-1">
          Palabra clave principal (opcional)
        </Label>
        <Input id="title-keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Ej. marketing de contenidos" />
      </div>

      {title ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4 text-sm">
          <p>
            <strong>{analysis.length}</strong> caracteres · <strong>{analysis.wordCount}</strong> palabras
          </p>
          {analysis.lengthWarning ? <p className="text-muted-foreground">{analysis.lengthWarning}</p> : null}
          {analysis.keywordPresent !== null ? (
            <p className={analysis.keywordPresent ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
              {analysis.keywordPresent ? "✓ La palabra clave aparece en el título." : "⚠ La palabra clave no aparece en el título."}
            </p>
          ) : null}
          <p>
            {analysis.repeatedWords.length > 0 ? `Palabras repetidas: ${analysis.repeatedWords.join(", ")}` : "Sin palabras repetidas relevantes."}
          </p>
          <p className="text-muted-foreground">
            {[analysis.hasNumber && "incluye número", analysis.hasQuestionOrExclamation && "incluye pregunta o exclamación", analysis.hasBrackets && "incluye paréntesis/corchetes"]
              .filter(Boolean)
              .join(" · ") || "Sin números, preguntas ni paréntesis."}
          </p>
          {analysis.suggestions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {analysis.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={report} label="Copiar análisis" />
        <ResetButton
          onReset={() => {
            setTitle("");
            setKeyword("");
          }}
        />
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { analyzeText, analysisToTextReport, formatMinutes } from "@/lib/public-tools/word-counter";

const MAX_LENGTH = 200_000;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function WordCounterTool() {
  const [text, setText] = useState("");

  const analysis = useMemo(() => analyzeText(text), [text]);
  const report = useMemo(() => analysisToTextReport(analysis), [analysis]);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="word-counter-input" className="mb-1 block text-sm font-medium">
          Texto a analizar
        </label>
        <Textarea
          id="word-counter-input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="Pega o escribe tu texto aquí..."
          className="min-h-48"
          aria-describedby="word-counter-live"
        />
        {text.length >= MAX_LENGTH ? (
          <p className="mt-1 text-xs text-destructive">Se alcanzó el límite de {MAX_LENGTH.toLocaleString("es")} caracteres.</p>
        ) : null}
      </div>

      <div id="word-counter-live" aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Palabras" value={analysis.words} />
        <Stat label="Caracteres con espacios" value={analysis.charactersWithSpaces} />
        <Stat label="Caracteres sin espacios" value={analysis.charactersWithoutSpaces} />
        <Stat label="Oraciones" value={analysis.sentences} />
        <Stat label="Párrafos" value={analysis.paragraphs} />
        <Stat label="Líneas" value={analysis.lines} />
        <Stat label="Palabras únicas" value={analysis.uniqueWords} />
        <Stat label="Tiempo de lectura" value={formatMinutes(analysis.readingTimeMinutes)} />
        <Stat label="Lectura en voz alta" value={formatMinutes(analysis.speakingTimeMinutes)} />
        <Stat label="Long. media de palabra" value={`${analysis.averageWordLength.toFixed(1)} car.`} />
        <Stat label="Long. media de oración" value={`${analysis.averageSentenceLength.toFixed(1)} pal.`} />
      </div>

      {analysis.topWords.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">Palabras más frecuentes (sin palabras vacías)</h3>
          <div className="flex flex-wrap gap-2">
            {analysis.topWords.map((w) => (
              <span key={w.word} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                {w.word} · {w.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={report} label="Copiar análisis" />
        <DownloadButton content={report} filename="analisis-de-texto.txt" label="Descargar análisis" />
        <ResetButton onReset={() => setText("")} />
      </div>
    </div>
  );
}

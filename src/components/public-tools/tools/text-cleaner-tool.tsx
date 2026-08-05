"use client";

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { cleanText, DEFAULT_TEXT_CLEANER_OPTIONS, type TextCleanerOptions } from "@/lib/public-tools/text-cleaner";

const CASE_LABELS: Record<TextCleanerOptions["caseMode"], string> = {
  none: "Sin cambios",
  upper: "MAYÚSCULAS",
  lower: "minúsculas",
  sentence: "Tipo oración",
};

export function TextCleanerTool() {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<TextCleanerOptions>(DEFAULT_TEXT_CLEANER_OPTIONS);

  const cleaned = useMemo(() => cleanText(text, options), [text, options]);

  function toggle(key: keyof Omit<TextCleanerOptions, "caseMode">) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="text-cleaner-input" className="mb-1 block text-sm font-medium">
          Texto a limpiar
        </label>
        <Textarea
          id="text-cleaner-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pega el texto que quieres normalizar..."
          className="min-h-40"
        />
      </div>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">Limpiezas a aplicar</legend>
        {(
          [
            ["collapseSpaces", "Eliminar espacios repetidos"],
            ["collapseLineBreaks", "Corregir saltos de línea excesivos"],
            ["removeInvisibleChars", "Retirar formato invisible"],
            ["normalizeQuotes", "Normalizar comillas y guiones"],
            ["removeDuplicateLines", "Eliminar líneas duplicadas"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <Checkbox id={`opt-${key}`} checked={options[key]} onCheckedChange={() => toggle(key)} />
            <Label htmlFor={`opt-${key}`} className="text-sm font-normal">
              {label}
            </Label>
          </div>
        ))}
      </fieldset>

      <div className="max-w-xs">
        <label htmlFor="case-mode" className="mb-1 block text-sm font-medium">
          Convertir mayúsculas/minúsculas
        </label>
        <Select value={options.caseMode} onValueChange={(value) => setOptions((prev) => ({ ...prev, caseMode: value as TextCleanerOptions["caseMode"] }))}>
          <SelectTrigger id="case-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CASE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label htmlFor="text-cleaner-output" className="mb-1 block text-sm font-medium">
          Resultado
        </label>
        <Textarea id="text-cleaner-output" value={cleaned} readOnly className="min-h-40" aria-live="polite" />
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={cleaned} />
        <DownloadButton content={cleaned} filename="texto-limpio.txt" />
        <ResetButton onReset={() => setText("")} />
      </div>
    </div>
  );
}

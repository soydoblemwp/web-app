"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { calculatePercentage, type PercentageMode } from "@/lib/public-tools/utilities/percentages";
import { parseNumericInput } from "@/lib/public-tools/utilities/validation";

const MODES: { id: PercentageMode; label: string; aLabel: string; bLabel: string }[] = [
  { id: "percent-of", label: "¿Cuánto es X % de Y?", aLabel: "X (porcentaje)", bLabel: "Y" },
  { id: "what-percent", label: "X es qué porcentaje de Y", aLabel: "X", bLabel: "Y" },
  { id: "increase", label: "Aumento porcentual", aLabel: "Valor inicial", bLabel: "Valor final" },
  { id: "decrease", label: "Disminución porcentual", aLabel: "Valor inicial", bLabel: "Valor final" },
  { id: "change", label: "Cambio porcentual entre dos valores", aLabel: "Valor anterior", bLabel: "Valor nuevo" },
  { id: "add-percent", label: "Añadir un porcentaje", aLabel: "Base", bLabel: "Porcentaje a añadir" },
  { id: "subtract-percent", label: "Restar un porcentaje", aLabel: "Base", bLabel: "Porcentaje a restar" },
  { id: "discount", label: "Descuento", aLabel: "Precio original", bLabel: "% de descuento" },
  { id: "margin", label: "Margen", aLabel: "Precio de venta", bLabel: "Costo" },
  { id: "markup", label: "Markup", aLabel: "Precio de venta", bLabel: "Costo" },
];

export function PercentageCalculatorTool() {
  const [mode, setMode] = useState<PercentageMode>("percent-of");
  const [aRaw, setARaw] = useState("");
  const [bRaw, setBRaw] = useState("");

  const config = MODES.find((m) => m.id === mode)!;
  const parsedA = parseNumericInput(aRaw, config.aLabel);
  const parsedB = parseNumericInput(bRaw, config.bLabel);

  const canCompute = parsedA.ok && parsedB.ok;
  const result = canCompute ? calculatePercentage(mode, parsedA.value!, parsedB.value!) : null;

  const summary = result?.ok
    ? [`Modo: ${config.label}`, `Fórmula: ${result.formula}`, `Sustitución: ${result.substitution}`, `Resultado: ${result.result}`, result.extra?.savings !== undefined ? `Ahorro: ${result.extra.savings}` : null]
        .filter(Boolean)
        .join("\n")
    : "";

  function handleReset() {
    setARaw("");
    setBRaw("");
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="pct-mode" className="mb-1">
          Modo de cálculo
        </Label>
        <Select value={mode} onValueChange={(v) => setMode(v as PercentageMode)}>
          <SelectTrigger id="pct-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="pct-a" className="mb-1">
            {config.aLabel}
          </Label>
          <Input id="pct-a" value={aRaw} onChange={(e) => setARaw(e.target.value)} inputMode="decimal" />
          {aRaw && !parsedA.ok ? <p className="mt-1 text-xs text-destructive">{parsedA.error}</p> : null}
        </div>
        <div>
          <Label htmlFor="pct-b" className="mb-1">
            {config.bLabel}
          </Label>
          <Input id="pct-b" value={bRaw} onChange={(e) => setBRaw(e.target.value)} inputMode="decimal" />
          {bRaw && !parsedB.ok ? <p className="mt-1 text-xs text-destructive">{parsedB.error}</p> : null}
        </div>
      </div>

      {canCompute && result ? (
        result.ok ? (
          <div aria-live="polite" className="space-y-2 rounded-lg border p-4 text-sm">
            <p className="text-muted-foreground">{result.formula}</p>
            <p className="text-muted-foreground">{result.substitution}</p>
            <p className="flex items-center gap-2 text-base font-medium">
              Resultado: <code>{result.result}</code>
              <CopyButton text={String(result.result)} label="Copiar" />
            </p>
            {result.extra?.savings !== undefined ? <p>Ahorro: {result.extra.savings}</p> : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <DownloadButton content={summary} filename="calculo-porcentaje.txt" mimeType="text/plain" label="Descargar resumen" />
            </div>
          </div>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {result.error}
          </p>
        )
      ) : null}

      <p className="text-xs text-muted-foreground">Esta herramienta realiza cálculos matemáticos; no ofrece asesoría financiera.</p>

      <ResetButton onReset={handleReset} />
    </div>
  );
}

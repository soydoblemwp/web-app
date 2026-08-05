"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { calculateProjection, calculateSavingsGoal, type CompoundingFrequency, type ContributionFrequency, type ContributionTiming } from "@/lib/public-tools/finance/compound-interest";
import { formatMoney, toMinorUnits } from "@/lib/public-tools/finance/money";
import { parseNumericInput } from "@/lib/public-tools/utilities/validation";
import { buildCsv, downloadTextFile } from "@/lib/public-tools/csv-export";

type Mode = "projection" | "goal";

export function CompoundInterestCalculatorTool() {
  const [mode, setMode] = useState<Mode>("projection");
  const [initialRaw, setInitialRaw] = useState("1000");
  const [contributionRaw, setContributionRaw] = useState("100");
  const [contributionFrequency, setContributionFrequency] = useState<ContributionFrequency>("monthly");
  const [rateRaw, setRateRaw] = useState("5");
  const [compoundingFrequency, setCompoundingFrequency] = useState<CompoundingFrequency>("monthly");
  const [yearsRaw, setYearsRaw] = useState("10");
  const [timing, setTiming] = useState<ContributionTiming>("end");
  const [goalRaw, setGoalRaw] = useState("50000");
  const [inflationRaw, setInflationRaw] = useState("");
  const [inflationEnabled, setInflationEnabled] = useState(false);
  const [computed, setComputed] = useState(false);

  const initial = parseNumericInput(initialRaw, "El depósito inicial");
  const contribution = parseNumericInput(contributionRaw || "0", "La contribución");
  const rate = parseNumericInput(rateRaw, "La tasa anual");
  const years = parseNumericInput(yearsRaw, "La duración");
  const goal = parseNumericInput(goalRaw, "La meta");
  const inflation = inflationEnabled ? parseNumericInput(inflationRaw || "0", "La inflación") : { ok: true, value: undefined };

  const canCompute = initial.ok && contribution.ok && rate.ok && years.ok && (mode === "projection" || goal.ok) && inflation.ok;

  const projectionResult =
    mode === "projection" && canCompute
      ? calculateProjection({
          initialDeposit: initial.value!,
          contribution: contribution.value!,
          contributionFrequency,
          annualRatePercent: rate.value!,
          compoundingFrequency,
          years: years.value!,
          timing,
          annualInflationPercent: inflationEnabled ? inflation.value : undefined,
        })
      : null;

  const goalResult =
    mode === "goal" && canCompute
      ? calculateSavingsGoal({
          goal: goal.value!,
          initialDeposit: initial.value!,
          annualRatePercent: rate.value!,
          years: years.value!,
          compoundingFrequency,
          contributionFrequency,
          timing,
        })
      : null;

  function handleReset() {
    setInitialRaw("1000");
    setContributionRaw("100");
    setRateRaw("5");
    setYearsRaw("10");
    setGoalRaw("50000");
    setInflationRaw("");
    setInflationEnabled(false);
    setComputed(false);
  }

  const result = mode === "projection" ? projectionResult : goalResult;
  const csv =
    result?.ok && result.schedule
      ? buildCsv(
          ["Periodo", "Contribución", "Interés", "Saldo"],
          result.schedule.map((row) => [String(row.period), row.contribution.toFixed(2), row.interest.toFixed(2), row.balance.toFixed(2)])
        )
      : "";

  const summary =
    mode === "projection" && projectionResult?.ok
      ? [
          `Valor futuro: ${formatMoney(toMinorUnits(projectionResult.futureValue!))}`,
          `Aportaciones totales: ${formatMoney(toMinorUnits(projectionResult.totalContributions!))}`,
          `Interés generado: ${formatMoney(toMinorUnits(projectionResult.totalInterest!))}`,
          projectionResult.realFutureValue !== undefined ? `Valor futuro ajustado por inflación: ${formatMoney(toMinorUnits(projectionResult.realFutureValue))}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : goalResult?.ok
        ? [
            `Contribución periódica necesaria: ${formatMoney(toMinorUnits(goalResult.requiredContribution!))}`,
            `Aportaciones totales: ${formatMoney(toMinorUnits(goalResult.totalContributions!))}`,
            `Interés estimado: ${formatMoney(toMinorUnits(goalResult.totalInterest!))}`,
          ].join("\n")
        : "";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Los resultados son estimaciones matemáticas y no garantizan rendimientos futuros.
      </p>

      <div className="flex gap-2">
        <Button type="button" variant={mode === "projection" ? "default" : "outline"} size="sm" onClick={() => setMode("projection")}>
          Proyección
        </Button>
        <Button type="button" variant={mode === "goal" ? "default" : "outline"} size="sm" onClick={() => setMode("goal")}>
          Meta de ahorro
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ci-initial" className="mb-1">
            Depósito inicial
          </Label>
          <Input id="ci-initial" value={initialRaw} onChange={(e) => setInitialRaw(e.target.value)} inputMode="decimal" />
        </div>
        {mode === "goal" ? (
          <div>
            <Label htmlFor="ci-goal" className="mb-1">
              Meta de ahorro
            </Label>
            <Input id="ci-goal" value={goalRaw} onChange={(e) => setGoalRaw(e.target.value)} inputMode="decimal" />
          </div>
        ) : (
          <div>
            <Label htmlFor="ci-contribution" className="mb-1">
              Contribución periódica
            </Label>
            <Input id="ci-contribution" value={contributionRaw} onChange={(e) => setContributionRaw(e.target.value)} inputMode="decimal" />
          </div>
        )}
        <div>
          <Label htmlFor="ci-contribution-freq" className="mb-1">
            Frecuencia de contribución
          </Label>
          <Select value={contributionFrequency} onValueChange={(v) => setContributionFrequency(v as ContributionFrequency)}>
            <SelectTrigger id="ci-contribution-freq" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensual</SelectItem>
              <SelectItem value="quarterly">Trimestral</SelectItem>
              <SelectItem value="annually">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ci-rate" className="mb-1">
            Tasa anual (%)
          </Label>
          <Input id="ci-rate" value={rateRaw} onChange={(e) => setRateRaw(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label htmlFor="ci-compounding-freq" className="mb-1">
            Frecuencia de capitalización
          </Label>
          <Select value={compoundingFrequency} onValueChange={(v) => setCompoundingFrequency(v as CompoundingFrequency)}>
            <SelectTrigger id="ci-compounding-freq" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Diaria</SelectItem>
              <SelectItem value="monthly">Mensual</SelectItem>
              <SelectItem value="quarterly">Trimestral</SelectItem>
              <SelectItem value="annually">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ci-years" className="mb-1">
            Duración (años)
          </Label>
          <Input id="ci-years" value={yearsRaw} onChange={(e) => setYearsRaw(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label htmlFor="ci-timing" className="mb-1">
            Aportación al
          </Label>
          <Select value={timing} onValueChange={(v) => setTiming(v as ContributionTiming)}>
            <SelectTrigger id="ci-timing" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">Inicio del periodo</SelectItem>
              <SelectItem value="end">Final del periodo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === "projection" ? (
        <div className="flex items-center gap-2">
          <input id="ci-inflation-toggle" type="checkbox" checked={inflationEnabled} onChange={(e) => setInflationEnabled(e.target.checked)} />
          <Label htmlFor="ci-inflation-toggle">Ajustar por inflación (opcional)</Label>
          {inflationEnabled ? <Input value={inflationRaw} onChange={(e) => setInflationRaw(e.target.value)} inputMode="decimal" className="w-28" placeholder="% anual" /> : null}
        </div>
      ) : null}

      <Button type="button" onClick={() => setComputed(true)}>
        Calcular
      </Button>

      {computed && result && !result.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : null}

      {computed && result?.ok ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          {mode === "projection" && projectionResult?.ok ? (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                Valor futuro: <strong>{formatMoney(toMinorUnits(projectionResult.futureValue!))}</strong>
              </p>
              <p>Aportaciones totales: {formatMoney(toMinorUnits(projectionResult.totalContributions!))}</p>
              <p>Interés generado: {formatMoney(toMinorUnits(projectionResult.totalInterest!))}</p>
              {projectionResult.realFutureValue !== undefined ? <p>Valor futuro ajustado por inflación: {formatMoney(toMinorUnits(projectionResult.realFutureValue))}</p> : null}
            </div>
          ) : null}
          {mode === "goal" && goalResult?.ok ? (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                Contribución periódica necesaria: <strong>{formatMoney(toMinorUnits(goalResult.requiredContribution!))}</strong>
              </p>
              <p>Aportaciones totales: {formatMoney(toMinorUnits(goalResult.totalContributions!))}</p>
              <p>Interés estimado: {formatMoney(toMinorUnits(goalResult.totalInterest!))}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <CopyButton text={summary} label="Copiar resumen" />
            <DownloadButton content={summary} filename="resumen-interes-compuesto.txt" label="Descargar resumen" />
            <Button type="button" variant="outline" size="sm" onClick={() => downloadTextFile("tabla-interes-compuesto.csv", csv, "text/csv;charset=utf-8")}>
              Descargar tabla CSV
            </Button>
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}

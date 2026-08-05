"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import {
  parseIsoDateInput,
  calendarDateToIso,
  todayAsCalendarDate,
  calculateAge,
  calendarDiff,
  addCalendarTime,
  weekdayOf,
  monthNameOf,
  type Feb29Policy,
  type CalendarDate,
} from "@/lib/public-tools/utilities/dates";

type Mode = "age" | "diff" | "add" | "subtract" | "days-until" | "next-birthday";

const MODE_LABELS: Record<Mode, string> = {
  age: "Calcular edad",
  diff: "Diferencia entre dos fechas",
  add: "Sumar tiempo a una fecha",
  subtract: "Restar tiempo a una fecha",
  "days-until": "Días hasta una fecha",
  "next-birthday": "Próximo cumpleaños",
};

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1">
        {label}
      </Label>
      <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function AgeDateCalculatorTool() {
  const [mode, setMode] = useState<Mode>("age");
  const [dateA, setDateA] = useState("");
  const [dateB, setDateB] = useState("");
  const [feb29Policy, setFeb29Policy] = useState<Feb29Policy>("feb28");
  const [addYears, setAddYears] = useState(0);
  const [addMonths, setAddMonths] = useState(0);
  const [addDays, setAddDays] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>("");

  function fillDateWithToday(setter: (v: string) => void) {
    setter(calendarDateToIso(todayAsCalendarDate()));
  }

  function parse(raw: string, label: string): CalendarDate | null {
    const parsed = raw ? parseIsoDateInput(raw) : null;
    if (!parsed) {
      setError(`${label} no es una fecha válida.`);
      return null;
    }
    return parsed;
  }

  function handleCompute() {
    setError(null);
    setSummary("");

    if (mode === "age" || mode === "next-birthday") {
      const birth = parse(dateA, "La fecha de nacimiento");
      if (!birth) return;
      const asOf = dateB ? parse(dateB, "La fecha de referencia") : todayAsCalendarDate();
      if (!asOf) return;
      const age = calculateAge(birth, asOf, feb29Policy);
      const lines = [
        `Edad: ${age.diff.years} años, ${age.diff.months} meses, ${age.diff.days} días`,
        `Total en meses: ${age.diff.totalMonths}`,
        `Total en semanas: ${age.diff.totalWeeks}`,
        `Total en días: ${age.diff.totalDays}`,
        `Nació en ${weekdayOf(birth)}`,
        `Próximo cumpleaños: ${calendarDateToIso(age.nextBirthday)} (${age.isBirthdayToday ? "¡hoy!" : `en ${age.daysUntilNextBirthday} días`})`,
      ];
      setSummary(lines.join("\n"));
      return;
    }

    if (mode === "diff" || mode === "days-until") {
      const start = mode === "days-until" ? todayAsCalendarDate() : parse(dateA, "La fecha inicial");
      const end = mode === "days-until" ? parse(dateA, "La fecha objetivo") : parse(dateB, "La fecha final");
      if (!start || !end) return;
      const diff = calendarDiff(start, end);
      setSummary(
        [
          `${diff.negative ? "La fecha final es anterior a la inicial." : ""}`,
          `Diferencia: ${diff.years} años, ${diff.months} meses, ${diff.days} días`,
          `Total en días: ${diff.totalDays}`,
          `Total en semanas: ${diff.totalWeeks}`,
          `Total en meses: ${diff.totalMonths}`,
        ]
          .filter(Boolean)
          .join("\n")
      );
      return;
    }

    if (mode === "add" || mode === "subtract") {
      const base = parse(dateA, "La fecha base");
      if (!base) return;
      const sign = mode === "subtract" ? -1 : 1;
      const result = addCalendarTime(base, { years: sign * addYears, months: sign * addMonths, days: sign * addDays });
      setSummary(`${calendarDateToIso(base)} ${mode === "add" ? "+" : "−"} (${addYears} años, ${addMonths} meses, ${addDays} días) = ${calendarDateToIso(result)} (${weekdayOf(result)} de ${monthNameOf(result.month)})`);
      return;
    }
  }

  function handleReset() {
    setDateA("");
    setDateB("");
    setAddYears(0);
    setAddMonths(0);
    setAddDays(0);
    setError(null);
    setSummary("");
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="age-mode" className="mb-1">
          Modo
        </Label>
        <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <SelectTrigger id="age-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mode === "age" || mode === "next-birthday" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField id="age-birth" label="Fecha de nacimiento" value={dateA} onChange={setDateA} />
          <div>
            <DateField id="age-asof" label="Calcular como de (opcional, por defecto hoy)" value={dateB} onChange={setDateB} />
            <button type="button" className="mt-1 text-xs underline" onClick={() => fillDateWithToday(setDateB)}>
              Usar hoy
            </button>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="feb29-policy" className="mb-1">
              Nacido el 29 de febrero: en años no bisiestos, considerar el cumpleaños el
            </Label>
            <Select value={feb29Policy} onValueChange={(v) => setFeb29Policy(v as Feb29Policy)}>
              <SelectTrigger id="feb29-policy" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feb28">28 de febrero</SelectItem>
                <SelectItem value="mar1">1 de marzo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {mode === "diff" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField id="diff-start" label="Fecha inicial" value={dateA} onChange={setDateA} />
          <DateField id="diff-end" label="Fecha final" value={dateB} onChange={setDateB} />
        </div>
      ) : null}

      {mode === "days-until" ? <DateField id="days-target" label="Fecha objetivo" value={dateA} onChange={setDateA} /> : null}

      {mode === "add" || mode === "subtract" ? (
        <div className="space-y-4">
          <DateField id="addsub-base" label="Fecha base" value={dateA} onChange={setDateA} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="addsub-years" className="mb-1">
                Años
              </Label>
              <Input id="addsub-years" type="number" min={0} value={addYears} onChange={(e) => setAddYears(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="addsub-months" className="mb-1">
                Meses
              </Label>
              <Input id="addsub-months" type="number" min={0} value={addMonths} onChange={(e) => setAddMonths(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="addsub-days" className="mb-1">
                Días
              </Label>
              <Input id="addsub-days" type="number" min={0} value={addDays} onChange={(e) => setAddDays(Number(e.target.value))} />
            </div>
          </div>
        </div>
      ) : null}

      <Button type="button" onClick={handleCompute}>
        Calcular
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div aria-live="polite" className="space-y-1 rounded-lg border p-4 text-sm">
          <pre className="whitespace-pre-wrap font-sans">{summary}</pre>
          <div className="flex flex-wrap gap-2 pt-2">
            <CopyButton text={summary} label="Copiar" />
            <DownloadButton content={summary} filename="calculo-fechas.txt" mimeType="text/plain" label="Descargar" />
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}

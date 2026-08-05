"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { countBusinessDays, addBusinessDays, dedupeHolidays } from "@/lib/public-tools/productivity/business-days";
import { parseIsoDateInput, todayAsCalendarDate, calendarDateToIso, type CalendarDate } from "@/lib/public-tools/utilities/dates";
import { parseNumericInput } from "@/lib/public-tools/utilities/validation";

const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type Mode = "count" | "shift";

export function BusinessDaysCalculatorTool() {
  const [mode, setMode] = useState<Mode>("count");
  const today = calendarDateToIso(todayAsCalendarDate());
  const [startRaw, setStartRaw] = useState(today);
  const [endRaw, setEndRaw] = useState(today);
  const [includeStart, setIncludeStart] = useState(true);
  const [includeEnd, setIncludeEnd] = useState(true);
  const [weekendDays, setWeekendDays] = useState<number[]>([0, 6]);
  const [holidaysRaw, setHolidaysRaw] = useState("");
  const [shiftCountRaw, setShiftCountRaw] = useState("10");
  const [shiftDirection, setShiftDirection] = useState<1 | -1>(1);
  const [computed, setComputed] = useState(false);

  const start = parseIsoDateInput(startRaw);
  const end = parseIsoDateInput(endRaw);
  const shiftCount = parseNumericInput(shiftCountRaw, "La cantidad de días");

  const holidays: CalendarDate[] = dedupeHolidays(
    holidaysRaw
      .split(/[\n,]/)
      .map((s) => parseIsoDateInput(s.trim()))
      .filter((d): d is CalendarDate => d !== null)
  );

  function toggleWeekendDay(day: number) {
    setWeekendDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  const countResult = mode === "count" && start && end ? countBusinessDays(start, end, includeStart, includeEnd, { weekendDays, holidays }) : null;
  const shiftResult = mode === "shift" && start && shiftCount.ok ? addBusinessDays(start, shiftCount.value!, shiftDirection, { weekendDays, holidays }) : null;

  function handleReset() {
    setStartRaw(today);
    setEndRaw(today);
    setHolidaysRaw("");
    setShiftCountRaw("10");
    setComputed(false);
  }

  const summary =
    mode === "count" && countResult
      ? [
          `Días naturales: ${countResult.totalDays}`,
          `Días laborables: ${countResult.businessDays}`,
          `Días de fin de semana: ${countResult.weekendDays}`,
          `Festivos excluidos: ${countResult.holidaysExcluded}`,
        ].join("\n")
      : shiftResult
        ? [
            `Fecha resultante: ${calendarDateToIso(shiftResult.resultDate)}`,
            `Días naturales recorridos: ${shiftResult.naturalDaysElapsed}`,
            `Fines de semana omitidos: ${shiftResult.weekendsSkipped}`,
            `Festivos omitidos: ${shiftResult.holidaysSkipped}`,
          ].join("\n")
        : "";

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button type="button" variant={mode === "count" ? "default" : "outline"} size="sm" onClick={() => setMode("count")}>
          Contar
        </Button>
        <Button type="button" variant={mode === "shift" ? "default" : "outline"} size="sm" onClick={() => setMode("shift")}>
          Sumar o restar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="bd-start" className="mb-1">
            Fecha inicial
          </Label>
          <Input id="bd-start" type="date" value={startRaw} onChange={(e) => setStartRaw(e.target.value)} />
        </div>
        {mode === "count" ? (
          <div>
            <Label htmlFor="bd-end" className="mb-1">
              Fecha final
            </Label>
            <Input id="bd-end" type="date" value={endRaw} onChange={(e) => setEndRaw(e.target.value)} />
          </div>
        ) : (
          <div>
            <Label htmlFor="bd-shift-count" className="mb-1">
              Cantidad de días laborables
            </Label>
            <div className="flex gap-2">
              <Input id="bd-shift-count" value={shiftCountRaw} onChange={(e) => setShiftCountRaw(e.target.value)} inputMode="numeric" />
              <Button type="button" variant={shiftDirection === 1 ? "default" : "outline"} size="sm" onClick={() => setShiftDirection(1)}>
                Sumar
              </Button>
              <Button type="button" variant={shiftDirection === -1 ? "default" : "outline"} size="sm" onClick={() => setShiftDirection(-1)}>
                Restar
              </Button>
            </div>
          </div>
        )}
      </div>

      {mode === "count" ? (
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={includeStart} onCheckedChange={(c) => setIncludeStart(Boolean(c))} />
            Incluir fecha inicial
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={includeEnd} onCheckedChange={(c) => setIncludeEnd(Boolean(c))} />
            Incluir fecha final
          </label>
        </div>
      ) : null}

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Días de fin de semana</legend>
        <div className="flex flex-wrap gap-3">
          {WEEKDAY_LABELS.map((label, day) => (
            <label key={day} className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={weekendDays.includes(day)} onCheckedChange={() => toggleWeekendDay(day)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="bd-holidays" className="mb-1">
          Festivos personalizados (uno por línea o separados por coma, AAAA-MM-DD)
        </Label>
        <textarea id="bd-holidays" value={holidaysRaw} onChange={(e) => setHolidaysRaw(e.target.value)} rows={3} className="w-full rounded-md border p-2 text-sm font-mono" placeholder={`${today}`} />
        <p className="mt-1 text-xs text-muted-foreground">{holidays.length} festivo(s) reconocido(s).</p>
      </div>

      <Button type="button" onClick={() => setComputed(true)}>
        Calcular
      </Button>

      {computed && mode === "count" && countResult ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>Días naturales: {countResult.totalDays}</p>
            <p>
              Días laborables: <strong>{countResult.businessDays}</strong>
            </p>
            <p>Días de fin de semana: {countResult.weekendDays}</p>
            <p>Festivos excluidos: {countResult.holidaysExcluded}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={summary} label="Copiar" />
            <DownloadButton content={summary} filename="dias-laborables.txt" label="Descargar" />
          </div>
        </div>
      ) : null}

      {computed && mode === "shift" && shiftResult ? (
        <div aria-live="polite" className="space-y-3 rounded-lg border p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              Fecha resultante: <strong>{calendarDateToIso(shiftResult.resultDate)}</strong>
            </p>
            <p>Días naturales recorridos: {shiftResult.naturalDaysElapsed}</p>
            <p>Fines de semana omitidos: {shiftResult.weekendsSkipped}</p>
            <p>Festivos omitidos: {shiftResult.holidaysSkipped}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={summary} label="Copiar" />
            <DownloadButton content={summary} filename="fecha-calculada.txt" label="Descargar" />
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}

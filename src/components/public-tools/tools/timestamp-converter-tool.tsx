"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { detectUnixUnit, unixToDate, dateToUnix, formatTimestamp, describeDiffFromNow, validateTimeZone, type UnixUnit, type FormattedTimestamp } from "@/lib/public-tools/utilities/timestamp";

export function TimestampConverterTool() {
  const [rawValue, setRawValue] = useState("");
  const [unit, setUnit] = useState<UnixUnit>("seconds");
  const [unitTouched, setUnitTouched] = useState(false);
  const [zone, setZone] = useState("");
  const [result, setResult] = useState<FormattedTimestamp | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dateInput, setDateInput] = useState("");

  function handleFromTimestamp() {
    setError(null);
    const value = Number(rawValue.trim());
    if (Number.isNaN(value)) {
      setError("Introduce un timestamp numérico válido.");
      return;
    }
    const effectiveUnit = unitTouched ? unit : detectUnixUnit(value).suggested;
    if (!unitTouched) setUnit(effectiveUnit);
    const converted = unixToDate(value, effectiveUnit);
    if (!converted.ok || !converted.date) {
      setError(converted.error ?? "No se pudo convertir el valor.");
      return;
    }
    const zoneCheck = zone.trim() ? validateTimeZone(zone.trim()) : { ok: true };
    if (!zoneCheck.ok) {
      setError(zoneCheck.error ?? "Zona horaria inválida.");
      return;
    }
    setResult(formatTimestamp(converted.date, zone.trim() || null));
    setDiff(describeDiffFromNow(converted.date));
  }

  function handleFromDate() {
    setError(null);
    if (!dateInput) {
      setError("Selecciona una fecha y hora.");
      return;
    }
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
      setError("La fecha introducida no es válida.");
      return;
    }
    const unix = dateToUnix(date);
    if (!unix) {
      setError("No se pudo convertir la fecha.");
      return;
    }
    const zoneCheck = zone.trim() ? validateTimeZone(zone.trim()) : { ok: true };
    if (!zoneCheck.ok) {
      setError(zoneCheck.error ?? "Zona horaria inválida.");
      return;
    }
    setResult(formatTimestamp(date, zone.trim() || null));
    setDiff(describeDiffFromNow(date));
  }

  function useNow() {
    setDateInput(new Date().toISOString().slice(0, 16));
  }

  function handleReset() {
    setRawValue("");
    setDateInput("");
    setResult(null);
    setDiff(null);
    setError(null);
    setUnitTouched(false);
  }

  const detection = rawValue.trim() && !Number.isNaN(Number(rawValue)) ? detectUnixUnit(Number(rawValue)) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ts-value" className="mb-1">
            Timestamp Unix
          </Label>
          <Input id="ts-value" value={rawValue} onChange={(e) => setRawValue(e.target.value)} placeholder="Ej. 1753776000" />
          {detection ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Interpretado como <strong>{unit === "seconds" ? "segundos" : "milisegundos"}</strong> ({detection.reason}).{" "}
              <button type="button" className="underline" onClick={() => { setUnit(unit === "seconds" ? "milliseconds" : "seconds"); setUnitTouched(true); }}>
                Cambiar a {unit === "seconds" ? "milisegundos" : "segundos"}
              </button>
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="ts-zone" className="mb-1">
            Zona IANA (opcional)
          </Label>
          <Input id="ts-zone" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Ej. America/Mexico_City" />
        </div>
      </div>
      <Button type="button" onClick={handleFromTimestamp}>
        Convertir a fecha
      </Button>

      <div className="border-t pt-6">
        <Label htmlFor="ts-date" className="mb-1">
          Fecha y hora → timestamp
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input id="ts-date" type="datetime-local" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="max-w-xs" />
          <Button type="button" variant="outline" onClick={useNow}>
            Usar ahora
          </Button>
          <Button type="button" onClick={handleFromDate}>
            Convertir a timestamp
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4 text-sm">
          <Row label="Timestamp (segundos)" value={String(result.timestampSeconds)} />
          <Row label="Timestamp (milisegundos)" value={String(result.timestampMilliseconds)} />
          <Row label="ISO 8601" value={result.iso} />
          <Row label="UTC" value={result.utc} />
          <Row label="Hora local del navegador" value={result.local} />
          {result.inZone ? <Row label={`Zona ${zone.trim()}`} value={result.inZone} /> : null}
          <Row label="Día de la semana (UTC)" value={result.dayOfWeek} />
          {diff ? <p className="text-muted-foreground">{diff}</p> : null}
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <code>{value}</code>
        <CopyButton text={value} label="Copiar" />
      </span>
    </div>
  );
}

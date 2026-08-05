"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton, DownloadButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { todayAsCalendarDate, calendarDateToIso, parseIsoDateInput } from "@/lib/public-tools/utilities/dates";
import {
  createDefaultCalendarOptions,
  createSchoolPeriod,
  createSchoolBreak,
  validateCalendarOptions,
  calendarEventsToCsv,
  type CalendarOptions,
  type CalendarViewMode,
  type CalendarEvent,
} from "@/lib/public-tools/organization/printable-calendar";
import { buildPrintableCalendarPdf } from "@/lib/public-tools/organization/printable-calendar-pdf";
import { renderPdfPageToPngBlob } from "@/lib/public-tools/documents/png-export";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { downloadTextFile } from "@/lib/public-tools/csv-export";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { DOCUMENT_LIMITS } from "@/lib/public-tools/documents/limits";

const TOOL_ID = "generador-calendarios-imprimibles";
const MODE_LABELS: Record<CalendarViewMode, string> = { monthly: "Mensual", "multi-month": "Varios meses", annual: "Anual", school: "Escolar personalizado" };

export function PrintableCalendarTool() {
  const today = todayAsCalendarDate();
  const [options, setOptions] = useState<CalendarOptions>(createDefaultCalendarOptions(today));
  const [eventsRaw, setEventsRaw] = useState({ date: "", label: "", isHoliday: false });
  const [error, setError] = useState<string | null>(null);

  const validation = validateCalendarOptions(options);

  function patch(p: Partial<CalendarOptions>) {
    setOptions((prev) => ({ ...prev, ...p }));
  }

  function addEvent() {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventsRaw.date);
    if (!match || !eventsRaw.label.trim()) return;
    if (options.events.length >= DOCUMENT_LIMITS.calendar.maxEvents) return;
    const event: CalendarEvent = { id: `event-${Date.now()}`, year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), label: eventsRaw.label.trim(), isHoliday: eventsRaw.isHoliday };
    setOptions((prev) => ({ ...prev, events: [...prev.events, event] }));
    setEventsRaw({ date: "", label: "", isHoliday: false });
  }
  function removeEvent(id: string) {
    setOptions((prev) => ({ ...prev, events: prev.events.filter((e) => e.id !== id) }));
  }

  function updatePeriod(id: string, patch2: Partial<CalendarOptions["periods"][number]>) {
    setOptions((prev) => ({ ...prev, periods: prev.periods.map((p) => (p.id === id ? { ...p, ...patch2 } : p)) }));
  }
  function removePeriod(id: string) {
    setOptions((prev) => ({ ...prev, periods: prev.periods.filter((p) => p.id !== id) }));
  }
  function updateBreak(id: string, patch2: Partial<CalendarOptions["breaks"][number]>) {
    setOptions((prev) => ({ ...prev, breaks: prev.breaks.map((b) => (b.id === id ? { ...b, ...patch2 } : b)) }));
  }
  function removeBreak(id: string) {
    setOptions((prev) => ({ ...prev, breaks: prev.breaks.filter((b) => b.id !== id) }));
  }

  function handleExportJson() {
    downloadTextFile("calendario.json", JSON.stringify(buildDocumentEnvelope(TOOL_ID, options), null, 2), "application/json;charset=utf-8");
  }
  function handleImportJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<CalendarOptions>(text, TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setOptions(result.data);
    });
  }

  async function handleDownloadPdf() {
    setError(null);
    try {
      const bytes = await buildPrintableCalendarPdf(options);
      downloadBlob(sanitizeFilename(`calendario-${options.year}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF del calendario.");
    }
  }

  async function handleDownloadPng() {
    setError(null);
    try {
      const bytes = await buildPrintableCalendarPdf(options);
      const blob = await renderPdfPageToPngBlob(bytes, 1, DOCUMENT_LIMITS.pngRenderScale);
      downloadBlob(sanitizeFilename(`calendario-${options.year}.png`), blob);
    } catch {
      setError("No se pudo generar el PNG del calendario.");
    }
  }

  function handleReset() {
    setOptions(createDefaultCalendarOptions(today));
    setError(null);
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>
      <p className="text-xs text-muted-foreground">Los festivos y eventos son los que introduzcas manualmente.</p>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <Label htmlFor="cal-mode" className="mb-1">
            Modo
          </Label>
          <Select value={options.mode} onValueChange={(v) => patch({ mode: v as CalendarViewMode })}>
            <SelectTrigger id="cal-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABELS) as CalendarViewMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {options.mode !== "school" ? (
          <div>
            <Label htmlFor="cal-year" className="mb-1">
              Año
            </Label>
            <Input id="cal-year" type="number" value={options.year} onChange={(e) => patch({ year: Number(e.target.value) })} />
          </div>
        ) : null}
        {options.mode !== "annual" && options.mode !== "school" ? (
          <div>
            <Label htmlFor="cal-month" className="mb-1">
              Mes
            </Label>
            <Input id="cal-month" type="number" min={1} max={12} value={options.month} onChange={(e) => patch({ month: Number(e.target.value) })} />
          </div>
        ) : null}
        {options.mode === "multi-month" ? (
          <div>
            <Label htmlFor="cal-count" className="mb-1">
              Cantidad de meses
            </Label>
            <Input id="cal-count" type="number" min={1} max={DOCUMENT_LIMITS.calendar.maxMonthsInRange} value={options.monthCount} onChange={(e) => patch({ monthCount: Number(e.target.value) })} />
          </div>
        ) : null}
        {options.mode === "school" ? (
          <>
            <div>
              <Label htmlFor="cal-school-start" className="mb-1">
                Fecha inicial
              </Label>
              <Input
                id="cal-school-start"
                type="date"
                value={calendarDateToIso(options.schoolStartDate)}
                onChange={(e) => {
                  const d = parseIsoDateInput(e.target.value);
                  if (d) patch({ schoolStartDate: d });
                }}
              />
            </div>
            <div>
              <Label htmlFor="cal-school-end" className="mb-1">
                Fecha final
              </Label>
              <Input
                id="cal-school-end"
                type="date"
                value={calendarDateToIso(options.schoolEndDate)}
                onChange={(e) => {
                  const d = parseIsoDateInput(e.target.value);
                  if (d) patch({ schoolEndDate: d });
                }}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={options.firstDayOfWeek === 1} onCheckedChange={(c) => patch({ firstDayOfWeek: c ? 1 : 0 })} />
          Semana empieza en lunes
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={options.showWeekNumbers} onCheckedChange={(c) => patch({ showWeekNumbers: Boolean(c) })} />
          Mostrar número de semana
        </label>
      </div>

      {options.mode === "school" ? (
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border p-3">
            <h2 className="text-sm font-semibold">Periodos (trimestres, semestres, etc.)</h2>
            {options.periods.map((period) => (
              <div key={period.id} className="grid gap-2 sm:grid-cols-4">
                <Input placeholder="Nombre del periodo" value={period.label} onChange={(e) => updatePeriod(period.id, { label: e.target.value })} className="sm:col-span-2" />
                <Input
                  type="date"
                  value={calendarDateToIso(period.startDate)}
                  onChange={(e) => {
                    const d = parseIsoDateInput(e.target.value);
                    if (d) updatePeriod(period.id, { startDate: d });
                  }}
                />
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={calendarDateToIso(period.endDate)}
                    onChange={(e) => {
                      const d = parseIsoDateInput(e.target.value);
                      if (d) updatePeriod(period.id, { endDate: d });
                    }}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removePeriod(period.id)}>
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setOptions((prev) => ({ ...prev, periods: [...prev.periods, createSchoolPeriod(prev.schoolStartDate)] }))}>
              Añadir periodo
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <h2 className="text-sm font-semibold">Descansos (vacaciones, recesos)</h2>
            {options.breaks.map((brk) => (
              <div key={brk.id} className="grid gap-2 sm:grid-cols-4">
                <Input placeholder="Nombre del descanso" value={brk.label} onChange={(e) => updateBreak(brk.id, { label: e.target.value })} className="sm:col-span-2" />
                <Input
                  type="date"
                  value={calendarDateToIso(brk.startDate)}
                  onChange={(e) => {
                    const d = parseIsoDateInput(e.target.value);
                    if (d) updateBreak(brk.id, { startDate: d });
                  }}
                />
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={calendarDateToIso(brk.endDate)}
                    onChange={(e) => {
                      const d = parseIsoDateInput(e.target.value);
                      if (d) updateBreak(brk.id, { endDate: d });
                    }}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeBreak(brk.id)}>
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setOptions((prev) => ({ ...prev, breaks: [...prev.breaks, createSchoolBreak(prev.schoolStartDate)] }))}>
              Añadir descanso
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border p-3">
        <h2 className="text-sm font-semibold">Eventos y festivos manuales</h2>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={eventsRaw.date} onChange={(e) => setEventsRaw((p) => ({ ...p, date: e.target.value }))} />
          <Input placeholder="Descripción" value={eventsRaw.label} onChange={(e) => setEventsRaw((p) => ({ ...p, label: e.target.value }))} />
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={eventsRaw.isHoliday} onCheckedChange={(c) => setEventsRaw((p) => ({ ...p, isHoliday: Boolean(c) }))} />
            Festivo
          </label>
          <Button type="button" variant="outline" size="sm" onClick={addEvent}>
            Añadir
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {options.events.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-2">
              <span>
                {event.year}-{String(event.month).padStart(2, "0")}-{String(event.day).padStart(2, "0")}: {event.label} {event.isHoliday ? "(festivo)" : ""}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeEvent(event.id)}>
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {validation.errors.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {validation.errors.map((e, i) => (
            <li key={i} role="alert">
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleDownloadPdf} disabled={validation.errors.length > 0}>
          Descargar PDF
        </Button>
        <Button type="button" variant="outline" onClick={handleDownloadPng} disabled={validation.errors.length > 0}>
          Descargar PNG
        </Button>
        <DownloadButton content={calendarEventsToCsv(options.events)} filename="eventos-calendario.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV de eventos" />
        <CopyButton text={options.events.map((e) => `${e.year}-${String(e.month).padStart(2, "0")}-${String(e.day).padStart(2, "0")}: ${e.label}`).join("\n")} label="Copiar eventos" />
        <Button type="button" variant="outline" onClick={handleExportJson}>
          Exportar JSON
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Imprimir
        </Button>
        <ResetButton onReset={handleReset} />
      </div>

      <FileUploadZone accept="application/json" onFilesSelected={handleImportJson} label="Importar un calendario guardado previamente" hint="" />
    </div>
  );
}

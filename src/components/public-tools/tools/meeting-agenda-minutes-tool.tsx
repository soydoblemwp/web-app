"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import {
  createDefaultAgenda,
  createDefaultMinutes,
  createAgendaTopic,
  createMeetingAction,
  convertAgendaToMinutes,
  agendaTotalMinutes,
  agendaEstimatedEndTime,
  validateAgenda,
  validateMinutes,
  agendaToMarkdown,
  minutesToMarkdown,
  agendaToPlainText,
  minutesToPlainText,
  meetingActionsToCsv,
  type MeetingAgenda,
  type MeetingMinutes,
  type MeetingActionStatus,
} from "@/lib/public-tools/organization/meeting-documents";
import { buildAgendaPdf, buildMinutesPdf } from "@/lib/public-tools/organization/meeting-documents-pdf";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { downloadBlob } from "@/lib/public-tools/files/download";
import { sanitizeFilename } from "@/lib/public-tools/files/filenames";

const AGENDA_TOOL_ID = "generador-agendas-actas-reunion-agenda";
const MINUTES_TOOL_ID = "generador-agendas-actas-reunion-acta";

const STATUS_LABELS: Record<MeetingActionStatus, string> = { pending: "Pendiente", "in-progress": "En curso", done: "Completada" };

export function MeetingAgendaMinutesTool() {
  const [mode, setMode] = useState<"agenda" | "minutes">("agenda");
  const [agenda, setAgenda] = useState<MeetingAgenda>(createDefaultAgenda());
  const [minutes, setMinutes] = useState<MeetingMinutes>(createDefaultMinutes());
  const [error, setError] = useState<string | null>(null);

  const agendaValidation = validateAgenda(agenda);
  const minutesValidation = validateMinutes(minutes);

  function patchAgenda(p: Partial<MeetingAgenda>) {
    setAgenda((prev) => ({ ...prev, ...p }));
  }
  function updateTopic(id: string, patch: Partial<MeetingAgenda["topics"][number]>) {
    setAgenda((prev) => ({ ...prev, topics: prev.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }
  function patchMinutes(p: Partial<MeetingMinutes>) {
    setMinutes((prev) => ({ ...prev, ...p }));
  }
  function updateAction(id: string, patch: Partial<MeetingMinutes["actions"][number]>) {
    setMinutes((prev) => ({ ...prev, actions: prev.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  }

  function handleConvertToMinutes() {
    setMinutes(convertAgendaToMinutes(agenda));
    setMode("minutes");
  }

  function handleImportAgendaJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<MeetingAgenda>(text, AGENDA_TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setAgenda(result.data);
    });
  }

  function handleImportMinutesJson(files: File[]) {
    const file = files[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseDocumentEnvelope<MeetingMinutes>(text, MINUTES_TOOL_ID);
      if (!result.ok || !result.data) {
        setError(result.error ?? "No se pudo importar el archivo.");
        return;
      }
      setError(null);
      setMinutes(result.data);
    });
  }

  async function handleDownloadAgendaPdf() {
    setError(null);
    try {
      const bytes = await buildAgendaPdf(agenda);
      downloadBlob(sanitizeFilename(`agenda-${agenda.title || "reunion"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF de la agenda.");
    }
  }
  async function handleDownloadMinutesPdf() {
    setError(null);
    try {
      const bytes = await buildMinutesPdf(minutes);
      downloadBlob(sanitizeFilename(`acta-${minutes.title || "reunion"}.pdf`), bytes, "application/pdf");
    } catch {
      setError("No se pudo generar el PDF del acta.");
    }
  }

  const totalMinutes = agendaTotalMinutes(agenda);
  const endTime = agendaEstimatedEndTime(agenda);

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor.</p>

      <div className="flex gap-2">
        <Button type="button" variant={mode === "agenda" ? "default" : "outline"} size="sm" onClick={() => setMode("agenda")}>
          Agenda
        </Button>
        <Button type="button" variant={mode === "minutes" ? "default" : "outline"} size="sm" onClick={() => setMode("minutes")}>
          Acta
        </Button>
      </div>

      {mode === "agenda" ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="agenda-title" className="mb-1">
                Título
              </Label>
              <Input id="agenda-title" value={agenda.title} onChange={(e) => patchAgenda({ title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="agenda-date" className="mb-1">
                Fecha
              </Label>
              <Input id="agenda-date" type="date" value={agenda.date} onChange={(e) => patchAgenda({ date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="agenda-time" className="mb-1">
                Hora de inicio
              </Label>
              <Input id="agenda-time" type="time" value={agenda.startTime} onChange={(e) => patchAgenda({ startTime: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="agenda-location" className="mb-1">
                Ubicación / enlace
              </Label>
              <Input id="agenda-location" value={agenda.location} onChange={(e) => patchAgenda({ location: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="agenda-organizer" className="mb-1">
                Organizador
              </Label>
              <Input id="agenda-organizer" value={agenda.organizer} onChange={(e) => patchAgenda({ organizer: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="agenda-available" className="mb-1">
                Tiempo disponible (min, opcional)
              </Label>
              <Input id="agenda-available" type="number" min={0} value={agenda.availableMinutes ?? ""} onChange={(e) => patchAgenda({ availableMinutes: e.target.value ? Number(e.target.value) : null })} />
            </div>
          </div>
          <div>
            <Label htmlFor="agenda-participants" className="mb-1">
              Participantes (uno por línea)
            </Label>
            <textarea
              id="agenda-participants"
              value={agenda.participants.join("\n")}
              onChange={(e) => patchAgenda({ participants: e.target.value.split("\n").filter(Boolean) })}
              rows={2}
              className="w-full rounded-md border p-2 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="agenda-objective" className="mb-1">
              Objetivo
            </Label>
            <textarea id="agenda-objective" value={agenda.objective} onChange={(e) => patchAgenda({ objective: e.target.value })} rows={2} className="w-full rounded-md border p-2 text-sm" />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Temas</h2>
            {agenda.topics.map((topic) => (
              <div key={topic.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-4">
                <Input placeholder="Tema" value={topic.title} onChange={(e) => updateTopic(topic.id, { title: e.target.value })} className="sm:col-span-2" />
                <Input placeholder="Responsable" value={topic.responsible} onChange={(e) => updateTopic(topic.id, { responsible: e.target.value })} />
                <Input type="number" min={1} placeholder="Minutos" value={topic.durationMinutes} onChange={(e) => updateTopic(topic.id, { durationMinutes: Number(e.target.value) })} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setAgenda((prev) => ({ ...prev, topics: [...prev.topics, createAgendaTopic()] }))}>
              Añadir tema
            </Button>
          </div>

          <p aria-live="polite" className="text-sm font-semibold">
            Duración total: {totalMinutes} min{endTime ? ` — fin estimado: ${endTime}` : ""}
          </p>
          {agenda.availableMinutes !== null && totalMinutes > agenda.availableMinutes ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">La suma de los temas supera el tiempo disponible.</p>
          ) : null}

          {agendaValidation.errors.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {agendaValidation.errors.map((e, i) => (
                <li key={i} role="alert">
                  {e}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleDownloadAgendaPdf} disabled={agendaValidation.errors.length > 0}>
              Descargar agenda (PDF)
            </Button>
            <DownloadButton content={agendaToMarkdown(agenda)} filename="agenda.md" mimeType="text/markdown;charset=utf-8" label="Descargar Markdown" />
            <DownloadButton content={agendaToPlainText(agenda)} filename="agenda.txt" mimeType="text/plain;charset=utf-8" label="Descargar TXT" />
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadBlob(sanitizeFilename("agenda.json"), new TextEncoder().encode(JSON.stringify(buildDocumentEnvelope(AGENDA_TOOL_ID, agenda), null, 2)), "application/json")}
            >
              Exportar JSON
            </Button>
            <Button type="button" variant="outline" onClick={handleConvertToMinutes}>
              Convertir en plantilla de acta
            </Button>
            <ResetButton onReset={() => setAgenda(createDefaultAgenda())} />
          </div>
          <FileUploadZone accept="application/json" onFilesSelected={handleImportAgendaJson} label="Importar una agenda guardada previamente" hint="" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="minutes-title" className="mb-1">
                Título
              </Label>
              <Input id="minutes-title" value={minutes.title} onChange={(e) => patchMinutes({ title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="minutes-date" className="mb-1">
                Fecha
              </Label>
              <Input id="minutes-date" type="date" value={minutes.date} onChange={(e) => patchMinutes({ date: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="minutes-participants" className="mb-1">
              Participantes (uno por línea)
            </Label>
            <textarea id="minutes-participants" value={minutes.participants.join("\n")} onChange={(e) => patchMinutes({ participants: e.target.value.split("\n").filter(Boolean) })} rows={2} className="w-full rounded-md border p-2 text-sm" />
          </div>
          <div>
            <Label htmlFor="minutes-decisions" className="mb-1">
              Decisiones (una por línea)
            </Label>
            <textarea id="minutes-decisions" value={minutes.decisions.join("\n")} onChange={(e) => patchMinutes({ decisions: e.target.value.split("\n").filter(Boolean) })} rows={2} className="w-full rounded-md border p-2 text-sm" />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Acciones</h2>
            {minutes.actions.map((action) => (
              <div key={action.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-4">
                <Input placeholder="Acción" value={action.description} onChange={(e) => updateAction(action.id, { description: e.target.value })} className="sm:col-span-2" />
                <Input placeholder="Responsable" value={action.responsible} onChange={(e) => updateAction(action.id, { responsible: e.target.value })} />
                <Select value={action.status} onValueChange={(v) => updateAction(action.id, { status: v as MeetingActionStatus })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as MeetingActionStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setMinutes((prev) => ({ ...prev, actions: [...prev.actions, createMeetingAction()] }))}>
              Añadir acción
            </Button>
          </div>

          {minutesValidation.errors.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {minutesValidation.errors.map((e, i) => (
                <li key={i} role="alert">
                  {e}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleDownloadMinutesPdf} disabled={minutesValidation.errors.length > 0}>
              Descargar acta (PDF)
            </Button>
            <DownloadButton content={minutesToMarkdown(minutes)} filename="acta.md" mimeType="text/markdown;charset=utf-8" label="Descargar Markdown" />
            <DownloadButton content={minutesToPlainText(minutes)} filename="acta.txt" mimeType="text/plain;charset=utf-8" label="Descargar TXT" />
            <DownloadButton content={meetingActionsToCsv(minutes)} filename="acciones.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV de acciones" />
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadBlob(sanitizeFilename("acta.json"), new TextEncoder().encode(JSON.stringify(buildDocumentEnvelope(MINUTES_TOOL_ID, minutes), null, 2)), "application/json")}
            >
              Exportar JSON
            </Button>
            <CopyButton text={minutesToMarkdown(minutes)} label="Copiar acta" />
            <ResetButton onReset={() => setMinutes(createDefaultMinutes())} />
          </div>
          <FileUploadZone accept="application/json" onFilesSelected={handleImportMinutesJson} label="Importar un acta guardada previamente" hint="" />
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

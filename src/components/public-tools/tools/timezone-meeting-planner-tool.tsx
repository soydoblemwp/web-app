"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { planMeetings, type Participant, type MeetingSlot } from "@/lib/public-tools/time/meeting-planner";
import { isValidTimeZone } from "@/lib/public-tools/time/time-zones";
import { buildIcsEvent, generateIcsUid } from "@/lib/public-tools/time/ics";
import { downloadTextFile, buildCsv } from "@/lib/public-tools/csv-export";
import { parseIsoDateInput, todayAsCalendarDate, calendarDateToIso } from "@/lib/public-tools/utilities/dates";
import { parseNumericInput } from "@/lib/public-tools/utilities/validation";

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#be185d", "#65a30d", "#ea580c", "#4338ca"];
const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function newParticipant(index: number): Participant {
  return {
    id: `p-${Date.now()}-${index}`,
    label: `Participante ${index + 1}`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    workStartMinutes: 9 * 60,
    workEndMinutes: 17 * 60,
    workDays: [1, 2, 3, 4, 5],
  };
}

export function TimezoneMeetingPlannerTool() {
  const [participants, setParticipants] = useState<Participant[]>([newParticipant(0), newParticipant(1)]);
  const [dateRaw, setDateRaw] = useState(calendarDateToIso(todayAsCalendarDate()));
  const [durationRaw, setDurationRaw] = useState("30");
  const [intervalRaw, setIntervalRaw] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<MeetingSlot[] | null>(null);
  const [meetingTitle, setMeetingTitle] = useState("Reunión de equipo");

  function updateParticipant(id: string, patch: Partial<Participant>) {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function removeParticipant(id: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  }
  function addParticipant() {
    if (participants.length >= 10) return;
    setParticipants((prev) => [...prev, newParticipant(prev.length)]);
  }

  function handleGenerate() {
    setError(null);
    const date = parseIsoDateInput(dateRaw);
    const duration = parseNumericInput(durationRaw, "La duración de la reunión");
    const interval = parseNumericInput(intervalRaw, "El intervalo de búsqueda");
    if (!date) {
      setError("Fecha inválida.");
      return;
    }
    if (participants.length < 2 || participants.length > 10) {
      setError("Debe haber entre 2 y 10 participantes.");
      return;
    }
    for (const p of participants) {
      if (!isValidTimeZone(p.timeZone)) {
        setError(`Zona horaria inválida para "${p.label}": ${p.timeZone}`);
        return;
      }
    }
    if (!duration.ok || !interval.ok) {
      setError("Duración o intervalo inválidos.");
      return;
    }
    const result = planMeetings({
      anchorYear: date.year,
      anchorMonth: date.month,
      anchorDay: date.day,
      anchorTimeZone: participants[0].timeZone,
      participants,
      intervalMinutes: interval.value!,
      meetingDurationMinutes: duration.value!,
    });
    setSlots(result);
  }

  function handleReset() {
    setParticipants([newParticipant(0), newParticipant(1)]);
    setSlots(null);
    setError(null);
  }

  function downloadIcsForSlot(slot: MeetingSlot) {
    const ics = buildIcsEvent({
      uid: generateIcsUid(),
      title: meetingTitle,
      description: `Reunión planificada con ${participants.length} participantes.`,
      startUtc: slot.utcInstant,
      durationMinutes: Number(durationRaw) || 30,
    });
    downloadTextFile("reunion.ics", ics, "text/calendar;charset=utf-8");
  }

  const csv = slots
    ? buildCsv(
        ["Hora UTC", ...participants.map((p) => p.label)],
        slots.map((slot) => [
          slot.utcInstant.toISOString(),
          ...slot.participants.map((p) => `${String(p.localHour).padStart(2, "0")}:${String(p.localMinute).padStart(2, "0")} (${p.withinWorkHours ? "disponible" : "fuera de horario"})`),
        ])
      )
    : "";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {participants.map((p, i) => (
          <div key={p.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-5" style={{ borderLeftColor: COLORS[i % COLORS.length], borderLeftWidth: 4 }}>
            <div>
              <Label htmlFor={`mp-label-${p.id}`} className="mb-1 text-xs">
                Nombre
              </Label>
              <Input id={`mp-label-${p.id}`} value={p.label} onChange={(e) => updateParticipant(p.id, { label: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={`mp-tz-${p.id}`} className="mb-1 text-xs">
                Zona horaria IANA
              </Label>
              <Input id={`mp-tz-${p.id}`} value={p.timeZone} onChange={(e) => updateParticipant(p.id, { timeZone: e.target.value })} placeholder="America/New_York" />
            </div>
            <div>
              <Label htmlFor={`mp-start-${p.id}`} className="mb-1 text-xs">
                Hora inicio laboral
              </Label>
              <Input
                id={`mp-start-${p.id}`}
                type="time"
                value={`${String(Math.floor(p.workStartMinutes / 60)).padStart(2, "0")}:${String(p.workStartMinutes % 60).padStart(2, "0")}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  updateParticipant(p.id, { workStartMinutes: h * 60 + m });
                }}
              />
            </div>
            <div>
              <Label htmlFor={`mp-end-${p.id}`} className="mb-1 text-xs">
                Hora fin laboral
              </Label>
              <Input
                id={`mp-end-${p.id}`}
                type="time"
                value={`${String(Math.floor(p.workEndMinutes / 60)).padStart(2, "0")}:${String(p.workEndMinutes % 60).padStart(2, "0")}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  updateParticipant(p.id, { workEndMinutes: h * 60 + m });
                }}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => removeParticipant(p.id)} disabled={participants.length <= 2}>
                Eliminar
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addParticipant} disabled={participants.length >= 10}>
          Añadir participante
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="mp-date" className="mb-1">
            Fecha
          </Label>
          <Input id="mp-date" type="date" value={dateRaw} onChange={(e) => setDateRaw(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="mp-duration" className="mb-1">
            Duración de la reunión (min)
          </Label>
          <Input id="mp-duration" value={durationRaw} onChange={(e) => setDurationRaw(e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <Label htmlFor="mp-interval" className="mb-1">
            Intervalo de búsqueda (min)
          </Label>
          <Input id="mp-interval" value={intervalRaw} onChange={(e) => setIntervalRaw(e.target.value)} inputMode="numeric" />
        </div>
      </div>

      <div>
        <Label htmlFor="mp-title" className="mb-1">
          Título de la reunión (para el archivo .ics)
        </Label>
        <Input id="mp-title" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} />
      </div>

      <Button type="button" onClick={handleGenerate}>
        Generar horario
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {slots ? (
        <div aria-live="polite" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <CopyButton text={csv} label="Copiar propuesta" />
            <DownloadButton content={csv} filename="planificador-reuniones.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV" />
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
          <div className="max-h-[32rem] overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th scope="col" className="p-2 text-left">
                    Hora UTC
                  </th>
                  {participants.map((p) => (
                    <th key={p.id} scope="col" className="p-2 text-left">
                      {p.label}
                    </th>
                  ))}
                  <th scope="col" className="p-2 text-left">
                    Descargar
                  </th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot, i) => (
                  <tr key={i} className={`border-t ${slot.allAvailable ? "bg-green-50 dark:bg-green-950/30" : slot.majorityAvailable ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                    <td className="p-2 font-mono">{slot.utcInstant.toISOString().slice(11, 16)} UTC</td>
                    {slot.participants.map((p) => (
                      <td key={p.id} className="p-2">
                        <span className={p.withinWorkHours ? "" : "text-muted-foreground"}>
                          {String(p.localHour).padStart(2, "0")}:{String(p.localMinute).padStart(2, "0")} ({WEEKDAY_LABELS[p.localWeekday]}) {p.abbreviation}
                        </span>
                        {!p.withinWorkHours ? <span className="ml-1 text-amber-600 dark:text-amber-400">fuera de horario</span> : null}
                      </td>
                    ))}
                    <td className="p-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => downloadIcsForSlot(slot)}>
                        .ics
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}

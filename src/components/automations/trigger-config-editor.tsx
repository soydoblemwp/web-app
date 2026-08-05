"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WorkflowAutomationTriggerType } from "@/lib/automations/types";

const COMMON_TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Mexico_City", "America/Bogota", "America/Argentina/Buenos_Aires", "Europe/Madrid", "Europe/London", "Europe/Paris"];

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
];

export interface EventDefinitionOption {
  key: string;
  label: string;
}

interface TriggerConfigEditorProps {
  type: WorkflowAutomationTriggerType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  eventDefinitions: EventDefinitionOption[];
}

function set(config: Record<string, unknown>, patch: Record<string, unknown>) {
  return { ...config, ...patch };
}

/** Renders the exact fields each trigger type's real config shape needs (src/lib/automations/triggers.ts) — never a generic free-form JSON box. WEBHOOK has no fields here; its secret/public URL are managed from the automation detail page after creation. */
export function TriggerConfigEditor({ type, config, onChange, eventDefinitions }: TriggerConfigEditorProps) {
  if (type === "MANUAL" || type === "WEBHOOK") {
    return <p className="text-sm text-muted-foreground">{type === "MANUAL" ? "Sin configuración adicional — se ejecuta cuando alguien pulsa “Ejecutar ahora”." : "El endpoint y el secreto se generan al guardar; podrás verlos en la pestaña Webhook del detalle."}</p>;
  }

  if (type === "SCHEDULE_ONCE") {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Fecha</Label>
          <Input type="date" value={(config.localDate as string) ?? ""} onChange={(e) => onChange(set(config, { localDate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hora</Label>
          <Input type="time" value={(config.localTime as string) ?? ""} onChange={(e) => onChange(set(config, { localTime: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Zona horaria</Label>
          <Select value={(config.timezone as string) ?? "UTC"} onValueChange={(v) => onChange(set(config, { timezone: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (type === "SCHEDULE_RECURRING") {
    const kind = (config.kind as string) ?? "DAILY";
    const daysOfWeek = (config.daysOfWeek as number[]) ?? [];
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Frecuencia</Label>
            <Select value={kind} onValueChange={(v) => onChange(set(config, { kind: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HOURLY">Cada hora</SelectItem>
                <SelectItem value="DAILY">Diaria</SelectItem>
                <SelectItem value="WEEKLY_DAYS">Semanal (días concretos)</SelectItem>
                <SelectItem value="MONTHLY">Mensual</SelectItem>
                <SelectItem value="CUSTOM_INTERVAL_DAYS">Cada N días</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fecha de inicio</Label>
            <Input type="date" value={(config.startDate as string) ?? ""} onChange={(e) => onChange(set(config, { startDate: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Zona horaria</Label>
            <Select value={(config.timezone as string) ?? "UTC"} onValueChange={(v) => onChange(set(config, { timezone: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {kind !== "HOURLY" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Hora</Label>
              <Input
                type="time"
                value={typeof config.hour === "number" && typeof config.minute === "number" ? `${String(config.hour).padStart(2, "0")}:${String(config.minute).padStart(2, "0")}` : ""}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  onChange(set(config, { hour: h, minute: m }));
                }}
              />
            </div>
          </div>
        ) : null}

        {kind === "WEEKLY_DAYS" ? (
          <div className="space-y-1">
            <Label className="text-xs">Días de la semana</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = daysOfWeek.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    className={`rounded-md border px-2 py-1 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                    onClick={() => onChange(set(config, { daysOfWeek: active ? daysOfWeek.filter((v) => v !== d.value) : [...daysOfWeek, d.value] }))}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {kind === "MONTHLY" ? (
          <div className="space-y-1">
            <Label className="text-xs">Día del mes (1-28)</Label>
            <Input type="number" min={1} max={28} value={(config.dayOfMonth as number) ?? 1} onChange={(e) => onChange(set(config, { dayOfMonth: Number(e.target.value) }))} />
          </div>
        ) : null}

        {kind === "CUSTOM_INTERVAL_DAYS" ? (
          <div className="space-y-1">
            <Label className="text-xs">Cada cuántos días</Label>
            <Input type="number" min={1} value={(config.intervalDays as number) ?? 1} onChange={(e) => onChange(set(config, { intervalDays: Number(e.target.value) }))} />
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Fecha de fin (opcional)</Label>
            <Input type="date" value={(config.endDate as string) ?? ""} onChange={(e) => onChange(set(config, { endDate: e.target.value || null }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Máximo de repeticiones (opcional)</Label>
            <Input type="number" min={1} value={(config.maxOccurrences as number) ?? ""} onChange={(e) => onChange(set(config, { maxOccurrences: e.target.value ? Number(e.target.value) : null }))} />
          </div>
        </div>
      </div>
    );
  }

  if (type === "INTERNAL_EVENT") {
    return (
      <div className="space-y-1">
        <Label className="text-xs">Evento interno</Label>
        <Select value={(config.eventKey as string) ?? ""} onValueChange={(v) => onChange(set(config, { eventKey: v }))}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un evento" />
          </SelectTrigger>
          <SelectContent>
            {eventDefinitions.map((e) => (
              <SelectItem key={e.key} value={e.key}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === "WORKFLOW_COMPLETED" || type === "AGENT_RUN_COMPLETED") {
    const key = type === "WORKFLOW_COMPLETED" ? "sourceWorkflowId" : "sourceAgentRef";
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{type === "WORKFLOW_COMPLETED" ? "ID del workflow origen (opcional — vacío = cualquiera)" : "Clave del agente origen (opcional — vacío = cualquiera)"}</Label>
          <Input value={(config[key] as string) ?? ""} onChange={(e) => onChange(set(config, { [key]: e.target.value || null }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Resultado</Label>
          <Select value={(config.outcomeFilter as string) ?? "ANY"} onValueChange={(v) => onChange(set(config, { outcomeFilter: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Cualquiera</SelectItem>
              <SelectItem value="COMPLETED">Completado</SelectItem>
              <SelectItem value="FAILED">Fallido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (type === "MARKETING_BRAIN_COMPLETED") {
    return (
      <div className="space-y-1">
        <Label className="text-xs">Resultado</Label>
        <Select value={(config.outcomeFilter as string) ?? "ANY"} onValueChange={(v) => onChange(set(config, { outcomeFilter: v }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ANY">Cualquiera</SelectItem>
            <SelectItem value="COMPLETED">Completado</SelectItem>
            <SelectItem value="PARTIALLY_COMPLETED">Parcial</SelectItem>
            <SelectItem value="FAILED">Fallido</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === "KNOWLEDGE_SOURCE_READY") {
    return (
      <div className="space-y-1">
        <Label className="text-xs">Estado</Label>
        <Select value={(config.statusFilter as string) ?? "ANY"} onValueChange={(v) => onChange(set(config, { statusFilter: v }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ANY">Cualquiera</SelectItem>
            <SelectItem value="READY">Lista</SelectItem>
            <SelectItem value="PARTIALLY_READY">Parcialmente lista</SelectItem>
            <SelectItem value="NEEDS_OCR">Necesita OCR</SelectItem>
            <SelectItem value="FAILED">Fallida</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (type === "CONTENT_STATUS_CHANGED" || type === "SOCIAL_POST_STATUS_CHANGED") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Desde estado (opcional)</Label>
          <Input value={(config.fromStatus as string) ?? ""} onChange={(e) => onChange(set(config, { fromStatus: e.target.value || null }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hacia estado (opcional)</Label>
          <Input value={(config.toStatus as string) ?? ""} onChange={(e) => onChange(set(config, { toStatus: e.target.value || null }))} />
        </div>
      </div>
    );
  }

  if (type === "CAMPAIGN_DATE_REACHED") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Fecha</Label>
          <Select value={(config.which as string) ?? "START"} onValueChange={(v) => onChange(set(config, { which: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="START">Inicio de campaña</SelectItem>
              <SelectItem value="END">Fin de campaña</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">ID de campaña (opcional — vacío = cualquiera)</Label>
          <Input value={(config.campaignId as string) ?? ""} onChange={(e) => onChange(set(config, { campaignId: e.target.value || null }))} />
        </div>
      </div>
    );
  }

  return null;
}

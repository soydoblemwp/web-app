"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TriggerConfigEditor, type EventDefinitionOption } from "@/components/automations/trigger-config-editor";
import { ConditionGroupBuilder } from "@/components/automations/condition-builder";
import { InputMappingEditor } from "@/components/automations/input-mapping-editor";
import { TRIGGER_TYPE_LABELS, ERROR_POLICY_LABELS } from "@/components/automations/labels";
import { WORKFLOW_AUTOMATION_TRIGGER_TYPES } from "@/lib/automations/types";
import { zonedWallTimeToUtc } from "@/lib/automations/recurrence";
import { createAutomationAction, updateAutomationAction } from "@/server/actions/automations";
import type { CreateAutomationInput, ConditionGroupInput, InputMappingInput } from "@/lib/validation/automations";

export interface AutomationFormWorkflowOption {
  id: string;
  name: string;
  variables: string[];
}

export interface AutomationFormInitial {
  id: string;
  name: string;
  description: string | null;
  workflowId: string;
  trigger: { type: string; config: Record<string, unknown> };
  conditions: ConditionGroupInput | null;
  inputMappings: InputMappingInput[];
  errorPolicy: string;
  maxRetryAttempts: number;
  requireApprovalBeforeStart: boolean;
  notifyOnCompletion: boolean;
  notifyOnFailure: boolean;
  timezone: string;
}

interface AutomationFormProps {
  projectId: string;
  workflows: AutomationFormWorkflowOption[];
  eventDefinitions: EventDefinitionOption[];
  initial?: AutomationFormInitial;
}

function computeScheduleOnceUtc(config: Record<string, unknown>): Record<string, unknown> {
  const localDate = config.localDate as string | undefined;
  const localTime = config.localTime as string | undefined;
  const timezone = (config.timezone as string) ?? "UTC";
  if (!localDate || !localTime) return config;
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const scheduledAtUtc = zonedWallTimeToUtc(year, month, day, hour, minute, timezone).toISOString();
  return { ...config, scheduledAtUtc };
}

export function AutomationForm({ projectId, workflows, eventDefinitions, initial }: AutomationFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [workflowId, setWorkflowId] = useState(initial?.workflowId ?? workflows[0]?.id ?? "");
  const [triggerType, setTriggerType] = useState(initial?.trigger.type ?? "MANUAL");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(initial?.trigger.config ?? {});
  const [conditions, setConditions] = useState<ConditionGroupInput | null>(initial?.conditions ?? null);
  const [mappings, setMappings] = useState<InputMappingInput[]>(initial?.inputMappings ?? []);
  const [errorPolicy, setErrorPolicy] = useState(initial?.errorPolicy ?? "STOP");
  const [maxRetryAttempts, setMaxRetryAttempts] = useState(initial?.maxRetryAttempts ?? 3);
  const [requireApproval, setRequireApproval] = useState(initial?.requireApprovalBeforeStart ?? false);
  const [notifyOnCompletion, setNotifyOnCompletion] = useState(initial?.notifyOnCompletion ?? false);
  const [notifyOnFailure, setNotifyOnFailure] = useState(initial?.notifyOnFailure ?? true);
  const [timezone, setTimezone] = useState(initial?.timezone ?? "UTC");
  const [error, setError] = useState<string | null>(null);

  const selectedWorkflow = workflows.find((w) => w.id === workflowId);

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!workflowId) {
      setError("Selecciona un workflow.");
      return;
    }

    const finalConfig = triggerType === "SCHEDULE_ONCE" ? computeScheduleOnceUtc(triggerConfig) : triggerConfig;

    const payload: CreateAutomationInput = {
      name,
      description: description || undefined,
      workflowId,
      trigger: { type: triggerType as CreateAutomationInput["trigger"]["type"], config: finalConfig },
      conditions: conditions ?? undefined,
      inputMappings: mappings.length > 0 ? mappings : undefined,
      errorPolicy: errorPolicy as CreateAutomationInput["errorPolicy"],
      maxRetryAttempts,
      requireApprovalBeforeStart: requireApproval,
      notifyOnCompletion,
      notifyOnFailure,
      timezone,
    };

    startTransition(async () => {
      const result = initial ? await updateAutomationAction(projectId, initial.id, payload) : await createAutomationAction(projectId, payload);
      if (result.errorCode || result.errorMessage) {
        setError(result.errorMessage ?? "No se pudo guardar la automatización.");
        toast.error(result.errorMessage ?? "No se pudo guardar la automatización.");
        return;
      }
      toast.success(initial ? "Automatización actualizada." : "Automatización creada como borrador.");
      router.push(`/dashboard/${projectId}/automations/${result.id ?? initial?.id}`);
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos generales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Publicar resumen semanal" />
          </div>
          <div className="space-y-1">
            <Label>Descripción (opcional)</Label>
            <Textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Workflow a ejecutar</Label>
            <Select value={workflowId} onValueChange={(v) => v && setWorkflowId(v)} disabled={Boolean(initial)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {initial ? <p className="text-xs text-muted-foreground">El workflow no se puede cambiar después de crear la automatización — crea una nueva si necesitas otro.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disparador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select
              value={triggerType}
              onValueChange={(v) => {
                if (!v) return;
                setTriggerType(v);
                setTriggerConfig({});
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOW_AUTOMATION_TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TRIGGER_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TriggerConfigEditor type={triggerType as never} config={triggerConfig} onChange={setTriggerConfig} eventDefinitions={eventDefinitions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Condiciones (opcional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {conditions ? (
            <>
              <ConditionGroupBuilder group={conditions} onChange={setConditions} />
              <Button type="button" size="sm" variant="ghost" onClick={() => setConditions(null)}>
                Quitar todas las condiciones
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setConditions({ operator: "AND", conditions: [] })}>
              Añadir condiciones
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entradas del workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <InputMappingEditor mappings={mappings} workflowVariables={selectedWorkflow?.variables ?? []} onChange={setMappings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Políticas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Ante un error</Label>
              <Select value={errorPolicy} onValueChange={(v) => v && setErrorPolicy(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ERROR_POLICY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errorPolicy === "RETRY" ? (
              <div className="space-y-1">
                <Label className="text-xs">Máximo de reintentos</Label>
                <Input type="number" min={1} max={10} value={maxRetryAttempts} onChange={(e) => setMaxRetryAttempts(Number(e.target.value))} />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label className="text-xs">Zona horaria de referencia</Label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Requerir aprobación antes de iniciar</p>
              <p className="text-xs text-muted-foreground">Cada ejecución quedará pendiente hasta que alguien la apruebe.</p>
            </div>
            <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Notificar al completarse</p>
            </div>
            <Switch checked={notifyOnCompletion} onCheckedChange={setNotifyOnCompletion} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Notificar al fallar</p>
            </div>
            <Switch checked={notifyOnFailure} onCheckedChange={setNotifyOnFailure} />
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={pending}>
          {pending ? "Guardando…" : initial ? "Guardar cambios" : "Crear automatización"}
        </Button>
      </div>
    </div>
  );
}

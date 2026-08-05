"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { createAgentAction, updateAgentAction } from "@/server/actions/agents";
import { AGENT_CATEGORIES, AGENT_OUTPUT_TYPES, AGENT_CREATIVITY_LEVELS, AGENT_TOOL_IDS, AGENT_INPUT_FIELD_TYPES } from "@/lib/agents/types";
import { CUSTOM_AGENT_ICON_NAMES } from "@/components/agents/agent-icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { AgentInputFieldSpec, AgentInputFieldType } from "@/lib/agents/types";

interface AgentFormValues {
  name: string;
  description: string;
  icon: string;
  category: string;
  objective: string;
  systemInstructions: string;
  inputSchema: AgentInputFieldSpec[];
  outputType: string;
  language: string;
  creativity: string;
  allowedTools: string[];
  requireApproval: boolean;
  maxSteps: number;
  visibility: string;
}

const DEFAULT_VALUES: AgentFormValues = {
  name: "",
  description: "",
  icon: "Bot",
  category: "CUSTOM",
  objective: "",
  systemInstructions: "",
  inputSchema: [],
  outputType: "text",
  language: "es",
  creativity: "BALANCED",
  allowedTools: [],
  requireApproval: false,
  maxSteps: 1,
  visibility: "PROJECT",
};

export function AgentForm({ projectId, agentId, initialValues }: { projectId: string; agentId?: string; initialValues?: Partial<AgentFormValues> }) {
  const router = useRouter();
  const [values, setValues] = useState<AgentFormValues>({ ...DEFAULT_VALUES, ...initialValues });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(next: Partial<AgentFormValues>) {
    setValues((prev) => ({ ...prev, ...next }));
  }

  function addField() {
    patch({ inputSchema: [...values.inputSchema, { key: `campo${values.inputSchema.length + 1}`, label: "Nuevo campo", type: "short_text", required: false }] });
  }
  function updateField(index: number, next: Partial<AgentInputFieldSpec>) {
    patch({ inputSchema: values.inputSchema.map((f, i) => (i === index ? { ...f, ...next } : f)) });
  }
  function removeField(index: number) {
    patch({ inputSchema: values.inputSchema.filter((_, i) => i !== index) });
  }

  async function handleSubmit() {
    if (!values.systemInstructions.trim()) {
      setError("Las instrucciones no pueden estar vacías.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { ...values, category: values.category as never, outputType: values.outputType as never, creativity: values.creativity as never, visibility: values.visibility as never, allowedTools: values.allowedTools as never };
    const result = agentId ? await updateAgentAction(projectId, agentId, payload) : await createAgentAction(projectId, payload);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(agentId ? "Agente actualizado." : "Agente creado.");
    router.push(`/dashboard/${projectId}/agents/${agentId ?? (result as { id?: string }).id}`);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardContent className="grid gap-3 py-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nombre *</Label>
            <Input value={values.name} onChange={(e) => patch({ name: e.target.value })} maxLength={200} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descripción *</Label>
            <Textarea rows={2} value={values.description} onChange={(e) => patch({ description: e.target.value })} maxLength={2000} />
          </div>
          <div className="space-y-1.5">
            <Label>Icono</Label>
            <Select value={values.icon} onValueChange={(v) => v && patch({ icon: v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_AGENT_ICON_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={values.category} onValueChange={(v) => v && patch({ category: v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Objetivo</Label>
            <Input value={values.objective} onChange={(e) => patch({ objective: e.target.value })} maxLength={1000} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Instrucciones del sistema *</Label>
            <Textarea rows={6} value={values.systemInstructions} onChange={(e) => patch({ systemInstructions: e.target.value })} maxLength={8000} />
          </div>
          <div className="space-y-1.5">
            <Label>Formato de salida</Label>
            <Select value={values.outputType} onValueChange={(v) => v && patch({ outputType: v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_OUTPUT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Idioma</Label>
            <Input value={values.language} onChange={(e) => patch({ language: e.target.value })} maxLength={10} />
          </div>
          <div className="space-y-1.5">
            <Label>Creatividad</Label>
            <Select value={values.creativity} onValueChange={(v) => v && patch({ creativity: v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_CREATIVITY_LEVELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Máximo de pasos</Label>
            <Input type="number" min={1} max={10} value={values.maxSteps} onChange={(e) => patch({ maxSteps: Number(e.target.value) || 1 })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Herramientas permitidas</Label>
            <div className="flex flex-wrap gap-3">
              {AGENT_TOOL_IDS.map((tool) => {
                const checked = values.allowedTools.includes(tool);
                return (
                  <label key={tool} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => patch({ allowedTools: checked ? values.allowedTools.filter((t) => t !== tool) : [...values.allowedTools, tool] })}
                    />
                    {tool}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <Label className="text-sm">Requiere aprobación antes de finalizar</Label>
            <Switch checked={values.requireApproval} onCheckedChange={(v) => patch({ requireApproval: v })} />
          </div>
          <div className="space-y-1.5">
            <Label>Visibilidad</Label>
            <Select value={values.visibility} onValueChange={(v) => v && patch({ visibility: v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PROJECT">Todo el proyecto</SelectItem>
                <SelectItem value="CREATOR_ONLY">Solo yo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <Label>Campos de entrada</Label>
            <Button type="button" size="sm" variant="outline" onClick={addField}>
              <Plus className="size-3.5" /> Añadir campo
            </Button>
          </div>
          {values.inputSchema.map((field, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto_auto] items-end gap-2 rounded-md border p-2">
              <div className="space-y-1">
                <Label className="text-xs">Clave</Label>
                <Input value={field.key} onChange={(e) => updateField(index, { key: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Etiqueta</Label>
                <Input value={field.label} onChange={(e) => updateField(index, { label: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={field.type} onValueChange={(v) => v && updateField(index, { type: v as AgentInputFieldType })}>
                  <SelectTrigger size="sm" className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_INPUT_FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-1 text-xs">
                <Checkbox checked={field.required} onCheckedChange={(v) => updateField(index, { required: v === true })} /> Obligatorio
              </label>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeField(index)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" disabled={saving} onClick={handleSubmit}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {agentId ? "Guardar cambios" : "Crear agente"}
      </Button>
    </div>
  );
}

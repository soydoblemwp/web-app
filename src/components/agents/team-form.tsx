"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save, ArrowUp, ArrowDown } from "lucide-react";
import { createAgentTeamAction, updateAgentTeamAction } from "@/server/actions/agent-teams";
import { listAgentDefinitions } from "@/lib/agents/registry";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { AgentIcon } from "@/components/agents/agent-icon";

interface TeamMemberValue {
  agentRef: string;
  order: number;
  enabled: boolean;
  requireApproval: boolean;
}

interface TeamFormValues {
  name: string;
  description: string;
  objective: string;
  coordinatorAgentRef: string;
  reviewerAgentRef: string | null;
  errorStrategy: string;
  members: TeamMemberValue[];
}

const OFFICIAL_AGENTS = listAgentDefinitions();

export function TeamForm({ projectId, teamId, initialValues, customAgents }: { projectId: string; teamId?: string; initialValues?: Partial<TeamFormValues>; customAgents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [values, setValues] = useState<TeamFormValues>({
    name: "",
    description: "",
    objective: "",
    coordinatorAgentRef: "review-agent",
    reviewerAgentRef: null,
    errorStrategy: "STOP_ON_ERROR",
    members: [],
    ...initialValues,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAgentOptions = [...OFFICIAL_AGENTS.map((a) => ({ ref: a.key, name: a.name })), ...customAgents.map((a) => ({ ref: a.id, name: a.name }))];

  function patch(next: Partial<TeamFormValues>) {
    setValues((prev) => ({ ...prev, ...next }));
  }

  function addMember() {
    const ref = allAgentOptions[0]?.ref ?? "writing-agent";
    patch({ members: [...values.members, { agentRef: ref, order: values.members.length, enabled: true, requireApproval: false }] });
  }
  function updateMember(index: number, next: Partial<TeamMemberValue>) {
    patch({ members: values.members.map((m, i) => (i === index ? { ...m, ...next } : m)) });
  }
  function removeMember(index: number) {
    patch({ members: values.members.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i })) });
  }
  function moveMember(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= values.members.length) return;
    const next = [...values.members];
    [next[index], next[target]] = [next[target], next[index]];
    patch({ members: next.map((m, i) => ({ ...m, order: i })) });
  }

  async function handleSubmit() {
    if (values.members.length === 0) {
      setError("Añade al menos un agente al equipo.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { ...values, errorStrategy: values.errorStrategy as never };
    const result = teamId ? await updateAgentTeamAction(projectId, teamId, payload) : await createAgentTeamAction(projectId, payload);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(teamId ? "Equipo actualizado." : "Equipo creado.");
    router.push(`/dashboard/${projectId}/agent-teams/${teamId ?? (result as { id?: string }).id}`);
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
            <Label>Descripción</Label>
            <Textarea rows={2} value={values.description} onChange={(e) => patch({ description: e.target.value })} maxLength={1000} />
          </div>
          <div className="space-y-1.5">
            <Label>Agente coordinador</Label>
            <Select value={values.coordinatorAgentRef} onValueChange={(v) => v && patch({ coordinatorAgentRef: v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allAgentOptions.map((a) => (
                  <SelectItem key={a.ref} value={a.ref}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Estrategia ante errores</Label>
            <Select value={values.errorStrategy} onValueChange={(v) => v && patch({ errorStrategy: v })}>
              <SelectTrigger className="w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STOP_ON_ERROR">Detener en el primer error</SelectItem>
                <SelectItem value="CONTINUE_INDEPENDENT_BRANCHES">Continuar con los demás pasos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <Label>Agentes del equipo (orden secuencial)</Label>
            <Button type="button" size="sm" variant="outline" onClick={addMember}>
              <Plus className="size-3.5" /> Añadir agente
            </Button>
          </div>
          {values.members.map((member, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <AgentIcon agentRef={member.agentRef} className="size-4 shrink-0" />
              <Select value={member.agentRef} onValueChange={(v) => v && updateMember(index, { agentRef: v })}>
                <SelectTrigger size="sm" className="h-8 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allAgentOptions.map((a) => (
                    <SelectItem key={a.ref} value={a.ref}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-xs">
                <Checkbox checked={member.enabled} onCheckedChange={(v) => updateMember(index, { enabled: v === true })} /> Activo
              </label>
              <label className="flex items-center gap-1 text-xs">
                <Checkbox checked={member.requireApproval} onCheckedChange={(v) => updateMember(index, { requireApproval: v === true })} /> Requiere aprobación
              </label>
              <div className="ml-auto flex gap-1">
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveMember(index, -1)} disabled={index === 0}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveMember(index, 1)} disabled={index === values.members.length - 1}>
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeMember(index)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" disabled={saving} onClick={handleSubmit}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {teamId ? "Guardar cambios" : "Crear equipo"}
      </Button>
    </div>
  );
}

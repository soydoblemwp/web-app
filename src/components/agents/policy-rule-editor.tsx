"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAgentModeCatalogAction } from "@/server/actions/agent-governance";

const RISK_LEVELS = ["READ_ONLY", "DRAFT_WRITE", "INTERNAL_MUTATION"] as const;

export interface RuleDraft {
  scope: "AGENT" | "MODE";
  agentRef: string;
  mode?: string;
  enabled?: boolean | null;
  riskOverride?: (typeof RISK_LEVELS)[number] | null;
  requireApproval?: boolean | null;
  maxRunsPerDay?: number | null;
  maxConcurrent?: number | null;
  maxRetries?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
}

function emptyRule(): RuleDraft {
  return { scope: "AGENT", agentRef: "", enabled: null, riskOverride: null, requireApproval: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null, startsAt: null, expiresAt: null };
}

/**
 * The visual AGENT/MODE override editor (Fase 38 spec section 8) — resolves
 * the Fase 37 limitation "los overrides pueden gestionarse por API/
 * servicios, pero no hay un formulario visual". Every row maps 1:1 to a
 * `PolicyRuleInput` the real `createPolicyDraft` service persists — no
 * separate visual representation that needs manual translation. An UNSET
 * field means "heredado" (inherited) — represented as `null`/undefined,
 * never a fake sentinel value.
 */
export function PolicyRuleEditor({ projectId, rules, onChange }: { projectId: string; rules: RuleDraft[]; onChange: (rules: RuleDraft[]) => void }) {
  const [catalog, setCatalog] = useState<{ agentRef: string; agentLabel: string; isCustom: boolean; modes: string[] }[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAgentModeCatalogAction(projectId).then((list) => {
      if (!cancelled) setCatalog(list);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function updateRule(index: number, patch: Partial<RuleDraft>) {
    const next = rules.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }
  function removeRule(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }
  function addRule() {
    onChange([...rules, emptyRule()]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Overrides por agente y modo</Label>
        <Button type="button" size="sm" variant="outline" onClick={addRule}>
          <Plus className="size-3.5" /> Agregar regla
        </Button>
      </div>

      {rules.length === 0 ? <p className="text-sm text-muted-foreground">Sin overrides — todos los agentes heredan la política base.</p> : null}

      {rules.map((rule, index) => {
        const agentEntry = catalog.find((a) => a.agentRef === rule.agentRef);
        const modes = agentEntry?.modes ?? [];
        return (
          <Card key={index}>
            <CardContent className="grid gap-2.5 py-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Alcance</Label>
                <Select value={rule.scope} onValueChange={(v) => v && updateRule(index, { scope: v as "AGENT" | "MODE", mode: v === "AGENT" ? undefined : rule.mode })}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AGENT">Agente</SelectItem>
                    <SelectItem value="MODE">Modo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Agente</Label>
                <Select value={rule.agentRef || undefined} onValueChange={(v) => v && updateRule(index, { agentRef: v, mode: undefined })}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="Selecciona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((a) => (
                      <SelectItem key={a.agentRef} value={a.agentRef}>
                        {a.agentLabel} {a.isCustom ? "(personalizado)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {rule.scope === "MODE" ? (
                <div className="space-y-1">
                  <Label className="text-xs">Modo</Label>
                  {modes.length > 0 ? (
                    <Select value={rule.mode || undefined} onValueChange={(v) => v && updateRule(index, { mode: v })}>
                      <SelectTrigger className="w-full" size="sm">
                        <SelectValue placeholder="Selecciona..." />
                      </SelectTrigger>
                      <SelectContent>
                        {modes.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={rule.mode ?? ""} onChange={(e) => updateRule(index, { mode: e.target.value })} placeholder="Nombre del modo" />
                  )}
                </div>
              ) : null}

              <div className="space-y-1">
                <Label className="text-xs">Habilitado</Label>
                <Select value={rule.enabled === null || rule.enabled === undefined ? "INHERIT" : String(rule.enabled)} onValueChange={(v) => updateRule(index, { enabled: v === "INHERIT" ? null : v === "true" })}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INHERIT">Heredado</SelectItem>
                    <SelectItem value="true">Habilitado</SelectItem>
                    <SelectItem value="false">Deshabilitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Riesgo máximo</Label>
                <Select value={rule.riskOverride ?? "INHERIT"} onValueChange={(v) => updateRule(index, { riskOverride: v === "INHERIT" ? null : (v as (typeof RISK_LEVELS)[number]) })}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INHERIT">Heredado</SelectItem>
                    {RISK_LEVELS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1.5 pt-4">
                <Checkbox
                  checked={rule.requireApproval === true}
                  onCheckedChange={(c) => updateRule(index, { requireApproval: c === true ? true : null })}
                  aria-label="Requiere aprobación"
                />
                <Label className="text-xs">Requiere aprobación</Label>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Máx. runs/día</Label>
                <Input type="number" value={rule.maxRunsPerDay ?? ""} onChange={(e) => updateRule(index, { maxRunsPerDay: e.target.value ? Number(e.target.value) : null })} placeholder="Heredado" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Concurrencia máx.</Label>
                <Input type="number" value={rule.maxConcurrent ?? ""} onChange={(e) => updateRule(index, { maxConcurrent: e.target.value ? Number(e.target.value) : null })} placeholder="Heredado" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reintentos máx.</Label>
                <Input type="number" value={rule.maxRetries ?? ""} onChange={(e) => updateRule(index, { maxRetries: e.target.value ? Number(e.target.value) : null })} placeholder="Heredado" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vigente desde</Label>
                <Input type="datetime-local" value={rule.startsAt ? rule.startsAt.slice(0, 16) : ""} onChange={(e) => updateRule(index, { startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vigente hasta</Label>
                <Input type="datetime-local" value={rule.expiresAt ? rule.expiresAt.slice(0, 16) : ""} onChange={(e) => updateRule(index, { expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>

              <div className="flex items-end justify-end sm:col-span-2 lg:col-span-4">
                {rule.agentRef && rule.scope === "AGENT" ? <Badge variant="outline" className="mr-auto">{rule.agentRef}</Badge> : null}
                {rule.agentRef && rule.scope === "MODE" ? <Badge variant="outline" className="mr-auto">{rule.agentRef} · {rule.mode || "?"}</Badge> : null}
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeRule(index)} aria-label="Quitar regla">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { WORKFLOW_AUTOMATION_CONDITION_OPERATORS } from "@/lib/automations/types";
import { CONDITION_OPERATOR_LABELS } from "@/components/automations/labels";
import type { ConditionGroupInput, ConditionInput } from "@/lib/validation/automations";

const NO_VALUE_OPERATORS = new Set(["IS_EMPTY", "IS_NOT_EMPTY", "EXISTS", "NOT_EXISTS"]);
const MAX_DEPTH = 3;

interface ConditionGroupBuilderProps {
  group: ConditionGroupInput;
  onChange: (group: ConditionGroupInput) => void;
  onRemove?: () => void;
  depth?: number;
}

/** Visual AND/OR nested condition builder (spec section 15) — reads/writes the same ConditionGroupInput shape the server validates; depth is capped to match the backend's MAX_CONDITION_DEPTH. */
export function ConditionGroupBuilder({ group, onChange, onRemove, depth = 0 }: ConditionGroupBuilderProps) {
  const conditions = group.conditions ?? [];
  const groups = group.groups ?? [];

  function updateCondition(index: number, patch: Partial<ConditionInput>) {
    const next = conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...group, conditions: next });
  }

  function removeCondition(index: number) {
    onChange({ ...group, conditions: conditions.filter((_, i) => i !== index) });
  }

  function addCondition() {
    onChange({ ...group, conditions: [...conditions, { field: "", operator: "EQUALS", value: "" }] });
  }

  function updateChildGroup(index: number, next: ConditionGroupInput) {
    const nextGroups = groups.map((g, i) => (i === index ? next : g));
    onChange({ ...group, groups: nextGroups });
  }

  function removeChildGroup(index: number) {
    onChange({ ...group, groups: groups.filter((_, i) => i !== index) });
  }

  function addChildGroup() {
    onChange({ ...group, groups: [...groups, { operator: "AND", conditions: [] }] });
  }

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Coincidir</span>
            <Select value={group.operator} onValueChange={(v) => onChange({ ...group, operator: v as "AND" | "OR" })}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">todas (AND)</SelectItem>
                <SelectItem value="OR">alguna (OR)</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">de las siguientes condiciones</span>
          </div>
          {onRemove ? (
            <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
              <Trash2 className="size-4" /> Quitar grupo
            </Button>
          ) : null}
        </div>

        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <Input
                placeholder="campo, p. ej. status"
                className="h-8 w-40"
                value={condition.field}
                onChange={(e) => updateCondition(index, { field: e.target.value })}
              />
              <Select value={condition.operator} onValueChange={(v) => updateCondition(index, { operator: v as ConditionInput["operator"] })}>
                <SelectTrigger className="h-8 w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_AUTOMATION_CONDITION_OPERATORS.map((op) => (
                    <SelectItem key={op} value={op}>
                      {CONDITION_OPERATOR_LABELS[op] ?? op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!NO_VALUE_OPERATORS.has(condition.operator) ? (
                <Input
                  placeholder="valor"
                  className="h-8 flex-1 min-w-32"
                  value={typeof condition.value === "string" ? condition.value : condition.value != null ? String(condition.value) : ""}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                />
              ) : null}
              <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => removeCondition(index)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={addCondition}>
            <Plus className="size-4" /> Añadir condición
          </Button>
        </div>

        {depth < MAX_DEPTH - 1 ? (
          <div className="space-y-2 border-l-2 border-dashed pl-4">
            {groups.map((childGroup, index) => (
              <ConditionGroupBuilder key={index} group={childGroup} onChange={(next) => updateChildGroup(index, next)} onRemove={() => removeChildGroup(index)} depth={depth + 1} />
            ))}
            <Button type="button" size="sm" variant="outline" onClick={addChildGroup}>
              <Plus className="size-4" /> Añadir subgrupo
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

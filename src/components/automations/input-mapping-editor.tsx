"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INPUT_MAPPING_SOURCE_KINDS, INPUT_MAPPING_TRANSFORMS } from "@/lib/automations/mapping";
import type { InputMappingInput } from "@/lib/validation/automations";

const SOURCE_KIND_LABELS: Record<string, string> = {
  EVENT_FIELD: "Campo del evento",
  STATIC: "Valor fijo",
  RESOURCE: "Recurso relacionado",
  TEMPLATE: "Plantilla {{...}}",
};

const TRANSFORM_LABELS: Record<string, string> = {
  text_to_text: "Texto",
  number_to_text: "Número a texto",
  date_to_text: "Fecha a texto",
  list_to_text: "Lista a texto",
  select_property: "Seleccionar propiedad",
};

interface InputMappingEditorProps {
  mappings: InputMappingInput[];
  workflowVariables: string[];
  onChange: (mappings: InputMappingInput[]) => void;
}

/** Maps event/static/resource/template data into the target workflow's own input variables (spec section 17) — never a free-form JS expression, only the declared safe source kinds/transforms. */
export function InputMappingEditor({ mappings, workflowVariables, onChange }: InputMappingEditorProps) {
  function update(index: number, patch: Partial<InputMappingInput>) {
    onChange(mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function remove(index: number) {
    onChange(mappings.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...mappings, { targetVariable: workflowVariables[0] ?? "", sourceKind: "STATIC", sourceExpression: "" }]);
  }

  if (workflowVariables.length === 0) {
    return <p className="text-sm text-muted-foreground">Este workflow no declara variables de entrada — no hay nada que mapear.</p>;
  }

  return (
    <div className="space-y-2">
      {mappings.map((mapping, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
          <Select value={mapping.targetVariable} onValueChange={(v) => v && update(index, { targetVariable: v })}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="variable" />
            </SelectTrigger>
            <SelectContent>
              {workflowVariables.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">=</span>
          <Select value={mapping.sourceKind} onValueChange={(v) => update(index, { sourceKind: v as InputMappingInput["sourceKind"] })}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INPUT_MAPPING_SOURCE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {SOURCE_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={mapping.sourceKind === "STATIC" ? "valor fijo" : mapping.sourceKind === "TEMPLATE" ? "{{event.title}}" : "event.id / resource.title"}
            className="h-8 flex-1 min-w-40"
            value={mapping.sourceExpression}
            onChange={(e) => update(index, { sourceExpression: e.target.value })}
          />
          <Select value={mapping.transform ?? "__none"} onValueChange={(v) => update(index, { transform: v === "__none" ? null : (v as InputMappingInput["transform"]) })}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="sin transformar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sin transformar</SelectItem>
              {INPUT_MAPPING_TRANSFORMS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TRANSFORM_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => remove(index)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>
        <Plus className="size-4" /> Añadir mapeo
      </Button>
    </div>
  );
}

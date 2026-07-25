"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { listToolDefinitions, findToolDefinition } from "@/lib/ai-center/tools/registry";
import { listSavedPromptsForSelectAction } from "@/server/actions/prompt-library";
import { listAiTemplatesForSelectAction } from "@/server/actions/ai-templates";
import { listBrandProfilesForSelectAction } from "@/server/actions/brand-profiles";
import { listWorkflowsForSelectAction } from "@/server/actions/ai-workflows";
import { listWorkflowRevisionsAction } from "@/server/actions/workflow-lifecycle";
import { validateWorkflowSteps, WORKFLOW_STEP_TYPES, type WorkflowStep, type WorkflowStepType } from "@/lib/ai-workflows/engine";
import type { SavedPromptLike } from "@/lib/prompt-library/types";
import type { AiTemplateLike } from "@/lib/ai-templates/types";
import type { BrandProfileLike } from "@/lib/brand-profiles/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const STEP_TYPE_LABELS: Record<WorkflowStepType, string> = {
  ai_tool: "Ejecutar herramienta IA",
  prompt_library: "Usar Prompt Library",
  ai_template: "Usar AI Template",
  brand_kit: "Usar Brand Kit",
  transform: "Transformar salida",
  save_result: "Guardar resultado",
  workflow: "Ejecutar sub-workflow",
};

interface WorkflowOption {
  id: string;
  name: string;
  status: string;
  publishedVersion: number | null;
  variables: string[];
}

type RevisionOption = { id: string; version: number; isActive: boolean };

function nextStepId() {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultStepFor(type: WorkflowStepType, index: number): WorkflowStep {
  return {
    id: nextStepId(),
    type,
    label: STEP_TYPE_LABELS[type],
    outputVariable: `step${index + 1}_output`,
    ...(type === "workflow" ? { childRevisionMode: "latest" as const } : {}),
  };
}

/**
 * The step builder shared by WorkflowCreateForm and WorkflowCard's edit
 * mode — the ONE place workflow steps get authored, so both call sites stay
 * in sync automatically. Fetches the user's Prompt Library/AI
 * Templates/Brand Kit lists client-side on mount (reusing the same
 * *ForSelectAction pattern BrandProfileSelect established) and reads
 * listToolDefinitions() directly — the exact same AI Center registry every
 * other tool already reads, never a second list.
 */
export function WorkflowStepEditor({
  projectId,
  workflowId,
  steps,
  onChange,
}: {
  projectId: string;
  /** The workflow currently being edited — undefined for a not-yet-created draft. Used only to exclude a direct self-reference from the SubWorkflow picker (a UX nicety; real cycle protection is the publish-time check in workflow-lifecycle.ts, never this alone). */
  workflowId?: string;
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
}) {
  const [prompts, setPrompts] = useState<SavedPromptLike[]>([]);
  const [templates, setTemplates] = useState<AiTemplateLike[]>([]);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfileLike[]>([]);
  const [workflowOptions, setWorkflowOptions] = useState<WorkflowOption[]>([]);
  const [childRevisions, setChildRevisions] = useState<Record<string, RevisionOption[]>>({});
  const tools = listToolDefinitions();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listSavedPromptsForSelectAction(projectId),
      listAiTemplatesForSelectAction(projectId),
      listBrandProfilesForSelectAction(projectId),
      listWorkflowsForSelectAction(projectId, workflowId),
    ]).then(([promptResult, templateResult, brandResult, workflowResult]) => {
      if (cancelled) return;
      setPrompts(promptResult);
      setTemplates(templateResult);
      setBrandProfiles(brandResult);
      setWorkflowOptions(workflowResult);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, workflowId]);

  async function ensureChildRevisionsLoaded(childWorkflowId: string) {
    if (childRevisions[childWorkflowId]) return;
    const revisions = await listWorkflowRevisionsAction(projectId, childWorkflowId);
    setChildRevisions((prev) => ({ ...prev, [childWorkflowId]: revisions }));
  }

  const issues = validateWorkflowSteps(steps);

  function updateStep(index: number, patch: Partial<WorkflowStep>) {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function updateFieldInput(index: number, fieldName: string, value: string) {
    const step = steps[index];
    onChange(steps.map((s, i) => (i === index ? { ...s, fieldInputs: { ...step.fieldInputs, [fieldName]: value } } : s)));
  }

  function updateChildInputMapping(index: number, childVarName: string, value: string) {
    const step = steps[index];
    onChange(steps.map((s, i) => (i === index ? { ...s, childInputMapping: { ...step.childInputMapping, [childVarName]: value } } : s)));
  }

  function addStep(type: WorkflowStepType) {
    onChange([...steps, defaultStepFor(type, steps.length)]);
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay pasos. Añade el primero abajo.</p>
      ) : (
        <div className="space-y-3">
          {steps.map((step, index) => {
            const stepIssues = issues.filter((issue) => issue.stepId === step.id);
            return (
              <div key={step.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Paso {index + 1}</Badge>
                    <Select value={step.type} onValueChange={(value) => value && updateStep(index, { type: value as WorkflowStepType })}>
                      <SelectTrigger size="sm" className="w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_STEP_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {STEP_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveStep(index, -1)} aria-label="Subir paso">
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === steps.length - 1}
                      onClick={() => moveStep(index, 1)}
                      aria-label="Bajar paso"
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeStep(index)} aria-label="Eliminar paso">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${step.id}-label`}>Etiqueta</Label>
                    <Input
                      id={`${step.id}-label`}
                      value={step.label}
                      onChange={(event) => updateStep(index, { label: event.target.value })}
                      maxLength={150}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${step.id}-output`}>Variable de salida</Label>
                    <Input
                      id={`${step.id}-output`}
                      value={step.outputVariable}
                      onChange={(event) => updateStep(index, { outputVariable: event.target.value })}
                      maxLength={60}
                    />
                  </div>
                </div>

                {step.type === "ai_tool" ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${step.id}-tool`}>Herramienta de IA</Label>
                      <Select value={step.toolSlug ?? ""} onValueChange={(value) => value && updateStep(index, { toolSlug: value })}>
                        <SelectTrigger id={`${step.id}-tool`} size="sm" className="w-full">
                          <SelectValue placeholder="Selecciona una herramienta" />
                        </SelectTrigger>
                        <SelectContent>
                          {tools.map((tool) => (
                            <SelectItem key={tool.slug} value={tool.slug}>
                              {tool.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {(() => {
                      const tool = step.toolSlug ? findToolDefinition(step.toolSlug) : undefined;
                      if (!tool) return null;
                      return (
                        <div className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-2">
                          <p className="text-xs text-muted-foreground sm:col-span-2">
                            Campos de &quot;{tool.label}&quot; — usa <code className="rounded bg-muted px-1">{"{{variable}}"}</code> o{" "}
                            <code className="rounded bg-muted px-1">{"{{salida_de_paso_anterior}}"}</code> en cualquiera.
                          </p>
                          {tool.fields.map((field) => (
                            <div key={field.name} className="space-y-1.5">
                              <Label htmlFor={`${step.id}-field-${field.name}`}>
                                {field.label}
                                {field.required ? " *" : " (opcional)"}
                              </Label>
                              <Input
                                id={`${step.id}-field-${field.name}`}
                                value={step.fieldInputs?.[field.name] ?? ""}
                                onChange={(event) => updateFieldInput(index, field.name, event.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}

                {step.type === "prompt_library" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${step.id}-prompt`}>Prompt guardado</Label>
                    <Select value={step.promptId ?? ""} onValueChange={(value) => value && updateStep(index, { promptId: value })}>
                      <SelectTrigger id={`${step.id}-prompt`} size="sm" className="w-full">
                        <SelectValue placeholder="Selecciona un prompt" />
                      </SelectTrigger>
                      <SelectContent>
                        {prompts.map((prompt) => (
                          <SelectItem key={prompt.id} value={prompt.id}>
                            {prompt.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {step.type === "ai_template" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${step.id}-template`}>AI Template</Label>
                    <Select value={step.templateId ?? ""} onValueChange={(value) => value && updateStep(index, { templateId: value })}>
                      <SelectTrigger id={`${step.id}-template`} size="sm" className="w-full">
                        <SelectValue placeholder="Selecciona un template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {step.type === "brand_kit" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${step.id}-brand`}>Brand Kit</Label>
                    <Select value={step.brandProfileId ?? "default"} onValueChange={(value) => value && updateStep(index, { brandProfileId: value })}>
                      <SelectTrigger id={`${step.id}-brand`} size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Predeterminado</SelectItem>
                        {brandProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {step.type === "transform" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${step.id}-transform-kind`}>Transformación</Label>
                      <Select
                        value={step.transformKind ?? ""}
                        onValueChange={(value) => value && updateStep(index, { transformKind: value as WorkflowStep["transformKind"] })}
                      >
                        <SelectTrigger id={`${step.id}-transform-kind`} size="sm" className="w-full">
                          <SelectValue placeholder="Selecciona una transformación" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uppercase">MAYÚSCULAS</SelectItem>
                          <SelectItem value="lowercase">minúsculas</SelectItem>
                          <SelectItem value="trim">Recortar espacios</SelectItem>
                          <SelectItem value="prefix">Añadir prefijo</SelectItem>
                          <SelectItem value="suffix">Añadir sufijo</SelectItem>
                          <SelectItem value="truncate">Truncar (longitud)</SelectItem>
                          <SelectItem value="replace">Reemplazo literal</SelectItem>
                          <SelectItem value="combine">Combinar salidas anteriores</SelectItem>
                          <SelectItem value="extract_section">Extraer sección por encabezado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {step.transformKind === "prefix" ||
                    step.transformKind === "suffix" ||
                    step.transformKind === "truncate" ||
                    step.transformKind === "replace" ||
                    step.transformKind === "extract_section" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor={`${step.id}-transform-value`}>
                          {step.transformKind === "truncate"
                            ? "Longitud máxima"
                            : step.transformKind === "replace"
                              ? "Texto a buscar"
                              : step.transformKind === "extract_section"
                                ? "Encabezado a extraer"
                                : "Texto"}
                        </Label>
                        <Input
                          id={`${step.id}-transform-value`}
                          value={step.transformValue ?? ""}
                          onChange={(event) => updateStep(index, { transformValue: event.target.value })}
                          maxLength={200}
                        />
                      </div>
                    ) : null}
                    {step.transformKind === "replace" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor={`${step.id}-transform-replacement`}>Reemplazar por</Label>
                        <Input
                          id={`${step.id}-transform-replacement`}
                          value={step.transformReplacement ?? ""}
                          onChange={(event) => updateStep(index, { transformReplacement: event.target.value })}
                          maxLength={200}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {step.type === "workflow" ? (
                  <div className="space-y-3 rounded-lg border border-dashed p-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${step.id}-child-workflow`}>Workflow a ejecutar (SubWorkflow)</Label>
                      <Select
                        value={step.childWorkflowId ?? ""}
                        onValueChange={(value) => {
                          if (!value) return;
                          updateStep(index, { childWorkflowId: value, childRevisionMode: step.childRevisionMode ?? "latest", childRevisionId: undefined });
                          if (step.childRevisionMode === "specific") void ensureChildRevisionsLoaded(value);
                        }}
                      >
                        <SelectTrigger id={`${step.id}-child-workflow`} size="sm" className="w-full">
                          <SelectValue placeholder="Selecciona un workflow" />
                        </SelectTrigger>
                        <SelectContent>
                          {workflowOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                              {option.publishedVersion === null ? " (sin publicar)" : ` (v${option.publishedVersion})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {workflowOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tienes otros workflows disponibles todavía para usar como sub-workflow.</p>
                      ) : null}
                    </div>

                    {step.childWorkflowId ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`${step.id}-child-revision-mode`}>Versión</Label>
                          <Select
                            value={step.childRevisionMode ?? "latest"}
                            onValueChange={(value) => {
                              if (!value) return;
                              updateStep(index, { childRevisionMode: value as "latest" | "specific", childRevisionId: undefined });
                              if (value === "specific" && step.childWorkflowId) void ensureChildRevisionsLoaded(step.childWorkflowId);
                            }}
                          >
                            <SelectTrigger id={`${step.id}-child-revision-mode`} size="sm" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="latest">Última versión publicada</SelectItem>
                              <SelectItem value="specific">Versión específica</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {step.childRevisionMode === "specific" ? (
                          <div className="space-y-1.5">
                            <Label htmlFor={`${step.id}-child-revision`}>Revisión</Label>
                            <Select
                              value={step.childRevisionId ?? ""}
                              onValueChange={(value) => value && updateStep(index, { childRevisionId: value })}
                            >
                              <SelectTrigger id={`${step.id}-child-revision`} size="sm" className="w-full">
                                <SelectValue placeholder="Selecciona una versión" />
                              </SelectTrigger>
                              <SelectContent>
                                {(childRevisions[step.childWorkflowId] ?? []).map((revision) => (
                                  <SelectItem key={revision.id} value={revision.id}>
                                    v{revision.version}
                                    {revision.isActive ? " (activa)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {(() => {
                      const childOption = workflowOptions.find((o) => o.id === step.childWorkflowId);
                      if (!childOption || childOption.variables.length === 0) return null;
                      return (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Variables de entrada de &quot;{childOption.name}&quot; — usa{" "}
                            <code className="rounded bg-muted px-1">{"{{variable}}"}</code> o{" "}
                            <code className="rounded bg-muted px-1">{"{{salida_de_paso_anterior}}"}</code> de ESTE workflow.
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {childOption.variables.map((varName) => (
                              <div key={varName} className="space-y-1.5">
                                <Label htmlFor={`${step.id}-child-var-${varName}`}>{`{{${varName}}}`}</Label>
                                <Input
                                  id={`${step.id}-child-var-${varName}`}
                                  value={step.childInputMapping?.[varName] ?? ""}
                                  onChange={(event) => updateChildInputMapping(index, varName, event.target.value)}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor={`${step.id}-input`}>
                    Entrada del paso — usa <code className="rounded bg-muted px-1">{"{{variable}}"}</code> o{" "}
                    <code className="rounded bg-muted px-1">{"{{salida_de_paso_anterior}}"}</code>
                  </Label>
                  <Textarea
                    id={`${step.id}-input`}
                    value={step.inputTemplate ?? ""}
                    onChange={(event) => updateStep(index, { inputTemplate: event.target.value })}
                    rows={3}
                    className="font-mono text-sm"
                  />
                </div>

                {stepIssues.length > 0 ? (
                  <div className="space-y-1">
                    {stepIssues.map((issue, issueIndex) => (
                      <p key={issueIndex} className="text-xs text-destructive">
                        {issue.message}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {WORKFLOW_STEP_TYPES.map((type) => (
          <Button key={type} type="button" variant="outline" size="sm" onClick={() => addStep(type)}>
            + {STEP_TYPE_LABELS[type]}
          </Button>
        ))}
      </div>

      {issues.some((issue) => issue.stepId === null) ? (
        <div className="space-y-1">
          {issues
            .filter((issue) => issue.stepId === null)
            .map((issue, issueIndex) => (
              <p key={issueIndex} className="text-xs text-destructive">
                {issue.message}
              </p>
            ))}
        </div>
      ) : null}
    </div>
  );
}

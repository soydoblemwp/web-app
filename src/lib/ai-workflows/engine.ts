import { analyzeTemplateVariables, renderTemplate } from "@/lib/ai-templates/engine";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";

/**
 * The AI Workflows engine: validates a workflow's step sequence (types,
 * references, variable order, circular dependencies, and — for real
 * execution — tool existence and required-field completeness) and can
 * resolve a full, deterministic PREVIEW plan from it. Pure and
 * dependency-free besides reusing AI Templates' own {{variable}} engine and
 * the real, static AI Center tool registry (both already safe to import
 * client- or server-side — no duplicated parsing logic, no second tool
 * list) so it runs identically in both places.
 *
 * planWorkflowRun below is PREVIEW ONLY and unchanged from Phase 20: it
 * never calls a real AI tool, the local model, or any external service —
 * every "ai_tool", "prompt_library" and "ai_template" step produces a
 * clearly-labeled "[Simulado]" placeholder string built only from its own
 * resolved input. Real execution (Phase 21) is a separate, server-orchestrated
 * flow, driven by the server actions under src/server/actions, that still
 * runs the single existing local engine (src/lib/ai/local/engine.ts) for
 * actual generation, since that engine is browser-only ("client-only") and
 * cannot run on the server; this module supplies the pure resolution logic
 * that flow reuses (resolveStepForExecution), never a second implementation.
 */

export type WorkflowStepType = "ai_tool" | "prompt_library" | "ai_template" | "brand_kit" | "transform" | "save_result" | "workflow";

export const WORKFLOW_STEP_TYPES: WorkflowStepType[] = [
  "ai_tool",
  "prompt_library",
  "ai_template",
  "brand_kit",
  "transform",
  "save_result",
  "workflow",
];

/** "workflow" step only — which revision of the referenced Workflow to execute. "latest": the child's currently-active PUBLISHED revision, re-resolved (never re-published mid-run) at the moment the PARENT's own snapshot is built. "specific": always childRevisionId, frozen forever regardless of what the child publishes later. Never "draft" outside an explicit "Probar borrador" test of the PARENT itself. */
export type WorkflowChildRevisionMode = "latest" | "specific";

/** Deterministic, safe transforms only — no eval, no user-supplied code, no regex built from user input. */
export type WorkflowTransformKind =
  | "uppercase"
  | "lowercase"
  | "trim"
  | "prefix"
  | "suffix"
  | "truncate"
  | "replace"
  | "combine"
  | "extract_section";

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  label: string;
  /** Name this step's (simulated or real) output becomes available under to later steps — just another {{variable}} in the same namespace as workflow-level variables. */
  outputVariable: string;
  /** ai_tool step: AiToolDefinition.slug (see src/lib/ai-center/tools/registry.ts). */
  toolSlug?: string;
  /** ai_tool step only: one {{variable}}-templated value per required/optional field the selected tool declares (AiToolDefinition.fields[].name → template string). Resolved the same way inputTemplate is for every other step type. */
  fieldInputs?: Record<string, string>;
  /** prompt_library step: SavedPrompt.id. */
  promptId?: string;
  /** ai_template step: AiTemplate.id. */
  templateId?: string;
  /** brand_kit step: BrandProfile.id, or "default" for the user's default Brand Kit. */
  brandProfileId?: string;
  transformKind?: WorkflowTransformKind;
  /** prefix/suffix text, truncate length, "replace"'s search text, or "extract_section"'s heading text. */
  transformValue?: string;
  /** "replace" only: the literal replacement text for transformValue's literal search text. */
  transformReplacement?: string;
  /** Free text with {{variable}}/{{stepOutput}} tokens — this step's own input. */
  inputTemplate?: string;
  /** workflow step: Workflow.id of the child (SubWorkflow) to execute. */
  childWorkflowId?: string;
  /** workflow step: see WorkflowChildRevisionMode. */
  childRevisionMode?: WorkflowChildRevisionMode;
  /** workflow step, childRevisionMode "specific" only: the id of the specific published revision to run — frozen, never re-resolved. */
  childRevisionId?: string;
  /** workflow step: child variable name → {{parent variable}}-templated value, resolved against THIS workflow's own resolved variables (workflow inputs + prior steps' outputs) exactly like every other step's templates, then passed as the child run's own inputVariables. */
  childInputMapping?: Record<string, string>;
}

export interface WorkflowValidationIssue {
  /** null for a workflow-level issue (e.g. no steps at all). */
  stepId: string | null;
  code:
    | "empty_steps"
    | "invalid_step_type"
    | "missing_reference"
    | "invalid_output_variable"
    | "duplicate_output_variable"
    | "unknown_variable"
    | "forward_reference"
    | "circular_reference"
    | "tool_not_found"
    | "missing_field_input"
    | "invalid_child_revision_mode";
  message: string;
}

const VARIABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Every template string a step can reference {{variables}} from — inputTemplate for every step type, plus one per ai_tool field input. */
function stepTemplateStrings(step: WorkflowStep): string[] {
  const strings: string[] = [];
  if (step.inputTemplate) strings.push(step.inputTemplate);
  if (step.fieldInputs) strings.push(...Object.values(step.fieldInputs));
  if (step.childInputMapping) strings.push(...Object.values(step.childInputMapping));
  return strings;
}

function stepReferencedNames(step: WorkflowStep): string[] {
  const seen: string[] = [];
  const seenSet = new Set<string>();
  for (const template of stepTemplateStrings(step)) {
    for (const name of analyzeTemplateVariables(template).names) {
      if (seenSet.has(name)) continue;
      seenSet.add(name);
      seen.push(name);
    }
  }
  return seen;
}

function stepInvalidTokens(step: WorkflowStep): string[] {
  const seen: string[] = [];
  const seenSet = new Set<string>();
  for (const template of stepTemplateStrings(step)) {
    for (const token of analyzeTemplateVariables(template).invalidTokens) {
      if (seenSet.has(token)) continue;
      seenSet.add(token);
      seen.push(token);
    }
  }
  return seen;
}

/** Every {{token}} used anywhere in the workflow that isn't produced by any step — the workflow's own run-time inputs. Always server-derived, mirrors AiTemplate.variables. */
export function deriveWorkflowVariables(steps: WorkflowStep[]): string[] {
  const outputVariables = new Set(steps.map((step) => step.outputVariable));
  const seen: string[] = [];
  const seenSet = new Set<string>();

  for (const step of steps) {
    for (const name of stepReferencedNames(step)) {
      if (outputVariables.has(name) || seenSet.has(name)) continue;
      seenSet.add(name);
      seen.push(name);
    }
  }
  return seen;
}

/**
 * Builds the dependency graph (each step → the step ids whose output it
 * references) and finds cycles via DFS. Modeled as a general graph (not
 * just "must be earlier in the array") so this validation stays meaningful
 * even if step reordering/branching is added in a future phase.
 */
export function detectCircularReferences(steps: WorkflowStep[]): string[][] {
  const outputVariableToStepId = new Map<string, string>();
  for (const step of steps) outputVariableToStepId.set(step.outputVariable, step.id);

  const dependsOn = new Map<string, string[]>();
  for (const step of steps) {
    const deps = stepReferencedNames(step)
      .map((name) => outputVariableToStepId.get(name))
      .filter((id): id is string => Boolean(id) && id !== step.id);
    dependsOn.set(step.id, deps);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];

  function visit(stepId: string) {
    visited.add(stepId);
    onStack.add(stepId);
    stack.push(stepId);

    for (const dep of dependsOn.get(stepId) ?? []) {
      if (!visited.has(dep)) {
        visit(dep);
      } else if (onStack.has(dep)) {
        const cycleStart = stack.indexOf(dep);
        cycles.push(stack.slice(cycleStart));
      }
    }

    stack.pop();
    onStack.delete(stepId);
  }

  for (const step of steps) {
    if (!visited.has(step.id)) visit(step.id);
  }
  return cycles;
}

/** Validates step types, required references, output-variable naming/uniqueness, variable order (no forward references) and circular dependencies. */
export function validateWorkflowSteps(steps: WorkflowStep[]): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];

  if (steps.length === 0) {
    return [{ stepId: null, code: "empty_steps", message: "El workflow no tiene ningún paso." }];
  }

  const outputVariableToIndex = new Map<string, number>();

  steps.forEach((step, index) => {
    if (!WORKFLOW_STEP_TYPES.includes(step.type)) {
      issues.push({ stepId: step.id, code: "invalid_step_type", message: `Tipo de paso inválido: "${step.type}".` });
    }

    if (!VARIABLE_NAME_RE.test(step.outputVariable)) {
      issues.push({
        stepId: step.id,
        code: "invalid_output_variable",
        message: `El nombre de salida "${step.outputVariable}" del paso "${step.label}" no es válido.`,
      });
    } else if (outputVariableToIndex.has(step.outputVariable)) {
      issues.push({
        stepId: step.id,
        code: "duplicate_output_variable",
        message: `La variable de salida "${step.outputVariable}" ya la usa otro paso.`,
      });
    } else {
      outputVariableToIndex.set(step.outputVariable, index);
    }

    if (step.type === "ai_tool") {
      if (!step.toolSlug) {
        issues.push({ stepId: step.id, code: "missing_reference", message: `Falta la herramienta de IA en el paso "${step.label}".` });
      } else {
        const tool = findToolDefinition(step.toolSlug);
        if (!tool) {
          issues.push({
            stepId: step.id,
            code: "tool_not_found",
            message: `La herramienta "${step.toolSlug}" del paso "${step.label}" ya no existe en el registro de AI Center.`,
          });
        } else if (step.fieldInputs) {
          // Per-field inputs are only validated once the step actually opts
          // into them — a step still driven by a single inputTemplate (the
          // Phase 20 shape, and still valid for preview) is left alone here;
          // real execution's own resolveStepForExecution independently
          // requires every required field to resolve non-empty before it
          // will build a prompt, so nothing unsafe reaches buildUserPrompt.
          for (const field of tool.fields) {
            if (field.required && !step.fieldInputs[field.name]?.trim()) {
              issues.push({
                stepId: step.id,
                code: "missing_field_input",
                message: `Falta el valor del campo "${field.label}" (${tool.label}) en el paso "${step.label}".`,
              });
            }
          }
        }
      }
    }
    if (step.type === "prompt_library" && !step.promptId) {
      issues.push({ stepId: step.id, code: "missing_reference", message: `Falta el prompt de Prompt Library en el paso "${step.label}".` });
    }
    if (step.type === "ai_template" && !step.templateId) {
      issues.push({ stepId: step.id, code: "missing_reference", message: `Falta el AI Template en el paso "${step.label}".` });
    }
    if (step.type === "brand_kit" && !step.brandProfileId) {
      issues.push({ stepId: step.id, code: "missing_reference", message: `Falta el Brand Kit en el paso "${step.label}".` });
    }
    if (step.type === "transform") {
      if (!step.transformKind) {
        issues.push({ stepId: step.id, code: "missing_reference", message: `Falta el tipo de transformación en el paso "${step.label}".` });
      } else if ((step.transformKind === "replace" || step.transformKind === "extract_section") && !step.transformValue?.trim()) {
        issues.push({
          stepId: step.id,
          code: "missing_reference",
          message: `Falta el ${step.transformKind === "replace" ? "texto a buscar" : "encabezado"} en el paso "${step.label}".`,
        });
      }
    }
    if (step.type === "workflow") {
      if (!step.childWorkflowId) {
        issues.push({ stepId: step.id, code: "missing_reference", message: `Falta el workflow a ejecutar en el paso "${step.label}".` });
      }
      if (step.childRevisionMode && step.childRevisionMode !== "latest" && step.childRevisionMode !== "specific") {
        issues.push({
          stepId: step.id,
          code: "invalid_child_revision_mode",
          message: `El modo de versión "${step.childRevisionMode}" del paso "${step.label}" no es válido.`,
        });
      }
      if (step.childRevisionMode === "specific" && !step.childRevisionId) {
        issues.push({
          stepId: step.id,
          code: "missing_reference",
          message: `Falta la versión específica del workflow hijo en el paso "${step.label}".`,
        });
      }
    }
  });

  const declaredVariables = new Set(deriveWorkflowVariables(steps));

  steps.forEach((step, index) => {
    // A malformed {{token}} (empty, digit-leading, contains spaces/symbols)
    // is the only way a variable reference can be genuinely "unknown" —
    // every well-formed name is by construction either produced by an
    // earlier step or a declared workflow-level input (see
    // deriveWorkflowVariables), so those two are never ambiguous.
    for (const token of stepInvalidTokens(step)) {
      issues.push({
        stepId: step.id,
        code: "unknown_variable",
        message: `El paso "${step.label}" usa una referencia de variable inválida: "{{${token}}}".`,
      });
    }

    for (const name of stepReferencedNames(step)) {
      if (declaredVariables.has(name)) continue; // a workflow-level run-time input — always valid regardless of order

      const producerIndex = outputVariableToIndex.get(name);
      if (producerIndex !== undefined && producerIndex >= index) {
        issues.push({
          stepId: step.id,
          code: "forward_reference",
          message: `El paso "${step.label}" usa "{{${name}}}" antes de que se genere (paso ${producerIndex + 1}).`,
        });
      }
    }
  });

  for (const cycle of detectCircularReferences(steps)) {
    const labels = cycle.map((id) => steps.find((s) => s.id === id)?.label ?? id);
    issues.push({
      stepId: cycle[0],
      code: "circular_reference",
      message: `Referencia circular entre pasos: ${labels.join(" → ")}.`,
    });
  }

  return issues;
}

/**
 * Extracts the section under a markdown-style heading line (`# `..`###### `)
 * that matches `heading` exactly (case-insensitive), up to the next heading
 * of the same or higher level. Pure string/line scanning — the heading text
 * is compared with plain equality, never turned into a regex, so arbitrary
 * user text can never cause a ReDoS or unexpected pattern match. Returns
 * the original text unchanged when the heading "no existe", per spec.
 */
function extractSectionByHeading(text: string, heading: string): string {
  const target = heading.trim().toLowerCase();
  if (!target) return text;
  const lines = text.split("\n");
  const headingRe = /^(#{1,6})\s*(.+?)\s*$/;

  let startIndex = -1;
  let startLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = headingRe.exec(lines[i]);
    if (match && match[2].toLowerCase() === target) {
      startIndex = i;
      startLevel = match[1].length;
      break;
    }
  }
  if (startIndex === -1) return text;

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = headingRe.exec(lines[i]);
    if (match && match[1].length <= startLevel) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join("\n").trim();
}

/** Every kind is a deterministic, pure string operation — no eval, no dynamically-constructed regex from user text, no arbitrary code execution. Exported so real execution (src/lib/ai-workflows/execution-resolver.ts) reuses the exact same implementation — never a second one. */
export function applyTransform(
  input: string,
  kind: WorkflowTransformKind | undefined,
  value: string | undefined,
  replacement: string | undefined
): string {
  switch (kind) {
    case "uppercase":
      return input.toUpperCase();
    case "lowercase":
      return input.toLowerCase();
    case "trim":
      return input.trim();
    case "prefix":
      return `${value ?? ""}${input}`;
    case "suffix":
      return `${input}${value ?? ""}`;
    case "truncate": {
      const limit = Number(value);
      return Number.isFinite(limit) && limit > 0 ? input.slice(0, limit) : input;
    }
    case "replace":
      // Literal substring replacement only — split/join, never `new RegExp(value)`.
      return value ? input.split(value).join(replacement ?? "") : input;
    case "combine":
      // The combination already happened via this step's own inputTemplate
      // interpolating multiple {{stepOutput}} variables — this is a
      // documented pass-through, not a no-op left over by accident.
      return input;
    case "extract_section":
      return extractSectionByHeading(input, value ?? "");
    default:
      return input;
  }
}

export interface WorkflowStepRunResult {
  stepId: string;
  label: string;
  type: WorkflowStepType;
  resolvedInput: string;
  /** Never a real generation — deterministic text built only from resolvedInput and the step's own reference/config. */
  simulatedOutput: string;
  missingVariables: string[];
}

/** Deterministic, key-order-independent structural comparison — object key insertion order can legitimately differ between what the client sent and what Prisma reads back, so a plain JSON.stringify diff would false-positive on those. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * True when the steps array changed in any way that could affect what a run
 * actually DOES (type, order, references, templates, transforms, field
 * inputs, output variable names) — used by updateWorkflowAction to decide
 * whether to bump Workflow.version. Purely visual/metadata edits (name,
 * description, tags, category, favorite, active) never call this, so they
 * never bump the version, per spec.
 */
export function haveWorkflowStepsChanged(oldSteps: WorkflowStep[], newSteps: WorkflowStep[]): boolean {
  return stableStringify(oldSteps) !== stableStringify(newSteps);
}

export interface WorkflowRunResult {
  steps: WorkflowStepRunResult[];
  finalOutput: string;
  /** Non-empty means the run was refused — see planWorkflowRun. */
  issues: WorkflowValidationIssue[];
}

function describeSimulatedOutput(step: WorkflowStep, resolvedInput: string, refLabel: string | undefined): string {
  switch (step.type) {
    case "ai_tool":
      return `[Simulado] "${refLabel ?? step.toolSlug ?? "herramienta"}" generaría contenido a partir de: ${resolvedInput}`;
    case "prompt_library":
      return `[Simulado] Se usaría el prompt "${refLabel ?? step.promptId}" con: ${resolvedInput}`;
    case "ai_template":
      return `[Simulado] Se renderizaría el template "${refLabel ?? step.templateId}" con: ${resolvedInput}`;
    case "brand_kit":
      return resolvedInput || `[Simulado] Contexto del Brand Kit "${refLabel ?? step.brandProfileId}".`;
    case "transform":
      return applyTransform(resolvedInput, step.transformKind, step.transformValue, step.transformReplacement);
    case "save_result":
      return resolvedInput;
    case "workflow":
      return `[Simulado] Se ejecutaría el workflow "${refLabel ?? step.childWorkflowId}" como sub-workflow y se usaría su resultado final.`;
  }
}

/**
 * Resolves the full run plan: walks the steps in order, substitutes
 * {{variables}} (workflow inputs and prior steps' outputs) via the same
 * renderTemplate engine AI Templates uses, and records each step's
 * simulated output. Refuses to run (empty steps/finalOutput, issues
 * returned) when validateWorkflowSteps finds any problem — a workflow must
 * be structurally valid before it can even be simulated.
 *
 * `referenceLabels` optionally maps a step's reference id (toolSlug,
 * promptId, templateId, brandProfileId) to a human label for nicer output —
 * purely cosmetic, resolved by the caller (client or server) since this
 * function itself never touches a database.
 */
export function planWorkflowRun(
  steps: WorkflowStep[],
  variableValues: Record<string, string>,
  referenceLabels: Record<string, string> = {}
): WorkflowRunResult {
  const issues = validateWorkflowSteps(steps);
  if (issues.length > 0) return { steps: [], finalOutput: "", issues };

  const resolvedVariables: Record<string, string> = { ...variableValues };
  const results: WorkflowStepRunResult[] = [];

  for (const step of steps) {
    const { output: resolvedInput, missing } = renderTemplate(step.inputTemplate ?? "", resolvedVariables);
    const refId = step.toolSlug ?? step.promptId ?? step.templateId ?? step.brandProfileId ?? step.childWorkflowId;
    const simulatedOutput = describeSimulatedOutput(step, resolvedInput, refId ? referenceLabels[refId] : undefined);

    resolvedVariables[step.outputVariable] = simulatedOutput;
    results.push({ stepId: step.id, label: step.label, type: step.type, resolvedInput, simulatedOutput, missingVariables: missing });
  }

  return { steps: results, finalOutput: results[results.length - 1]?.simulatedOutput ?? "", issues: [] };
}

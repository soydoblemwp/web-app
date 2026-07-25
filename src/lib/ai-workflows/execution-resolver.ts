import { renderTemplate } from "@/lib/ai-templates/engine";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";
import type { AiToolFieldValues } from "@/lib/ai-center/tools/types";
import { applyTransform, type WorkflowStep } from "@/lib/ai-workflows/engine";

/**
 * Resolves ONE workflow step for REAL execution — pure, no database access,
 * no network call, no AI generation. It only ever:
 *  - looks up the real tool via findToolDefinition (the one AI Center
 *    registry, never a duplicate),
 *  - calls that tool's own buildSystemPrompt/buildUserPrompt (the real
 *    AiToolDefinition, never reimplemented),
 *  - substitutes {{variables}} via the same renderTemplate engine AI
 *    Templates uses,
 *  - applies the same deterministic applyTransform every preview run uses.
 *
 * Callers (src/server/services/workflow-execution.ts) do all the database
 * work — fetching the prompt/template/brand profile, checking ownership —
 * and pass the already-resolved text in via `resources`; this function
 * itself never trusts an id, only already-verified content. For an
 * "ai_tool" step, this never calls the model itself (it can't — the local
 * engine is browser-only) — it returns the exact system/user prompt the
 * caller must send through the existing useLocalAI/generateLocalText engine
 * in the browser, and the caller reports the real result back.
 */

export type StepResolutionResult =
  | { kind: "ai_call"; systemPrompt: string; userPrompt: string; resolvedInputSummary: string }
  | { kind: "resolved"; output: string; resolvedInputSummary: string }
  | { kind: "sub_workflow"; childInputVariables: Record<string, string>; resolvedInputSummary: string }
  | { kind: "error"; message: string; resolvedInputSummary?: string };

export interface ExecutionResourceContext {
  /** Project brand context + the user's resolved BrandProfile context, already composed by the caller — passed to every ai_tool step's buildSystemPrompt, exactly like every other real generation in this app. */
  brandContext: string;
  /** prompt_library step: the SavedPrompt's own content, already ownership-verified by the caller. */
  promptContent?: string;
  /** prompt_library step: SavedPrompt.useBrandKit — when true, the resolved prompt is combined with brandProfileContext. */
  promptUseBrandKit?: boolean;
  /** ai_template step: the AiTemplate's own content, already ownership-verified by the caller. */
  templateContent?: string;
  /** ai_template step: {{brand_*}} auto-fill values from buildBrandProfileTemplateVariables, already computed by the caller. */
  templateBrandVariables?: Record<string, string>;
  /** brand_kit step: the resolved BrandProfile's context text (buildBrandProfileContext), already ownership-verified by the caller. */
  brandProfileContext?: string;
  /** workflow step (SubWorkflow): the child Workflow.id, resolved and ownership-checked once at PARENT-snapshot-build time — frozen here, never re-resolved at run time. */
  childWorkflowId?: string;
  /** workflow step: the exact WorkflowRevision.id to execute — resolved ONCE at parent-snapshot-build time (either the child's active revision at that moment, for "latest" mode, or the explicit pinned revision, for "specific" mode) and frozen. The child run always executes against exactly this revision, never a re-resolved "latest", even if the child publishes again before the parent run reaches this step. */
  childRevisionId?: string;
  /** The frozen revision's own definitionHash, carried alongside childRevisionId purely so the freeze can be verified/displayed without a second lookup. */
  childDefinitionHash?: string;
  /** The frozen revision's own name, for display only (Workspace/progress UI labels). */
  childWorkflowName?: string;
}

function missingVariablesError(missing: string[]): StepResolutionResult {
  return { kind: "error", message: `Faltan valores para las variables: ${missing.map((name) => `{{${name}}}`).join(", ")}.` };
}

export function resolveStepForExecution(
  step: WorkflowStep,
  resolvedVariables: Record<string, string>,
  resources: ExecutionResourceContext
): StepResolutionResult {
  switch (step.type) {
    case "ai_tool": {
      const tool = findToolDefinition(step.toolSlug ?? "");
      if (!tool) return { kind: "error", message: `La herramienta "${step.toolSlug}" ya no existe en el registro de AI Center.` };

      const values: AiToolFieldValues = {};
      const missingFields: string[] = [];
      for (const field of tool.fields) {
        const template = step.fieldInputs?.[field.name] ?? "";
        const { output, missing } = renderTemplate(template, resolvedVariables);
        if (field.required && (!output.trim() || missing.length > 0)) missingFields.push(field.label);
        values[field.name] = output;
      }
      if (missingFields.length > 0) {
        return { kind: "error", message: `Faltan valores para los campos: ${missingFields.join(", ")}.` };
      }

      return {
        kind: "ai_call",
        systemPrompt: tool.buildSystemPrompt(resources.brandContext),
        userPrompt: tool.buildUserPrompt(values),
        resolvedInputSummary: JSON.stringify(values),
      };
    }

    case "prompt_library": {
      if (resources.promptContent === undefined) return { kind: "error", message: "El prompt de este paso ya no está disponible." };
      const { output, missing } = renderTemplate(resources.promptContent, resolvedVariables);
      if (missing.length > 0) return missingVariablesError(missing);

      const finalOutput =
        resources.promptUseBrandKit && resources.brandProfileContext ? [output, resources.brandProfileContext].join("\n\n") : output;
      return { kind: "resolved", output: finalOutput, resolvedInputSummary: output };
    }

    case "ai_template": {
      if (resources.templateContent === undefined) return { kind: "error", message: "El AI Template de este paso ya no está disponible." };
      // Brand auto-fill variables act as defaults; explicit workflow variables of the same name win.
      const mergedVariables = { ...(resources.templateBrandVariables ?? {}), ...resolvedVariables };
      const { output, missing } = renderTemplate(resources.templateContent, mergedVariables);
      if (missing.length > 0) return missingVariablesError(missing);
      return { kind: "resolved", output, resolvedInputSummary: output };
    }

    case "brand_kit": {
      if (resources.brandProfileContext === undefined) return { kind: "error", message: "El Brand Kit de este paso ya no está disponible." };
      return { kind: "resolved", output: resources.brandProfileContext, resolvedInputSummary: resources.brandProfileContext };
    }

    case "transform": {
      const { output: resolvedInput, missing } = renderTemplate(step.inputTemplate ?? "", resolvedVariables);
      if (missing.length > 0) return missingVariablesError(missing);
      const output = applyTransform(resolvedInput, step.transformKind, step.transformValue, step.transformReplacement);
      return { kind: "resolved", output, resolvedInputSummary: resolvedInput };
    }

    case "save_result": {
      const { output: resolvedInput, missing } = renderTemplate(step.inputTemplate ?? "", resolvedVariables);
      if (missing.length > 0) return missingVariablesError(missing);
      return { kind: "resolved", output: resolvedInput, resolvedInputSummary: resolvedInput };
    }

    case "workflow": {
      if (!resources.childWorkflowId || !resources.childRevisionId) {
        return { kind: "error", message: "El workflow hijo de este paso ya no está disponible." };
      }
      const childInputVariables: Record<string, string> = {};
      const missingAll: string[] = [];
      for (const [childVarName, template] of Object.entries(step.childInputMapping ?? {})) {
        const { output, missing } = renderTemplate(template, resolvedVariables);
        childInputVariables[childVarName] = output;
        missingAll.push(...missing);
      }
      if (missingAll.length > 0) return missingVariablesError(missingAll);
      return { kind: "sub_workflow", childInputVariables, resolvedInputSummary: JSON.stringify(childInputVariables) };
    }

    default:
      return { kind: "error", message: `Tipo de paso desconocido: "${step.type}".` };
  }
}

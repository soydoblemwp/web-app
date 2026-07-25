import { analyzeTemplateVariables } from "@/lib/ai-templates/engine";
import { validateWorkflowSteps, type WorkflowStep } from "@/lib/ai-workflows/engine";
import { WORKFLOW_EXECUTION_LIMITS } from "@/lib/ai-workflows/limits";
import type { WorkflowDiffResult } from "@/lib/ai-workflows/workflow-diff";

/**
 * Full pre-publish validation, structured and testable — never a single
 * pass/fail boolean. `error` always blocks publishing; `warning`/`info`
 * never do. This module is pure/DB-free: it reuses the existing structural
 * engine (validateWorkflowSteps — types, references, cycles, tool
 * existence, required-field completeness) for every error, and adds a
 * handful of deterministic warnings on top. Resource-OWNERSHIP checks
 * (does this Prompt Library id actually belong to this user) need the
 * database and are layered on separately by the publish service, which
 * folds their errors into this same result shape.
 */

export type PublishIssueSeverity = "error" | "warning" | "info";

export interface PublishIssue {
  severity: PublishIssueSeverity;
  code: string;
  message: string;
  stepId?: string | null;
}

export interface PublishValidationResult {
  issues: PublishIssue[];
  errors: PublishIssue[];
  warnings: PublishIssue[];
  infos: PublishIssue[];
  /** Publishing is blocked exactly when this is true — errors only, never warnings/info. */
  canPublish: boolean;
}

function groupIssues(issues: PublishIssue[]): PublishValidationResult {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");
  return { issues, errors, warnings, infos, canPublish: errors.length === 0 };
}

/** Every template string a step can reference {{variables}} from — mirrors engine.ts's own private helper since both need the exact same notion of "a step's referenced text". */
function stepTemplateStrings(step: WorkflowStep): string[] {
  const strings: string[] = [];
  if (step.inputTemplate) strings.push(step.inputTemplate);
  if (step.fieldInputs) strings.push(...Object.values(step.fieldInputs));
  return strings;
}

/**
 * Structural-only validation (no DB) — the errors here are exactly
 * validateWorkflowSteps' own issues (never re-implemented), plus warnings
 * for things that are legal but probably unintended.
 */
export function validateStepsForPublish(steps: WorkflowStep[]): PublishValidationResult {
  const issues: PublishIssue[] = [];

  for (const structuralIssue of validateWorkflowSteps(steps)) {
    issues.push({ severity: "error", code: structuralIssue.code, message: structuralIssue.message, stepId: structuralIssue.stepId });
  }

  if (steps.length > 0) {
    if (!steps.some((s) => s.type === "save_result")) {
      issues.push({
        severity: "warning",
        code: "no_save_result",
        message: "Este workflow no tiene ningún paso 'Guardar resultado' — sus resultados nunca se guardarán automáticamente en el Workspace.",
      });
    }

    if (steps.length >= WORKFLOW_EXECUTION_LIMITS.MAX_STEPS_PER_RUN - 2) {
      issues.push({
        severity: "warning",
        code: "near_step_limit",
        message: `Este workflow tiene ${steps.length} pasos, cerca del máximo permitido en una ejecución (${WORKFLOW_EXECUTION_LIMITS.MAX_STEPS_PER_RUN}).`,
      });
    }

    for (const step of steps) {
      if (step.type === "transform" && !(step.inputTemplate ?? "").trim()) {
        issues.push({
          severity: "warning",
          code: "empty_step_input",
          message: `El paso "${step.label}" no tiene contenido de entrada configurado.`,
          stepId: step.id,
        });
      }
      if (step.type === "brand_kit" && !step.brandProfileId) {
        // Already an "error" (missing_reference) from validateWorkflowSteps above — not duplicated here.
        continue;
      }
    }

    // Unused step output: produced by a non-final step but never referenced
    // by any later step's own templates — legal (its value just becomes an
    // intermediate, unused byproduct), but worth flagging.
    const referencedVars = new Set<string>();
    for (const step of steps) {
      for (const template of stepTemplateStrings(step)) {
        for (const name of analyzeTemplateVariables(template).names) referencedVars.add(name);
      }
    }
    steps.forEach((step, index) => {
      const isLast = index === steps.length - 1;
      if (!isLast && !referencedVars.has(step.outputVariable)) {
        issues.push({
          severity: "warning",
          code: "unused_step_output",
          message: `La salida del paso "${step.label}" no se usa en ningún paso posterior.`,
          stepId: step.id,
        });
      }
    });
  }

  return groupIssues(issues);
}

/** Adds a "cambio significativo respecto a producción" warning when the draft-vs-active-published diff touches a large share of the workflow — computed by the publish service, which already has both definitions, and merged into the structural result here so callers see one combined list. */
export function addSignificantChangeWarning(result: PublishValidationResult, diff: WorkflowDiffResult, totalSteps: number): PublishValidationResult {
  const touchedSteps = new Set(diff.stepChanges.map((c) => c.stepId)).size;
  const isSignificant = touchedSteps >= 3 || (totalSteps > 0 && touchedSteps / totalSteps >= 0.5);
  if (!isSignificant) return result;
  const issue: PublishIssue = {
    severity: "warning",
    code: "significant_change_vs_production",
    message: "Este borrador introduce un cambio significativo respecto a la versión publicada actual.",
  };
  return groupIssues([...result.issues, issue]);
}

/** A pure error-only shortcut for callers (like resource-ownership checks) that just need to append a hard error and recompute canPublish. */
export function appendError(result: PublishValidationResult, code: string, message: string, stepId?: string | null): PublishValidationResult {
  return groupIssues([...result.issues, { severity: "error", code, message, stepId: stepId ?? null }]);
}

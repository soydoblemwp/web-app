import type { WorkflowLike } from "@/lib/ai-workflows/types";

/** How many workflows get embedded in the assistant's context — bounded, same rationale as Prompt Library/AI Templates' own limits. */
export const ASSISTANT_CONTEXT_WORKFLOW_LIMIT = 8;

const STEP_TYPE_LABELS: Record<string, string> = {
  ai_tool: "Ejecutar herramienta IA",
  prompt_library: "Usar Prompt Library",
  ai_template: "Usar AI Template",
  brand_kit: "Usar Brand Kit",
  transform: "Transformar salida",
  save_result: "Guardar resultado",
};

/**
 * Renders a bounded set of the user's AI Workflows into a text block Chat
 * IA's general assistant prompt can read — the same mechanism as Prompt
 * Library/AI Templates' own assistant-context builders, so "ejecuta mi
 * workflow SEO", "usa el workflow YouTube" or "completa el workflow
 * Marketing" work without any orchestrator or intent-router change: the
 * model sees each workflow's name, steps and declared variables on every
 * turn and can walk through/describe what it would produce, asking for any
 * variable value it's missing — it never silently invents one. This never
 * triggers a real run of the Workflow Engine; only Workspace-triggered runs
 * (see src/lib/ai-workflows/engine.ts) produce a simulated plan.
 */
export function buildWorkflowsAssistantContext(workflows: WorkflowLike[]): string {
  const active = workflows.filter((workflow) => workflow.isActive);
  if (active.length === 0) return "";

  const lines = active.map((workflow) => {
    const meta = [workflow.category, ...workflow.tags].filter(Boolean).join(", ");
    const steps = workflow.steps.map((step, index) => `${index + 1}. ${STEP_TYPE_LABELS[step.type] ?? step.type}: ${step.label}`);
    return [
      `- "${workflow.name}"${workflow.isFavorite ? " (favorito)" : ""}${meta ? ` [${meta}]` : ""}`,
      workflow.variables.length ? `  Variables: ${workflow.variables.map((v) => `{{${v}}}`).join(", ")}` : "  Variables: ninguna",
      `  Pasos:\n${steps.map((line) => `    ${line}`).join("\n")}`,
    ].join("\n");
  });

  return [
    "Workflows guardados en AI Workflows del usuario (secuencias de pasos reutilizables — cada paso ejecuta una herramienta, un prompt guardado, un AI Template, el Brand Kit o una transformación). Si el usuario pide ejecutar, usar o completar uno — por ejemplo \"ejecuta mi workflow SEO\", \"usa el workflow YouTube\" o \"completa el workflow Marketing\" — identifícalo por nombre, categoría o etiquetas, describe/aplica su secuencia de pasos y pide los valores de cualquier variable que falte en vez de inventarlos. Nunca inventes un workflow que no aparezca en esta lista.",
    "",
    ...lines,
  ].join("\n");
}

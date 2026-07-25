import { z } from "zod";
import { WORKFLOW_STEP_TYPES } from "@/lib/ai-workflows/engine";

const workflowStepSchema = z.object({
  id: z.string().trim().min(1).max(60),
  type: z.enum(WORKFLOW_STEP_TYPES as [string, ...string[]]),
  label: z.string().trim().min(1, "Cada paso necesita una etiqueta.").max(150),
  outputVariable: z.string().trim().min(1, "Cada paso necesita un nombre de salida.").max(60),
  toolSlug: z.string().trim().max(120).optional(),
  /** ai_tool steps only — one templated value per AiToolDefinition field. Was missing from this schema before the lifecycle phase, which silently stripped it on every save; now kept in sync with WorkflowStep (src/lib/ai-workflows/engine.ts). */
  fieldInputs: z.record(z.string(), z.string().trim().max(8000)).optional(),
  promptId: z.string().trim().max(60).optional(),
  templateId: z.string().trim().max(60).optional(),
  brandProfileId: z.string().trim().max(60).optional(),
  transformKind: z.enum(["uppercase", "lowercase", "trim", "prefix", "suffix", "truncate", "replace", "combine", "extract_section"]).optional(),
  transformValue: z.string().trim().max(200).optional(),
  /** "replace" only — was missing from this schema before the lifecycle phase. */
  transformReplacement: z.string().trim().max(200).optional(),
  inputTemplate: z.string().trim().max(8000).optional(),
  /** workflow step (SubWorkflow) only — see WorkflowStep in src/lib/ai-workflows/engine.ts. */
  childWorkflowId: z.string().trim().max(60).optional(),
  childRevisionMode: z.enum(["latest", "specific"]).optional(),
  childRevisionId: z.string().trim().max(60).optional(),
  childInputMapping: z.record(z.string(), z.string().trim().max(8000)).optional(),
});

export const createWorkflowSchema = z.object({
  projectId: z.string().cuid().nullable().default(null),
  name: z.string().trim().min(1, "El nombre del workflow es obligatorio.").max(200),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  isActive: z.boolean().default(true),
  steps: z.array(workflowStepSchema).max(50).default([]),
});

export const updateWorkflowSchema = createWorkflowSchema.partial().extend({
  id: z.string().cuid(),
  /** Optimistic-concurrency token — must match the Workflow's current editVersion or the save is rejected as a conflict. */
  editVersion: z.number().int().min(1),
});

export const publishWorkflowSchema = z.object({
  workflowId: z.string().cuid(),
  releaseNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const restoreRevisionSchema = z.object({
  workflowId: z.string().cuid(),
  revisionId: z.string().cuid(),
});

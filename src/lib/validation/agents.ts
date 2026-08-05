import { z } from "zod";
import { agentInputSchemaArray } from "@/lib/agents/dynamic-form";
import { AGENT_OUTPUT_TYPES, AGENT_CATEGORIES, AGENT_CREATIVITY_LEVELS, AGENT_TOOL_IDS } from "@/lib/agents/types";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/** Custom-agent creation/edit form (spec section 5). Instructions can never be empty — "no permitas instrucciones vacías." */
export const createAgentSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  description: z.string().trim().min(1, "La descripción es obligatoria.").max(2000),
  icon: z.string().trim().min(1).max(60),
  category: z.enum(AGENT_CATEGORIES),
  objective: optionalText(1000),
  systemInstructions: z.string().trim().min(1, "Las instrucciones no pueden estar vacías.").max(8000),
  inputSchema: agentInputSchemaArray,
  outputType: z.enum(AGENT_OUTPUT_TYPES),
  brandProfileId: z.string().cuid().nullable().optional(),
  language: z.string().trim().min(2).max(10).default("es"),
  creativity: z.enum(AGENT_CREATIVITY_LEVELS).default("BALANCED"),
  allowedTools: z.array(z.enum(AGENT_TOOL_IDS)).max(20).default([]),
  reviewerAgentRef: z.string().trim().max(60).nullable().optional(),
  requireApproval: z.boolean().default(false),
  maxSteps: z.number().int().min(1).max(10).default(1),
  visibility: z.enum(["PROJECT", "CREATOR_ONLY"]).default("PROJECT"),
});
export const updateAgentSchema = createAgentSchema.partial();
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const createTeamMemberSchema = z.object({
  agentRef: z.string().trim().min(1).max(60),
  order: z.number().int().min(0),
  enabled: z.boolean().default(true),
  requireApproval: z.boolean().default(false),
});

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  description: optionalText(1000),
  objective: optionalText(1000),
  coordinatorAgentRef: z.string().trim().min(1).max(60),
  reviewerAgentRef: z.string().trim().max(60).nullable().optional(),
  errorStrategy: z.enum(["STOP_ON_ERROR", "CONTINUE_INDEPENDENT_BRANCHES"]).default("STOP_ON_ERROR"),
  members: z.array(createTeamMemberSchema).min(1, "Un equipo necesita al menos un agente.").max(20),
});
export const updateTeamSchema = createTeamSchema.partial();

const contextSelectionSchema = z.object({
  brandProfileId: z.string().cuid().nullable().optional(),
  contentItemIds: z.array(z.string().cuid()).max(20).default([]),
  campaignId: z.string().cuid().nullable().optional(),
  campaignPieceId: z.string().cuid().nullable().optional(),
  socialPostId: z.string().cuid().nullable().optional(),
  promptIds: z.array(z.string().cuid()).max(10).default([]),
  fileAssetIds: z.array(z.string().cuid()).max(10).default([]),
  notes: optionalText(4000),
  previousRunIds: z.array(z.string().cuid()).max(5).default([]),
});
export { contextSelectionSchema };

export const createAgentRunSchema = z.object({
  idempotencyKey: z.string().trim().min(10).max(100),
  officialAgentKey: z.string().trim().max(60).nullable().optional(),
  customAgentId: z.string().cuid().nullable().optional(),
  teamId: z.string().cuid().nullable().optional(),
});

export const updateAgentRunInputSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  context: contextSelectionSchema.partial().optional(),
});

export const decideAgentApprovalSchema = z.object({
  stepOrder: z.number().int().min(0),
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  comment: optionalText(2000),
  /** Set when the user edited the AI's output as part of deciding — kept distinct from the raw output (spec section 13: "versión revisada"). */
  revisedOutput: z.record(z.string(), z.unknown()).optional(),
});

export const createAgentMemorySchema = z.object({
  agentRef: z.string().trim().min(1).max(60),
  type: z.enum(["PREFERENCE", "DECISION", "PERSISTENT_INSTRUCTION", "APPROVED_LEARNING", "BRAND_FACT", "CONSTRAINT", "PREFERRED_FORMAT"]),
  content: z.string().trim().min(1, "El contenido de la memoria no puede estar vacío.").max(2000),
  sourceRunId: z.string().cuid().nullable().optional(),
});

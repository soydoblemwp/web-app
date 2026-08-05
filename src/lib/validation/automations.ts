import { z } from "zod";
import { WORKFLOW_AUTOMATION_TRIGGER_TYPES, WORKFLOW_AUTOMATION_ERROR_POLICIES, WORKFLOW_AUTOMATION_CONDITION_OPERATORS, WORKFLOW_AUTOMATION_CONDITION_GROUP_OPERATORS } from "@/lib/automations/types";
import { INPUT_MAPPING_SOURCE_KINDS, INPUT_MAPPING_TRANSFORMS } from "@/lib/automations/mapping";
import { WORKFLOW_AUTOMATION_LIMITS } from "@/lib/automations/limits";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const conditionSchema = z.object({
  field: z.string().trim().min(1).max(200),
  operator: z.enum(WORKFLOW_AUTOMATION_CONDITION_OPERATORS),
  value: z.unknown().optional(),
});
export type ConditionInput = z.infer<typeof conditionSchema>;

export const conditionGroupSchema: z.ZodType<ConditionGroupInput> = z.lazy(() =>
  z.object({
    operator: z.enum(WORKFLOW_AUTOMATION_CONDITION_GROUP_OPERATORS),
    conditions: z.array(conditionSchema).max(WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITIONS_PER_GROUP),
    groups: z.array(conditionGroupSchema).max(WORKFLOW_AUTOMATION_LIMITS.MAX_CONDITION_GROUPS).optional(),
  })
);
export interface ConditionGroupInput {
  operator: "AND" | "OR";
  conditions: ConditionInput[];
  groups?: ConditionGroupInput[];
}

export const inputMappingSchema = z.object({
  targetVariable: z.string().trim().min(1).max(100),
  sourceKind: z.enum(INPUT_MAPPING_SOURCE_KINDS),
  sourceExpression: z.string().trim().min(1).max(2000),
  transform: z.enum(INPUT_MAPPING_TRANSFORMS).nullable().optional(),
  defaultValue: z.string().trim().max(2000).nullable().optional(),
});
export type InputMappingInput = z.infer<typeof inputMappingSchema>;

export const triggerSchema = z.object({
  type: z.enum(WORKFLOW_AUTOMATION_TRIGGER_TYPES),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type TriggerInput = z.infer<typeof triggerSchema>;

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  description: optionalText(2000),
  workflowId: z.string().cuid(),
  trigger: triggerSchema,
  conditions: conditionGroupSchema.optional(),
  inputMappings: z.array(inputMappingSchema).max(WORKFLOW_AUTOMATION_LIMITS.MAX_INPUT_MAPPINGS).optional(),
  errorPolicy: z.enum(WORKFLOW_AUTOMATION_ERROR_POLICIES).default("STOP"),
  maxRetryAttempts: z.number().int().min(1).max(WORKFLOW_AUTOMATION_LIMITS.MAX_RETRY_ATTEMPTS).optional(),
  retryBaseDelayMs: z.number().int().min(1000).optional(),
  retryDelayMultiplier: z.number().min(1).max(10).optional(),
  retryMaxDelayMs: z.number().int().min(1000).optional(),
  executionTimeoutMs: z.number().int().min(1000).nullable().optional(),
  approvalTimeoutMs: z.number().int().min(1000).nullable().optional(),
  waitTimeoutMs: z.number().int().min(1000).nullable().optional(),
  requireApprovalBeforeStart: z.boolean().optional(),
  notifyOnCompletion: z.boolean().optional(),
  notifyOnFailure: z.boolean().optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
});
export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;

export const updateAutomationSchema = createAutomationSchema.omit({ workflowId: true }).partial();
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;

export const decideApprovalSchema = z.object({
  approvalId: z.string().cuid(),
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  comment: optionalText(2000),
});

export const manualTriggerSchema = z.object({
  automationId: z.string().cuid(),
  idempotencyKey: z.string().trim().min(10).max(100),
  inputs: z.record(z.string(), z.string()).optional(),
});

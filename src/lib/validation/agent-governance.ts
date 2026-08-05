import { z } from "zod";
import { GOVERNANCE_RISK_LEVELS, AI_AGENT_POLICY_RULE_SCOPES, AI_AGENT_BUDGET_ON_EXHAUSTED, GOVERNANCE_OPERATION_TYPES, AI_AGENT_UNKNOWN_AGENT_BEHAVIORS } from "@/lib/agents/governance-types";
import { GOVERNANCE_LIMITS } from "@/lib/agents/governance-limits";

const optionalText = (max: number) => z.string().trim().max(max).optional();
const boundedInt = (max: number) => z.number().int().min(0).max(max).nullable().optional();
/** ISO datetime string, validated as a real, finite date — never NaN/Infinity through Date parsing. */
const isoDateNullable = () =>
  z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Fecha no válida.")
    .nullable()
    .optional();

export const policyRuleInputSchema = z.object({
  scope: z.enum(AI_AGENT_POLICY_RULE_SCOPES),
  agentRef: z.string().trim().min(1).max(120),
  /** Required (non-empty) when scope === "MODE"; ignored/normalized to "" for scope === "AGENT" (enforced in the service, matching the Postgres NULL-distinctness workaround baked into the schema). */
  mode: z.string().trim().max(60).optional(),
  enabled: z.boolean().nullable().optional(),
  riskOverride: z.enum(GOVERNANCE_RISK_LEVELS).nullable().optional(),
  requireApproval: z.boolean().nullable().optional(),
  maxRunsPerDay: boundedInt(GOVERNANCE_LIMITS.MAX_RUNS_PER_DAY),
  maxConcurrent: boundedInt(GOVERNANCE_LIMITS.MAX_CONCURRENT_RUNS_PER_AGENT),
  maxRetries: boundedInt(GOVERNANCE_LIMITS.MAX_RETRIES),
  /** Fase 38 spec section 25 — optional validity window; a rule outside it is treated as unmatched, never deleted. */
  startsAt: isoDateNullable(),
  expiresAt: isoDateNullable(),
});
export type PolicyRuleInput = z.infer<typeof policyRuleInputSchema>;

export const createPolicyVersionSchema = z.object({
  comment: optionalText(GOVERNANCE_LIMITS.MAX_POLICY_COMMENT_LENGTH),
  maxRiskLevel: z.enum(GOVERNANCE_RISK_LEVELS).default("DRAFT_WRITE"),
  requireApprovalAtOrAboveRisk: z.enum(GOVERNANCE_RISK_LEVELS).nullable().optional(),
  maxRunsPerDay: boundedInt(GOVERNANCE_LIMITS.MAX_RUNS_PER_DAY),
  maxRunsPerMonth: boundedInt(GOVERNANCE_LIMITS.MAX_RUNS_PER_MONTH),
  maxConcurrentRunsPerProject: z.number().int().min(1).max(GOVERNANCE_LIMITS.MAX_CONCURRENT_RUNS_PER_PROJECT).default(5),
  maxConcurrentRunsPerAgent: z.number().int().min(1).max(GOVERNANCE_LIMITS.MAX_CONCURRENT_RUNS_PER_AGENT).default(2),
  maxRetries: z.number().int().min(0).max(GOVERNANCE_LIMITS.MAX_RETRIES).default(3),
  maxDurationSeconds: boundedInt(GOVERNANCE_LIMITS.MAX_DURATION_SECONDS),
  maxSteps: boundedInt(GOVERNANCE_LIMITS.MAX_STEPS),
  maxContextChars: boundedInt(GOVERNANCE_LIMITS.MAX_CONTEXT_CHARS),
  maxOutputChars: boundedInt(GOVERNANCE_LIMITS.MAX_OUTPUT_CHARS),
  onBudgetExhausted: z.enum(AI_AGENT_BUDGET_ON_EXHAUSTED).default("DENY"),
  disabledAgentRefs: z.array(z.string().trim().max(120)).max(GOVERNANCE_LIMITS.MAX_DISABLED_AGENT_REFS).default([]),
  rules: z.array(policyRuleInputSchema).max(GOVERNANCE_LIMITS.MAX_RULES_PER_POLICY).default([]),
  /** Fase 38 spec sections 13-14. */
  unknownAgentBehavior: z.enum(AI_AGENT_UNKNOWN_AGENT_BEHAVIORS).default("ALLOW_DEFAULT"),
  /** Fase 38 spec section 22 — set when this draft is a "restore" of an earlier version; traceability only. */
  basedOnPolicyId: z.string().cuid().nullable().optional(),
});
export type CreatePolicyVersionInput = z.infer<typeof createPolicyVersionSchema>;

export const simulatePolicySchema = z.object({
  agentRef: z.string().trim().min(1).max(120),
  mode: z.string().trim().max(60).optional(),
  operationType: z.enum(GOVERNANCE_OPERATION_TYPES).default("CREATE_RUN"),
  contextChars: z.number().int().min(0).max(GOVERNANCE_LIMITS.MAX_CONTEXT_CHARS * 2).default(0),
  expectedOutputChars: z.number().int().min(0).max(GOVERNANCE_LIMITS.MAX_OUTPUT_CHARS * 2).default(0),
  retryCount: z.number().int().min(0).max(GOVERNANCE_LIMITS.MAX_RETRIES * 2).default(0),
  simulatedConcurrentRunsForProject: z.number().int().min(0).max(GOVERNANCE_LIMITS.MAX_CONCURRENT_RUNS_PER_PROJECT * 2).default(0),
  simulatedConcurrentRunsForAgent: z.number().int().min(0).max(GOVERNANCE_LIMITS.MAX_CONCURRENT_RUNS_PER_AGENT * 2).default(0),
});
export type SimulatePolicyInput = z.infer<typeof simulatePolicySchema>;

export const decideGovernanceApprovalSchema = z.object({
  approvalId: z.string().cuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: optionalText(2000),
});
export type DecideGovernanceApprovalInput = z.infer<typeof decideGovernanceApprovalSchema>;

export const pauseProjectSchema = z.object({ paused: z.boolean(), reason: optionalText(1000) });
export const pauseAgentSchema = z.object({ agentRef: z.string().trim().min(1).max(120), paused: z.boolean() });
export const emergencyStopSchema = z.object({ enabled: z.boolean(), reason: optionalText(1000) });

export const bulkCancelRunsSchema = z.object({
  runIds: z.array(z.string().cuid()).min(1).max(GOVERNANCE_LIMITS.MAX_BULK_CANCEL),
});
export type BulkCancelRunsInput = z.infer<typeof bulkCancelRunsSchema>;

// ---------------------------------------------------------------------------
// Fase 38: Policy Studio — matrix, rollout, impact analysis, comparison,
// change approval, templates.
// ---------------------------------------------------------------------------

export const startRolloutSchema = z.object({
  policyId: z.string().cuid(),
});

export const updateRolloutScopeSchema = z.object({
  policyId: z.string().cuid(),
  scopeAgentRefs: z.array(z.string().trim().max(120)).max(GOVERNANCE_LIMITS.MAX_ROLLOUT_SCOPE_ENTRIES).default([]),
  scopeModes: z.array(z.string().trim().max(60)).max(GOVERNANCE_LIMITS.MAX_ROLLOUT_SCOPE_ENTRIES).default([]),
  percentage: z.number().int().min(0).max(100).nullable().optional(),
});
export type UpdateRolloutScopeInput = z.infer<typeof updateRolloutScopeSchema>;

export const promoteRolloutSchema = z.object({
  policyId: z.string().cuid(),
  targetStage: z.enum(["LIMITED", "PROMOTED"]),
});

export const retireRolloutSchema = z.object({ policyId: z.string().cuid() });

export const massSimulationSchema = z.object({
  /** The DRAFT/ACTIVE policy version to simulate against — never the live active one silently substituted. */
  policyId: z.string().cuid().nullable().optional(),
  agentRefs: z.array(z.string().trim().max(120)).max(GOVERNANCE_LIMITS.MAX_MASS_SIMULATION_CELLS).default([]),
  operationType: z.enum(GOVERNANCE_OPERATION_TYPES).default("CREATE_RUN"),
});
export type MassSimulationInput = z.infer<typeof massSimulationSchema>;

export const impactAnalysisSchema = z.object({
  policyId: z.string().cuid(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  maxRuns: z.number().int().min(1).max(GOVERNANCE_LIMITS.MAX_IMPACT_ANALYSIS_RUNS).default(GOVERNANCE_LIMITS.DEFAULT_IMPACT_ANALYSIS_RUNS),
  agentRef: z.string().trim().max(120).optional(),
});
export type ImpactAnalysisInput = z.infer<typeof impactAnalysisSchema>;

export const comparePolicyVersionsSchema = z.object({
  policyIdA: z.string().cuid(),
  policyIdB: z.string().cuid(),
});
export type ComparePolicyVersionsInput = z.infer<typeof comparePolicyVersionsSchema>;

export const restorePolicyVersionSchema = z.object({ sourcePolicyId: z.string().cuid() });

export const applyTemplateSchema = z.object({ templateKey: z.enum(["CONSERVATIVE", "BALANCED", "EXPERIMENTAL"]) });

export const requestPolicyChangeApprovalSchema = z.object({
  policyId: z.string().cuid(),
  reason: z.string().trim().min(1).max(2000),
});
export type RequestPolicyChangeApprovalInput = z.infer<typeof requestPolicyChangeApprovalSchema>;

export const decidePolicyChangeApprovalSchema = z.object({
  approvalId: z.string().cuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: optionalText(2000),
});
export type DecidePolicyChangeApprovalInput = z.infer<typeof decidePolicyChangeApprovalSchema>;

export const runFilterSchema = z.object({
  status: z.string().trim().max(40).optional(),
  agentRef: z.string().trim().max(120).optional(),
  mode: z.string().trim().max(60).optional(),
  riskLevel: z.enum(GOVERNANCE_RISK_LEVELS).optional(),
  decision: z.enum(["ALLOW", "DENY", "REQUIRE_APPROVAL"]).optional(),
  createdById: z.string().cuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().cuid().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export type RunFilterInput = z.infer<typeof runFilterSchema>;

/**
 * Shared, framework-free types for AI Agent Governance & Mission Control
 * (Fase 37). Mirrors the Prisma enum value lists in prisma/schema.prisma
 * exactly (kept as plain string unions here so the pure policy engine in
 * governance-engine.ts never needs to import the generated Prisma client) —
 * same convention as src/lib/performance/types.ts and
 * src/lib/marketing-brain/types.ts.
 */

export const GOVERNANCE_DECISIONS = ["ALLOW", "DENY", "REQUIRE_APPROVAL"] as const;
export type GovernanceDecisionValue = (typeof GOVERNANCE_DECISIONS)[number];

export const GOVERNANCE_RISK_LEVELS = ["READ_ONLY", "DRAFT_WRITE", "INTERNAL_MUTATION", "EXTERNAL_SIDE_EFFECT"] as const;
export type GovernanceRiskLevelValue = (typeof GOVERNANCE_RISK_LEVELS)[number];

/** Ordinal ranking used to compare risk levels (spec section 7) — never inferred from a name match, always this fixed table. */
export const RISK_RANK: Record<GovernanceRiskLevelValue, number> = {
  READ_ONLY: 0,
  DRAFT_WRITE: 1,
  INTERNAL_MUTATION: 2,
  EXTERNAL_SIDE_EFFECT: 3,
};

/** No agent in this codebase currently performs an external side effect automatically (spec section 43 of Fase 34/36 chain) — this is a hard, non-configurable ceiling; no policy can ever raise maxRiskLevel to this value (spec section 6: "restricciones de seguridad no configurables"). */
export const ARCHITECTURAL_RISK_CEILING: GovernanceRiskLevelValue = "INTERNAL_MUTATION";

export const AI_AGENT_POLICY_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type AiAgentPolicyStatusValue = (typeof AI_AGENT_POLICY_STATUSES)[number];

export const AI_AGENT_POLICY_RULE_SCOPES = ["AGENT", "MODE"] as const;
export type AiAgentPolicyRuleScopeValue = (typeof AI_AGENT_POLICY_RULE_SCOPES)[number];

export const AI_AGENT_BUDGET_SCOPES = ["PROJECT", "AGENT"] as const;
export type AiAgentBudgetScopeValue = (typeof AI_AGENT_BUDGET_SCOPES)[number];

export const AI_AGENT_BUDGET_METRICS = ["RUNS", "AI_STEPS", "RETRIES", "EXECUTION_SECONDS", "CONTEXT_CHARS", "OUTPUT_CHARS"] as const;
export type AiAgentBudgetMetricValue = (typeof AI_AGENT_BUDGET_METRICS)[number];

export const AI_AGENT_BUDGET_WINDOWS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type AiAgentBudgetWindowValue = (typeof AI_AGENT_BUDGET_WINDOWS)[number];

export const AI_AGENT_BUDGET_ON_EXHAUSTED = ["DENY", "REQUIRE_APPROVAL"] as const;
export type AiAgentBudgetOnExhaustedValue = (typeof AI_AGENT_BUDGET_ON_EXHAUSTED)[number];

export const AI_AGENT_GOVERNANCE_APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"] as const;
export type AiAgentGovernanceApprovalStatusValue = (typeof AI_AGENT_GOVERNANCE_APPROVAL_STATUSES)[number];

/** Which real lifecycle point is being governed (spec section 18) — never evaluated only in the UI. */
export const GOVERNANCE_OPERATION_TYPES = ["CREATE_RUN", "PREPARE_STEP", "COMPLETE_WRITE", "RETRY", "RESUME"] as const;
export type GovernanceOperationType = (typeof GOVERNANCE_OPERATION_TYPES)[number];

/** Fase 38 spec sections 13-14: how the engine treats an agent/mode with NO matching AiAgentPolicyRule at all. */
export const AI_AGENT_UNKNOWN_AGENT_BEHAVIORS = ["ALLOW_DEFAULT", "REQUIRE_APPROVAL", "DENY"] as const;
export type AiAgentUnknownAgentBehaviorValue = (typeof AI_AGENT_UNKNOWN_AGENT_BEHAVIORS)[number];

/** Fase 38 spec section 19: staged rollout for a DRAFT policy version. */
export const AI_AGENT_ROLLOUT_STAGES = ["SHADOW", "LIMITED", "PROMOTED", "RETIRED"] as const;
export type AiAgentRolloutStageValue = (typeof AI_AGENT_ROLLOUT_STAGES)[number];

/** Fase 38 spec section 7: where a resolved field's effective value actually came from — never just the final number. */
export const GOVERNANCE_FIELD_ORIGINS = ["ARCHITECTURAL_CEILING", "MODE_RULE", "AGENT_RULE", "BASE_POLICY", "SYSTEM_DEFAULT"] as const;
export type GovernanceFieldOrigin = (typeof GOVERNANCE_FIELD_ORIGINS)[number];

export interface EffectiveLimits {
  maxRunsPerDay: number | null;
  maxRunsPerMonth: number | null;
  maxConcurrentRunsPerProject: number;
  maxConcurrentRunsPerAgent: number;
  maxRetries: number;
  maxDurationSeconds: number | null;
  maxSteps: number | null;
  maxContextChars: number | null;
  maxOutputChars: number | null;
  maxRiskLevel: GovernanceRiskLevelValue;
  requireApprovalAtOrAboveRisk: GovernanceRiskLevelValue | null;
  requireApproval: boolean;
  onBudgetExhausted: AiAgentBudgetOnExhaustedValue;
  /** Fase 38 addition — defaults to "ALLOW_DEFAULT" everywhere it's constructed, so every Fase 37 caller/context keeps behaving identically without being updated. */
  unknownAgentBehavior: AiAgentUnknownAgentBehaviorValue;
}

export interface BudgetDimensionSnapshot {
  metric: AiAgentBudgetMetricValue;
  window: AiAgentBudgetWindowValue;
  limit: number | null;
  reserved: number;
  consumed: number;
  available: number | null;
  periodStart: string;
  periodEnd: string;
}

export interface RuleEvaluationEntry {
  code: string;
  outcome: "PASSED" | "TRIGGERED" | "SKIPPED";
  message: string;
}

/** The engine's full input — every real signal the precedence chain (spec section 6) needs, already resolved by the caller (the pure engine itself never touches a database). */
export interface PolicyEvaluationContext {
  projectId: string;
  userId: string;
  hasProjectAccess: boolean;
  agentRef: string;
  agentIsOfficial: boolean;
  mode: string | null;
  operationType: GovernanceOperationType;
  riskLevel: GovernanceRiskLevelValue;
  contextChars: number;
  expectedOutputChars: number;
  retryCount: number;
  /** Concurrent PREPARING/PENDING/RUNNING runs already observed for this project/agent, counted atomically by the caller. */
  concurrentRunsForProject: number;
  concurrentRunsForAgent: number;
  runsTodayForProject: number;
  runsThisMonthForProject: number;
  emergencyStopEnabled: boolean;
  projectPaused: boolean;
  agentPaused: boolean;
  policy: {
    id: string;
    version: number;
    disabledAgentRefs: string[];
    limits: EffectiveLimits;
  } | null;
  /** AGENT-scope + MODE-scope overrides that apply to this agentRef/mode, already merged with MODE winning over AGENT (spec section 9) — the engine still re-derives final `enabled`/`requireApproval` from these for explainability. */
  matchedAgentRule: { enabled: boolean | null; requireApproval: boolean | null; riskOverride: GovernanceRiskLevelValue | null; maxRunsPerDay: number | null; maxConcurrent: number | null; maxRetries: number | null } | null;
  matchedModeRule: { enabled: boolean | null; requireApproval: boolean | null; riskOverride: GovernanceRiskLevelValue | null; maxRunsPerDay: number | null; maxConcurrent: number | null; maxRetries: number | null } | null;
  /** Real budget dimensions already fetched for the relevant metrics/windows — the engine only ever reads these, never invents a number. */
  budgets: BudgetDimensionSnapshot[];
  /** Set by the caller once a human has already approved this exact operation — the engine treats a valid, unexpired, matching approval as satisfying the "aprobación previa" precedence step (spec section 12). */
  preApprovedRequestId: string | null;
}

export interface PolicyEvaluationResult {
  decision: GovernanceDecisionValue;
  code: string;
  reason: string;
  policyId: string | null;
  policyVersion: number | null;
  riskLevel: GovernanceRiskLevelValue;
  effectiveLimits: EffectiveLimits;
  budgetSnapshot: BudgetDimensionSnapshot[];
  concurrencyObserved: number;
  requireApproval: boolean;
  warnings: string[];
  rulesEvaluated: RuleEvaluationEntry[];
  evaluatedAt: string;
}

export const GOVERNANCE_ERROR_CODES = [
  "EXTERNAL_SIDE_EFFECT_UNSUPPORTED",
  "NO_PROJECT_ACCESS",
  "EMERGENCY_STOP",
  "PROJECT_PAUSED",
  "AGENT_PAUSED",
  "AGENT_DISABLED",
  "MODE_DISABLED",
  "UNKNOWN_AGENT_POLICY",
  "RISK_EXCEEDS_POLICY",
  "QUOTA_EXCEEDED",
  "BUDGET_EXHAUSTED",
  "CONCURRENCY_LIMIT",
  "RETRY_LIMIT",
  "REQUIRE_APPROVAL",
  "ALLOWED",
  "NO_ACTIVE_POLICY",
] as const;
export type GovernanceErrorCode = (typeof GOVERNANCE_ERROR_CODES)[number];

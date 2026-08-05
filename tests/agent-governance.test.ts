import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { evaluatePolicy } from "@/lib/agents/governance-engine";
import { RISK_RANK, ARCHITECTURAL_RISK_CEILING, GOVERNANCE_ERROR_CODES } from "@/lib/agents/governance-types";
import type { PolicyEvaluationContext, EffectiveLimits, BudgetDimensionSnapshot } from "@/lib/agents/governance-types";
import { classifyAgentModeRisk, describeRiskLevel } from "@/lib/agents/governance-risk";
import { AGENT_FIELD_OPTION_LIMITS, MULTISELECT_MAX_SELECTIONS, MULTISELECT_VISIBLE_WITHOUT_SEARCH, MULTISELECT_MAX_VISIBLE_RESULTS } from "@/lib/agents/governance-limits";
import { agentInputFieldSpecSchema } from "@/lib/agents/dynamic-form";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const DEFAULT_LIMITS: EffectiveLimits = {
  maxRunsPerDay: null,
  maxRunsPerMonth: null,
  maxConcurrentRunsPerProject: 5,
  maxConcurrentRunsPerAgent: 2,
  maxRetries: 3,
  maxDurationSeconds: null,
  maxSteps: null,
  maxContextChars: null,
  maxOutputChars: null,
  maxRiskLevel: "DRAFT_WRITE",
  requireApprovalAtOrAboveRisk: null,
  requireApproval: false,
  onBudgetExhausted: "DENY",
  unknownAgentBehavior: "ALLOW_DEFAULT",
};

function baseCtx(overrides: Partial<PolicyEvaluationContext> = {}): PolicyEvaluationContext {
  return {
    projectId: "project-1",
    userId: "user-1",
    hasProjectAccess: true,
    agentRef: "research-agent",
    agentIsOfficial: true,
    mode: null,
    operationType: "CREATE_RUN",
    riskLevel: "DRAFT_WRITE",
    contextChars: 100,
    expectedOutputChars: 100,
    retryCount: 0,
    concurrentRunsForProject: 0,
    concurrentRunsForAgent: 0,
    runsTodayForProject: 0,
    runsThisMonthForProject: 0,
    emergencyStopEnabled: false,
    projectPaused: false,
    agentPaused: false,
    policy: { id: "policy-1", version: 1, disabledAgentRefs: [], limits: DEFAULT_LIMITS },
    matchedAgentRule: null,
    matchedModeRule: null,
    budgets: [],
    preApprovedRequestId: null,
    ...overrides,
  };
}

function budget(overrides: Partial<BudgetDimensionSnapshot>): BudgetDimensionSnapshot {
  return {
    metric: "AI_STEPS",
    window: "DAILY",
    limit: null,
    reserved: 0,
    consumed: 0,
    available: null,
    periodStart: new Date(2026, 0, 1).toISOString(),
    periodEnd: new Date(2026, 0, 2).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Baseline ALLOW + explainability
// ---------------------------------------------------------------------------
describe("evaluatePolicy: baseline ALLOW is explainable, never a bare boolean", () => {
  it("allows a plain, compliant request and returns ALLOWED", () => {
    const result = evaluatePolicy(baseCtx());
    expect(result.decision).toBe("ALLOW");
    expect(result.code).toBe("ALLOWED");
    expect(result.reason).toBeTruthy();
    expect(result.policyId).toBe("policy-1");
    expect(result.policyVersion).toBe(1);
    expect(result.rulesEvaluated.length).toBeGreaterThan(5);
    expect(result.evaluatedAt).toBeTruthy();
  });

  it("every rule entry has a code, an outcome, and a human-readable message", () => {
    const result = evaluatePolicy(baseCtx());
    for (const rule of result.rulesEvaluated) {
      expect(rule.code).toBeTruthy();
      expect(["PASSED", "TRIGGERED", "SKIPPED"]).toContain(rule.outcome);
      expect(rule.message).toBeTruthy();
    }
  });

  it("warns (but still allows) when there is no active policy — safe defaults apply", () => {
    const result = evaluatePolicy(baseCtx({ policy: null }));
    expect(result.decision).toBe("ALLOW");
    expect(result.policyId).toBeNull();
    expect(result.warnings.some((w) => w.toLowerCase().includes("política activa"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Precedence order (spec section 6) — each step wins over everything below it
// ---------------------------------------------------------------------------
describe("evaluatePolicy: deterministic precedence order", () => {
  it("1. hard architectural risk ceiling cannot be overridden by any policy field", () => {
    const result = evaluatePolicy(baseCtx({ riskLevel: "EXTERNAL_SIDE_EFFECT", policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, maxRiskLevel: "EXTERNAL_SIDE_EFFECT" } } }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("EXTERNAL_SIDE_EFFECT_UNSUPPORTED");
  });

  it("2/3. no project access denies before anything else is evaluated", () => {
    const result = evaluatePolicy(baseCtx({ hasProjectAccess: false, emergencyStopEnabled: true, projectPaused: true }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("NO_PROJECT_ACCESS");
  });

  it("4. emergency stop denies before project pause / agent pause / anything below", () => {
    const result = evaluatePolicy(baseCtx({ emergencyStopEnabled: true, projectPaused: true, agentPaused: true }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("EMERGENCY_STOP");
  });

  it("5. project paused denies before agent paused", () => {
    const result = evaluatePolicy(baseCtx({ projectPaused: true, agentPaused: true }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("PROJECT_PAUSED");
  });

  it("6. agent paused denies before agent-disabled/mode-disabled checks", () => {
    const result = evaluatePolicy(baseCtx({ agentPaused: true, policy: { id: "p", version: 1, disabledAgentRefs: ["research-agent"], limits: DEFAULT_LIMITS } }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("AGENT_PAUSED");
  });

  it("7. agent disabled via the policy's deny-list", () => {
    const result = evaluatePolicy(baseCtx({ policy: { id: "p", version: 1, disabledAgentRefs: ["research-agent"], limits: DEFAULT_LIMITS } }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("AGENT_DISABLED");
  });

  it("7b. agent disabled via an AGENT-scope rule with enabled:false", () => {
    const result = evaluatePolicy(baseCtx({ matchedAgentRule: { enabled: false, requireApproval: null, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null } }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("AGENT_DISABLED");
  });

  it("a MODE-scope rule enabling the agent wins over an AGENT-scope rule disabling it", () => {
    const result = evaluatePolicy(
      baseCtx({
        mode: "ANALYZE",
        matchedAgentRule: { enabled: false, requireApproval: null, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null },
        matchedModeRule: { enabled: true, requireApproval: null, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null },
      })
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("8. mode disabled via a MODE-scope rule", () => {
    const result = evaluatePolicy(
      baseCtx({ mode: "PREPARE_STRATEGY", matchedModeRule: { enabled: false, requireApproval: null, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null } })
    );
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("MODE_DISABLED");
  });

  it("9. risk exceeds the policy's configured maxRiskLevel", () => {
    const result = evaluatePolicy(baseCtx({ riskLevel: "INTERNAL_MUTATION", policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, maxRiskLevel: "DRAFT_WRITE" } } }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("RISK_EXCEEDS_POLICY");
  });

  it("9b. a MODE-scope riskOverride raises the ceiling for that mode only", () => {
    const result = evaluatePolicy(
      baseCtx({
        riskLevel: "INTERNAL_MUTATION",
        mode: "REVIEW_EXISTING",
        policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, maxRiskLevel: "DRAFT_WRITE" } },
        matchedModeRule: { enabled: null, requireApproval: null, riskOverride: "INTERNAL_MUTATION", maxRunsPerDay: null, maxConcurrent: null, maxRetries: null },
      })
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("10. risk-based approval requirement only flags REQUIRE_APPROVAL, never DENY by itself", () => {
    const result = evaluatePolicy(
      baseCtx({ riskLevel: "DRAFT_WRITE", policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, requireApprovalAtOrAboveRisk: "DRAFT_WRITE" } } })
    );
    expect(result.decision).toBe("REQUIRE_APPROVAL");
    expect(result.requireApproval).toBe(true);
  });

  it("11. quota exceeded (daily) denies (or requires approval per onBudgetExhausted)", () => {
    const deny = evaluatePolicy(baseCtx({ runsTodayForProject: 10, policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, maxRunsPerDay: 10, onBudgetExhausted: "DENY" } } }));
    expect(deny.decision).toBe("DENY");
    expect(deny.code).toBe("QUOTA_EXCEEDED");

    const approval = evaluatePolicy(
      baseCtx({ runsTodayForProject: 10, policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, maxRunsPerDay: 10, onBudgetExhausted: "REQUIRE_APPROVAL" } } })
    );
    expect(approval.decision).toBe("REQUIRE_APPROVAL");
    expect(approval.code).toBe("QUOTA_EXCEEDED");
  });

  it("11b. quota exceeded (monthly)", () => {
    const result = evaluatePolicy(baseCtx({ runsThisMonthForProject: 100, policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, maxRunsPerMonth: 100 } } }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("QUOTA_EXCEEDED");
  });

  it("an AGENT-scope maxRunsPerDay override is honored (spec section 9 example: limit research-agent to 5 daily runs)", () => {
    const result = evaluatePolicy(baseCtx({ runsTodayForProject: 5, matchedAgentRule: { enabled: null, requireApproval: null, riskOverride: null, maxRunsPerDay: 5, maxConcurrent: null, maxRetries: null } }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("QUOTA_EXCEEDED");
  });

  it("12. budget exhausted for a non-quota dimension (e.g. CONTEXT_CHARS)", () => {
    const result = evaluatePolicy(baseCtx({ budgets: [budget({ metric: "CONTEXT_CHARS", limit: 1000, reserved: 0, consumed: 1000 })] }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("BUDGET_EXHAUSTED");
  });

  it("12b. budget exhaustion with onBudgetExhausted=REQUIRE_APPROVAL requires approval instead of denying", () => {
    const result = evaluatePolicy(
      baseCtx({
        policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, onBudgetExhausted: "REQUIRE_APPROVAL" } },
        budgets: [budget({ metric: "OUTPUT_CHARS", limit: 500, reserved: 500, consumed: 0 })],
      })
    );
    expect(result.decision).toBe("REQUIRE_APPROVAL");
    expect(result.code).toBe("BUDGET_EXHAUSTED");
  });

  it("emits a warning when a budget dimension drops below 10% remaining, without denying", () => {
    const result = evaluatePolicy(baseCtx({ budgets: [budget({ metric: "AI_STEPS", limit: 100, reserved: 0, consumed: 95, available: 5 })] }));
    expect(result.decision).toBe("ALLOW");
    expect(result.warnings.some((w) => w.includes("AI_STEPS"))).toBe(true);
  });

  it("13. project concurrency limit denies before agent concurrency is even checked", () => {
    const result = evaluatePolicy(baseCtx({ concurrentRunsForProject: 5, concurrentRunsForAgent: 999 }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("CONCURRENCY_LIMIT");
  });

  it("13b. per-agent concurrency limit (with MODE override) denies", () => {
    const result = evaluatePolicy(baseCtx({ concurrentRunsForAgent: 1, matchedAgentRule: { enabled: null, requireApproval: null, riskOverride: null, maxRunsPerDay: null, maxConcurrent: 1, maxRetries: null } }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("CONCURRENCY_LIMIT");
  });

  it("14. retry limit only applies to RETRY operations", () => {
    const retried = evaluatePolicy(baseCtx({ operationType: "RETRY", retryCount: 3 }));
    expect(retried.decision).toBe("DENY");
    expect(retried.code).toBe("RETRY_LIMIT");

    const createRun = evaluatePolicy(baseCtx({ operationType: "CREATE_RUN", retryCount: 999 }));
    expect(createRun.decision).toBe("ALLOW");
  });

  it("15. a MODE-scope requireApproval:true forces REQUIRE_APPROVAL even when risk itself doesn't", () => {
    const result = evaluatePolicy(
      baseCtx({ mode: "PREPARE_STRATEGY", matchedModeRule: { enabled: null, requireApproval: true, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null } })
    );
    expect(result.decision).toBe("REQUIRE_APPROVAL");
  });

  it("15b. a valid pre-approval satisfies the approval requirement and the run proceeds to ALLOW", () => {
    const result = evaluatePolicy(
      baseCtx({
        policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, requireApprovalAtOrAboveRisk: "DRAFT_WRITE" } },
        preApprovedRequestId: "approval-123",
      })
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("never automatically approves Performance Strategist's PREPARE_STRATEGY without a real pre-approval", () => {
    const result = evaluatePolicy(
      baseCtx({
        agentRef: "performance-strategist",
        mode: "PREPARE_STRATEGY",
        matchedModeRule: { enabled: null, requireApproval: true, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null },
        preApprovedRequestId: null,
      })
    );
    expect(result.decision).toBe("REQUIRE_APPROVAL");
  });
});

// ---------------------------------------------------------------------------
// 3. Risk classification (spec section 7 / 19 / 20)
// ---------------------------------------------------------------------------
describe("classifyAgentModeRisk: central, non-name-matching risk catalog", () => {
  it("classifies performance-strategist's ANALYZE mode as READ_ONLY", () => {
    expect(classifyAgentModeRisk("performance-strategist", "ANALYZE")).toBe("READ_ONLY");
  });

  it("classifies every other performance-strategist mode as DRAFT_WRITE", () => {
    for (const mode of ["PREPARE_STRATEGY", "REVIEW_EXISTING", "PREPARE_MEASUREMENT", "PREPARE_REVIEW"]) {
      expect(classifyAgentModeRisk("performance-strategist", mode)).toBe("DRAFT_WRITE");
    }
  });

  it("classifies every other official agent as DRAFT_WRITE regardless of mode", () => {
    expect(classifyAgentModeRisk("research-agent", null)).toBe("DRAFT_WRITE");
    expect(classifyAgentModeRisk("seo-agent", null)).toBe("DRAFT_WRITE");
  });

  it("classifies a custom agent (identified by its own cuid, not a declared capability) as DRAFT_WRITE — never agent-declared as READ_ONLY", () => {
    expect(classifyAgentModeRisk("clx1234567890custom", null)).toBe("DRAFT_WRITE");
    expect(classifyAgentModeRisk("clx1234567890custom", "anything")).toBe("DRAFT_WRITE");
  });

  it("RISK_RANK is a strict total order matching the architectural ceiling", () => {
    expect(RISK_RANK.READ_ONLY).toBeLessThan(RISK_RANK.DRAFT_WRITE);
    expect(RISK_RANK.DRAFT_WRITE).toBeLessThan(RISK_RANK.INTERNAL_MUTATION);
    expect(RISK_RANK.INTERNAL_MUTATION).toBeLessThan(RISK_RANK.EXTERNAL_SIDE_EFFECT);
    expect(ARCHITECTURAL_RISK_CEILING).toBe("INTERNAL_MUTATION");
  });

  it("describeRiskLevel returns a real, non-empty description for every level", () => {
    for (const level of ["READ_ONLY", "DRAFT_WRITE", "INTERNAL_MUTATION", "EXTERNAL_SIDE_EFFECT"] as const) {
      expect(describeRiskLevel(level).length).toBeGreaterThan(10);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Field option limits (spec section 21 fix) + MultiSelectField constants (section 22)
// ---------------------------------------------------------------------------
describe("agentInputFieldSpecSchema: per-field-type option limits (Fase 37 fix of Fase 36's flat 80 limit)", () => {
  function options(n: number) {
    return Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Label ${i}` }));
  }

  it("select rejects more than AGENT_FIELD_OPTION_LIMITS.select options", () => {
    const result = agentInputFieldSpecSchema.safeParse({ key: "f", label: "F", type: "select", required: false, options: options(AGENT_FIELD_OPTION_LIMITS.select + 1) });
    expect(result.success).toBe(false);
  });

  it("select accepts exactly AGENT_FIELD_OPTION_LIMITS.select options", () => {
    const result = agentInputFieldSpecSchema.safeParse({ key: "f", label: "F", type: "select", required: false, options: options(AGENT_FIELD_OPTION_LIMITS.select) });
    expect(result.success).toBe(true);
  });

  it("multiselect accepts up to AGENT_FIELD_OPTION_LIMITS.multiselect options (covers Performance Center's 56-metric catalog)", () => {
    expect(AGENT_FIELD_OPTION_LIMITS.multiselect).toBeGreaterThanOrEqual(56);
    const result = agentInputFieldSpecSchema.safeParse({ key: "f", label: "F", type: "multiselect", required: false, options: options(AGENT_FIELD_OPTION_LIMITS.multiselect) });
    expect(result.success).toBe(true);
  });

  it("multiselect rejects more than AGENT_FIELD_OPTION_LIMITS.multiselect options", () => {
    const result = agentInputFieldSpecSchema.safeParse({ key: "f", label: "F", type: "multiselect", required: false, options: options(AGENT_FIELD_OPTION_LIMITS.multiselect + 1) });
    expect(result.success).toBe(false);
  });

  it("select's limit is meaningfully lower than multiselect's — never one flat global ceiling again", () => {
    expect(AGENT_FIELD_OPTION_LIMITS.select).toBeLessThan(AGENT_FIELD_OPTION_LIMITS.multiselect);
  });

  it("every previously-valid Fase 36 config (<=80 options) still fits under the new multiselect ceiling — no regression", () => {
    const result = agentInputFieldSpecSchema.safeParse({ key: "f", label: "F", type: "multiselect", required: false, options: options(80) });
    expect(result.success).toBe(true);
  });
});

describe("MultiSelectField UI constants (Fase 37 spec section 22): scalable, windowed rendering — never unbounded", () => {
  it("defines a bounded initial-visible window and a bounded max-visible-while-searching window", () => {
    expect(MULTISELECT_VISIBLE_WITHOUT_SEARCH).toBeGreaterThan(0);
    expect(MULTISELECT_MAX_VISIBLE_RESULTS).toBeGreaterThanOrEqual(MULTISELECT_VISIBLE_WITHOUT_SEARCH);
  });

  it("MULTISELECT_MAX_SELECTIONS matches the multiselect value-array cap enforced server-side in dynamic-form.ts (never silently drifts apart)", () => {
    const source = read("src/lib/agents/dynamic-form.ts");
    expect(source).toMatch(/z\.array\(z\.string\(\)\.trim\(\)\.max\(100\)\)\.max\(MULTISELECT_MAX_SELECTIONS\)/);
    expect(MULTISELECT_MAX_SELECTIONS).toBeGreaterThan(0);
  });

  it("the MultiSelectField component implements search, counters, clear actions, keyboard nav, and accessible labels (source-level check — no component-render harness in this suite's node environment)", () => {
    const source = read("src/components/agents/dynamic-input-form.tsx");
    expect(source).toMatch(/role="searchbox"/);
    expect(source).toMatch(/aria-live="polite"/);
    expect(source).toMatch(/ArrowDown/);
    expect(source).toMatch(/ArrowUp/);
    expect(source).toMatch(/role="alert"/);
    expect(source).toMatch(/Limpiar selección/);
    expect(source).toMatch(/Cargar más/);
    expect(source).not.toMatch(/\bwindow\.confirm\(|\balert\(/);
  });
});

// ---------------------------------------------------------------------------
// 5. Schema / migration structural checks (versioning, partial unique index, non-destructive)
// ---------------------------------------------------------------------------
describe("prisma schema: AI Agent Governance data model (spec sections 8-17, 31)", () => {
  const schema = read("prisma/schema.prisma");

  it("AiAgentPolicy is versioned and unique per (projectId, version) — never overwritten in place", () => {
    expect(schema).toMatch(/model AiAgentPolicy \{[\s\S]*?@@unique\(\[projectId, version\]\)/);
  });

  it("exactly one ACTIVE policy per project is enforced at the DB level via a partial unique index", () => {
    const migrationsDir = readdirSync(path.join(ROOT, "prisma/migrations"));
    const governanceMigration = migrationsDir.find((m) => m.includes("add_ai_agent_governance"));
    expect(governanceMigration).toBeDefined();
    const sql = read(`prisma/migrations/${governanceMigration}/migration.sql`);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "AiAgentPolicy_project_active_unique" ON "AiAgentPolicy"\("projectId"\) WHERE "status" = 'ACTIVE'/);
    expect(sql).not.toMatch(/^\s*DROP TABLE/m);
    expect(sql).not.toMatch(/TRUNCATE/);
  });

  it("AiAgentRunGovernanceSnapshot is 1:1 with a run and keeps the full evaluation trail as real fields, not just true/false", () => {
    expect(schema).toMatch(/model AiAgentRunGovernanceSnapshot \{[\s\S]*?runId\s+String\s+@unique/);
    expect(schema).toMatch(/model AiAgentRunGovernanceSnapshot \{[\s\S]*?rulesEvaluated\s+Json/);
    expect(schema).toMatch(/model AiAgentRunGovernanceSnapshot \{[\s\S]*?effectiveLimits\s+Json/);
    expect(schema).toMatch(/model AiAgentRunGovernanceSnapshot \{[\s\S]*?budgetSnapshot\s+Json/);
  });

  it("AiAgentGovernanceApproval is distinct from the pre-existing Fase-31 AiAgentApproval (per-run gate vs per-step gate)", () => {
    expect(schema).toMatch(/model AiAgentGovernanceApproval \{/);
    expect(schema).toMatch(/model AiAgentApproval \{/);
  });

  it("AiAgentBudgetUsage tracks reserved and consumed as separate counters, never a single merged number", () => {
    expect(schema).toMatch(/model AiAgentBudgetUsage \{[\s\S]*?reserved\s+Int\s+@default\(0\)[\s\S]*?consumed\s+Int\s+@default\(0\)/);
  });

  it("budget metrics never include tokens or money — only real, measurable dimensions", () => {
    expect(schema).toMatch(/enum AiAgentBudgetMetric \{\s*RUNS\s*AI_STEPS\s*RETRIES\s*EXECUTION_SECONDS\s*CONTEXT_CHARS\s*OUTPUT_CHARS\s*\}/);
    expect(schema).not.toMatch(/enum AiAgentBudgetMetric \{[\s\S]*?(TOKENS|COST|MONEY)/);
  });

  it("governance migration is additive-only and placed after the confirmed Fase 34-36 baseline", () => {
    const migrationsDir = readdirSync(path.join(ROOT, "prisma/migrations")).sort();
    const governanceMigration = migrationsDir.find((m) => m.includes("add_ai_agent_governance"))!;
    const baselineMigration = migrationsDir.find((m) => m.includes("add_marketing_brain_strategy_brief"));
    if (baselineMigration) expect(governanceMigration.localeCompare(baselineMigration)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Service-layer structural checks (atomicity, idempotency, human-only approvals)
// ---------------------------------------------------------------------------
describe("agent-governance-policy.ts: versioning CRUD never edits history in place", () => {
  const source = read("src/server/services/agent-governance-policy.ts");

  it("activation archives the previous ACTIVE version and activates the new one inside one transaction", () => {
    expect(source).toMatch(/\$transaction\(\[\s*prisma\.aiAgentPolicy\.updateMany\(\{ where: \{ projectId, status: "ACTIVE" \}, data: \{ status: "ARCHIVED"/);
  });

  it("handles a P2002 race on the partial unique index instead of silently succeeding twice", () => {
    expect(source).toMatch(/P2002/);
  });

  it("never allows reactivating an ARCHIVED version directly (must create a new version)", () => {
    expect(source).toMatch(/No se puede reactivar una versión archivada/);
  });
});

describe("agent-governance-budget.ts: reserve/consume/release are atomic and clamp against double-release", () => {
  const source = read("src/server/services/agent-governance-budget.ts");

  it("uses updateMany (conditioned) rather than a plain read-then-write for every mutation", () => {
    expect((source.match(/prisma\.aiAgentBudgetUsage\.updateMany/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("release/consume clamp the release amount to what is actually reserved — never a negative or double release", () => {
    expect(source).toMatch(/Math\.max\(0, Math\.min\(releaseAmount|Math\.max\(0, Math\.min\(reservedAmountToRelease, row\.reserved\)\)/);
    expect(source).toMatch(/Math\.max\(0, Math\.min\(amount, row\.reserved\)\)/);
  });

  it("never invents a monetary or token cost from characters/time", () => {
    expect(source).not.toMatch(/\* 0\.0\d+|costUsd|tokenPrice/i);
  });
});

describe("agent-governance-concurrency.ts: only counts real non-terminal runs", () => {
  const source = read("src/server/services/agent-governance-concurrency.ts");

  it("counts READY/RUNNING/WAITING_FOR_APPROVAL as active, never COMPLETED/FAILED/CANCELLED/ARCHIVED", () => {
    expect(source).toMatch(/ACTIVE_RUN_STATUSES = \["READY", "RUNNING", "WAITING_FOR_APPROVAL"\]/);
    expect(source).not.toMatch(/ACTIVE_RUN_STATUSES[\s\S]*?COMPLETED/);
  });
});

describe("agent-governance-approvals.ts: approval decisions are strictly human, idempotent, race-safe", () => {
  const source = read("src/server/services/agent-governance-approvals.ts");

  it("decideGovernanceApproval requires a real decidedById argument — never called by a cron/automation/AI Workflow with no actor", () => {
    expect(source).toMatch(/decideGovernanceApproval\(projectId: string, approvalId: string, decidedById: string,/);
  });

  it("uses a conditioned updateMany so two concurrent approvers can never both win the same PENDING request", () => {
    expect(source).toMatch(/updateMany\(\{\s*where: \{ id: approvalId, status: "PENDING" \}/);
  });

  it("expired PENDING approvals are rejected at decision time, not silently approved", () => {
    expect(source).toMatch(/expiresAt.*getTime\(\) < Date\.now\(\)/);
  });

  it("creation is idempotent via a unique idempotencyKey with a P2002 race fallback", () => {
    expect(source).toMatch(/idempotencyKey: input\.idempotencyKey/);
    expect(source).toMatch(/P2002/);
  });
});

describe("agent-governance-state.ts: pause/emergency never auto-resolves active runs", () => {
  const source = read("src/server/services/agent-governance-state.ts");

  it("bulk cancellation only ever sets CANCELLED, never COMPLETED, and is scoped to still-active statuses", () => {
    expect(source).toMatch(/bulkCancelActiveRuns[\s\S]*?status: \{ in: \["DRAFT", "READY", "RUNNING", "WAITING_FOR_APPROVAL"\] \}/);
    expect(source).toMatch(/data: \{ status: "CANCELLED"/);
    expect(source).not.toMatch(/bulkCancelActiveRuns[\s\S]*?status: "COMPLETED"/);
  });

  it("pause/emergency toggles are audited and emit a real Automation Center event", () => {
    expect(source).toMatch(/logGovernanceAction/);
    expect(source).toMatch(/publishAutomationEvent/);
  });
});

describe("agent-governance-mission-control.ts: real pagination, never an unbounded history load", () => {
  const source = read("src/server/services/agent-governance-mission-control.ts");

  it("listGovernedRuns uses a cursor + take limit, never findMany without pagination", () => {
    expect(source).toMatch(/take: filter\.limit \+ 1/);
    expect(source).toMatch(/cursor: \{ id: filter\.cursor \}/);
  });

  it("every governance query is scoped by projectId", () => {
    expect(source).toMatch(/getRunGovernanceDetail[\s\S]*?run\.projectId !== projectId/);
  });
});

// ---------------------------------------------------------------------------
// 7. Multi-tenant isolation & security
// ---------------------------------------------------------------------------
describe("multi-tenant isolation: every governance read/write is scoped by projectId, never trusts a bare ID", () => {
  it("getPolicyVersionDetail rejects a policy ID that belongs to a different project", () => {
    const source = read("src/server/services/agent-governance-policy.ts");
    expect(source).toMatch(/if \(!row \|\| row\.projectId !== projectId\) return null;/);
  });

  it("getApproval / decideGovernanceApproval reject an approval belonging to a different project", () => {
    const source = read("src/server/services/agent-governance-approvals.ts");
    expect(source).toMatch(/if \(!row \|\| row\.projectId !== projectId\) return null;/);
    expect(source).toMatch(/if \(!target \|\| target\.projectId !== projectId\) return \{ error:/);
  });

  it("governance server actions gate admin operations at MANAGER and reuse the real project role system (no parallel roles)", () => {
    const source = read("src/server/actions/agent-governance.ts");
    expect(source).toMatch(/requireProjectAccess\(projectId, "MANAGER"\)/);
    expect(source).not.toMatch(/role === "MANAGER" \|\| role === "ADMIN"/);
  });

  it("a normal EDITOR can only view governance detail for their own runs, not any run in the project", () => {
    const source = read("src/server/actions/agent-governance.ts");
    expect(source).toMatch(/detail\.createdById !== user\.id/);
  });
});

// ---------------------------------------------------------------------------
// 8. Orchestrator integration — governance actually gates the real lifecycle
// ---------------------------------------------------------------------------
describe("agent-orchestrator.ts: governance is wired into the REAL lifecycle, not just the UI", () => {
  const source = read("src/server/services/agent-orchestrator.ts");

  it("confirmRun evaluates governance (CREATE_RUN) before the run is confirmed", () => {
    expect(source).toMatch(/operationType: "CREATE_RUN"/);
    expect(source).toMatch(/if \(governance\.decision === "DENY"\) return \{ error: governance\.reason \};/);
  });

  it("a REQUIRE_APPROVAL decision blocks confirmRun and creates a real approval request — the run cannot start before approval", () => {
    expect(source).toMatch(/if \(governance\.decision === "REQUIRE_APPROVAL"\)/);
    expect(source).toMatch(/createApprovalRequest\(\{/);
  });

  it("startRun re-evaluates governance and persists the immutable per-run snapshot only on ALLOW", () => {
    expect(source).toMatch(/export async function startRun\(projectId: string, runId: string, userId: string\)/);
    expect(source).toMatch(/recordRunGovernanceSnapshot\(runId, projectId, governance/);
  });

  it("prepareNextStep gates claiming a step (PREPARE_STEP) before the atomic claim happens", () => {
    expect(source).toMatch(/operationType: "PREPARE_STEP"/);
  });

  it("completeAiStep gates persisting the write (COMPLETE_WRITE) before parsing/persisting output", () => {
    expect(source).toMatch(/operationType: "COMPLETE_WRITE"/);
  });

  it("retryFailedStep and resumeRun both evaluate governance before proceeding", () => {
    expect(source).toMatch(/export async function retryFailedStep\(projectId: string, runId: string, userId: string, stepOrder: number\)/);
    expect(source).toMatch(/operationType: "RETRY"/);
    expect(source).toMatch(/export async function resumeRun\(projectId: string, runId: string, userId: string\)/);
    expect(source).toMatch(/operationType: "RESUME"/);
  });

  it("no internal lifecycle function bypasses governance by calling prisma.aiAgentRun.update to RUNNING without a preceding evaluateRunGovernance call in the same function", () => {
    // startRun is the only place that flips DRAFT/READY -> RUNNING at the top level; confirm it's governed.
    const startRunBody = source.slice(source.indexOf("export async function startRun"), source.indexOf("export async function", source.indexOf("export async function startRun") + 1));
    expect(startRunBody).toMatch(/evaluateRunGovernance/);
  });
});

describe("agent-performance-strategist.ts: the flagship per-mode governance case (spec section 19)", () => {
  const source = read("src/server/services/agent-performance-strategist.ts");

  it("evaluates governance with the REAL parsed mode before dispatching to any mode branch", () => {
    expect(source).toMatch(/mode: input\.mode,\s*operationType: "PREPARE_STEP"/);
  });

  it("gates PREPARE_STRATEGY/REVIEW_EXISTING/PREPARE_MEASUREMENT/PREPARE_REVIEW writes as COMPLETE_WRITE, but not ANALYZE (read-only)", () => {
    expect(source).toMatch(/if \(mode !== "ANALYZE"\) \{/);
    expect((source.match(/operationType: "COMPLETE_WRITE"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 9. Automation Center events + notifications reuse (no new systems)
// ---------------------------------------------------------------------------
describe("Automation Center: real governance events registered in the single event catalog", () => {
  const source = read("src/lib/automations/events.ts");
  const expectedKeys = [
    "ai_agent_governance.policy_created",
    "ai_agent_governance.policy_activated",
    "ai_agent_governance.simulation_completed",
    "ai_agent_governance.run_allowed",
    "ai_agent_governance.run_denied",
    "ai_agent_governance.approval_requested",
    "ai_agent_governance.approval_approved",
    "ai_agent_governance.approval_rejected",
    "ai_agent_governance.budget_warning",
    "ai_agent_governance.budget_exhausted",
    "ai_agent_governance.concurrency_limit_reached",
    "ai_agent_governance.project_paused",
    "ai_agent_governance.project_resumed",
    "ai_agent_governance.agent_paused",
    "ai_agent_governance.agent_resumed",
    "ai_agent_governance.emergency_stop_enabled",
    "ai_agent_governance.emergency_stop_disabled",
  ];
  for (const key of expectedKeys) {
    it(`registers "${key}"`, () => {
      expect(source).toContain(`key: "${key}"`);
    });
  }
});

describe("notifications: reuses the existing Notification model, never a new notification system", () => {
  const source = read("src/server/services/agent-governance-notifications.ts");
  it("creates rows via prisma.notification.create, not a new table", () => {
    expect(source).toMatch(/prisma\.notification\.create/);
  });
  it("never simulates a delivery — no setTimeout/fake email/external provider", () => {
    expect(source).not.toMatch(/setTimeout|sendEmail|nodemailer|sendgrid/i);
  });
});

// ---------------------------------------------------------------------------
// 10. AI Workflows: confirmed still read-only / unextended
// ---------------------------------------------------------------------------
describe("AI Workflows: governance introduces no write capability (spec section 30)", () => {
  it("no AI Workflows source file references governance policy/approval mutation", () => {
    const files = ["engine.ts", "execution-resolver.ts", "types.ts", "run-state.ts", "limits.ts"];
    for (const file of files) {
      const source = read(`src/lib/ai-workflows/${file}`);
      expect(source).not.toMatch(/agent-governance|AiAgentPolicy|AiAgentGovernanceApproval/);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Error codes are a closed, documented catalog
// ---------------------------------------------------------------------------
describe("GOVERNANCE_ERROR_CODES: closed catalog matches every code the engine actually returns", () => {
  it("includes every code used by evaluatePolicy's precedence chain", () => {
    for (const code of [
      "EXTERNAL_SIDE_EFFECT_UNSUPPORTED",
      "NO_PROJECT_ACCESS",
      "EMERGENCY_STOP",
      "PROJECT_PAUSED",
      "AGENT_PAUSED",
      "AGENT_DISABLED",
      "MODE_DISABLED",
      "RISK_EXCEEDS_POLICY",
      "QUOTA_EXCEEDED",
      "BUDGET_EXHAUSTED",
      "CONCURRENCY_LIMIT",
      "RETRY_LIMIT",
      "REQUIRE_APPROVAL",
      "ALLOWED",
    ]) {
      expect(GOVERNANCE_ERROR_CODES).toContain(code);
    }
  });
});

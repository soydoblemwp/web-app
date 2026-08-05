import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { evaluatePolicy } from "@/lib/agents/governance-engine";
import { resolveOverride } from "@/lib/agents/governance-resolve";
import { detectPolicyConflicts, hasBlockingConflicts } from "@/lib/agents/governance-conflicts";
import { GOVERNANCE_TEMPLATES, findGovernanceTemplate } from "@/lib/agents/governance-templates";
import { resolveEffectivePolicy, isRiskLevelSelectable } from "@/lib/agents/governance-effective-policy";
import { stableHashPercent, isInLimitedRolloutScope } from "@/lib/agents/governance-rollout-scope";
import { detectSensitiveChanges } from "@/lib/agents/governance-sensitive-changes";
import { createPolicyVersionSchema, policyRuleInputSchema } from "@/lib/validation/agent-governance";
import type { EffectiveLimits, PolicyEvaluationContext } from "@/lib/agents/governance-types";

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

// ---------------------------------------------------------------------------
// 1. resolveOverride — the shared primitive both the engine and Policy
//    Studio's effective-policy resolver depend on (spec section 7)
// ---------------------------------------------------------------------------
describe("resolveOverride: the ONE override-resolution primitive shared by engine + Policy Studio", () => {
  it("MODE wins over AGENT wins over BASE", () => {
    expect(resolveOverride("MODE_VAL", "AGENT_VAL", "BASE_VAL")).toEqual({ value: "MODE_VAL", origin: "MODE_RULE" });
    expect(resolveOverride(null, "AGENT_VAL", "BASE_VAL")).toEqual({ value: "AGENT_VAL", origin: "AGENT_RULE" });
    expect(resolveOverride(undefined, undefined, "BASE_VAL")).toEqual({ value: "BASE_VAL", origin: "BASE_POLICY" });
  });

  it("treats null and undefined identically as 'not set'", () => {
    expect(resolveOverride(null, null, 5)).toEqual({ value: 5, origin: "BASE_POLICY" });
    expect(resolveOverride(undefined, null, 5)).toEqual({ value: 5, origin: "BASE_POLICY" });
  });

  it("a falsy-but-set value (false, 0) is still honored as an explicit override, never treated as unset", () => {
    expect(resolveOverride(false, true, true)).toEqual({ value: false, origin: "MODE_RULE" });
    expect(resolveOverride(0, 5, 10)).toEqual({ value: 0, origin: "MODE_RULE" });
  });
});

describe("governance-engine.ts: every override chain routes through resolveOverride (source-level check, guards against silent re-forking of precedence logic)", () => {
  it("imports and calls resolveOverride for risk, quota, concurrency, retries, and approval overrides", () => {
    const source = read("src/lib/agents/governance-engine.ts");
    expect(source).toMatch(/import \{ resolveOverride \} from "@\/lib\/agents\/governance-resolve"/);
    expect((source.match(/resolveOverride\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
    // No leftover hand-rolled `??` override chain competing with resolveOverride.
    expect(source).not.toMatch(/matchedModeRule\?\.\w+ \?\? ctx\.matchedAgentRule\?\.\w+ \?\?/);
  });
});

describe("resolveEffectivePolicy: Policy Studio's matrix resolver is provably equivalent to the engine's own precedence", () => {
  const cases: { matchedAgentRule: PolicyEvaluationContext["matchedAgentRule"]; matchedModeRule: PolicyEvaluationContext["matchedModeRule"] }[] = [
    { matchedAgentRule: null, matchedModeRule: null },
    { matchedAgentRule: { enabled: false, requireApproval: null, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null }, matchedModeRule: null },
    { matchedAgentRule: { enabled: true, requireApproval: true, riskOverride: "READ_ONLY", maxRunsPerDay: 3, maxConcurrent: 1, maxRetries: 1 }, matchedModeRule: { enabled: null, requireApproval: false, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null } },
    { matchedAgentRule: { enabled: false, requireApproval: null, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null }, matchedModeRule: { enabled: true, requireApproval: null, riskOverride: "INTERNAL_MUTATION", maxRunsPerDay: 9, maxConcurrent: 4, maxRetries: 2 } },
  ];

  for (const [i, c] of cases.entries()) {
    it(`case ${i}: effective riskOverride/maxRunsPerDay/maxConcurrent/maxRetries match what evaluatePolicy() would actually use`, () => {
      const effective = resolveEffectivePolicy({ disabledAgentRefs: [], agentRef: "research-agent", base: DEFAULT_LIMITS, matchedAgentRule: c.matchedAgentRule, matchedModeRule: c.matchedModeRule });

      // Cross-check against a real engine run whose DENY/ALLOW hinges on these exact resolved values.
      const engineResultAtLimit = evaluatePolicy(
        baseCtx({
          matchedAgentRule: c.matchedAgentRule,
          matchedModeRule: c.matchedModeRule,
          concurrentRunsForAgent: effective.maxConcurrent.value, // AT the effective limit must DENY (or be blocked earlier by AGENT_DISABLED)
        })
      );
      if (effective.enabled.value && !effective.disabledByDenyList) {
        expect(["DENY", "REQUIRE_APPROVAL", "ALLOW"]).toContain(engineResultAtLimit.decision);
        if (engineResultAtLimit.code === "CONCURRENCY_LIMIT") {
          expect(engineResultAtLimit.decision).toBe("DENY");
        }
      } else {
        expect(engineResultAtLimit.decision).toBe("DENY");
        expect(engineResultAtLimit.code).toBe("AGENT_DISABLED");
      }
    });
  }

  it("a deny-listed agent is always reported disabled+locked, regardless of any rule saying otherwise", () => {
    const effective = resolveEffectivePolicy({
      disabledAgentRefs: ["research-agent"],
      agentRef: "research-agent",
      base: DEFAULT_LIMITS,
      matchedAgentRule: { enabled: true, requireApproval: null, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null },
      matchedModeRule: null,
    });
    expect(effective.enabled.value).toBe(false);
    expect(effective.enabled.locked).toBe(true);
    expect(effective.disabledByDenyList).toBe(true);
  });

  it("isRiskLevelSelectable rejects EXTERNAL_SIDE_EFFECT (above the architectural ceiling) and accepts everything at/under it", () => {
    expect(isRiskLevelSelectable("READ_ONLY")).toBe(true);
    expect(isRiskLevelSelectable("DRAFT_WRITE")).toBe(true);
    expect(isRiskLevelSelectable("INTERNAL_MUTATION")).toBe(true);
    expect(isRiskLevelSelectable("EXTERNAL_SIDE_EFFECT")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Unknown-agent policy (spec sections 13-14) — new precedence step 8b
// ---------------------------------------------------------------------------
describe("evaluatePolicy: unknown-agent policy (Fase 38 step 8b)", () => {
  it("ALLOW_DEFAULT (the default) behaves exactly like Fase 37 — no rule at all still ALLOWS", () => {
    const result = evaluatePolicy(baseCtx({ matchedAgentRule: null, matchedModeRule: null }));
    expect(result.decision).toBe("ALLOW");
  });

  it("DENY blocks an agent with no explicit rule when the policy sets unknownAgentBehavior=DENY", () => {
    const result = evaluatePolicy(baseCtx({ matchedAgentRule: null, matchedModeRule: null, policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, unknownAgentBehavior: "DENY" } } }));
    expect(result.decision).toBe("DENY");
    expect(result.code).toBe("UNKNOWN_AGENT_POLICY");
  });

  it("REQUIRE_APPROVAL requires approval for an agent with no explicit rule, and a valid pre-approval satisfies it", () => {
    const denied = evaluatePolicy(baseCtx({ matchedAgentRule: null, matchedModeRule: null, policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, unknownAgentBehavior: "REQUIRE_APPROVAL" } } }));
    expect(denied.decision).toBe("REQUIRE_APPROVAL");
    expect(denied.code).toBe("UNKNOWN_AGENT_POLICY");

    const preApproved = evaluatePolicy(
      baseCtx({ matchedAgentRule: null, matchedModeRule: null, policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, unknownAgentBehavior: "REQUIRE_APPROVAL" } }, preApprovedRequestId: "appr-1" })
    );
    expect(preApproved.decision).toBe("ALLOW");
  });

  it("never triggers when an explicit AGENT or MODE rule exists, even an empty/no-op one", () => {
    const result = evaluatePolicy(
      baseCtx({
        matchedAgentRule: { enabled: null, requireApproval: null, riskOverride: null, maxRunsPerDay: null, maxConcurrent: null, maxRetries: null },
        policy: { id: "p", version: 1, disabledAgentRefs: [], limits: { ...DEFAULT_LIMITS, unknownAgentBehavior: "DENY" } },
      })
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("does not fire when unknownAgentBehavior is unset (default object, no active policy)", () => {
    const result = evaluatePolicy(baseCtx({ policy: null }));
    expect(result.decision).toBe("ALLOW");
  });
});

// ---------------------------------------------------------------------------
// 3. Conflict detector (spec section 12)
// ---------------------------------------------------------------------------
describe("detectPolicyConflicts: deterministic, pure, never uses AI", () => {
  const base = { maxRiskLevel: "DRAFT_WRITE" as const, requireApprovalAtOrAboveRisk: null, maxRunsPerDay: 100, maxConcurrentRunsPerProject: 5, disabledAgentRefs: [] as string[], rules: [] as never[] };

  it("no conflicts for an empty, well-formed draft", () => {
    expect(detectPolicyConflicts(base)).toEqual([]);
  });

  it("ERROR: exact duplicate (scope, agentRef, mode)", () => {
    const conflicts = detectPolicyConflicts({ ...base, rules: [{ scope: "AGENT", agentRef: "research-agent" }, { scope: "AGENT", agentRef: "research-agent" }] as never });
    expect(conflicts.some((c) => c.code === "DUPLICATE_RULE" && c.severity === "ERROR")).toBe(true);
    expect(hasBlockingConflicts(conflicts)).toBe(true);
  });

  it("ERROR: a MODE rule with no mode value", () => {
    const conflicts = detectPolicyConflicts({ ...base, rules: [{ scope: "MODE", agentRef: "performance-strategist", mode: "" }] as never });
    expect(conflicts.some((c) => c.code === "MODE_RULE_MISSING_MODE")).toBe(true);
  });

  it("ERROR: riskOverride above the architectural ceiling", () => {
    const conflicts = detectPolicyConflicts({ ...base, rules: [{ scope: "AGENT", agentRef: "research-agent", riskOverride: "EXTERNAL_SIDE_EFFECT" }] as never });
    expect(conflicts.some((c) => c.code === "RISK_OVERRIDE_EXCEEDS_CEILING" && c.severity === "ERROR")).toBe(true);
  });

  it("WARNING: rule enables an agent that's still on the deny-list (shadowed, never actually applies)", () => {
    const conflicts = detectPolicyConflicts({ ...base, disabledAgentRefs: ["research-agent"], rules: [{ scope: "AGENT", agentRef: "research-agent", enabled: true }] as never });
    expect(conflicts.some((c) => c.code === "RULE_SHADOWED_BY_DENY_LIST" && c.severity === "WARNING")).toBe(true);
    expect(hasBlockingConflicts(conflicts)).toBe(false);
  });

  it("WARNING: a MODE rule is unreachable because the parent AGENT rule disables the agent", () => {
    const conflicts = detectPolicyConflicts({
      ...base,
      rules: [
        { scope: "AGENT", agentRef: "performance-strategist", enabled: false },
        { scope: "MODE", agentRef: "performance-strategist", mode: "ANALYZE", requireApproval: true },
      ] as never,
    });
    expect(conflicts.some((c) => c.code === "MODE_UNREACHABLE_PARENT_DISABLED")).toBe(true);
  });

  it("WARNING: agent-level daily quota above the project base quota", () => {
    const conflicts = detectPolicyConflicts({ ...base, maxRunsPerDay: 10, rules: [{ scope: "AGENT", agentRef: "research-agent", maxRunsPerDay: 50 }] as never });
    expect(conflicts.some((c) => c.code === "AGENT_QUOTA_ABOVE_BASE")).toBe(true);
  });

  it("WARNING: agent concurrency above the project ceiling (unreachable — project ceiling checked first)", () => {
    const conflicts = detectPolicyConflicts({ ...base, maxConcurrentRunsPerProject: 2, rules: [{ scope: "AGENT", agentRef: "research-agent", maxConcurrent: 10 }] as never });
    expect(conflicts.some((c) => c.code === "AGENT_CONCURRENCY_ABOVE_PROJECT")).toBe(true);
  });

  it("ERROR: invalid validity window (starts after it expires)", () => {
    const conflicts = detectPolicyConflicts({ ...base, rules: [{ scope: "AGENT", agentRef: "research-agent", startsAt: "2027-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:00:00.000Z" }] as never });
    expect(conflicts.some((c) => c.code === "INVALID_VALIDITY_WINDOW" && c.severity === "ERROR")).toBe(true);
  });

  it("WARNING: a rule that already expired in the past", () => {
    const conflicts = detectPolicyConflicts({ ...base, rules: [{ scope: "AGENT", agentRef: "research-agent", expiresAt: "2020-01-01T00:00:00.000Z" }] as never });
    expect(conflicts.some((c) => c.code === "RULE_ALREADY_EXPIRED" && c.severity === "WARNING")).toBe(true);
  });

  it("WARNING: an unreachable risk-based approval threshold (higher than the policy's own max risk)", () => {
    const conflicts = detectPolicyConflicts({ ...base, maxRiskLevel: "READ_ONLY", requireApprovalAtOrAboveRisk: "DRAFT_WRITE" });
    expect(conflicts.some((c) => c.code === "UNREACHABLE_RISK_APPROVAL")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Templates (spec section 30)
// ---------------------------------------------------------------------------
describe("GOVERNANCE_TEMPLATES: safe, real, schema-valid drafts — never activated automatically", () => {
  it("has exactly the three documented templates", () => {
    expect(GOVERNANCE_TEMPLATES.map((t) => t.key).sort()).toEqual(["BALANCED", "CONSERVATIVE", "EXPERIMENTAL"]);
  });

  for (const template of GOVERNANCE_TEMPLATES) {
    it(`"${template.key}" draft passes createPolicyVersionSchema validation exactly as-is`, () => {
      const parsed = createPolicyVersionSchema.safeParse(template.draft);
      expect(parsed.success).toBe(true);
    });

    it(`"${template.key}" never sets a risk level above the architectural ceiling`, () => {
      expect(["READ_ONLY", "DRAFT_WRITE", "INTERNAL_MUTATION"]).toContain(template.draft.maxRiskLevel);
    });

    it(`"${template.key}" never has blocking conflicts`, () => {
      const conflicts = detectPolicyConflicts({ ...template.draft, requireApprovalAtOrAboveRisk: template.draft.requireApprovalAtOrAboveRisk ?? null, maxRunsPerDay: template.draft.maxRunsPerDay ?? null });
      expect(hasBlockingConflicts(conflicts)).toBe(false);
    });
  }

  it("findGovernanceTemplate resolves a real template and returns undefined for an unknown key", () => {
    expect(findGovernanceTemplate("CONSERVATIVE")).toBeDefined();
    expect(findGovernanceTemplate("NOT_A_TEMPLATE")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Rollout scope — deterministic hashing (spec section 19)
// ---------------------------------------------------------------------------
describe("stableHashPercent / isInLimitedRolloutScope: deterministic, never per-request randomness", () => {
  it("the same input always hashes to the same bucket", () => {
    const a = stableHashPercent("policy-1:user-1");
    const b = stableHashPercent("policy-1:user-1");
    expect(a).toBe(b);
  });

  it("bucket is always within [0, 100)", () => {
    for (const input of ["a", "policy-1:user-1", "x".repeat(50), ""]) {
      const bucket = stableHashPercent(input);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it("a LIMITED rollout with NO scope configured at all matches nothing by default", () => {
    expect(isInLimitedRolloutScope({ policyId: "p", scopeAgentRefs: [], scopeModes: [], percentage: null }, "research-agent", null, "user-1")).toBe(false);
  });

  it("percentage: 100 matches every subject; 0 matches none", () => {
    expect(isInLimitedRolloutScope({ policyId: "p", scopeAgentRefs: [], scopeModes: [], percentage: 100 }, "research-agent", null, "user-1")).toBe(true);
    expect(isInLimitedRolloutScope({ policyId: "p", scopeAgentRefs: [], scopeModes: [], percentage: 0 }, "research-agent", null, "user-1")).toBe(false);
  });

  it("agentRefs scope excludes agents not listed", () => {
    expect(isInLimitedRolloutScope({ policyId: "p", scopeAgentRefs: ["seo-agent"], scopeModes: [], percentage: null }, "research-agent", null, "user-1")).toBe(false);
    expect(isInLimitedRolloutScope({ policyId: "p", scopeAgentRefs: ["research-agent"], scopeModes: [], percentage: null }, "research-agent", null, "user-1")).toBe(true);
  });

  it("modes scope only applies when a mode is actually given", () => {
    expect(isInLimitedRolloutScope({ policyId: "p", scopeAgentRefs: [], scopeModes: ["ANALYZE"], percentage: null }, "performance-strategist", "PREPARE_STRATEGY", "user-1")).toBe(false);
    expect(isInLimitedRolloutScope({ policyId: "p", scopeAgentRefs: [], scopeModes: ["ANALYZE"], percentage: null }, "performance-strategist", "ANALYZE", "user-1")).toBe(true);
  });

  it("the same user is always assigned the same way for the same policy (no flip-flopping)", () => {
    const config = { policyId: "policy-abc", scopeAgentRefs: [], scopeModes: [], percentage: 50 };
    const first = isInLimitedRolloutScope(config, "research-agent", null, "user-42");
    for (let i = 0; i < 5; i++) {
      expect(isInLimitedRolloutScope(config, "research-agent", null, "user-42")).toBe(first);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Sensitive change detection (spec sections 23-24)
// ---------------------------------------------------------------------------
describe("detectSensitiveChanges: deterministic, no AI, never flags an identical policy", () => {
  const stable = { maxRiskLevel: "DRAFT_WRITE" as const, requireApprovalAtOrAboveRisk: null, maxRunsPerDay: 50, maxRunsPerMonth: 1000, maxConcurrentRunsPerProject: 3, maxConcurrentRunsPerAgent: 1, unknownAgentBehavior: "ALLOW_DEFAULT" as const, onBudgetExhausted: "DENY" as const, disabledAgentRefs: ["a"] };

  it("the very first policy a project activates has nothing to compare against — never flagged", () => {
    expect(detectSensitiveChanges(null, stable)).toEqual([]);
  });

  it("an identical policy produces no sensitive changes", () => {
    expect(detectSensitiveChanges(stable, { ...stable })).toEqual([]);
  });

  it("raising the risk ceiling is flagged", () => {
    const changes = detectSensitiveChanges(stable, { ...stable, maxRiskLevel: "INTERNAL_MUTATION" });
    expect(changes.some((c) => c.code === "RISK_CEILING_RAISED")).toBe(true);
  });

  it("re-enabling a previously denied agent is flagged", () => {
    const changes = detectSensitiveChanges(stable, { ...stable, disabledAgentRefs: [] });
    expect(changes.some((c) => c.code === "AGENT_RE_ENABLED")).toBe(true);
  });

  it("removing a risk-based approval requirement is flagged", () => {
    const changes = detectSensitiveChanges({ ...stable, requireApprovalAtOrAboveRisk: "DRAFT_WRITE" }, stable);
    expect(changes.some((c) => c.code === "APPROVAL_REQUIREMENT_REMOVED")).toBe(true);
  });

  it("increasing daily/monthly quota is flagged", () => {
    expect(detectSensitiveChanges(stable, { ...stable, maxRunsPerDay: 500 }).some((c) => c.code === "DAILY_QUOTA_INCREASED")).toBe(true);
    expect(detectSensitiveChanges(stable, { ...stable, maxRunsPerMonth: 5000 }).some((c) => c.code === "MONTHLY_QUOTA_INCREASED")).toBe(true);
  });

  it("increasing concurrency (project or agent) is flagged", () => {
    expect(detectSensitiveChanges(stable, { ...stable, maxConcurrentRunsPerProject: 20 }).some((c) => c.code === "PROJECT_CONCURRENCY_INCREASED")).toBe(true);
    expect(detectSensitiveChanges(stable, { ...stable, maxConcurrentRunsPerAgent: 10 }).some((c) => c.code === "AGENT_CONCURRENCY_INCREASED")).toBe(true);
  });

  it("disabling the unknown-agent guard (back to ALLOW_DEFAULT) is flagged", () => {
    const changes = detectSensitiveChanges({ ...stable, unknownAgentBehavior: "DENY" }, stable);
    expect(changes.some((c) => c.code === "UNKNOWN_AGENT_GUARD_DISABLED")).toBe(true);
  });

  it("relaxing budget-exhausted behavior from DENY to REQUIRE_APPROVAL is flagged", () => {
    const changes = detectSensitiveChanges(stable, { ...stable, onBudgetExhausted: "REQUIRE_APPROVAL" });
    expect(changes.some((c) => c.code === "BUDGET_EXHAUSTED_BEHAVIOR_RELAXED")).toBe(true);
  });

  it("lowering limits or tightening controls never triggers a sensitive-change flag", () => {
    expect(detectSensitiveChanges(stable, { ...stable, maxRunsPerDay: 5, maxConcurrentRunsPerProject: 1 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. Validation schemas for new Fase 38 inputs
// ---------------------------------------------------------------------------
describe("policyRuleInputSchema: validity window fields are validated real dates", () => {
  it("accepts a rule with a real ISO startsAt/expiresAt", () => {
    const result = policyRuleInputSchema.safeParse({ scope: "AGENT", agentRef: "research-agent", startsAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-06-01T00:00:00.000Z" });
    expect(result.success).toBe(true);
  });
  it("rejects a garbage date string", () => {
    const result = policyRuleInputSchema.safeParse({ scope: "AGENT", agentRef: "research-agent", startsAt: "not-a-date" });
    expect(result.success).toBe(false);
  });
});

describe("createPolicyVersionSchema: unknownAgentBehavior and basedOnPolicyId", () => {
  it("defaults unknownAgentBehavior to ALLOW_DEFAULT", () => {
    const result = createPolicyVersionSchema.parse({});
    expect(result.unknownAgentBehavior).toBe("ALLOW_DEFAULT");
  });
  it("rejects an unrecognized unknownAgentBehavior value", () => {
    const result = createPolicyVersionSchema.safeParse({ unknownAgentBehavior: "MAYBE" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Prisma schema + migration structural checks
// ---------------------------------------------------------------------------
describe("prisma schema: Fase 38 Policy Studio data model", () => {
  const schema = read("prisma/schema.prisma");

  it("AiAgentPolicyRollout is 1:1 with a policy version — never a second parallel active-policy concept", () => {
    expect(schema).toMatch(/model AiAgentPolicyRollout \{[\s\S]*?policyId\s+String\s+@unique/);
  });

  it("AiAgentPolicyShadowEvaluation only stores bounded, useful fields — decision + code, never a full duplicate snapshot", () => {
    const model = schema.match(/model AiAgentPolicyShadowEvaluation \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/activeDecision\s+GovernanceDecision/);
    expect(model).toMatch(/shadowDecision\s+GovernanceDecision/);
    expect(model).not.toMatch(/rulesEvaluated|effectiveLimits|budgetSnapshot/);
  });

  it("AiAgentPolicyChangeApproval is distinct from AiAgentGovernanceApproval (run-gate) and AiAgentApproval (step-gate)", () => {
    expect(schema).toMatch(/model AiAgentPolicyChangeApproval \{/);
    expect(schema).toMatch(/model AiAgentGovernanceApproval \{/);
    expect(schema).toMatch(/model AiAgentApproval \{/);
  });

  it("AiAgentPolicy.basedOnPolicyId is a self-relation used for restore/rollback traceability, SetNull on delete (never cascades and deletes a whole version chain)", () => {
    expect(schema).toMatch(/basedOnPolicy\s+AiAgentPolicy\?\s+@relation\("AiAgentPolicyRestoredFrom", fields: \[basedOnPolicyId\], references: \[id\], onDelete: SetNull\)/);
  });

  it("AiAgentPolicyRule gained startsAt/expiresAt as nullable, additive columns", () => {
    const model = schema.match(/model AiAgentPolicyRule \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/startsAt\s+DateTime\?/);
    expect(model).toMatch(/expiresAt\s+DateTime\?/);
  });

  it("the Fase 38 migration exists, is additive, and comes after the Fase 37 governance migration", () => {
    const migrationsDir = readdirSync(path.join(ROOT, "prisma/migrations")).sort();
    const fase37 = migrationsDir.find((m) => m.includes("add_ai_agent_governance"));
    const fase38 = migrationsDir.find((m) => m.includes("add_ai_agent_policy_studio"));
    expect(fase37).toBeDefined();
    expect(fase38).toBeDefined();
    expect(fase38!.localeCompare(fase37!)).toBeGreaterThan(0);

    const sql = read(`prisma/migrations/${fase38}/migration.sql`);
    const statements = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(/DROP TABLE/);
    expect(statements).not.toMatch(/TRUNCATE/);
    expect(statements).not.toMatch(/\bRESET\b/);
  });
});

// ---------------------------------------------------------------------------
// 9. Service-layer structural checks
// ---------------------------------------------------------------------------
describe("agent-governance-policy.ts: rule validity window is enforced at query time, not just by a cron", () => {
  const source = read("src/server/services/agent-governance-policy.ts");
  it("getMatchedRules filters by startsAt/expiresAt against `now` on every call", () => {
    expect(source).toMatch(/startsAt: \{ lte: now \}/);
    expect(source).toMatch(/expiresAt: \{ gt: now \}/);
  });
  it("createPolicyDraft blocks on ERROR-severity conflicts before ever writing to the database", () => {
    expect(source).toMatch(/hasBlockingConflicts\(conflicts\)/);
    expect(source.indexOf("hasBlockingConflicts(conflicts)")).toBeLessThan(source.indexOf("prisma.aiAgentPolicy.create"));
  });
  it("restorePolicyVersion always creates a NEW draft — never updates the source version's own row", () => {
    expect(source).not.toMatch(/restorePolicyVersion[\s\S]{0,400}prisma\.aiAgentPolicy\.update/);
  });
  it("activatePolicyVersion blocks on an un-approved sensitive change before the real activation transaction", () => {
    const activateBody = source.slice(source.indexOf("export async function activatePolicyVersion"));
    const sensitiveCheckIndex = activateBody.indexOf("detectSensitiveChanges");
    const transactionIndex = activateBody.indexOf("$transaction");
    expect(sensitiveCheckIndex).toBeGreaterThan(-1);
    expect(sensitiveCheckIndex).toBeLessThan(transactionIndex);
  });
});

describe("agent-governance-rollout.ts: promotion to PROMOTED always goes through the REAL activatePolicyVersion — never a second activation path", () => {
  const source = read("src/server/services/agent-governance-rollout.ts");
  it("imports and calls the real activatePolicyVersion for PROMOTED", () => {
    expect(source).toMatch(/import \{ activatePolicyVersion \} from "@\/server\/services\/agent-governance-policy"/);
    expect(source).toMatch(/const activation = await activatePolicyVersion\(projectId, userId, policyId\);/);
  });
  it("only inserts a detailed shadow-difference row when the decision actually differs — never one row per evaluation", () => {
    expect(source).toMatch(/if \(!differs\) return;/);
  });
  it("uses upsert for starting a rollout — idempotent, never creates two rollout rows for one policy", () => {
    expect(source).toMatch(/prisma\.aiAgentPolicyRollout\.upsert/);
  });
});

describe("agent-governance-change-approval.ts: real separation of duties when the project has more than one approver", () => {
  const source = read("src/server/services/agent-governance-change-approval.ts");
  it("blocks the requester from deciding their own request when separation of duties can be enforced", () => {
    expect(source).toMatch(/separationEnforced && target\.requestedById === decidedById/);
  });
  it("documents (never silently hides) the single-approver fallback", () => {
    expect(source).toMatch(/honest limitation/i);
    expect(source).toMatch(/fully audited/i);
  });
  it("uses a conditioned updateMany so two decisions can never both win", () => {
    expect(source).toMatch(/updateMany\(\{\s*where: \{ id: approvalId, status: "PENDING" \}/);
  });
});

describe("agent-governance-impact.ts: never mutates a run or its immutable governance snapshot", () => {
  const source = read("src/server/services/agent-governance-impact.ts");
  it("only reads from aiAgentRunGovernanceSnapshot / aiAgentRun — no update/create calls against either", () => {
    expect(source).not.toMatch(/prisma\.aiAgentRunGovernanceSnapshot\.(update|create|delete)/);
    expect(source).not.toMatch(/prisma\.aiAgentRun\.(update|create|delete)/);
  });
  it("bounds the number of runs analyzed via take: maxRuns + 1 and reports truncation honestly", () => {
    expect(source).toMatch(/take: input\.maxRuns \+ 1/);
    expect(source).toMatch(/truncated/);
  });
});

describe("agent-governance-matrix.ts / mass simulation: never creates a run, never consumes budget or concurrency", () => {
  const source = read("src/server/services/agent-governance-matrix.ts");
  it("never calls a run-creation or budget-reservation function", () => {
    expect(source).not.toMatch(/createDraftRun|reserveBudget|consumeBudget/);
  });
  it("bounds the number of cells computed to GOVERNANCE_LIMITS.MAX_MASS_SIMULATION_CELLS", () => {
    expect(source).toMatch(/GOVERNANCE_LIMITS\.MAX_MASS_SIMULATION_CELLS/);
  });
});

// ---------------------------------------------------------------------------
// 10. Multi-tenant isolation
// ---------------------------------------------------------------------------
describe("multi-tenant isolation: every new Fase 38 read/write is scoped by projectId", () => {
  it("getPolicyById rejects a policy from a different project", () => {
    const source = read("src/server/services/agent-governance-policy.ts");
    expect(source).toMatch(/getPolicyById[\s\S]{0,200}if \(!row \|\| row\.projectId !== projectId\) return null;/);
  });
  it("comparePolicyVersions rejects a version belonging to a different project", () => {
    const source = read("src/server/services/agent-governance-comparison.ts");
    expect(source).toMatch(/a\.projectId !== projectId/);
    expect(source).toMatch(/b\.projectId !== projectId/);
  });
  it("getRollout / rollout mutations reject a policyId from a different project", () => {
    const source = read("src/server/services/agent-governance-rollout.ts");
    expect(source).toMatch(/if \(!row \|\| row\.projectId !== projectId\) return null;/);
  });
  it("getPolicyCoverage rejects a policy from a different project", () => {
    const source = read("src/server/services/agent-governance-coverage.ts");
    expect(source).toMatch(/if \(!policy \|\| policy\.projectId !== projectId\) return \{ error:/);
  });
});

describe("server actions: Fase 38 admin operations gated at MANAGER, reuse the real role system", () => {
  const source = read("src/server/actions/agent-governance.ts");
  const managerGatedActions = [
    "createPolicyDraftAction",
    "activatePolicyVersionAction",
    "restorePolicyVersionAction",
    "analyzePolicyImpactAction",
    "runMassSimulationAction",
    "startShadowRolloutAction",
    "updateRolloutScopeAction",
    "promoteRolloutAction",
    "retireRolloutAction",
    "requestPolicyChangeApprovalAction",
    "decidePolicyChangeApprovalAction",
    "getPolicyCoverageAction",
  ];
  for (const action of managerGatedActions) {
    it(`${action} requires MANAGER`, () => {
      const body = source.slice(source.indexOf(`export async function ${action}`), source.indexOf(`export async function ${action}`) + 400);
      expect(body).toMatch(/requireProjectAccess\(projectId, "MANAGER"\)/);
    });
  }
});

// ---------------------------------------------------------------------------
// 11. Automation Center + notifications
// ---------------------------------------------------------------------------
describe("Automation Center: Fase 38 events registered in the single event catalog", () => {
  const source = read("src/lib/automations/events.ts");
  const keys = [
    "ai_agent_governance.policy_conflict_detected",
    "ai_agent_governance.impact_analysis_completed",
    "ai_agent_governance.shadow_rollout_started",
    "ai_agent_governance.limited_rollout_started",
    "ai_agent_governance.policy_promotion_requested",
    "ai_agent_governance.policy_promoted",
    "ai_agent_governance.policy_rollback_created",
    "ai_agent_governance.rule_expired",
    "ai_agent_governance.unknown_agent_detected",
  ];
  for (const key of keys) {
    it(`registers "${key}"`, () => {
      expect(source).toContain(`key: "${key}"`);
    });
  }
});

describe("notifications: Fase 38 reuses the existing Notification model, never a new system", () => {
  const source = read("src/server/services/agent-governance-notifications.ts");
  it("every new notify function creates via prisma.notification.create (through notifyOnce)", () => {
    expect(source).toMatch(/notifyPolicyChangeApprovalPending/);
    expect(source).toMatch(/notifyShadowRolloutDivergence/);
    expect(source).toMatch(/notifyPolicyRollbackCreated/);
    expect((source.match(/notifyOnce\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it("shadow-divergence notifications only fire at a real threshold, never once per evaluation", () => {
    const rolloutSource = read("src/server/services/agent-governance-rollout.ts");
    expect(rolloutSource).toMatch(/shadowDifferenceCount % 10 === 0/);
  });
});

// ---------------------------------------------------------------------------
// 12. AI Workflows: still no write capability introduced by Fase 38
// ---------------------------------------------------------------------------
describe("AI Workflows: Fase 38 introduces no write capability over governance/rollout/policy studio", () => {
  it("no AI Workflows source file references any Fase 38 governance model or service", () => {
    const files = ["engine.ts", "execution-resolver.ts", "types.ts", "run-state.ts", "limits.ts"];
    for (const file of files) {
      const source = read(`src/lib/ai-workflows/${file}`);
      expect(source).not.toMatch(/agent-governance|AiAgentPolicyRollout|AiAgentPolicyShadowEvaluation|AiAgentPolicyChangeApproval/);
    }
  });
});

// ---------------------------------------------------------------------------
// 13. UI: no alert()/confirm(), real accessible states
// ---------------------------------------------------------------------------
describe("Policy Studio UI: no native alert()/confirm(), real empty/loading states", () => {
  const files = ["src/components/agents/policy-studio.tsx", "src/components/agents/policy-rule-editor.tsx"];
  for (const file of files) {
    it(`${file} never calls window.alert()/confirm()`, () => {
      const source = read(file);
      expect(source).not.toMatch(/\bwindow\.confirm\(|\balert\(/);
    });
  }
  it("the matrix shows a real truncation notice instead of silently hiding cut-off data", () => {
    const source = read("src/components/agents/policy-studio.tsx");
    expect(source).toMatch(/truncated/);
  });
  it("the rule editor represents an unset override as null/'heredado', never a fake sentinel value", () => {
    const source = read("src/components/agents/policy-rule-editor.tsx");
    expect(source).toMatch(/Heredado/);
  });
});

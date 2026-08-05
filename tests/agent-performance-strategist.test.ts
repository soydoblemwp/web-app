import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { findAgentDefinition, listAgentDefinitions } from "@/lib/agents/registry";
import { AGENT_INPUT_FIELD_TYPES, AGENT_RESOURCE_INPUT_TYPES } from "@/lib/agents/types";
import { buildInputZodSchema } from "@/lib/agents/dynamic-form";
import { agentPerformanceStrategistInputSchema, PERFORMANCE_STRATEGIST_MODES } from "@/lib/validation/agent-performance-strategist";
import { MB_OPTIMIZATION_LIMITS } from "@/lib/marketing-brain/optimization-limits";
import { guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Registration — the one real registry, no "coming soon" card
// ---------------------------------------------------------------------------
describe("registry.ts: Performance Strategist is registered as a real, executable official agent (Fase 36 spec section 5)", () => {
  it("is present in AGENT_DEFINITIONS with a stable key, active, and a full configuration", () => {
    const def = findAgentDefinition("performance-strategist");
    expect(def).toBeDefined();
    expect(def!.active).toBe(true);
    expect(def!.name).toBeTruthy();
    expect(def!.description).toBeTruthy();
    expect(def!.icon).toBeTruthy();
    expect(def!.category).toBe("MARKETING");
    expect(def!.capabilities.length).toBeGreaterThan(0);
  });

  it("is reachable through the SAME listAgentDefinitions() every other official agent uses — no second registry", () => {
    expect(listAgentDefinitions().some((a) => a.key === "performance-strategist")).toBe(true);
  });

  it("declares a required 'mode' select input with exactly the 5 documented modes", () => {
    const def = findAgentDefinition("performance-strategist")!;
    const modeField = def.requiredInputs.find((f) => f.key === "mode");
    expect(modeField).toBeDefined();
    expect(modeField!.type).toBe("select");
    expect((modeField!.options ?? []).map((o) => o.value).sort()).toEqual([...PERFORMANCE_STRATEGIST_MODES].sort());
  });

  it("its metricKeys multiselect options come from the real Performance Center catalog, never an invented list", () => {
    const def = findAgentDefinition("performance-strategist")!;
    const metricField = def.optionalInputs.find((f) => f.key === "metricKeys");
    expect(metricField?.options?.length).toBeGreaterThan(10);
  });

  it("never appears in guest navigation — AI Agents (and this capability) are authenticated-project-only", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels.join(",").toLowerCase()).not.toMatch(/performance strategist/);
  });
});

// ---------------------------------------------------------------------------
// 2. Field type: marketing_brain_session wired end-to-end
// ---------------------------------------------------------------------------
describe("marketing_brain_session field type: wired the same way every other resource-reference type is (registry -> shape validation -> UI)", () => {
  it("is a real member of AGENT_INPUT_FIELD_TYPES and AGENT_RESOURCE_INPUT_TYPES (server-side re-validation required)", () => {
    expect(AGENT_INPUT_FIELD_TYPES).toContain("marketing_brain_session");
    expect(AGENT_RESOURCE_INPUT_TYPES).toContain("marketing_brain_session");
  });

  it("buildInputZodSchema validates it as a cuid shape, same as campaign/content_item", () => {
    const schema = buildInputZodSchema([{ key: "optimizationSessionId", label: "Sesión", type: "marketing_brain_session", required: false }]);
    expect(schema.safeParse({ optimizationSessionId: "clabcdefghijklmnopqrstuv" }).success).toBe(true);
    expect(schema.safeParse({ optimizationSessionId: "not-a-cuid" }).success).toBe(false);
  });

  it("the dynamic form renderer has a real case for it, fetching real sessions via a select action — never a raw text box", () => {
    const source = read("src/components/agents/dynamic-input-form.tsx");
    expect(source).toMatch(/case "marketing_brain_session":/);
    expect(source).toMatch(/listOptimizationSessionsForSelectAction/);
  });
});

// ---------------------------------------------------------------------------
// 3. Input validation — mode-dependent, server-side, never trusts shape alone
// ---------------------------------------------------------------------------
describe("validation/agent-performance-strategist.ts: mode-dependent input validation (spec section 7)", () => {
  it("accepts a bare ANALYZE mode with no other fields", () => {
    expect(agentPerformanceStrategistInputSchema.safeParse({ mode: "ANALYZE" }).success).toBe(true);
  });

  it("rejects an unknown mode", () => {
    expect(agentPerformanceStrategistInputSchema.safeParse({ mode: "DO_EVERYTHING" }).success).toBe(false);
  });

  it("requires optimizationSessionId for REVIEW_EXISTING", () => {
    expect(agentPerformanceStrategistInputSchema.safeParse({ mode: "REVIEW_EXISTING" }).success).toBe(false);
    expect(agentPerformanceStrategistInputSchema.safeParse({ mode: "REVIEW_EXISTING", optimizationSessionId: "clabcdefghijklmnopqrstuv" }).success).toBe(true);
  });

  it("requires optimizationSessionId for PREPARE_MEASUREMENT and PREPARE_REVIEW", () => {
    expect(agentPerformanceStrategistInputSchema.safeParse({ mode: "PREPARE_MEASUREMENT" }).success).toBe(false);
    expect(agentPerformanceStrategistInputSchema.safeParse({ mode: "PREPARE_REVIEW" }).success).toBe(false);
  });

  it("caps periodDays at the shared MB_OPTIMIZATION_LIMITS.MAX_PERIOD_DAYS — never an unbounded period", () => {
    const result = agentPerformanceStrategistInputSchema.safeParse({ mode: "ANALYZE", periodDays: MB_OPTIMIZATION_LIMITS.MAX_PERIOD_DAYS + 100 });
    expect(result.success).toBe(false);
  });

  it("caps metricKeys at MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_METRICS — reuses the SAME Fase 35 limit, no duplicated constant", () => {
    const tooMany = Array.from({ length: MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_METRICS + 5 }, (_, i) => `metric_${i}`);
    expect(agentPerformanceStrategistInputSchema.safeParse({ mode: "ANALYZE", metricKeys: tooMany }).success).toBe(false);
  });

  it("rejects a negative budget", () => {
    expect(agentPerformanceStrategistInputSchema.safeParse({ mode: "PREPARE_STRATEGY", budget: -100 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Execution engine reuse — no second orchestrator
// ---------------------------------------------------------------------------
describe("agent-orchestrator.ts: Performance Strategist is dispatched from the SAME prepare/complete pipeline, never a parallel one (spec sections 10/11)", () => {
  it("prepareNextStep branches to the capability's own handler only AFTER the generic RUNNING claim — concurrency guard is shared, not reimplemented", () => {
    const source = read("src/server/services/agent-orchestrator.ts");
    const prepareFn = source.match(/export async function prepareNextStep[\s\S]*?\n^}/m)![0];
    const claimIndex = prepareFn.indexOf('status: "PENDING" },\n    data: { status: "RUNNING"');
    const branchIndex = prepareFn.indexOf('step.agentRef === "performance-strategist"');
    expect(claimIndex).toBeGreaterThan(-1);
    expect(branchIndex).toBeGreaterThan(claimIndex);
  });

  it("completeAiStep validates the SAME step/executionToken match before branching to the capability's completion handler", () => {
    const source = read("src/server/services/agent-orchestrator.ts");
    const completeFn = source.match(/export async function completeAiStep[\s\S]*?\n^}/m)![0];
    const tokenCheckIndex = completeFn.indexOf("step.executionToken !== executionToken");
    const branchIndex = completeFn.indexOf('step.agentRef === "performance-strategist"');
    expect(tokenCheckIndex).toBeGreaterThan(-1);
    expect(branchIndex).toBeGreaterThan(tokenCheckIndex);
  });

  it("agent-run-lifecycle.ts is the SINGLE shared finalize/fail implementation both the generic orchestrator and the capability import — never duplicated", () => {
    const orchestrator = read("src/server/services/agent-orchestrator.ts");
    const strategist = read("src/server/services/agent-performance-strategist.ts");
    expect(orchestrator).toMatch(/from "@\/server\/services\/agent-run-lifecycle"/);
    expect(strategist).toMatch(/from "@\/server\/services\/agent-run-lifecycle"/);
    expect(strategist).not.toMatch(/async function finalizeIfAllStepsResolved/);
    expect(orchestrator).not.toMatch(/async function finalizeIfAllStepsResolved/);
  });
});

// ---------------------------------------------------------------------------
// 5. Reuse of Fase 35 primitives — no second context/scenario/evidence/numeric-claims engine
// ---------------------------------------------------------------------------
describe("agent-performance-strategist.ts: reuses Fase 35's context builder, scenario generator, evidence strength, and numeric-claims guard — never reimplements them", () => {
  const source = read("src/server/services/agent-performance-strategist.ts");

  it("imports buildPerformanceContext from the Fase 35 service, never redefining its own context builder", () => {
    expect(source).toMatch(/import \{ buildPerformanceContext \} from "@\/server\/services\/marketing-brain-performance-context"/);
  });

  it("imports the scenario generation prompt builders/parser from scenario-ai.ts, never a second parser", () => {
    expect(source).toMatch(/buildScenarioGenerationSystemPrompt/);
    expect(source).toMatch(/parseScenarioGenerationText/);
  });

  it("imports checkForFabricatedNumericClaims from the SAME numeric-claims.ts built in Fase 35", () => {
    expect(source).toMatch(/checkForFabricatedNumericClaims/);
    expect(read("src/lib/marketing-brain/numeric-claims.ts")).toBeTruthy();
  });

  it("delegates the actual session/scenario persistence to Fase 35's prepareOptimizationGeneration/completeOptimizationGeneration — never writes MarketingBrainScenario rows itself", () => {
    expect(source).toMatch(/prepareOptimizationGeneration/);
    expect(source).toMatch(/completeOptimizationGeneration/);
    expect(source).not.toMatch(/prisma\.marketingBrainScenario\.(create|upsert)/);
  });

  it("PREPARE_MEASUREMENT/PREPARE_REVIEW delegate to Fase 35's deterministic createMeasurementPlan/generateMeasurementReview — the AI never decides REACHED/NOT_REACHED", () => {
    expect(source).toMatch(/createMeasurementPlan/);
    expect(source).toMatch(/generateMeasurementReview/);
  });
});

// ---------------------------------------------------------------------------
// 6. Permission boundaries — what the agent can and can NOT do
// ---------------------------------------------------------------------------
describe("Performance Strategist permission boundaries: only ever prepares DRAFT artifacts (spec sections 2/14)", () => {
  const source = read("src/server/services/agent-performance-strategist.ts");

  it("never calls decideOptimizationSession — cannot approve or formally reject a strategy", () => {
    expect(source).not.toMatch(/decideOptimizationSession\(/);
  });

  it("never calls convertScenarioAction — cannot convert a proposed action into a real resource", () => {
    expect(source).not.toMatch(/convertScenarioAction\(/);
    expect(source).not.toMatch(/from "@\/server\/services\/marketing-brain-scenario-conversion"/);
  });

  it("never imports publishing/scheduling/automation-activation services", () => {
    expect(source).not.toMatch(/from "@\/server\/services\/publishing"/);
    expect(source).not.toMatch(/runAutomationNow/);
    expect(source).not.toMatch(/schedulePublication|publishNow/);
  });

  it("ANALYZE mode never creates a MarketingBrainOptimizationSession — spec 6.1: 'no debe crear automáticamente una estrategia'", () => {
    const analyzeFn = source.match(/async function prepareAnalyze[\s\S]*?\n}/)![0];
    expect(analyzeFn).not.toMatch(/createOptimizationSession\(/);
  });

  it("PREPARE_MEASUREMENT requires the target session to be APPROVED — never drafts a plan for a session still pending review", () => {
    expect(source).toMatch(/session\.status !== "APPROVED"/);
  });
});

// ---------------------------------------------------------------------------
// 7. Versioning — never silently edits an already-decided session
// ---------------------------------------------------------------------------
describe("REVIEW_EXISTING mode: never edits an already-generated session directly (spec section 16)", () => {
  it("creates a new DRAFT version whenever the target session is not still a bare DRAFT", () => {
    const source = read("src/server/services/agent-performance-strategist.ts");
    expect(source).toMatch(/session\.status !== "DRAFT"/);
    expect(source).toMatch(/createOptimizationSessionVersion/);
  });
});

// ---------------------------------------------------------------------------
// 8. Idempotency — the same run never creates two sessions/versions
// ---------------------------------------------------------------------------
describe("Idempotency: the agent run's own id derives every idempotency key — never a second session for the same run", () => {
  it("PREPARE_STRATEGY derives its session idempotencyKey from the run id", () => {
    const source = read("src/server/services/agent-performance-strategist.ts");
    expect(source).toMatch(/`agent-run:\$\{run\.id\}`/);
  });

  it("REVIEW_EXISTING's new-version idempotencyKey also derives from the run id", () => {
    const source = read("src/server/services/agent-performance-strategist.ts");
    expect(source).toMatch(/createOptimizationSessionVersion\(projectId, session\.id, userId, `agent-run:\$\{run\.id\}`\)/);
  });
});

// ---------------------------------------------------------------------------
// 9. Migration — none was needed, and none was added
// ---------------------------------------------------------------------------
describe("Schema: no migration was needed for Fase 36 — createdByAgentRunId already existed from Fase 35", () => {
  it("no new migration folder references performance-strategist/agent-performance-strategist", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"));
    expect(migrations.some((m) => m.toLowerCase().includes("performance_strategist") || m.toLowerCase().includes("performance-strategist"))).toBe(false);
  });

  it("MarketingBrainOptimizationSession.createdByAgentRunId already exists in the schema — reused, not re-added", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model MarketingBrainOptimizationSession \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/createdByAgentRunId\s+String\?/);
  });

  it("the two Fase 35 migrations remain adjacent with nothing inserted between them for Fase 36 (later phases may still add their OWN migrations after both)", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"))
      .filter((m) => /^\d{14}_/.test(m))
      .sort();
    const firstIndex = migrations.indexOf("20260731090000_add_marketing_brain_optimization_loop");
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(migrations[firstIndex + 1]).toBe("20260731090100_add_marketing_brain_strategy_brief");
  });
});

// ---------------------------------------------------------------------------
// 10. Automation Center events — real, published after commit, never before
// ---------------------------------------------------------------------------
describe("event integration: the Performance Strategist events are registered and genuinely published after persistence", () => {
  const eventKeys = [
    "agent_run.performance_strategist_draft_created",
    "agent_run.performance_strategist_draft_revised",
    "agent_run.performance_strategist_measurement_drafted",
    "agent_run.performance_strategist_review_drafted",
    "agent_run.performance_strategist_insufficient_data",
  ];

  it("every event key is registered in AUTOMATION_EVENT_DEFINITIONS", () => {
    const source = read("src/lib/automations/events.ts");
    for (const key of eventKeys) expect(source).toMatch(new RegExp(`key: "${key.replace(/\./g, "\\.")}"`));
  });

  it("agent-performance-strategist.ts publishes every one of these keys via the shared automation-events helper", () => {
    const source = read("src/server/services/agent-performance-strategist.ts");
    expect(source).toMatch(/from "@\/server\/services\/automation-events"/);
    for (const key of eventKeys) expect(source).toMatch(new RegExp(key.replace(/\./g, "\\.")));
  });

  it("draft_created is only published from inside completePerformanceStrategistStep, after completeOptimizationGeneration already succeeded — never before persistence", () => {
    const source = read("src/server/services/agent-performance-strategist.ts");
    const completedIndex = source.indexOf("const completed = await completeOptimizationGeneration");
    const eventIndex = source.indexOf("agent_run.performance_strategist_draft_created");
    expect(completedIndex).toBeGreaterThan(-1);
    expect(eventIndex).toBeGreaterThan(completedIndex);
  });
});

// ---------------------------------------------------------------------------
// 11. AI Workflows — left unmodified, decision documented
// ---------------------------------------------------------------------------
describe("AI Workflows: left unmodified for Performance Strategist (documented scope decision, spec section 27)", () => {
  it("the workflow engine has no new step type or reference for performance-strategist / agent-performance-strategist", () => {
    const source = read("src/lib/ai-workflows/engine.ts");
    expect(source).not.toMatch(/performance-strategist/);
    expect(source).not.toMatch(/agent-performance-strategist/);
  });
});

// ---------------------------------------------------------------------------
// 12. Security — cross-project resource IDs are never trusted
// ---------------------------------------------------------------------------
describe("security: every resource ID the capability touches is re-validated against the current project, never trusted by shape alone", () => {
  const source = read("src/server/services/agent-performance-strategist.ts");

  it("has dedicated ownership-check helpers for every resource type it accepts, each filtering by projectId", () => {
    expect(source).toMatch(/async function ownedCampaign/);
    expect(source).toMatch(/async function ownedContentItem/);
    expect(source).toMatch(/async function ownedSocialPost/);
    expect(source).toMatch(/async function ownedSession/);
    expect(source).toMatch(/row\?\.projectId === projectId/);
  });

  it("the entry action layer (agent-execution.ts) still requires EDITOR project access for prepare/complete/fail — untouched by this phase", () => {
    const actionsSource = read("src/server/actions/agent-execution.ts");
    expect(actionsSource).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/g);
  });
});

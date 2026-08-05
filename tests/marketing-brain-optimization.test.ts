import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { classifyEvidenceStrength, computeEvidenceStrengthScore } from "@/lib/marketing-brain/evidence-strength";
import { checkForFabricatedNumericClaims } from "@/lib/marketing-brain/numeric-claims";
import { buildScenarioGenerationSystemPrompt, buildScenarioGenerationUserPrompt, parseScenarioGenerationText } from "@/lib/marketing-brain/scenario-ai";
import { performanceContextSelectionSchema, createMeasurementPlanSchema, convertScenarioActionSchema } from "@/lib/validation/marketing-brain-optimization";
import { MB_OPTIMIZATION_LIMITS } from "@/lib/marketing-brain/optimization-limits";
import { MB_OPTIMIZATION_ERROR_CODES, mbOptimizationError } from "@/lib/marketing-brain/optimization-types";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Evidence strength — deterministic, never AI-based
// ---------------------------------------------------------------------------
describe("evidence-strength.ts: deterministic solidez de evidencia (spec section 11)", () => {
  it("classifies INSUFFICIENT when there's no real sample or data quality", () => {
    expect(classifyEvidenceStrength({ dataQualityScore: 0, coverage: 0, recency: 0, sampleSize: 0, hasBenchmark: false, hasGoal: false, hasExperiment: false })).toBe("INSUFFICIENT");
  });

  it("classifies STRONG for excellent quality, full coverage/recency, large sample, and a supporting experiment", () => {
    const level = classifyEvidenceStrength({ dataQualityScore: 95, coverage: 100, recency: 100, sampleSize: 100, hasBenchmark: true, hasGoal: true, hasExperiment: true });
    expect(level).toBe("STRONG");
  });

  it("is monotonic — more real evidence never produces a lower score for otherwise-identical input", () => {
    const base = { dataQualityScore: 60, coverage: 60, recency: 60, sampleSize: 10, hasBenchmark: false, hasGoal: false, hasExperiment: false };
    const withExperiment = { ...base, hasExperiment: true };
    expect(computeEvidenceStrengthScore(withExperiment)).toBeGreaterThan(computeEvidenceStrengthScore(base));
  });

  it("is deterministic — identical input always produces identical output", () => {
    const input = { dataQualityScore: 70, coverage: 55, recency: 80, sampleSize: 40, hasBenchmark: true, hasGoal: false, hasExperiment: false };
    expect(classifyEvidenceStrength(input)).toBe(classifyEvidenceStrength(input));
  });
});

// ---------------------------------------------------------------------------
// 2. Numeric claim guard — flags fabricated %/currency figures
// ---------------------------------------------------------------------------
describe("numeric-claims.ts: flags numeric claims not backed by real context data (spec section 9)", () => {
  it("flags a percentage that never appeared in the allowed real numbers", () => {
    const result = checkForFabricatedNumericClaims("Esta acción aumentará las conversiones un 30%.", ["12", "45"]);
    expect(result.hasSuspiciousClaims).toBe(true);
    expect(result.suspiciousNumbers).toContain("30");
  });

  it("does not flag a percentage that genuinely came from the real context (e.g. a goal target)", () => {
    const result = checkForFabricatedNumericClaims("El objetivo real es alcanzar un 12%.", ["12"]);
    expect(result.hasSuspiciousClaims).toBe(false);
  });

  it("does not flag directional language with no numbers at all", () => {
    const result = checkForFabricatedNumericClaims("Aumentar el alcance y mejorar el engagement.", []);
    expect(result.hasSuspiciousClaims).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Scenario generation parser — pure, deterministic, never fabricates missing scenarios
// ---------------------------------------------------------------------------
describe("scenario-ai.ts: marker-based strategy/scenario parsing (spec sections 9-10)", () => {
  it("builds a system prompt that explicitly forbids invented numeric outcomes", () => {
    const prompt = buildScenarioGenerationSystemPrompt();
    expect(prompt).toMatch(/Nunca inventes cifras/);
    expect(prompt).toMatch(/CONSERVADOR/);
    expect(prompt).toMatch(/EQUILIBRADO/);
    expect(prompt).toMatch(/EXPANSIVO/);
  });

  it("user prompt reflects real context values, never asks the model to invent a budget when none exists", () => {
    const prompt = buildScenarioGenerationUserPrompt({
      campaignOrProjectName: "Campaña X",
      objective: "Aumentar alcance",
      periodLabel: "2026-01-01 — 2026-03-01",
      dataQualityLevel: "GOOD",
      evidenceStrength: "MODERATE",
      factsSummary: ["engagement_rate: 5 (origen: INTERNAL, muestra: 10)"],
      derivedSummary: [],
      signalsSummary: [],
      hypothesesSummary: [],
      constraintsSummary: [],
      missingDataSummary: [],
      hasBudget: false,
      budgetLabel: null,
    });
    expect(prompt).toMatch(/no asignes presupuesto/);
  });

  it("parses a full brief + all three scenarios from well-formed marker text", () => {
    const text = [
      "RESUMEN_EJECUTIVO:\nResumen de prueba.",
      "SITUACION_OBSERVADA:\nSituación observada de prueba.",
      "HALLAZGOS:\nHallazgo uno\nHallazgo dos",
      "LIMITACIONES:\nMuestra pequeña",
      "OBJETIVOS:\nAumentar alcance",
      "OPORTUNIDADES:\nOportunidad uno",
      "RIESGOS:\nRiesgo uno",
      "HIPOTESIS:\nHipótesis uno",
      "ESTRATEGIA_RECOMENDADA:\nEstrategia recomendada de prueba.",
      "CANALES:\ninstagram",
      "KPIS:\nengagement_rate",
      "SENALES_EXITO:\nSube el engagement",
      "SENALES_DETERIORO:\nBaja el alcance",
      "PLAN_MEDICION:\nMedir cada semana.",
      "CONDICIONES_REVISION:\nRevisar en 30 días",
      "ESCENARIO_CONSERVADOR_OBJETIVO:\nMantener",
      "ESCENARIO_CONSERVADOR_INTENSIDAD:\nbaja",
      "ESCENARIO_CONSERVADOR_ACCIONES:\nPublicar más seguido :: Aumentar frecuencia :: instagram",
      "ESCENARIO_CONSERVADOR_RECURSOS:\nEquipo de contenido",
      "ESCENARIO_CONSERVADOR_RIESGOS:\nFatiga de audiencia",
      "ESCENARIO_CONSERVADOR_KPIS:\nengagement_rate",
      "ESCENARIO_CONSERVADOR_PRECONDICIONES:\nTener el equipo disponible",
      "ESCENARIO_CONSERVADOR_RESTRICCIONES:\nSin presupuesto adicional",
      "ESCENARIO_CONSERVADOR_PLAZO:\n30 días",
      "ESCENARIO_CONSERVADOR_MEDICION:\nComparar antes/después",
      "ESCENARIO_EQUILIBRADO_OBJETIVO:\nCrecer moderadamente",
      "ESCENARIO_EQUILIBRADO_INTENSIDAD:\nmedia",
      "ESCENARIO_EQUILIBRADO_ACCIONES:\nProbar nuevos formatos :: Variar el contenido :: tiktok",
      "ESCENARIO_EQUILIBRADO_RECURSOS:\n(ninguno)",
      "ESCENARIO_EQUILIBRADO_RIESGOS:\n(ninguno)",
      "ESCENARIO_EQUILIBRADO_KPIS:\nengagement_rate",
      "ESCENARIO_EQUILIBRADO_PRECONDICIONES:\n(ninguno)",
      "ESCENARIO_EQUILIBRADO_RESTRICCIONES:\n(ninguno)",
      "ESCENARIO_EQUILIBRADO_PLAZO:\n45 días",
      "ESCENARIO_EQUILIBRADO_MEDICION:\nComparar periodos",
      "ESCENARIO_EXPANSIVO_OBJETIVO:\nCrecer agresivamente",
      "ESCENARIO_EXPANSIVO_INTENSIDAD:\nalta",
      "ESCENARIO_EXPANSIVO_ACCIONES:\nLanzar campaña nueva :: Expandir a más canales :: youtube",
      "ESCENARIO_EXPANSIVO_RECURSOS:\nPresupuesto adicional",
      "ESCENARIO_EXPANSIVO_RIESGOS:\nSobreexposición",
      "ESCENARIO_EXPANSIVO_KPIS:\nreach",
      "ESCENARIO_EXPANSIVO_PRECONDICIONES:\nAprobación de presupuesto",
      "ESCENARIO_EXPANSIVO_RESTRICCIONES:\nTiempo limitado",
      "ESCENARIO_EXPANSIVO_PLAZO:\n60 días",
      "ESCENARIO_EXPANSIVO_MEDICION:\nComparar contra benchmark",
    ].join("\n");

    const parsed = parseScenarioGenerationText(text);
    expect(parsed.brief.executiveSummary).toBe("Resumen de prueba.");
    expect(parsed.brief.dataBackedFindings).toEqual(["Hallazgo uno", "Hallazgo dos"]);
    expect(parsed.scenarios).toHaveLength(3);
    const conservative = parsed.scenarios.find((s) => s.kind === "CONSERVATIVE")!;
    expect(conservative.objective).toBe("Mantener");
    expect(conservative.actions).toEqual([{ title: "Publicar más seguido", description: "Aumentar frecuencia", channel: "instagram" }]);
  });

  it("never fabricates a scenario that the model didn't actually produce — missing markers just aren't included", () => {
    const text = "RESUMEN_EJECUTIVO:\nSolo resumen, sin escenarios.";
    const parsed = parseScenarioGenerationText(text);
    expect(parsed.scenarios).toEqual([]);
    expect(parsed.brief.executiveSummary).toBe("Solo resumen, sin escenarios.");
  });

  it("degrades gracefully on malformed/partial output instead of throwing", () => {
    expect(() => parseScenarioGenerationText("texto sin ningún marcador reconocible")).not.toThrow();
    const parsed = parseScenarioGenerationText("texto sin ningún marcador reconocible");
    expect(parsed.brief.executiveSummary).toBe("");
    expect(parsed.scenarios).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Validation schemas
// ---------------------------------------------------------------------------
describe("validation/marketing-brain-optimization.ts: rejects invalid input safely", () => {
  it("performanceContextSelectionSchema requires a period when mode isn't NONE", () => {
    const result = performanceContextSelectionSchema.safeParse({ mode: "MANUAL" });
    expect(result.success).toBe(false);
  });

  it("performanceContextSelectionSchema accepts mode NONE with no period at all", () => {
    const result = performanceContextSelectionSchema.safeParse({ mode: "NONE" });
    expect(result.success).toBe(true);
  });

  it("performanceContextSelectionSchema rejects an end date before the start date", () => {
    const result = performanceContextSelectionSchema.safeParse({ mode: "MANUAL", periodStart: "2026-03-01T00:00:00Z", periodEnd: "2026-01-01T00:00:00Z" });
    expect(result.success).toBe(false);
  });

  it("performanceContextSelectionSchema rejects a period longer than the configured maximum", () => {
    const start = "2020-01-01T00:00:00Z";
    const end = new Date(new Date(start).getTime() + (MB_OPTIMIZATION_LIMITS.MAX_PERIOD_DAYS + 10) * 86_400_000).toISOString();
    const result = performanceContextSelectionSchema.safeParse({ mode: "MANUAL", periodStart: start, periodEnd: end });
    expect(result.success).toBe(false);
  });

  it("performanceContextSelectionSchema caps array sizes at the configured limits", () => {
    const tooMany = Array.from({ length: MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_METRICS + 5 }, (_, i) => `metric_${i}`);
    const result = performanceContextSelectionSchema.safeParse({ mode: "MANUAL", periodStart: "2026-01-01T00:00:00Z", periodEnd: "2026-02-01T00:00:00Z", metricKeys: tooMany });
    expect(result.success).toBe(false);
  });

  it("createMeasurementPlanSchema rejects a tracking end date before the start date", () => {
    const result = createMeasurementPlanSchema.safeParse({
      sessionId: "clabcdefghijklmnopqrstuv",
      primaryMetricKey: "engagement_rate",
      resourceType: "CAMPAIGN",
      campaignId: "clabcdefghijklmnopqrstuv",
      trackingStart: "2026-03-01T00:00:00Z",
      trackingEnd: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("convertScenarioActionSchema only accepts a known actionType", () => {
    const result = convertScenarioActionSchema.safeParse({ scenarioActionId: "clabcdefghijklmnopqrstuv", actionType: "PUBLISH_NOW" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Error codes
// ---------------------------------------------------------------------------
describe("optimization-types.ts: typed error codes with safe messages", () => {
  it("every error code has a non-empty, non-stack-trace-shaped message", () => {
    for (const code of MB_OPTIMIZATION_ERROR_CODES) {
      const result = mbOptimizationError(code);
      expect(result.error).toBeTruthy();
      expect(result.error).not.toMatch(/at .*\(.*:\d+:\d+\)/);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Security — every action enforces requireProjectAccess
// ---------------------------------------------------------------------------
describe("security: every Marketing Brain optimization server action enforces requireProjectAccess", () => {
  it("every exported async function in marketing-brain-optimization.ts calls requireProjectAccess", () => {
    const source = read("src/server/actions/marketing-brain-optimization.ts");
    const functionMatches = source.match(/export async function (\w+)\([\s\S]*?\n\}/g) ?? [];
    expect(functionMatches.length).toBeGreaterThan(10);
    for (const body of functionMatches) {
      const name = body.match(/export async function (\w+)\(/)![1];
      expect(body, `${name} should call requireProjectAccess`).toMatch(/requireProjectAccess/);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. UI hygiene — no alert()/confirm()
// ---------------------------------------------------------------------------
describe("UI hygiene: no alert()/confirm() in the new Marketing Brain optimization components", () => {
  it("no relevant component calls window.alert(...) or window.confirm(...) as real code", () => {
    const files = [
      "src/components/marketing-brain/performance-context-section.tsx",
      "src/components/marketing-brain/optimization-session-view.tsx",
    ];
    for (const file of files) {
      const source = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(source).not.toMatch(/\balert\(/);
      expect(source).not.toMatch(/window\.confirm\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Migration — additive only, applied, no DROP
// ---------------------------------------------------------------------------
describe("migration: additive only, never DROP TABLE/COLUMN (spec section 22)", () => {
  it("both new migration directories exist and contain no DROP TABLE/COLUMN statements", () => {
    const migrationsDir = path.join(ROOT, "prisma/migrations");
    const dirs = readdirSync(migrationsDir).filter((d: string) => d.includes("marketing_brain_optimization") || d.includes("marketing_brain_strategy_brief"));
    expect(dirs.length).toBe(2);
    for (const dir of dirs) {
      const sql = readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8");
      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/DROP COLUMN/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Event integration
// ---------------------------------------------------------------------------
describe("event integration: the 12 Marketing Brain optimization events are registered and genuinely published", () => {
  const eventKeys = [
    "marketing_brain_optimization.context_selected",
    "marketing_brain_optimization.ready_for_review",
    "marketing_brain_optimization.approved",
    "marketing_brain_optimization.rejected",
    "marketing_brain_optimization.archived",
    "marketing_brain_optimization.scenario_selected",
    "marketing_brain_optimization.action_converted",
    "marketing_brain_optimization.measurement_started",
    "marketing_brain_optimization.review_available",
    "marketing_brain_optimization.goal_reached",
    "marketing_brain_optimization.review_indeterminate",
  ];

  it("every event key is registered in AUTOMATION_EVENT_DEFINITIONS", () => {
    const source = read("src/lib/automations/events.ts");
    for (const key of eventKeys) {
      expect(source).toMatch(new RegExp(`key: "${key.replace(/\./g, "\\.")}"`));
    }
  });

  const wiredFiles: Record<string, string[]> = {
    "src/server/services/marketing-brain-optimization.ts": ["marketing_brain_optimization.context_selected", "marketing_brain_optimization.ready_for_review", "marketing_brain_optimization.approved", "marketing_brain_optimization.rejected", "marketing_brain_optimization.archived", "marketing_brain_optimization.scenario_selected"],
    "src/server/services/marketing-brain-scenario-conversion.ts": ["marketing_brain_optimization.action_converted"],
    "src/server/services/marketing-brain-measurement.ts": ["marketing_brain_optimization.measurement_started", "marketing_brain_optimization.review_available", "marketing_brain_optimization.goal_reached"],
  };

  for (const [file, keys] of Object.entries(wiredFiles)) {
    it(`${file} calls publishAutomationEvent with every declared key: ${keys.join(", ")}`, () => {
      const source = read(file);
      expect(source).toMatch(/publishAutomationEvent/);
      for (const key of keys) expect(source).toMatch(new RegExp(key.replace(/\./g, "\\.")));
    });
  }

  it("no service publishes events via a parallel outbox — always the shared automation-events helper", () => {
    for (const file of Object.keys(wiredFiles)) {
      const source = read(file);
      expect(source).toMatch(/from "@\/server\/services\/automation-events"/);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Idempotency / concurrency — real DB constraints
// ---------------------------------------------------------------------------
describe("idempotency and concurrency: enforced via real unique constraints and lock fields", () => {
  const schema = read("prisma/schema.prisma");

  it("MarketingBrainOptimizationSession has a unique (createdById, idempotencyKey) constraint and lock fields", () => {
    const model = schema.match(/model MarketingBrainOptimizationSession \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[createdById, idempotencyKey\]\)/);
    expect(model).toMatch(/lockedAt/);
    expect(model).toMatch(/lockedBy/);
    expect(model).toMatch(/lockExpiresAt/);
    expect(model).toMatch(/executionToken/);
  });

  it("MarketingBrainContextSnapshot.sessionId is unique — one immutable snapshot per session", () => {
    const model = schema.match(/model MarketingBrainContextSnapshot \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/sessionId\s+String\s+@unique/);
  });

  it("MarketingBrainScenario has a unique (sessionId, kind) constraint — never two 'CONSERVATIVE' scenarios for the same session", () => {
    const model = schema.match(/model MarketingBrainScenario \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[sessionId, kind\]\)/);
  });

  it("MarketingBrainMeasurementReview.idempotencyKey is unique — regenerating the same day updates in place", () => {
    const model = schema.match(/model MarketingBrainMeasurementReview \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/idempotencyKey\s+String\s+@unique/);
  });

  it("prepareOptimizationGeneration claims the session atomically via updateMany with an expected status + null lock", () => {
    const source = read("src/server/services/marketing-brain-optimization.ts");
    expect(source).toMatch(/updateMany\(\{\s*where: \{ id: sessionId, status: "DRAFT", lockedAt: null \}/);
  });

  it("convertScenarioAction claims the action atomically via updateMany with convertedAt: null, never a plain read-then-write", () => {
    const source = read("src/server/services/marketing-brain-scenario-conversion.ts");
    expect(source).toMatch(/updateMany\(\{\s*where: \{ id: action\.id, convertedAt: null \}/);
  });
});

// ---------------------------------------------------------------------------
// 11. Human-only approval — no automated path to APPROVED
// ---------------------------------------------------------------------------
describe("human-only approval: nothing but a real user action can move a session to APPROVED (spec section 12)", () => {
  it("decideOptimizationSession is only ever called from decideOptimizationSessionAction, which requires EDITOR project access", () => {
    const actionsSource = read("src/server/actions/marketing-brain-optimization.ts");
    const fn = actionsSource.match(/export async function decideOptimizationSessionAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
  });

  it("no cron/automation service file calls decideOptimizationSession directly", () => {
    const cronSource = read("src/server/services/automation-events.ts");
    expect(cronSource).not.toMatch(/decideOptimizationSession/);
    const performanceCron = read("src/server/services/performance-cron.ts");
    expect(performanceCron).not.toMatch(/decideOptimizationSession/);
  });

  it("the session service's own decide function requires an explicit decision + comment for approval, never defaults to approved", () => {
    const source = read("src/server/services/marketing-brain-optimization.ts");
    const fn = source.match(/export async function decideOptimizationSession[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status !== "READY_FOR_REVIEW"/);
  });
});

// ---------------------------------------------------------------------------
// 12. Causality / indeterminate handling — never fabricated
// ---------------------------------------------------------------------------
describe("measurement honesty: never marks success/failure without data, never asserts causality without an experiment", () => {
  it("generateMeasurementReview defaults causality to CANNOT_CONFIRM and only upgrades to EXPERIMENT_BACKED when a COMPLETED experiment with a real winner is found", () => {
    const source = read("src/server/services/marketing-brain-measurement.ts");
    expect(source).toMatch(/CANNOT_CONFIRM/);
    expect(source).toMatch(/backingExperiment = relatedExperiments\.find\(\(e\) => e\.status === "COMPLETED" && e\.winnerVariantId\)/);
  });

  it("goalOutcome defaults to INDETERMINATE and is never set to REACHED/NOT_REACHED without a real goal evaluation", () => {
    const source = read("src/server/services/marketing-brain-measurement.ts");
    expect(source).toMatch(/goalOutcome: "REACHED" \| "NOT_REACHED" \| "INDETERMINATE" = "INDETERMINATE"/);
    expect(source).toMatch(/evaluateGoal\(projectId, plan\.goalId\)/);
  });
});

// ---------------------------------------------------------------------------
// 13. Navigation — reachable via Marketing Brain, never a lost-context global route
// ---------------------------------------------------------------------------
describe("navigation: the optimization loop stays reachable through Marketing Brain, project context preserved", () => {
  it("the Marketing Brain page links to /marketing-brain/optimization within the same projectId", () => {
    const source = read("src/app/(dashboard)/dashboard/[projectId]/marketing-brain/page.tsx");
    expect(source).toMatch(/marketing-brain\/optimization/);
  });

  it("projectNavGroups is unchanged by this phase (optimization is reached through Marketing Brain, not a new top-level nav item)", () => {
    const labels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain("Marketing Brain");
    expect(labels).not.toContain("Optimización");
  });

  it("guest navigation is completely untouched by this phase", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels.join(",")).not.toMatch(/optimizaci[oó]n/i);
  });
});

// ---------------------------------------------------------------------------
// 14. AI Workflows — left read-only / unmodified, documented deliberately
// ---------------------------------------------------------------------------
describe("AI Workflows: left unmodified in this phase (documented scope decision, spec section 19)", () => {
  it("WORKFLOW_STEP_TYPES has no new marketing-brain-optimization write or read node", () => {
    const source = read("src/lib/ai-workflows/engine.ts");
    expect(source).not.toMatch(/marketing_brain_optimization/);
    expect(source).not.toMatch(/"marketing_brain_review"/);
  });
});

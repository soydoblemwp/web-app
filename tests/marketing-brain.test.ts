import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeBriefing } from "@/lib/marketing-brain/normalize";
import {
  STAGE_DEFINITIONS,
  defaultStagesConfig,
  canDisableStage,
  areDependenciesSatisfied,
  buildExecutionPlan,
  MAX_AI_GENERATIONS_PER_RUN,
} from "@/lib/marketing-brain/plan";
import {
  isRunTerminal,
  canEditBriefing,
  canStartRun,
  canExecuteNextStep,
  canCancelRun,
  canRetryStep,
  canCompleteRun,
  shouldBePartiallyCompleted,
  nextRunStatusAfterAllSteps,
} from "@/lib/marketing-brain/state-machine";
import { MARKETING_BRAIN_STEP_KEYS, MARKETING_BRAIN_APPROVAL_GATE_KEYS } from "@/lib/marketing-brain/types";
import type { MarketingBrainStepKeyValue, StagesConfig } from "@/lib/marketing-brain/types";
import {
  marketingBrainBriefingSchema,
  createMarketingBrainRunSchema,
  aiStrategyOutputSchema,
  aiPillarsOutputSchema,
  aiContentPlanOutputSchema,
} from "@/lib/validation/marketing-brain";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

function enabledConfig(overrides: Partial<Record<MarketingBrainStepKeyValue, boolean>> = {}): StagesConfig {
  const config = defaultStagesConfig();
  return { ...config, enabled: { ...config.enabled, ...overrides } };
}

// ---------------------------------------------------------------------------
// 1. Normalization — deterministic layer runs before any AI call
// ---------------------------------------------------------------------------
describe("normalize.ts: deterministic briefing normalization (pure, real unit tests)", () => {
  const now = new Date("2026-08-01T00:00:00Z");

  it("defaults missing dates to a 30-day range starting now, marking both as inferred", () => {
    const result = normalizeBriefing({}, now);
    expect(result.startDate).toBe("2026-08-01");
    expect(result.endDate).toBe("2026-08-31");
    expect(result.inferredFields).toContain("startDate");
    expect(result.inferredFields).toContain("endDate");
  });

  it("flags an end date before the start date as a blocking error, never silently swapped", () => {
    const result = normalizeBriefing({ startDate: "2026-09-01", endDate: "2026-08-01" }, now);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("warns (but doesn't block) on a very short campaign range", () => {
    const result = normalizeBriefing({ startDate: "2026-08-01", endDate: "2026-08-02" }, now);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("corto"))).toBe(true);
  });

  it("defaults an unrecognized timezone to UTC with a warning, never throws", () => {
    const result = normalizeBriefing({ timezone: "Not/AZone" }, now);
    expect(result.timezone).toBe("UTC");
    expect(result.inferredFields).toContain("timezone");
    expect(result.warnings.some((w) => w.includes("zona horaria"))).toBe(true);
  });

  it("filters unknown platform ids, keeps known ones, and defaults to instagram when none remain", () => {
    const result = normalizeBriefing({ platforms: ["instagram", "not-a-real-platform"] }, now);
    expect(result.platforms).toEqual(["instagram"]);
    expect(result.warnings.some((w) => w.includes("no reconocidas"))).toBe(true);

    const empty = normalizeBriefing({ platforms: [] }, now);
    expect(empty.platforms).toEqual(["instagram"]);
    expect(empty.inferredFields).toContain("platforms");
  });

  it("derives maxPieces from date range and frequency when not supplied, and caps an excessive explicit value", () => {
    const inferred = normalizeBriefing({ startDate: "2026-08-01", endDate: "2026-08-31", frequencyPerWeek: 3 }, now);
    expect(inferred.maxPieces).toBeGreaterThan(0);
    expect(inferred.inferredFields).toContain("maxPieces");

    const capped = normalizeBriefing({ maxPieces: 500 }, now);
    expect(capped.maxPieces).toBe(200);
    expect(capped.warnings.some((w) => w.includes("máximo permitido"))).toBe(true);
  });

  it("requires an existingCampaignId when campaignMode is existing/duplicate", () => {
    const missing = normalizeBriefing({ campaignMode: "existing" }, now);
    expect(missing.errors.length).toBeGreaterThan(0);
    const present = normalizeBriefing({ campaignMode: "existing", existingCampaignId: "c1" }, now);
    expect(present.errors).toEqual([]);
  });

  it("warns when approval is required but no approver is assigned", () => {
    const result = normalizeBriefing({ requireApproval: true }, now);
    expect(result.warnings.some((w) => w.includes("aprobador"))).toBe(true);
  });

  it("is a pure function — identical input and clock always yield identical output", () => {
    const input = { objective: "Vender más", platforms: ["instagram", "tiktok"] };
    expect(normalizeBriefing(input, now)).toEqual(normalizeBriefing(input, now));
  });
});

// ---------------------------------------------------------------------------
// 2. Plan — the 12 stages, dependencies, toggling, volume estimate
// ---------------------------------------------------------------------------
describe("plan.ts: the 12 pipeline stages, dependency graph, volume estimate (pure, real unit tests)", () => {
  it("defines exactly the 12 stages from the spec, in execution order", () => {
    expect(STAGE_DEFINITIONS.map((s) => s.key)).toEqual([
      "INTERPRET_BRIEFING",
      "PREPARE_CAMPAIGN",
      "GENERATE_STRATEGY",
      "CREATE_PILLARS",
      "CREATE_CONTENT_PLAN",
      "CREATE_PIECES",
      "GENERATE_DRAFTS",
      "ADAPT_PLATFORMS",
      "CREATE_PUBLICATIONS",
      "PREPARE_APPROVAL",
      "PREPARE_CALENDAR",
      "SCHEDULE",
    ]);
    expect(STAGE_DEFINITIONS.map((s) => s.key)).toEqual([...MARKETING_BRAIN_STEP_KEYS]);
  });

  it("the structural backbone stages (interpret/prepare-campaign/create-pieces/prepare-approval/prepare-calendar) are never toggleable", () => {
    for (const key of ["INTERPRET_BRIEFING", "PREPARE_CAMPAIGN", "CREATE_PIECES", "PREPARE_APPROVAL", "PREPARE_CALENDAR"]) {
      expect(STAGE_DEFINITIONS.find((s) => s.key === key)?.toggleable).toBe(false);
    }
  });

  it("defaultStagesConfig enables every stage and requests no approval gates", () => {
    const config = defaultStagesConfig();
    expect(Object.values(config.enabled).every(Boolean)).toBe(true);
    expect(config.approvalGates).toEqual([]);
  });

  it("canDisableStage refuses to disable a stage a later enabled stage still depends on", () => {
    const config = enabledConfig();
    expect(canDisableStage("CREATE_PILLARS", config)).toBe(false); // CREATE_CONTENT_PLAN depends on it
    const withPlanOff = enabledConfig({ CREATE_CONTENT_PLAN: false, CREATE_PIECES: false, GENERATE_DRAFTS: false, ADAPT_PLATFORMS: false, CREATE_PUBLICATIONS: false, PREPARE_APPROVAL: false, PREPARE_CALENDAR: false, SCHEDULE: false });
    expect(canDisableStage("CREATE_PILLARS", withPlanOff)).toBe(true);
  });

  it("canDisableStage always refuses non-toggleable stages regardless of dependents", () => {
    expect(canDisableStage("PREPARE_CAMPAIGN", defaultStagesConfig())).toBe(false);
  });

  it("areDependenciesSatisfied treats a disabled dependency as satisfied (never blocks on a stage that was intentionally skipped)", () => {
    const config = enabledConfig({ CREATE_PILLARS: false });
    expect(areDependenciesSatisfied("CREATE_CONTENT_PLAN", config, new Set())).toBe(true);
  });

  it("areDependenciesSatisfied blocks an enabled stage until its enabled dependency has actually resolved", () => {
    const config = enabledConfig();
    expect(areDependenciesSatisfied("CREATE_CONTENT_PLAN", config, new Set())).toBe(false);
    expect(areDependenciesSatisfied("CREATE_CONTENT_PLAN", config, new Set(["CREATE_PILLARS"]))).toBe(true);
  });

  it("buildExecutionPlan estimates pieces/content-items/publications consistently and scales adaptations with platform count", () => {
    const briefing = normalizeBriefing({ platforms: ["instagram", "tiktok", "email"], maxPieces: 12 });
    const plan = buildExecutionPlan(briefing, defaultStagesConfig());
    expect(plan.totals.pieces).toBe(12);
    expect(plan.totals.contentItems).toBe(12);
    expect(plan.totals.adaptations).toBe(12 * 2); // 3 platforms - 1 primary each
    expect(plan.totals.socialPosts).toBe(plan.totals.contentItems + plan.totals.adaptations);
  });

  it("buildExecutionPlan reports zero downstream volume when a stage is disabled", () => {
    const briefing = normalizeBriefing({ platforms: ["instagram"], maxPieces: 10 });
    const plan = buildExecutionPlan(briefing, enabledConfig({ GENERATE_DRAFTS: false }));
    expect(plan.totals.contentItems).toBe(0);
    expect(plan.totals.socialPosts).toBe(0);
  });

  it("flags exceedsVolumeLimit once estimated AI generations cross the configured cap, without truncating the estimate itself", () => {
    const briefing = normalizeBriefing({ platforms: ["instagram", "tiktok", "linkedin", "x"], maxPieces: 80 });
    const plan = buildExecutionPlan(briefing, defaultStagesConfig());
    expect(plan.totals.aiGenerations).toBeGreaterThan(MAX_AI_GENERATIONS_PER_RUN);
    expect(plan.exceedsVolumeLimit).toBe(true);
  });

  it("is a pure function — identical input always yields identical output", () => {
    const briefing = normalizeBriefing({ platforms: ["instagram"], maxPieces: 6 });
    const config = defaultStagesConfig();
    expect(buildExecutionPlan(briefing, config)).toEqual(buildExecutionPlan(briefing, config));
  });
});

// ---------------------------------------------------------------------------
// 3. State machine — deterministic transitions
// ---------------------------------------------------------------------------
describe("state-machine.ts: run/step transitions (pure, real unit tests)", () => {
  it("only COMPLETED/FAILED/CANCELLED/ARCHIVED are terminal", () => {
    expect(isRunTerminal("COMPLETED")).toBe(true);
    expect(isRunTerminal("FAILED")).toBe(true);
    expect(isRunTerminal("CANCELLED")).toBe(true);
    expect(isRunTerminal("ARCHIVED")).toBe(true);
    expect(isRunTerminal("PARTIALLY_COMPLETED")).toBe(false);
    expect(isRunTerminal("RUNNING")).toBe(false);
  });

  it("the briefing can only be edited in DRAFT/READY — never while RUNNING (spec section 8)", () => {
    expect(canEditBriefing("DRAFT")).toBe(true);
    expect(canEditBriefing("READY")).toBe(true);
    expect(canEditBriefing("RUNNING")).toBe(false);
    expect(canEditBriefing("WAITING_FOR_APPROVAL")).toBe(false);
  });

  it("a run can only start from READY, and only advance steps while RUNNING", () => {
    expect(canStartRun("READY")).toBe(true);
    expect(canStartRun("DRAFT")).toBe(false);
    expect(canExecuteNextStep("RUNNING")).toBe(true);
    expect(canExecuteNextStep("WAITING_FOR_APPROVAL")).toBe(false);
  });

  it("cancellation is allowed for any non-terminal run, never for a terminal one", () => {
    expect(canCancelRun("RUNNING")).toBe(true);
    expect(canCancelRun("PARTIALLY_COMPLETED")).toBe(true);
    expect(canCancelRun("COMPLETED")).toBe(false);
    expect(canCancelRun("CANCELLED")).toBe(false);
  });

  it("only a FAILED step can be retried directly — never PENDING/RUNNING/COMPLETED", () => {
    expect(canRetryStep("FAILED")).toBe(true);
    expect(canRetryStep("RUNNING")).toBe(false);
    expect(canRetryStep("COMPLETED")).toBe(false);
  });

  it("a run can only complete when every step is COMPLETED or SKIPPED — one FAILED step blocks it", () => {
    expect(canCompleteRun(["COMPLETED", "SKIPPED", "COMPLETED"])).toBe(true);
    expect(canCompleteRun(["COMPLETED", "FAILED"])).toBe(false);
  });

  it("shouldBePartiallyCompleted is true only when some step recorded item-level failures", () => {
    expect(shouldBePartiallyCompleted([0, 0, 0])).toBe(false);
    expect(shouldBePartiallyCompleted([0, 2, 0])).toBe(true);
  });

  it("nextRunStatusAfterAllSteps resolves to FAILED/PARTIALLY_COMPLETED/COMPLETED deterministically", () => {
    expect(nextRunStatusAfterAllSteps(["COMPLETED", "FAILED"], [0, 0])).toBe("FAILED");
    expect(nextRunStatusAfterAllSteps(["COMPLETED", "COMPLETED"], [0, 1])).toBe("PARTIALLY_COMPLETED");
    expect(nextRunStatusAfterAllSteps(["COMPLETED", "SKIPPED"], [0, 0])).toBe("COMPLETED");
  });
});

// ---------------------------------------------------------------------------
// 4. Validation schemas — including AI-output validation ("esquemas estrictos")
// ---------------------------------------------------------------------------
describe("validation/marketing-brain.ts: zod schemas including strict AI-output validation (pure, real unit tests)", () => {
  it("marketingBrainBriefingSchema accepts a fully-empty object — every field optional for progressive autosave", () => {
    expect(marketingBrainBriefingSchema.safeParse({}).success).toBe(true);
  });

  it("createMarketingBrainRunSchema requires a real idempotency key, not an empty/short one", () => {
    expect(createMarketingBrainRunSchema.safeParse({ idempotencyKey: "" }).success).toBe(false);
    expect(createMarketingBrainRunSchema.safeParse({ idempotencyKey: "short" }).success).toBe(false);
    expect(createMarketingBrainRunSchema.safeParse({ idempotencyKey: crypto.randomUUID() }).success).toBe(true);
  });

  it("aiStrategyOutputSchema rejects a malformed AI strategy result (wrong types)", () => {
    expect(aiStrategyOutputSchema.safeParse({ summary: 123 }).success).toBe(false);
  });

  it("aiStrategyOutputSchema accepts a well-formed parsed strategy", () => {
    expect(
      aiStrategyOutputSchema.safeParse({
        summary: "s",
        audienceProfile: "a",
        valueProposition: "v",
        mainMessage: "m",
        objectives: ["o1"],
        themes: [],
        creativeAngles: [],
        cta: "Compra ya",
        risks: [],
        recommendations: [],
        suggestedMetrics: [],
      }).success
    ).toBe(true);
  });

  it("aiPillarsOutputSchema requires at least one pillar with a name", () => {
    expect(aiPillarsOutputSchema.safeParse([]).success).toBe(false);
    expect(aiPillarsOutputSchema.safeParse([{ name: "", description: "", objective: "", percentage: null, formats: [], platforms: [], topics: [] }]).success).toBe(false);
  });

  it("aiContentPlanOutputSchema requires at least one piece draft with a platform", () => {
    expect(aiContentPlanOutputSchema.safeParse([]).success).toBe(false);
    expect(
      aiContentPlanOutputSchema.safeParse([{ title: "T", idea: "", platform: "instagram", format: "", pillarName: "", objective: "", cta: "", date: "", time: "", keywords: [], notes: "" }])
        .success
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Draft creation, autosave, plan confirmation, idempotency — structural
// ---------------------------------------------------------------------------
describe("marketing-brain-orchestrator.ts: draft creation, autosave, plan confirmation (structural)", () => {
  const source = read("src/server/services/marketing-brain-orchestrator.ts");

  it("createDraftRun is idempotent via the (createdById, idempotencyKey) unique index — a doubled click resolves to the same draft", () => {
    const fn = source.match(/export async function createDraftRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/createdById_idempotencyKey/);
    expect(fn).toMatch(/prisma\.marketingBrainRun\.upsert/);
  });

  it("updateRunBriefing refuses to edit once the run is running/finished, and only true-partial-merges the patch", () => {
    const fn = source.match(/export async function updateRunBriefing[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/run\.status !== "DRAFT" && run\.status !== "READY"/);
    expect(fn).toMatch(/merged = \{ \.\.\.briefingOf\(run\), \.\.\.patch \}/);
  });

  it("editing the briefing after confirming reverts the run from READY back to DRAFT — the stale confirmed plan can never silently survive an edit", () => {
    const fn = source.match(/export async function updateRunBriefing[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/run\.status === "READY" \? \{ status: "DRAFT" \}/);
  });

  it("confirmRunPlan rejects a briefing with blocking normalization errors, and rejects a plan exceeding the AI-generation volume cap", () => {
    const fn = source.match(/export async function confirmRunPlan[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(normalized\.errors\.length > 0\) return \{ error:/);
    expect(fn).toMatch(/if \(plan\.exceedsVolumeLimit\)/);
  });

  it("confirmRunPlan verifies the selected Brand Profile and assignees actually belong to this user/project before snapshotting — never trusts client-supplied ids", () => {
    const fn = source.match(/export async function confirmRunPlan[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/profile\.userId !== userId/);
    expect(fn).toMatch(/projectMember\.findUnique/);
  });

  it("confirmRunPlan is safe to re-run while unstarted — it deletes only this run's own steps/approvals before recreating them, never touching another run's rows", () => {
    const fn = source.match(/export async function confirmRunPlan[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/marketingBrainStep\.deleteMany\(\{ where: \{ runId \} \}\)/);
    expect(fn).toMatch(/marketingBrainApproval\.deleteMany\(\{ where: \{ runId \} \}\)/);
  });

  it("confirmRunPlan creates a SKIPPED step row (never just omitted) for every disabled stage — a disabled stage is explicit, not silently dropped", () => {
    const fn = source.match(/export async function confirmRunPlan[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/config\.enabled\[def\.key\] === false \? "SKIPPED" : "PENDING"/);
  });
});

// ---------------------------------------------------------------------------
// 6. Campaign creation / reuse — structural
// ---------------------------------------------------------------------------
describe("marketing-brain-stages.ts: PREPARE_CAMPAIGN creates or reuses, never overwrites an existing campaign's strategy/pillars (structural)", () => {
  const source = read("src/server/services/marketing-brain-stages.ts");
  const fn = source.match(/export async function runPrepareCampaignStage[\s\S]*?\n\}/)![0];

  it("reuses run.campaignId if already set — idempotent across retries/resumes", () => {
    expect(fn).toMatch(/if \(run\.campaignId\) \{/);
    expect(fn).toMatch(/action: "REUSED"/);
  });

  it("campaignMode 'existing' links the existing campaign without creating a new one or touching its pillars/pieces", () => {
    expect(fn).toMatch(/normalized\.campaignMode === "existing"/);
    expect(fn).not.toMatch(/campaignPillar\.delete|campaignContentPiece\.delete/);
  });

  it("verifies an existing/duplicate-source campaign actually belongs to this project before using it", () => {
    expect(fn).toMatch(/source\.projectId !== projectId/);
  });
});

// ---------------------------------------------------------------------------
// 7. Strategy generation + versions — structural
// ---------------------------------------------------------------------------
describe("marketing-brain-stages.ts: GENERATE_STRATEGY uses CampaignStrategy directly, validated + repaired output (structural)", () => {
  const source = read("src/server/services/marketing-brain-stages.ts");

  it("prepareGenerateStrategyStage reuses the existing strategy-ai prompt builders — never a second AI strategy engine", () => {
    const fn = source.match(/export async function prepareGenerateStrategyStage[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/buildCampaignStrategySystemPrompt/);
    expect(fn).toMatch(/buildCampaignStrategyUserPrompt/);
  });

  it("completeGenerateStrategyStage rejects a genuinely empty AI result instead of persisting a blank strategy", () => {
    const fn = source.match(/export async function completeGenerateStrategyStage[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!parsed\.summary\.trim\(\) && parsed\.objectives\.length === 0\)/);
    expect(fn).toMatch(/kind: "failed"/);
  });

  it("completeGenerateStrategyStage validates against aiStrategyOutputSchema and controllably repairs (truncates) an over-length result instead of discarding it", () => {
    const fn = source.match(/export async function completeGenerateStrategyStage[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/aiStrategyOutputSchema\.safeParse/);
    expect(fn).toMatch(/\.slice\(0, 4000\)/);
  });

  it("writes to the SAME CampaignStrategy row (upsert), never a duplicate/parallel strategy model", () => {
    const fn = source.match(/export async function completeGenerateStrategyStage[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/campaignStrategy\.findUnique/);
    expect(fn).toMatch(/campaignStrategy\.update|campaignStrategy\.create/);
  });
});

// ---------------------------------------------------------------------------
// 8. Pillars — percentages, dedup, regeneration
// ---------------------------------------------------------------------------
describe("marketing-brain-stages.ts: CREATE_PILLARS — percentage warning never auto-corrected, dedup, real CampaignPillar rows (structural)", () => {
  const source = read("src/server/services/marketing-brain-stages.ts");
  const fn = source.match(/export async function completePillarsStage[\s\S]*?\n\}/)![0];

  it("never silently rewrites percentages to sum to 100 — only records a warning", () => {
    expect(fn).toMatch(/Math\.abs\(percentageSum - 100\) > 5/);
    expect(fn).not.toMatch(/percentage = .*\/ percentageSum/);
  });

  it("deduplicates obvious repeated pillar names before saving", () => {
    expect(fn).toMatch(/seen\.has\(key\)/);
  });

  it("creates real CampaignPillar rows (not a Json blob) and records each as a MarketingBrainResource for traceability", () => {
    expect(fn).toMatch(/campaignPillar\.create/);
    expect(fn).toMatch(/type: "CAMPAIGN_PILLAR", action: "CREATED"/);
  });
});

// ---------------------------------------------------------------------------
// 9. Content plan + pieces — date distribution, no deletion on regenerate
// ---------------------------------------------------------------------------
describe("marketing-brain-stages.ts: CREATE_CONTENT_PLAN / CREATE_PIECES — reviewable plan, additive piece creation (structural)", () => {
  const source = read("src/server/services/marketing-brain-stages.ts");

  it("completeContentPlanStage caps the AI's draft count at the briefing's requested maxPieces, never silently generating more", () => {
    const fn = source.match(/export async function completeContentPlanStage[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/\.slice\(0, ctx\.normalized\.maxPieces\)/);
  });

  it("runCreatePiecesStage never deletes or overwrites existing pieces — only ever creates new ones from the reviewed plan", () => {
    const fn = source.match(/export async function runCreatePiecesStage[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/campaignContentPiece\.create/);
    expect(fn).not.toMatch(/campaignContentPiece\.delete|campaignContentPiece\.deleteMany/);
  });

  it("runCreatePiecesStage resolves each draft's pillar by name, defaulting to no pillar rather than failing the whole batch", () => {
    const fn = source.match(/export async function runCreatePiecesStage[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/pillarByName\.get\(draft\.pillarName\.toLowerCase\(\)\.trim\(\)\) \?\? null/);
  });
});

// ---------------------------------------------------------------------------
// 10. ContentItem generation — reuse, preserving manual edits
// ---------------------------------------------------------------------------
describe("marketing-brain-stages.ts: GENERATE_DRAFTS — one ContentItem per piece, never overwrites an already-linked piece (structural)", () => {
  const source = read("src/server/services/marketing-brain-stages.ts");

  it("pendingPiecesForDrafts excludes pieces that already have a contentItemId — an edited/existing ContentItem is never regenerated over", () => {
    const fn = source.match(/async function pendingPiecesForDrafts[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/!p\.contentItemId/);
  });

  it("completeGenerateDraftsStage links the new ContentItem via the existing CampaignContent join model, never a second document system", () => {
    const fn = source.match(/export async function completeGenerateDraftsStage[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/campaignContent\.create/);
    expect(fn).toMatch(/contentItem\.create/);
  });

  it("a failed draft generation is recorded with the piece id as itemKey, not silently retried forever nor failing the other pieces", () => {
    const fn = source.match(/export async function completeGenerateDraftsStage[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/itemKey: piece\.id/);
  });
});

// ---------------------------------------------------------------------------
// 11. Adaptations — never overwrite the original ContentItem
// ---------------------------------------------------------------------------
describe("marketing-brain-stages.ts: ADAPT_PLATFORMS reuses the repurpose engine, never a new one, never touches the original ContentItem (structural)", () => {
  const source = read("src/server/services/marketing-brain-stages.ts");

  it("reuses findRepurposeChannel (AI Editor Pro's Fase 27 engine) — no bespoke adaptation prompts", () => {
    expect(source).toMatch(/import \{ findRepurposeChannel \} from "@\/lib\/editor\/repurpose-platforms"/);
  });

  it("adaptations are staged in the step's own output, never a second ContentItem per adaptation", () => {
    const fn = source.match(/export async function completeAdaptPlatformsStage[\s\S]*?\n\}/)![0];
    expect(fn).not.toMatch(/contentItem\.create/);
    expect(fn).toMatch(/adaptations: next/);
  });

  it("skips a platform equal to the piece's own primary platform — an adaptation is always to a DIFFERENT platform", () => {
    const fn = source.match(/async function adaptationTargets[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(platform === piece\.platform\) continue;/);
  });
});

// ---------------------------------------------------------------------------
// 12. SocialPost creation — never a fake successful publish
// ---------------------------------------------------------------------------
describe("marketing-brain-stages.ts: CREATE_PUBLICATIONS creates real SocialPost rows through the same model as Publishing Hub (structural)", () => {
  const source = read("src/server/services/marketing-brain-stages.ts");
  const fn = source.match(/export async function runCreatePublicationsStage[\s\S]*?\n\}/)![0];

  it("sets IN_REVIEW when the project requires approval, DRAFT otherwise — never a fake PUBLISHED/SCHEDULED status", () => {
    expect(fn).toMatch(/ctx\.normalized\.requireApproval \? "IN_REVIEW" : "DRAFT"/);
    expect(fn).not.toMatch(/status: "PUBLISHED"/);
  });

  it("links every publication back to Campaign, ContentItem/CampaignContentPiece, and BrandProfile", () => {
    expect(fn).toMatch(/campaignId: ctx\.run\.campaignId/);
    expect(fn).toMatch(/sourceContentId: contentItem\.id/);
    expect(fn).toMatch(/sourcePieceId: piece\?\.id/);
    expect(fn).toMatch(/brandProfileId: ctx\.normalized\.brandProfileId/);
  });

  it("a per-post creation failure is caught and recorded without aborting the loop for the other posts (spec section 21)", () => {
    expect(fn).toMatch(/} catch \(err\) \{/);
    expect(fn).toMatch(/failures\.push/);
  });
});

// ---------------------------------------------------------------------------
// 13. Approval flow — structural
// ---------------------------------------------------------------------------
describe("marketing-brain-orchestrator.ts: approval gates block execution until decided (structural)", () => {
  const source = read("src/server/services/marketing-brain-orchestrator.ts");

  it("MARKETING_BRAIN_APPROVAL_GATE_KEYS covers exactly the 7 gate points from spec section 18", () => {
    expect(MARKETING_BRAIN_APPROVAL_GATE_KEYS).toEqual([
      "PREPARE_CAMPAIGN",
      "CREATE_PILLARS",
      "CREATE_CONTENT_PLAN",
      "CREATE_PIECES",
      "GENERATE_DRAFTS",
      "CREATE_PUBLICATIONS",
      "SCHEDULE",
    ]);
  });

  it("prepareNextStep never executes a gated step until its approval is APPROVED — it flips the run to WAITING_FOR_APPROVAL instead", () => {
    const fn = source.match(/export async function prepareNextStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(approval\.status !== "APPROVED"\) \{/);
    expect(fn).toMatch(/status: "WAITING_FOR_APPROVAL"/);
  });

  it("decideApproval only reopens the step to PENDING on APPROVED — REJECTED leaves the run blocked", () => {
    const fn = source.match(/export async function decideApproval[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(decision === "APPROVED"\) \{/);
    expect(fn).toMatch(/status: "PENDING"/);
  });

  it("every approval decision records who decided, when, and an optional comment — a real audit trail, not a boolean flag", () => {
    const fn = source.match(/export async function decideApproval[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/decidedById: userId, decidedAt: new Date\(\)/);
  });
});

// ---------------------------------------------------------------------------
// 14. Scheduling — never simulates a real publish
// ---------------------------------------------------------------------------
describe("marketing-brain-stages.ts: SCHEDULE only moves posts that are genuinely schedulable, never simulates external publishing (structural)", () => {
  const source = read("src/server/services/marketing-brain-stages.ts");
  const fn = source.match(/export async function runScheduleStage[\s\S]*?\n\}/)![0];

  it("does nothing when scheduling mode isn't automatic — no silent auto-scheduling", () => {
    expect(fn).toMatch(/ctx\.normalized\.schedulingMode !== "automatic"/);
  });

  it("reuses canSchedule from Publishing Hub — the same approval gate logic, not a reimplementation", () => {
    expect(source).toMatch(/import \{ canSchedule \} from "@\/lib\/publishing\/status"/);
    expect(fn).toMatch(/canSchedule\(post\.status, ctx\.normalized\.requireApproval\)/);
  });

  it("only ever moves a post to SCHEDULED — never PUBLISHED (no real provider is connected)", () => {
    expect(fn).toMatch(/status: "SCHEDULED"/);
    expect(fn).not.toMatch(/status: "PUBLISHED"/);
  });
});

// ---------------------------------------------------------------------------
// 15. Cancellation, resumption, retries
// ---------------------------------------------------------------------------
describe("marketing-brain-orchestrator.ts: cancel/resume/retry never destroy already-created resources (structural)", () => {
  const source = read("src/server/services/marketing-brain-orchestrator.ts");

  it("cancelRun marks pending/running/waiting steps CANCELLED but never deletes a resource row", () => {
    const fn = source.match(/export async function cancelRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: \{ in: \["PENDING", "RUNNING", "WAITING_FOR_APPROVAL"\] \}/);
    expect(fn).not.toMatch(/marketingBrainResource\.delete/);
  });

  it("cancelRun is a no-op (not an error) on an already-terminal run", () => {
    const fn = source.match(/export async function cancelRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(isRunTerminal\(run\.status\)\) return \{\};/);
  });

  it("resumeRun only clears a stuck RUNNING step back to PENDING — it never marks anything COMPLETED", () => {
    const fn = source.match(/export async function resumeRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: "PENDING", executionToken: null/);
  });

  it("retryFailedStep only works on a FAILED run and un-skips the steps that were skipped because of it", () => {
    const fn = source.match(/export async function retryFailedStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(run\.status !== "FAILED"\) return \{ error:/);
    expect(fn).toMatch(/status: "SKIPPED" \}, data: \{ status: "PENDING" \}/);
  });

  it("retryFailedItem removes only the one failed item and safely re-opens the idempotent downstream stages instead of redoing everything", () => {
    const fn = source.match(/export async function retryFailedItem[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/filter\(\(f\) => f\.itemKey !== itemKey\)/);
    expect(fn).toMatch(/DOWNSTREAM_OF\[stepKey\]/);
  });

  it("prepareNextStep uses an atomic PENDING->RUNNING guard, so two concurrent calls can never both start the same step", () => {
    const fn = source.match(/export async function prepareNextStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/updateMany\(\{\s*where: \{ id: step\.id, status: "PENDING" \}/);
  });

  it("completeAiStep rejects a stale/superseded execution token instead of overwriting a newer attempt's result", () => {
    const fn = source.match(/export async function completeAiStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/step\.executionToken !== executionToken/);
  });
});

// ---------------------------------------------------------------------------
// 16. Partial failures never block independent items
// ---------------------------------------------------------------------------
describe("Partial errors: one failed draft/adaptation never stops the others (structural, spec section 21)", () => {
  const orchestrator = read("src/server/services/marketing-brain-orchestrator.ts");

  it("completeAiStep treats a failure in a multi-item-tolerant stage as a recorded item failure, not a run-ending error", () => {
    const fn = orchestrator.match(/export async function completeAiStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/MULTI_ITEM_TOLERANT_STEP_KEYS as readonly string\[\]\)\.includes\(step\.key\)/);
    expect(fn).toMatch(/failures\.push/);
  });

  it("only GENERATE_DRAFTS and ADAPT_PLATFORMS are multi-item-tolerant — single-item stages (strategy/pillars/plan) still fail hard", () => {
    const stagesSource = read("src/server/services/marketing-brain-stages.ts");
    expect(stagesSource).toMatch(/MULTI_ITEM_TOLERANT_STEP_KEYS = \["GENERATE_DRAFTS", "ADAPT_PLATFORMS"\]/);
  });
});

// ---------------------------------------------------------------------------
// 17. Duplication — never copies live state
// ---------------------------------------------------------------------------
describe("marketing-brain-orchestrator.ts: duplicateRun copies only the briefing/config, never progress/resources/campaign (structural, spec section 24)", () => {
  const fn = read("src/server/services/marketing-brain-orchestrator.ts").match(/export async function duplicateRun[\s\S]*?\n\}/)![0];

  it("copies briefing and stagesConfig", () => {
    expect(fn).toMatch(/briefing: briefingOf\(run\)/);
    expect(fn).toMatch(/stagesConfig: run\.stagesConfig/);
  });

  it("always starts as a fresh DRAFT with a new id and sourceRunId pointing back for traceability — never reuses the original campaignId", () => {
    expect(fn).toMatch(/status: "DRAFT"/);
    expect(fn).toMatch(/sourceRunId: run\.id/);
    expect(fn).not.toMatch(/campaignId: run\.campaignId/);
  });
});

// ---------------------------------------------------------------------------
// 18. Permissions & project isolation — every action, no exceptions
// ---------------------------------------------------------------------------
describe("Permissions and project isolation: every marketing-brain server action validates access and ownership (structural)", () => {
  const files = [
    "src/server/actions/marketing-brain.ts",
    "src/server/actions/marketing-brain-execution.ts",
    "src/server/actions/marketing-brain-approvals.ts",
    "src/server/actions/marketing-brain-select.ts",
  ];

  it("every exported action calls requireProjectAccess — never trusts projectId alone", () => {
    for (const file of files) {
      const source = read(file);
      const exportedFns = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
      expect(exportedFns.length).toBeGreaterThan(0);
      for (const fnName of exportedFns) {
        const fnMatch = source.match(new RegExp(`export async function ${fnName}\\([\\s\\S]*?\\n\\}`));
        expect(fnMatch?.[0], `${file}: ${fnName} should call requireProjectAccess`).toMatch(/requireProjectAccess\(/);
      }
    }
  });

  it("getOwnedRun re-verifies run.projectId === projectId — a runId from another project is always rejected, never trusted from the client", () => {
    const source = read("src/server/services/marketing-brain-orchestrator.ts");
    expect(source).toMatch(/async function getOwnedRun\(runId: string, projectId: string\)/);
    expect(source).toMatch(/if \(!run \|\| run\.projectId !== projectId\) return null;/);
  });

  it("getMarketingBrainRunDetail (read service) also re-verifies project ownership in the action layer before returning data", () => {
    const source = read("src/server/actions/marketing-brain-select.ts");
    expect(source).toMatch(/if \(!run \|\| run\.projectId !== projectId\) return null;/);
  });

  it("execution actions (prepare/complete/fail) require EDITOR — read-only VIEWER access is never enough to mutate a run", () => {
    const source = read("src/server/actions/marketing-brain-execution.ts");
    for (const fnName of ["prepareMarketingBrainStepAction", "completeMarketingBrainStepAction", "failMarketingBrainStepAction"]) {
      const fn = source.match(new RegExp(`export async function ${fnName}\\([\\s\\S]*?\\n\\}`))![0];
      expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
    }
  });
});

// ---------------------------------------------------------------------------
// 19. Concurrency & idempotency — schema-level guarantees
// ---------------------------------------------------------------------------
describe("Concurrency and idempotency: unique constraints back every dedup guarantee (structural)", () => {
  const schema = read("prisma/schema.prisma");

  it("MarketingBrainRun has a unique (createdById, idempotencyKey) index — a double-click can never create two drafts", () => {
    const model = schema.match(/model MarketingBrainRun \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[createdById, idempotencyKey\]\)/);
  });

  it("MarketingBrainStep has a unique (runId, key) index — a run can never have two rows for the same stage", () => {
    const model = schema.match(/model MarketingBrainStep \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[runId, key\]\)/);
  });

  it("MarketingBrainResource has unique (runId, X) indexes per resource-id column — a run can never record the same Campaign/ContentItem/SocialPost twice", () => {
    const model = schema.match(/model MarketingBrainResource \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[runId, campaignId\]\)/);
    expect(model).toMatch(/@@unique\(\[runId, campaignContentPieceId\]\)/);
    expect(model).toMatch(/@@unique\(\[runId, contentItemId\]\)/);
    expect(model).toMatch(/@@unique\(\[runId, socialPostId\]\)/);
  });

  it("MarketingBrainApproval has a unique (runId, stepKey) index — one decision record per gate per run", () => {
    const model = schema.match(/model MarketingBrainApproval \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[runId, stepKey\]\)/);
  });

  it("recordResource treats a unique-constraint violation as an idempotent no-op, never an unhandled crash", () => {
    const source = read("src/server/services/marketing-brain-stages.ts");
    const fn = source.match(/async function recordResource[\s\S]*?\n\}(?!\))/)![0];
    expect(fn).toMatch(/err\.code !== "P2002"/);
  });
});

// ---------------------------------------------------------------------------
// 20. Traceability
// ---------------------------------------------------------------------------
describe("Traceability: MarketingBrainResource lets the UI answer 'which run created this?' (structural, spec section 23)", () => {
  it("MarketingBrainResource uses real FK columns per resource type, never a bare polymorphic string id", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model MarketingBrainResource \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/campaign\s+Campaign\?\s+@relation/);
    expect(model).toMatch(/contentItem\s+ContentItem\?\s+@relation/);
    expect(model).toMatch(/socialPost\s+SocialPost\?\s+@relation/);
  });

  it("getMarketingBrainRunDetail includes resources with their linked Campaign/Pillar/Piece/ContentItem/SocialPost for direct navigation", () => {
    const source = read("src/server/services/marketing-brain.ts");
    const fn = source.match(/export async function getMarketingBrainRunDetail[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/resources: \{/);
    expect(fn).toMatch(/socialPost: \{ select:/);
  });
});

// ---------------------------------------------------------------------------
// 21. Safe deletion / archival
// ---------------------------------------------------------------------------
describe("Safe archival: only terminal runs can be archived, never one still in progress (structural)", () => {
  it("archiveRun refuses to archive a non-terminal run", () => {
    const fn = read("src/server/services/marketing-brain-orchestrator.ts").match(/export async function archiveRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!isRunTerminal\(run\.status\)\) return \{ error:/);
  });

  it("no destructive delete action exists anywhere for a run — cancel/archive only, resources always survive", () => {
    const source = read("src/server/services/marketing-brain-orchestrator.ts");
    expect(source).not.toMatch(/marketingBrainRun\.delete/);
  });
});

// ---------------------------------------------------------------------------
// 22. Schema — additive only, one migration, correct constraints
// ---------------------------------------------------------------------------
describe("Schema: Marketing Brain is additive-only, in a single new migration (structural)", () => {
  it("exactly one new migration folder exists for this phase", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"));
    expect(migrations).toContain("20260726120000_add_marketing_brain");
  });

  it("the migration is additive only — no DROP TABLE, no DROP COLUMN", () => {
    const migration = read("prisma/migrations/20260726120000_add_marketing_brain/migration.sql");
    expect(migration).not.toMatch(/DROP TABLE/);
    expect(migration).not.toMatch(/DROP COLUMN/);
  });

  it("every prior migration is still present — nothing was removed, renamed, or edited", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"));
    for (const prior of ["20260723193054_initial_schema", "20260725210000_add_campaign_studio", "20260725220000_add_publishing_hub"]) {
      expect(migrations).toContain(prior);
    }
  });

  it("Cascade is used only for a run's own exclusive children (steps/resources/approvals); SetNull is used for resources that can outlive the run", () => {
    const schema = read("prisma/schema.prisma");
    const stepModel = schema.match(/model MarketingBrainStep \{[\s\S]*?\n\}/)![0];
    expect(stepModel).toMatch(/run\s+MarketingBrainRun\s+@relation\(fields: \[runId\], references: \[id\], onDelete: Cascade\)/);
    const resourceModel = schema.match(/model MarketingBrainResource \{[\s\S]*?\n\}/)![0];
    expect(resourceModel).toMatch(/campaign\s+Campaign\?\s+@relation\("MarketingBrainResourceCampaign", fields: \[campaignId\], references: \[id\], onDelete: SetNull\)/);
  });

  it("no new model duplicates Campaign, ContentItem, or SocialPost — Marketing Brain only adds orchestration bookkeeping", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).not.toMatch(/model MarketingBrainCampaign|model MarketingBrainContent|model MarketingBrainPost/);
  });

  it("Json is used only for the explicitly-flexible cases: briefing snapshots, stage config, and small step input/output summaries", () => {
    const schema = read("prisma/schema.prisma");
    const runModel = schema.match(/model MarketingBrainRun \{[\s\S]*?\n\}/)![0];
    expect(runModel).toMatch(/briefing\s+Json/);
    expect(runModel).toMatch(/stagesConfig\s+Json/);
    const stepModel = schema.match(/model MarketingBrainStep \{[\s\S]*?\n\}/)![0];
    expect(stepModel).toMatch(/input\s+Json\?/);
    expect(stepModel).toMatch(/output\s+Json\?/);
  });
});

// ---------------------------------------------------------------------------
// 23. Route, navigation, and no-regression on frozen systems
// ---------------------------------------------------------------------------
describe("Route/navigation and regression: authenticated-only, no guest surface (structural)", () => {
  it("the marketing-brain route lives under the authenticated per-project dashboard, not guest", () => {
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/marketing-brain/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/marketing-brain/[runId]/page.tsx"))).toBe(true);
  });

  it("guestNavGroups was never touched by this phase — Marketing Brain is authenticated-only", () => {
    const source = read("src/lib/navigation.ts");
    const guestBlock = source.match(/export const guestNavGroups[\s\S]*?\n\];/)![0];
    expect(guestBlock).not.toMatch(/Marketing Brain|marketing-brain/);
  });

  it("projectNavGroups gained exactly one new item: Marketing Brain", () => {
    const source = read("src/lib/navigation.ts");
    expect(source).toMatch(/\{ label: "Marketing Brain", segment: "marketing-brain", icon: BrainCircuit \}/);
  });

  it("auth, email verification, Resend, and middleware were never modified by this phase", () => {
    const combined =
      read("src/lib/auth/config.ts") + read("src/lib/auth/edge-config.ts") + read("src/proxy.ts") + read("src/lib/email/send-email.ts");
    expect(combined).not.toMatch(/marketing-brain|MarketingBrainRun|MarketingBrainStep/i);
  });

  it("no alert() or confirm() is used anywhere in the Marketing Brain UI", () => {
    const dir = path.join(ROOT, "src/components/marketing-brain");
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".tsx")) continue;
      const source = readFileSync(path.join(dir, entry), "utf8");
      expect(source, entry).not.toMatch(/\balert\(|\bconfirm\(/);
    }
  });

  it("no server-side AI provider was introduced — every AI stage still routes through the browser's local engine (useLocalAI), consistent with the rest of the app", () => {
    const combined = read("src/server/services/marketing-brain-stages.ts") + read("src/server/services/marketing-brain-orchestrator.ts");
    expect(combined).not.toMatch(/@anthropic-ai\/sdk|openai|fetch\(.*api\.anthropic|fetch\(.*openai/i);
    const executionActions = read("src/server/actions/marketing-brain-execution.ts");
    expect(executionActions).toMatch(/browser|local engine/i);
  });
});

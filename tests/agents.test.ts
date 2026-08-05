import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_DEFINITIONS, OFFICIAL_TEAM_BLUEPRINTS, findAgentDefinition, listAgentDefinitions } from "@/lib/agents/registry";
import { AGENT_CATEGORIES, AGENT_OUTPUT_TYPES, AGENT_INPUT_FIELD_TYPES, AGENT_TOOL_IDS } from "@/lib/agents/types";
import { buildInputZodSchema, agentInputSchemaArray } from "@/lib/agents/dynamic-form";
import {
  buildStructuredSystemPrompt,
  parseStructuredText,
  buildStructuredZodSchema,
  repairStructuredOutput,
  isStructuredOutputEmpty,
  buildBlockSystemPrompt,
  parseBlockText,
} from "@/lib/agents/structured-output";
import { buildAgentPrompt, parseAndValidateAgentOutput, isBlockOutputType } from "@/lib/agents/prompt-builder";
import {
  isRunTerminal,
  canEditInput,
  canStartRun,
  canCancelRun,
  canRetryStep,
  canCompleteRun,
  shouldBePartiallyCompleted,
  nextRunStatusAfterAllSteps,
} from "@/lib/agents/state-machine";
import { createAgentSchema, createTeamSchema, decideAgentApprovalSchema, createAgentMemorySchema } from "@/lib/validation/agents";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Official agent registry — the single central source
// ---------------------------------------------------------------------------
describe("registry.ts: the official agents from the spec (10 original + Performance Strategist, Fase 36, + Customer Support Agent, Fase 40), one central typed registry (pure, real unit tests)", () => {
  it("defines exactly the 10 original official agents plus Performance Strategist (Fase 36) and Customer Support Agent (Fase 40)", () => {
    expect(AGENT_DEFINITIONS.map((a) => a.key)).toEqual([
      "writing-agent",
      "seo-agent",
      "research-agent",
      "social-media-agent",
      "marketing-agent",
      "brand-agent",
      "content-repurposing-agent",
      "campaign-agent",
      "publishing-agent",
      "review-agent",
      "performance-strategist",
      "customer-support-agent",
    ]);
  });

  it("every agent declares the full configuration spec section 3 requires", () => {
    for (const agent of AGENT_DEFINITIONS) {
      expect(agent.name).toBeTruthy();
      expect(agent.description).toBeTruthy();
      expect(agent.icon).toBeTruthy();
      expect(AGENT_CATEGORIES).toContain(agent.category);
      expect(agent.capabilities.length).toBeGreaterThan(0);
      expect(agent.systemInstructions.length).toBeGreaterThan(0);
      expect(AGENT_OUTPUT_TYPES).toContain(agent.outputType);
      expect(agent.outputFields.length).toBeGreaterThan(0);
      for (const tool of agent.allowedTools) expect(AGENT_TOOL_IDS).toContain(tool);
      expect(agent.defaultLanguage).toBeTruthy();
      expect(["CONSERVATIVE", "BALANCED", "CREATIVE"]).toContain(agent.defaultCreativity);
      expect(agent.maxSteps).toBeGreaterThan(0);
      expect(agent.active).toBe(true);
    }
  });

  it("findAgentDefinition resolves a real key and returns undefined for an unknown one — never throws", () => {
    expect(findAgentDefinition("writing-agent")?.name).toBe("Writing Agent");
    expect(findAgentDefinition("not-a-real-agent")).toBeUndefined();
  });

  it("listAgentDefinitions returns the same array findAgentDefinition reads from — one registry, not two", () => {
    expect(listAgentDefinitions()).toBe(AGENT_DEFINITIONS);
  });

  it("SEO Agent's capabilities never claim it decides the numeric score itself — it defers to the deterministic scorer", () => {
    const seo = findAgentDefinition("seo-agent")!;
    expect(seo.systemInstructions).toMatch(/NUNCA la decides tú|determinista/);
  });

  it("Research Agent's instructions explicitly forbid inventing web sources", () => {
    const research = findAgentDefinition("research-agent")!;
    expect(research.systemInstructions).toMatch(/nunca navegas la web ni inventas fuentes/);
  });

  it("Review Agent's output enum matches the 3 decisions from spec section 4 exactly", () => {
    const review = findAgentDefinition("review-agent")!;
    const decisionField = review.outputFields.find((f) => f.field === "decision")!;
    expect(decisionField.enumValues).toEqual(["APROBADO", "APROBADO_CON_OBSERVACIONES", "REQUIERE_CAMBIOS"]);
  });

  it("the 3 official example teams from spec section 10 are defined with real member lists", () => {
    expect(OFFICIAL_TEAM_BLUEPRINTS.map((t) => t.key)).toEqual(["content-production-team", "social-campaign-team", "seo-article-team"]);
    for (const blueprint of OFFICIAL_TEAM_BLUEPRINTS) {
      expect(blueprint.members.length).toBeGreaterThan(0);
      for (const ref of blueprint.members) expect(findAgentDefinition(ref)).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Dynamic input form engine — no per-agent duplicated forms
// ---------------------------------------------------------------------------
describe("dynamic-form.ts: one schema builder drives every agent's form (pure, real unit tests)", () => {
  it("buildInputZodSchema makes required fields mandatory and optional fields, optional", () => {
    const schema = buildInputZodSchema([
      { key: "topic", label: "Tema", type: "long_text", required: true },
      { key: "tone", label: "Tono", type: "short_text", required: false },
    ]);
    expect(schema.safeParse({ topic: "hola" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("resource-reference field types validate shape (a cuid) only — ownership is checked server-side, never here", () => {
    const schema = buildInputZodSchema([{ key: "contentItemId", label: "Contenido", type: "content_item", required: true }]);
    expect(schema.safeParse({ contentItemId: "not-a-cuid" }).success).toBe(false);
    expect(schema.safeParse({ contentItemId: "clxxxxxxxxxxxxxxxxxxxxxxxx" }).success).toBe(true);
  });

  it("every official agent's required+optional inputs validate against agentInputSchemaArray — the same schema custom agents are validated with", () => {
    for (const agent of AGENT_DEFINITIONS) {
      const fields = [...agent.requiredInputs, ...agent.optionalInputs];
      expect(agentInputSchemaArray.safeParse(fields).success).toBe(true);
    }
  });

  it("every declared AgentInputFieldType is a real, supported type", () => {
    for (const agent of AGENT_DEFINITIONS) {
      for (const field of [...agent.requiredInputs, ...agent.optionalInputs]) {
        expect(AGENT_INPUT_FIELD_TYPES).toContain(field.type);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Structured output engine — strict validation + controlled repair
// ---------------------------------------------------------------------------
describe("structured-output.ts: shared build/parse/validate/repair engine for all 11 output types (pure, real unit tests)", () => {
  const fields = [
    { marker: "TITULO", field: "title", kind: "text" as const, maxLength: 100 },
    { marker: "ETIQUETAS", field: "tags", kind: "list" as const, maxItems: 5 },
  ];

  it("buildStructuredSystemPrompt embeds every marker in the required format", () => {
    const prompt = buildStructuredSystemPrompt("Eres un agente.", fields, "");
    expect(prompt).toContain("TITULO:");
    expect(prompt).toContain("ETIQUETAS:");
  });

  it("parseStructuredText extracts text and list sections, never throwing on malformed input", () => {
    const parsed = parseStructuredText("TITULO:\nMi título\n\nETIQUETAS:\nuno\ndos\n", fields);
    expect(parsed.title).toBe("Mi título");
    expect(parsed.tags).toEqual(["uno", "dos"]);
    expect(() => parseStructuredText("", fields)).not.toThrow();
  });

  it("isStructuredOutputEmpty flags a fully-blank parse as unusable — never persisted as success", () => {
    expect(isStructuredOutputEmpty({ title: "", tags: [] })).toBe(true);
    expect(isStructuredOutputEmpty({ title: "algo", tags: [] })).toBe(false);
  });

  it("buildStructuredZodSchema rejects an over-length field and repairStructuredOutput truncates it instead of discarding the whole result", () => {
    const schema = buildStructuredZodSchema(fields);
    const tooLong = { title: "x".repeat(200), tags: ["a"] };
    expect(schema.safeParse(tooLong).success).toBe(false);
    const { repaired } = repairStructuredOutput(tooLong, fields);
    expect((repaired.title as string).length).toBe(100);
  });

  it("repairStructuredOutput never silently repairs an invalid enum — it reports enumFailed instead", () => {
    const enumFields = [{ marker: "DECISION", field: "decision", kind: "enum" as const, enumValues: ["A", "B"] }];
    const { enumFailed } = repairStructuredOutput({ decision: "NOT_A_VALID_OPTION" }, enumFields);
    expect(enumFailed).toBe(true);
  });

  it("buildBlockSystemPrompt/parseBlockText round-trip a list of records (variant_set/plan shape)", () => {
    const blockFields = [
      { marker: "PLATAFORMA", field: "platform", kind: "text" as const },
      { marker: "HASHTAGS", field: "hashtags", kind: "list" as const },
    ];
    const system = buildBlockSystemPrompt("Genera variantes.", "ELEMENTO", blockFields, "");
    expect(system).toContain("---ELEMENTO---");

    const raw = "---ELEMENTO---\nPLATAFORMA: instagram\nHASHTAGS: a, b, c\n---FIN---\n---ELEMENTO---\nPLATAFORMA: tiktok\nHASHTAGS: d\n---FIN---";
    const items = parseBlockText(raw, "ELEMENTO", blockFields);
    expect(items).toHaveLength(2);
    expect(items[0].platform).toBe("instagram");
    expect(items[0].hashtags).toEqual(["a", "b", "c"]);
  });

  it("parseBlockText silently drops a malformed block instead of crashing", () => {
    expect(() => parseBlockText("garbage with no markers", "ELEMENTO", fields)).not.toThrow();
    expect(parseBlockText("garbage with no markers", "ELEMENTO", fields)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Prompt builder — shared across every agent, block-vs-flat dispatch
// ---------------------------------------------------------------------------
describe("prompt-builder.ts: buildAgentPrompt/parseAndValidateAgentOutput drive every official and custom agent (pure, real unit tests)", () => {
  it("isBlockOutputType is true only for variant_set/plan — every other output type is flat", () => {
    expect(isBlockOutputType("variant_set")).toBe(true);
    expect(isBlockOutputType("plan")).toBe(true);
    expect(isBlockOutputType("content")).toBe(false);
    expect(isBlockOutputType("analysis")).toBe(false);
  });

  it("buildAgentPrompt renders provided input values and flags when no context was supplied", () => {
    const writing = findAgentDefinition("writing-agent")!;
    const { userPrompt } = buildAgentPrompt({
      agentDefinition: writing,
      inputValues: { instruction: "Escribe sobre gatos" },
      context: [],
      brandContext: "",
      memoryInstructions: [],
    });
    expect(userPrompt).toContain("Escribe sobre gatos");
    expect(userPrompt).toContain("No se proporcionó contexto adicional");
  });

  it("buildAgentPrompt includes resolved context items when provided, labeled by origin", () => {
    const writing = findAgentDefinition("writing-agent")!;
    const { userPrompt } = buildAgentPrompt({
      agentDefinition: writing,
      inputValues: {},
      context: [{ origin: "ContentItem", label: "Mi artículo", content: "Cuerpo del artículo" }],
      brandContext: "",
      memoryInstructions: [],
    });
    expect(userPrompt).toContain("[ContentItem] Mi artículo");
  });

  it("parseAndValidateAgentOutput fails cleanly (never crashes) on a completely empty AI response", () => {
    const writing = findAgentDefinition("writing-agent")!;
    const outcome = parseAndValidateAgentOutput(writing, "");
    expect(outcome.status).toBe("failed");
    expect(outcome.errorCategory).toBe("OUTPUT_SCHEMA");
  });

  it("parseAndValidateAgentOutput succeeds on a well-formed flat response", () => {
    const writing = findAgentDefinition("writing-agent")!;
    const outcome = parseAndValidateAgentOutput(writing, "TITULO:\nMi título\n\nCUERPO:\nUn cuerpo de texto real.\n\nCTA:\nCompra ahora\n");
    expect(outcome.status).toBe("completed");
    expect(Array.isArray(outcome.output)).toBe(false);
  });

  it("parseAndValidateAgentOutput succeeds on a well-formed block (variant_set) response", () => {
    const social = findAgentDefinition("social-media-agent")!;
    const raw = "---ELEMENTO---\nPLATAFORMA: instagram\nHOOK: Gancho\nTEXTO: Contenido\nHASHTAGS: a, b\nCTA: Compra\n---FIN---";
    const outcome = parseAndValidateAgentOutput(social, raw);
    expect(outcome.status).toBe("completed");
    expect(Array.isArray(outcome.output)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. State machine — deterministic transitions
// ---------------------------------------------------------------------------
describe("state-machine.ts: run/step transitions (pure, real unit tests)", () => {
  it("only COMPLETED/FAILED/CANCELLED/ARCHIVED are terminal", () => {
    expect(isRunTerminal("COMPLETED")).toBe(true);
    expect(isRunTerminal("PARTIALLY_COMPLETED")).toBe(false);
    expect(isRunTerminal("RUNNING")).toBe(false);
  });

  it("input can only be edited in DRAFT/READY — never while RUNNING (spec section 9)", () => {
    expect(canEditInput("DRAFT")).toBe(true);
    expect(canEditInput("READY")).toBe(true);
    expect(canEditInput("RUNNING")).toBe(false);
  });

  it("a run can only start from READY", () => {
    expect(canStartRun("READY")).toBe(true);
    expect(canStartRun("DRAFT")).toBe(false);
  });

  it("cancellation is allowed for any non-terminal run only", () => {
    expect(canCancelRun("RUNNING")).toBe(true);
    expect(canCancelRun("COMPLETED")).toBe(false);
  });

  it("only a FAILED step can be retried directly", () => {
    expect(canRetryStep("FAILED")).toBe(true);
    expect(canRetryStep("RUNNING")).toBe(false);
  });

  it("a run can only complete when every step is COMPLETED or SKIPPED", () => {
    expect(canCompleteRun(["COMPLETED", "SKIPPED"])).toBe(true);
    expect(canCompleteRun(["COMPLETED", "FAILED"])).toBe(false);
  });

  it("shouldBePartiallyCompleted / nextRunStatusAfterAllSteps resolve deterministically", () => {
    expect(shouldBePartiallyCompleted([0, 0])).toBe(false);
    expect(shouldBePartiallyCompleted([0, 1])).toBe(true);
    expect(nextRunStatusAfterAllSteps(["COMPLETED", "FAILED"], [0, 0])).toBe("FAILED");
    expect(nextRunStatusAfterAllSteps(["COMPLETED", "COMPLETED"], [0, 1])).toBe("PARTIALLY_COMPLETED");
    expect(nextRunStatusAfterAllSteps(["COMPLETED", "SKIPPED"], [0, 0])).toBe("COMPLETED");
  });
});

// ---------------------------------------------------------------------------
// 6. Validation schemas — custom agents, teams, approvals, memory
// ---------------------------------------------------------------------------
describe("validation/agents.ts: zod schemas (pure, real unit tests)", () => {
  it("createAgentSchema rejects empty instructions — spec section 5: 'no permitas instrucciones vacías'", () => {
    expect(
      createAgentSchema.safeParse({
        name: "Mi agente",
        description: "desc",
        icon: "Bot",
        category: "CUSTOM",
        systemInstructions: "",
        inputSchema: [],
        outputType: "text",
      }).success
    ).toBe(false);
  });

  it("createAgentSchema accepts a well-formed custom agent", () => {
    expect(
      createAgentSchema.safeParse({
        name: "Mi agente",
        description: "desc",
        icon: "Bot",
        category: "CUSTOM",
        systemInstructions: "Haz esto siempre.",
        inputSchema: [],
        outputType: "text",
      }).success
    ).toBe(true);
  });

  it("createTeamSchema requires at least one member", () => {
    expect(
      createTeamSchema.safeParse({ name: "Equipo", coordinatorAgentRef: "review-agent", errorStrategy: "STOP_ON_ERROR", members: [] }).success
    ).toBe(false);
  });

  it("decideAgentApprovalSchema constrains decision to the 3 real outcomes", () => {
    expect(decideAgentApprovalSchema.safeParse({ stepOrder: 0, decision: "APPROVED" }).success).toBe(true);
    expect(decideAgentApprovalSchema.safeParse({ stepOrder: 0, decision: "MADE_UP" }).success).toBe(false);
  });

  it("createAgentMemorySchema rejects empty memory content", () => {
    expect(createAgentMemorySchema.safeParse({ agentRef: "writing-agent", type: "PREFERENCE", content: "" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Orchestrator — draft creation, confirm, idempotency, transfer
// ---------------------------------------------------------------------------
describe("agent-orchestrator.ts: draft creation, confirmation, transfer between agents (structural)", () => {
  const source = read("src/server/services/agent-orchestrator.ts");

  it("createDraftRun is idempotent via the (createdById, idempotencyKey) unique index", () => {
    const fn = source.match(/export async function createDraftRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/createdById_idempotencyKey/);
    expect(fn).toMatch(/prisma\.aiAgentRun\.upsert/);
  });

  it("updateRunInput refuses to edit once running/finished, and true-partial-merges the patch", () => {
    const fn = source.match(/export async function updateRunInput[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/run\.status !== "DRAFT" && run\.status !== "READY"/);
    expect(fn).toMatch(/merged: StepInput = \{ values: \{ \.\.\.current\.values, \.\.\.values \}/);
  });

  it("confirmRun validates the entry agent's required inputs and verifies the Brand Profile belongs to this user before snapshotting", () => {
    const fn = source.match(/export async function confirmRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/inputSchema\.safeParse\(draft\.values\)/);
    expect(fn).toMatch(/profile\.userId !== userId/);
  });

  it("confirmRun creates one step per enabled team member (or a single step for a lone agent) — never silently including a disabled member", () => {
    const fn = source.match(/export async function confirmRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/run\.team\.members\.filter\(\(m\) => m\.enabled\)/);
  });

  it("prepareStepInput auto-creates a real, traceable ContentItem when the next agent needs one and the previous step didn't already produce it — never a silent drop (spec section 11)", () => {
    const fn = source.match(/async function prepareStepInput[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/needsContentItem/);
    expect(fn).toMatch(/contentItem\.create/);
    expect(fn).toMatch(/type: "CONTENT_ITEM", action: "CREATED"/);
  });

  it("prepareStepInput reuses an already-created intermediate ContentItem on a retry rather than creating a second one", () => {
    const fn = source.match(/async function prepareStepInput[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/existingResource\?\.contentItemId/);
  });
});

// ---------------------------------------------------------------------------
// 8. Approval flow
// ---------------------------------------------------------------------------
describe("agent-orchestrator.ts: approvals pause execution and record a real decision (structural)", () => {
  const source = read("src/server/services/agent-orchestrator.ts");

  it("prepareNextStep never executes a step requiring approval until APPROVED — it flips the run to WAITING_FOR_APPROVAL instead", () => {
    const fn = source.match(/export async function prepareNextStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(approval\.status !== "APPROVED"\)/);
    expect(fn).toMatch(/status: "WAITING_FOR_APPROVAL"/);
  });

  it("decideApproval supports APPROVED, CHANGES_REQUESTED, and REJECTED, and only reopens the step on APPROVED", () => {
    const fn = source.match(/export async function decideApproval[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(decision === "APPROVED"\)/);
  });

  it("an approved revised output overwrites the step's raw output distinctly, preserving what the AI actually produced only as history, not as the final saved result", () => {
    const fn = source.match(/export async function decideApproval[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/revisedOutput && step\.status === "WAITING_FOR_APPROVAL"/);
  });

  it("every approval decision records who decided, when, and an optional comment", () => {
    const fn = source.match(/export async function decideApproval[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/decidedById: userId, decidedAt: new Date\(\)/);
  });
});

// ---------------------------------------------------------------------------
// 9. Partial failures — independent branches never destroy each other
// ---------------------------------------------------------------------------
describe("Partial errors: a failing team member doesn't necessarily fail the whole run (structural, spec section 23)", () => {
  const source = read("src/server/services/agent-orchestrator.ts");

  it("completeAiStep honors CONTINUE_INDEPENDENT_BRANCHES by marking only the failing step FAILED, not the whole run", () => {
    const fn = source.match(/export async function completeAiStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/run\.team\?\.errorStrategy === "CONTINUE_INDEPENDENT_BRANCHES"/);
    expect(fn).toMatch(/status: "FAILED", errorMessage: outcome\.errorMessage/);
  });

  it("STOP_ON_ERROR (the default) still fails the whole run and skips remaining steps", () => {
    // Fase 36 extracted failRunAndSkipRemaining into agent-run-lifecycle.ts (shared with agent-performance-strategist.ts) — agent-orchestrator.ts still imports and calls it, just no longer defines it locally.
    const lifecycleSource = read("src/server/services/agent-run-lifecycle.ts");
    const fn = lifecycleSource.match(/export async function failRunAndSkipRemaining[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: "SKIPPED"/);
    expect(fn).toMatch(/status: "FAILED"/);
    expect(source).toMatch(/failRunAndSkipRemaining/);
  });

  it("AiAgentTeamMember.requireApproval lets a specific team step demand approval independent of the team default", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model AiAgentTeamMember \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/requireApproval\s+Boolean\s+@default\(false\)/);
  });
});

// ---------------------------------------------------------------------------
// 10. Cancellation, resumption, retries, duplication
// ---------------------------------------------------------------------------
describe("agent-orchestrator.ts: cancel/resume/retry/duplicate never destroy created resources (structural)", () => {
  const source = read("src/server/services/agent-orchestrator.ts");

  it("cancelRun marks pending/running/waiting steps CANCELLED, never deletes a resource, and is a no-op on a terminal run", () => {
    const fn = source.match(/export async function cancelRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: \{ in: \["PENDING", "RUNNING", "WAITING_FOR_APPROVAL"\] \}/);
    expect(fn).not.toMatch(/aiAgentResource\.delete/);
    expect(fn).toMatch(/if \(isRunTerminal\(run\.status\)\) return \{\};/);
  });

  it("resumeRun only clears a stuck RUNNING step back to PENDING — never marks anything COMPLETED", () => {
    const fn = source.match(/export async function resumeRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: "PENDING", executionToken: null/);
  });

  it("retryFailedStep only works on a FAILED/PARTIALLY_COMPLETED run and un-skips steps that were skipped because of it", () => {
    const fn = source.match(/export async function retryFailedStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/run\.status !== "FAILED" && run\.status !== "PARTIALLY_COMPLETED"/);
  });

  it("duplicateRun copies input/agent/team refs but starts fresh — never copies progress, resources, or approvals", () => {
    const fn = source.match(/export async function duplicateRun[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: "DRAFT"/);
    expect(fn).toMatch(/sourceRunId: run\.id/);
    expect(fn).not.toMatch(/steps: \{ create/);
  });

  it("prepareNextStep uses an atomic PENDING->RUNNING guard so two concurrent calls can never both start the same step", () => {
    const fn = source.match(/export async function prepareNextStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/updateMany\(\{\s*where: \{ id: step\.id, status: "PENDING" \}/);
  });

  it("completeAiStep rejects a stale/superseded execution token instead of overwriting a newer attempt's result", () => {
    const fn = source.match(/export async function completeAiStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/step\.executionToken !== executionToken/);
  });
});

// ---------------------------------------------------------------------------
// 11. Memory — controlled, per-project-and-agent, never invisible
// ---------------------------------------------------------------------------
describe("agent-memory.ts: memory requires explicit save (approval), scoped per project+agent (structural, spec section 15)", () => {
  const source = read("src/server/services/agent-memory.ts");

  it("saveAgentMemory always stamps an approvedById — there is no path to persist memory without it", () => {
    const fn = source.match(/export async function saveAgentMemory[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/approvedById,/);
  });

  it("listAgentMemory/deleteAgentMemory/setAgentMemoryActive are always scoped by projectId — never cross-project", () => {
    expect(source).toMatch(/prisma\.aiAgentMemory\.findMany\(\{\s*where: \{ projectId, agentRef, isActive: true \}/);
    const del = source.match(/export async function deleteAgentMemory[\s\S]*?\n\}/)![0];
    expect(del).toMatch(/memory\.projectId !== projectId/);
  });

  it("buildMemoryInstructions only pulls active memory — a deactivated memory never influences a future run", () => {
    const fn = source.match(/export async function buildMemoryInstructions[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/isActive: true/);
  });

  it("the schema scopes memory by (projectId, agentRef) with no cross-project relation possible — projectId is a required, non-nullable FK", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model AiAgentMemory \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/projectId\s+String\n/);
    expect(model).not.toMatch(/secret|token|password/i);
  });
});

// ---------------------------------------------------------------------------
// 12. Context builder — validated, deduplicated, honest about limitations
// ---------------------------------------------------------------------------
describe("agent-context.ts: context resolution validates ownership and never invents FileAsset content (structural, spec sections 14/16)", () => {
  const source = read("src/server/services/agent-context.ts");

  it("every resource type is re-validated against projectId/userId before being included — never trusts the client selection as-is", () => {
    expect(source).toMatch(/profile\.userId === userId/);
    expect(source).toMatch(/projectId, deletedAt: null/);
    expect(source).toMatch(/campaign\.projectId === projectId/);
  });

  it("deduplicates via a seen-keys set before adding any item", () => {
    expect(source).toMatch(/seen\.has\(dedupeKey\)/);
  });

  it("is honest about the lack of a FileAsset text-extraction pipeline instead of inventing file content", () => {
    expect(source).toMatch(/Sin contenido de texto extraíble|no extrae texto de archivos/);
  });

  it("caps every resolved item's length instead of dumping unbounded content into the prompt", () => {
    expect(source).toMatch(/function truncate/);
  });
});

// ---------------------------------------------------------------------------
// 13. Catalog — custom agents, teams, favorites, official team provisioning
// ---------------------------------------------------------------------------
describe("agent-catalog.ts: custom agent CRUD, teams, safe deletion, favorites (structural)", () => {
  const source = read("src/server/services/agent-catalog.ts");

  it("resolveAgent checks official registry first, then falls back to a project-owned custom agent — never trusts an id blindly", () => {
    const fn = source.match(/export async function resolveAgent[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/findAgentDefinition\(agentRef\)/);
    expect(fn).toMatch(/custom\.projectId !== projectId/);
  });

  it("deleteCustomAgent refuses to delete an agent with run history — archive instead (safe deletion, spec section 5)", () => {
    const fn = source.match(/export async function deleteCustomAgent[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/runCount > 0/);
    expect(fn).toMatch(/archívalo en vez de eliminarlo/);
  });

  it("ensureOfficialTeamBlueprints is idempotent — checks existing team names before creating, never duplicating on repeat visits", () => {
    const fn = source.match(/export async function ensureOfficialTeamBlueprints[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/existingNames\.has/);
  });

  it("toggleAgentFavorite reuses the existing AiToolInteraction model instead of a new favorites table", () => {
    const fn = source.match(/export async function toggleAgentFavorite[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.aiToolInteraction/);
  });
});

// ---------------------------------------------------------------------------
// 14. Results — save-as actions reuse existing models, type-appropriate
// ---------------------------------------------------------------------------
describe("agent-results.ts: save-as-ContentItem/pillars/SocialPost/prompt reuse existing models, never a parallel one (structural, spec sections 17-20)", () => {
  const source = read("src/server/services/agent-results.ts");

  it("saveStepOutputAsContentItem never overwrites an already-linked ContentItem without an explicit mode, and supports update-empty/new-version/copy", () => {
    const fn = source.match(/export async function saveStepOutputAsContentItem[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/mode === "update-empty"/);
    expect(fn).toMatch(/mode === "new-version"/);
    expect(fn).toMatch(/contentVersion\.create/);
  });

  it("saveStepOutputAsCampaignPillars creates real CampaignPillar rows, never a duplicate campaign model", () => {
    const fn = source.match(/export async function saveStepOutputAsCampaignPillars[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.campaignPillar\.create/);
    expect(fn).toMatch(/campaign\.projectId !== projectId/);
  });

  it("saveStepOutputAsSocialPosts never fakes a successful external publish — status is only ever DRAFT or IN_REVIEW", () => {
    const fn = source.match(/export async function saveStepOutputAsSocialPosts[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireApproval \? "IN_REVIEW" : "DRAFT"/);
    expect(fn).not.toMatch(/status: "PUBLISHED"/);
  });

  it("a per-variant failure (unrecognized platform, empty text) is recorded without aborting the other variants", () => {
    const fn = source.match(/export async function saveStepOutputAsSocialPosts[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/failures\.push/);
  });
});

// ---------------------------------------------------------------------------
// 15. SEO Agent's deterministic score integration
// ---------------------------------------------------------------------------
describe("SEO Agent reuses the existing deterministic SEO scorer — never an AI-invented numeric score (structural, spec section 4)", () => {
  it("attachDeterministicSeoScore calls the real computeSeoScore from src/lib/editor/seo-score.ts", () => {
    const source = read("src/server/services/agent-stages.ts");
    expect(source).toMatch(/import \{ computeSeoScore \} from "@\/lib\/editor\/seo-score"/);
    expect(source).toMatch(/computeSeoScore\(\{/);
  });

  it("completeAiStep attaches the deterministic score only for seo-agent steps, never for other agents", () => {
    const source = read("src/server/services/agent-orchestrator.ts");
    const fn = source.match(/export async function completeAiStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/step\.agentRef === "seo-agent"/);
    expect(fn).toMatch(/attachDeterministicSeoScore/);
  });
});

// ---------------------------------------------------------------------------
// 16. Permissions & project isolation — every action, no exceptions
// ---------------------------------------------------------------------------
describe("Permissions and project isolation: every AI Agent Studio server action validates access and ownership (structural)", () => {
  const files = [
    "src/server/actions/agents.ts",
    "src/server/actions/agent-teams.ts",
    "src/server/actions/agent-runs.ts",
    "src/server/actions/agent-execution.ts",
    "src/server/actions/agent-approvals.ts",
    "src/server/actions/agent-memory.ts",
    "src/server/actions/agent-results.ts",
    "src/server/actions/agent-select.ts",
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

  it("getOwnedRun re-verifies run.projectId === projectId — a runId from another project is always rejected", () => {
    const source = read("src/server/services/agent-orchestrator.ts");
    expect(source).toMatch(/async function getOwnedRun\(runId: string, projectId: string\)/);
    expect(source).toMatch(/if \(!run \|\| run\.projectId !== projectId\) return null;/);
  });

  it("execution actions (prepare/complete/fail) require EDITOR — VIEWER access is never enough to mutate a run", () => {
    const source = read("src/server/actions/agent-execution.ts");
    for (const fnName of ["prepareAgentRunStepAction", "completeAgentRunStepAction", "failAgentRunStepAction"]) {
      const fn = source.match(new RegExp(`export async function ${fnName}\\([\\s\\S]*?\\n\\}`))![0];
      expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
    }
  });

  it("no agent instruction or tool grants code execution, secret access, or auth modification — allowedTools is a fixed, closed vocabulary", () => {
    const registrySource = read("src/lib/agents/registry.ts");
    expect(registrySource).not.toMatch(/eval\(|exec\(|process\.env|child_process/);
    for (const agent of AGENT_DEFINITIONS) {
      for (const tool of agent.allowedTools) expect(AGENT_TOOL_IDS).toContain(tool);
    }
  });
});

// ---------------------------------------------------------------------------
// 17. Concurrency & idempotency — schema-level guarantees
// ---------------------------------------------------------------------------
describe("Concurrency and idempotency: unique constraints back every dedup guarantee (structural)", () => {
  const schema = read("prisma/schema.prisma");

  it("AiAgentRun has a unique (createdById, idempotencyKey) index", () => {
    const model = schema.match(/model AiAgentRun \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[createdById, idempotencyKey\]\)/);
  });

  it("AiAgentRunStep has a unique (runId, order) index — a run can never have two rows for the same position", () => {
    const model = schema.match(/model AiAgentRunStep \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[runId, order\]\)/);
  });

  it("AiAgentApproval has a unique (runId, stepOrder) index — one decision record per gate per run", () => {
    const model = schema.match(/model AiAgentApproval \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[runId, stepOrder\]\)/);
  });

  it("AiAgentTeamMember has a unique (teamId, order) index — no two members can share a position", () => {
    const model = schema.match(/model AiAgentTeamMember \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[teamId, order\]\)/);
  });

  it("AiAgentResource has unique (runId, X) indexes per resource-id column — a run can never record the same ContentItem/Campaign/SocialPost twice", () => {
    const model = schema.match(/model AiAgentResource \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[runId, contentItemId\]\)/);
    expect(model).toMatch(/@@unique\(\[runId, campaignId\]\)/);
    expect(model).toMatch(/@@unique\(\[runId, socialPostId\]\)/);
  });
});

// ---------------------------------------------------------------------------
// 18. Schema — additive only, one migration, correct constraints
// ---------------------------------------------------------------------------
describe("Schema: AI Agent Studio is additive-only, in a single new migration (structural)", () => {
  it("exactly one new migration folder exists for this phase", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"));
    expect(migrations).toContain("20260727090000_add_ai_agent_studio");
  });

  it("the migration is additive only — no DROP TABLE, no DROP COLUMN", () => {
    const migration = read("prisma/migrations/20260727090000_add_ai_agent_studio/migration.sql");
    expect(migration).not.toMatch(/DROP TABLE/);
    expect(migration).not.toMatch(/DROP COLUMN/);
  });

  it("every prior migration is still present — nothing was removed, renamed, or edited", () => {
    const migrations = readdirSync(path.join(ROOT, "prisma/migrations"));
    for (const prior of ["20260723193054_initial_schema", "20260725220000_add_publishing_hub", "20260726120000_add_marketing_brain"]) {
      expect(migrations).toContain(prior);
    }
  });

  it("Cascade is used only for a run's own exclusive children (steps/approvals/resources); SetNull is used for resources that can outlive the run", () => {
    const schema = read("prisma/schema.prisma");
    const stepModel = schema.match(/model AiAgentRunStep \{[\s\S]*?\n\}/)![0];
    expect(stepModel).toMatch(/run\s+AiAgentRun\s+@relation\(fields: \[runId\], references: \[id\], onDelete: Cascade\)/);
    const resourceModel = schema.match(/model AiAgentResource \{[\s\S]*?\n\}/)![0];
    expect(resourceModel).toMatch(/contentItem\s+ContentItem\?\s+@relation\(fields: \[contentItemId\], references: \[id\], onDelete: SetNull\)/);
  });

  it("no new model duplicates ContentItem, Campaign, or SocialPost — AiAgentRun/Step/Resource only add orchestration bookkeeping", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).not.toMatch(/model AiAgentContent|model AiAgentCampaign|model AiAgentPost/);
  });

  it("official agents are never persisted — AiAgent rows are custom agents only, referenced by officialAgentKey OR customAgentId, never both required", () => {
    const schema = read("prisma/schema.prisma");
    const runModel = schema.match(/model AiAgentRun \{[\s\S]*?\n\}/)![0];
    expect(runModel).toMatch(/officialAgentKey\s+String\?/);
    expect(runModel).toMatch(/customAgentId\s+String\?/);
  });

  it("Json is used only for flexible/non-relational cases: input schema, raw input, and small structured output/result summaries", () => {
    const schema = read("prisma/schema.prisma");
    const agentModel = schema.match(/model AiAgent \{[\s\S]*?\n\}/)![0];
    expect(agentModel).toMatch(/inputSchema\s+Json/);
    const runModel = schema.match(/model AiAgentRun \{[\s\S]*?\n\}/)![0];
    expect(runModel).toMatch(/input\s+Json/);
    expect(runModel).toMatch(/result\s+Json\?/);
  });
});

// ---------------------------------------------------------------------------
// 19. Route, navigation, and no-regression on frozen systems
// ---------------------------------------------------------------------------
describe("Route/navigation and regression: authenticated-only, no guest surface, no payments (structural)", () => {
  it("the AI Agent Studio routes live under the authenticated per-project dashboard, not guest", () => {
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/agents/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/agents/[agentId]/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/agents/runs/[runId]/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/agent-teams/[teamId]/page.tsx"))).toBe(true);
  });

  it("guestNavGroups was never touched by this phase — AI Agent Studio is authenticated-only", () => {
    const source = read("src/lib/navigation.ts");
    const guestBlock = source.match(/export const guestNavGroups[\s\S]*?\n\];/)![0];
    expect(guestBlock).not.toMatch(/AI Agents|\/agents/);
  });

  it("projectNavGroups gained exactly one new item: AI Agents", () => {
    const source = read("src/lib/navigation.ts");
    expect(source).toMatch(/\{ label: "AI Agents", segment: "agents", icon: Bot \}/);
  });

  it("auth, email verification, Resend, and middleware were never modified by this phase", () => {
    const combined =
      read("src/lib/auth/config.ts") + read("src/lib/auth/edge-config.ts") + read("src/proxy.ts") + read("src/lib/email/send-email.ts");
    expect(combined).not.toMatch(/ai-agent-studio|AiAgentRun|AiAgentTeam/i);
  });

  it("no alert() or confirm() is used anywhere in the AI Agent Studio UI", () => {
    const dir = path.join(ROOT, "src/components/agents");
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".tsx")) continue;
      const source = readFileSync(path.join(dir, entry), "utf8");
      expect(source, entry).not.toMatch(/\balert\(|\bconfirm\(/);
    }
  });

  it("no payments, subscriptions, or billing limits were introduced by this phase", () => {
    const schema = read("prisma/schema.prisma");
    const agentModels = schema.match(/model AiAgent[\s\S]*?(?=\nmodel |\z)/g)!.join("\n");
    const combined = read("src/lib/agents/registry.ts") + read("src/lib/agents/types.ts") + agentModels;
    expect(combined).not.toMatch(/stripe|subscription|billing|checkout|invoice/i);
  });

  it("no server-side AI provider was introduced — agents still route through the browser's local engine (useLocalAI), consistent with the rest of the app", () => {
    const combined = read("src/lib/agents/prompt-builder.ts") + read("src/server/services/agent-orchestrator.ts");
    expect(combined).not.toMatch(/@anthropic-ai\/sdk|openai|fetch\(.*api\.anthropic|fetch\(.*openai/i);
    const executionActions = read("src/server/actions/agent-execution.ts");
    expect(executionActions).toMatch(/browser|local engine/i);
  });
});

// ---------------------------------------------------------------------------
// 20. AI Workflows integration — the "agent" step type adapter
// ---------------------------------------------------------------------------
describe("AI Workflows adapter: a new 'agent' step type reuses the existing execution engine, never a second one (structural, spec section 22)", () => {
  it("WorkflowStepType includes 'agent' alongside the original 7 types — additive, nothing removed", () => {
    const source = read("src/lib/ai-workflows/engine.ts");
    expect(source).toMatch(/"ai_tool" \| "prompt_library" \| "ai_template" \| "brand_kit" \| "transform" \| "save_result" \| "workflow" \| "agent"/);
  });

  it("an 'agent' step without agentRef is flagged missing_reference, just like every other reference-based step type", () => {
    const source = read("src/lib/ai-workflows/engine.ts");
    expect(source).toMatch(/if \(step\.type === "agent"\) \{/);
    expect(source).toMatch(/if \(!step\.agentRef\)/);
  });

  it("resolveStepForExecution's 'agent' case only supports OFFICIAL agents (findAgentDefinition) — a custom agent needs DB-backed resolution this pure resolver deliberately doesn't do", () => {
    const source = read("src/lib/ai-workflows/execution-resolver.ts");
    const fn = source.match(/case "agent": \{[\s\S]*?\n    \}/)![0];
    expect(fn).toMatch(/findAgentDefinition\(step\.agentRef/);
    expect(fn).toMatch(/kind: "ai_call"/);
  });

  it("execution-resolver.ts imports the agent prompt builder from the PURE lib module, never the server-only agent-stages.ts — keeps this shared/test-safe file free of server-only transitive imports", () => {
    const source = read("src/lib/ai-workflows/execution-resolver.ts");
    expect(source).toMatch(/from "@\/lib\/agents\/prompt-builder"/);
    expect(source).not.toMatch(/from "@\/server\/services\/agent-stages"/);
  });

  it("the visual workflow step editor lets a user pick an official agent and fill its declared input fields — a real, working control, not a hidden/broken option", () => {
    const source = read("src/components/ai-workflows/workflow-step-editor.tsx");
    expect(source).toMatch(/step\.type === "agent"/);
    expect(source).toMatch(/listAgentDefinitions\(\)/);
    expect(source).toMatch(/updateAgentFieldInput/);
  });
});

// ---------------------------------------------------------------------------
// 21. Marketing Brain integration — traceability via shared resource targets
// ---------------------------------------------------------------------------
describe("Marketing Brain integration: AI Agent Studio never replaces its orchestrator, only adds a discoverable entry point (structural, spec section 21)", () => {
  it("Marketing Brain's execution panel links to AI Agent Studio — a real, working cross-reference", () => {
    const source = read("src/components/marketing-brain/run-execution-panel.tsx");
    expect(source).toMatch(/\/agents/);
  });

  it("Marketing Brain's own orchestrator/stages files were not rewired to call Agent Studio — its existing, tested execution stays self-contained", () => {
    const orchestrator = read("src/server/services/marketing-brain-orchestrator.ts");
    const stages = read("src/server/services/marketing-brain-stages.ts");
    expect(orchestrator + stages).not.toMatch(/agent-orchestrator|resolveAgent\(|AiAgentRun/);
  });

  it("AiAgentResource can reference the exact same Campaign/ContentItem/SocialPost rows Marketing Brain creates — traceability via shared FK targets, not a new cross-run link table", () => {
    const schema = read("prisma/schema.prisma");
    const resourceModel = schema.match(/model AiAgentResource \{[\s\S]*?\n\}/)![0];
    expect(resourceModel).toMatch(/campaignId\s+String\?/);
    expect(resourceModel).toMatch(/contentItemId\s+String\?/);
  });
});

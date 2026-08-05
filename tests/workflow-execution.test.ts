import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateWorkflowSteps,
  planWorkflowRun,
  applyTransform,
  type WorkflowStep,
} from "@/lib/ai-workflows/engine";
import { resolveStepForExecution, type ExecutionResourceContext } from "@/lib/ai-workflows/execution-resolver";
import {
  canTransitionRun,
  canTransitionStep,
  isRunTerminal,
  isStepTerminal,
  isNextRunnableStepIndex,
  isRetryableRunStatus,
  isValidIdempotencyKey,
} from "@/lib/ai-workflows/run-state";
import {
  WORKFLOW_EXECUTION_LIMITS,
  exceedsMaxSteps,
  exceedsStepInputLimit,
  exceedsAccumulatedLimit,
  exceedsConcurrentRunLimit,
  isRunDurationExceeded,
  truncateForPersistence,
  TRUNCATION_SUFFIX,
} from "@/lib/ai-workflows/limits";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: "step-1",
    type: "transform",
    label: "Transformar",
    outputVariable: "step1_output",
    transformKind: "uppercase",
    inputTemplate: "{{titulo}}",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Vista previa — sigue sin llamar al motor IA (regresión de la Fase 20)
// ---------------------------------------------------------------------------
describe("Vista previa (planWorkflowRun) — unaffected by real execution", () => {
  it("still produces a clearly-labeled [Simulado] output for an ai_tool step, never real text", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", type: "ai_tool", toolSlug: "youtube-titulos", outputVariable: "out", inputTemplate: "{{titulo}}" }),
    ];
    const run = planWorkflowRun(steps, { titulo: "Mi vídeo" });
    expect(run.issues).toEqual([]);
    expect(run.steps[0].simulatedOutput).toMatch(/^\[Simulado\]/);
  });

  it("still refuses to run a structurally invalid workflow (unchanged validation contract)", () => {
    const run = planWorkflowRun([step({ type: "ai_tool", toolSlug: undefined })], {});
    expect(run.steps).toEqual([]);
    expect(run.issues.length).toBeGreaterThan(0);
  });

  it("the preview engine module never imports the local AI engine, useLocalAI, or the workflow-execution actions", () => {
    const source = read("src/lib/ai-workflows/engine.ts");
    expect(source).not.toMatch(/useLocalAI|generateLocalText|workflow-execution/);
  });
});

// ---------------------------------------------------------------------------
// 2. Motor de validación extendido — herramienta real, campos obligatorios
// ---------------------------------------------------------------------------
describe("validateWorkflowSteps: real tool-existence and required-field checks", () => {
  it("accepts an ai_tool step referencing a real, existing tool with every required field filled", () => {
    const tool = findToolDefinition("youtube-titulos")!;
    const fieldInputs: Record<string, string> = {};
    for (const field of tool.fields) if (field.required) fieldInputs[field.name] = "valor";
    const issues = validateWorkflowSteps([step({ type: "ai_tool", toolSlug: "youtube-titulos", fieldInputs, inputTemplate: undefined })]);
    expect(issues).toEqual([]);
  });

  it("flags tool_not_found for a toolSlug that no longer exists in the real registry", () => {
    const issues = validateWorkflowSteps([step({ type: "ai_tool", toolSlug: "this-tool-does-not-exist" })]);
    expect(issues.some((issue) => issue.code === "tool_not_found")).toBe(true);
  });

  it("flags missing_field_input for each required field of the real tool left empty", () => {
    const issues = validateWorkflowSteps([step({ type: "ai_tool", toolSlug: "youtube-titulos", fieldInputs: {} })]);
    const missingFieldIssues = issues.filter((issue) => issue.code === "missing_field_input");
    const requiredFieldCount = findToolDefinition("youtube-titulos")!.fields.filter((f) => f.required).length;
    expect(missingFieldIssues).toHaveLength(requiredFieldCount);
  });

  it("never flags missing_field_input for optional fields left empty", () => {
    const tool = findToolDefinition("youtube-titulos")!;
    const fieldInputs: Record<string, string> = {};
    for (const field of tool.fields) if (field.required) fieldInputs[field.name] = "x";
    const issues = validateWorkflowSteps([step({ type: "ai_tool", toolSlug: "youtube-titulos", fieldInputs })]);
    expect(issues.filter((i) => i.code === "missing_field_input")).toHaveLength(0);
  });

  it("scans fieldInputs (not just inputTemplate) for forward references and unknown/circular variables", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", type: "ai_tool", toolSlug: "youtube-titulos", outputVariable: "out1", fieldInputs: { tema: "{{out2}}", idioma: "es", tono: "x", cantidad: "3" } }),
      step({ id: "s2", type: "transform", outputVariable: "out2", inputTemplate: "{{titulo}}" }),
    ];
    const issues = validateWorkflowSteps(steps);
    expect(issues.some((issue) => issue.code === "forward_reference")).toBe(true);
  });

  it("requires transformValue for 'replace' and 'extract_section' transform kinds", () => {
    expect(validateWorkflowSteps([step({ transformKind: "replace", transformValue: undefined })]).some((i) => i.code === "missing_reference")).toBe(true);
    expect(validateWorkflowSteps([step({ transformKind: "extract_section", transformValue: undefined })]).some((i) => i.code === "missing_reference")).toBe(true);
    expect(validateWorkflowSteps([step({ transformKind: "replace", transformValue: "buscar" })]).some((i) => i.code === "missing_reference")).toBe(false);
  });

  it("YOUTUBE_TOOLS is untouched by this phase — same 8 tools as every prior phase verified", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// 3. applyTransform — nuevas transformaciones deterministas
// ---------------------------------------------------------------------------
describe("applyTransform: new deterministic transform kinds", () => {
  it("replace: literal substring replacement only — never a regex from user text", () => {
    expect(applyTransform("hola mundo", "replace", "mundo", "planeta")).toBe("hola planeta");
    // A string containing regex metacharacters is treated literally, not as a pattern.
    expect(applyTransform("precio: $5.00", "replace", "$5.00", "$10.00")).toBe("precio: $10.00");
  });

  it("combine: pure pass-through — the actual combination already happened via {{var}} interpolation in inputTemplate", () => {
    expect(applyTransform("paso1 + paso2", "combine", undefined, undefined)).toBe("paso1 + paso2");
  });

  it("extract_section: extracts the matching heading's content up to the next same/higher-level heading", () => {
    const text = "# Intro\nHola\n\n## Sección A\nContenido A\n\n## Sección B\nContenido B\n";
    expect(applyTransform(text, "extract_section", "Sección A", undefined)).toBe("## Sección A\nContenido A");
  });

  it("extract_section: returns the original text unchanged when the heading doesn't exist ('cuando exista')", () => {
    const text = "# Solo esto\nContenido";
    expect(applyTransform(text, "extract_section", "No existe", undefined)).toBe(text);
  });

  it("extract_section: is case-insensitive and matches exact heading text, never a regex built from it", () => {
    const text = "## Mi Título\nTexto";
    expect(applyTransform(text, "extract_section", "mi título", undefined)).toBe("## Mi Título\nTexto");
  });

  it("no transform kind ever calls eval or the Function constructor", () => {
    const engineSource = read("src/lib/ai-workflows/engine.ts");
    expect(engineSource).not.toMatch(/\beval\(/);
    expect(engineSource).not.toMatch(/new Function\(/);
  });
});

// ---------------------------------------------------------------------------
// 4. Motor de resolución real (execution-resolver) — sin base de datos
// ---------------------------------------------------------------------------
describe("resolveStepForExecution: real, unmocked resolution logic", () => {
  const emptyResources: ExecutionResourceContext = { brandContext: "Marca: Acme" };

  it("ai_tool: builds the EXACT system/user prompt the real AiToolDefinition would produce — never a fabricated one", () => {
    const tool = findToolDefinition("youtube-titulos")!;
    const s = step({
      type: "ai_tool",
      toolSlug: "youtube-titulos",
      fieldInputs: { tema: "{{tema}}", idioma: "es", tono: "Cercano", cantidad: "3" },
    });
    const resolution = resolveStepForExecution(s, { tema: "Cámaras vintage" }, emptyResources);
    expect(resolution.kind).toBe("ai_call");
    if (resolution.kind !== "ai_call") throw new Error("expected ai_call");

    const expectedSystem = tool.buildSystemPrompt("Marca: Acme");
    const expectedUser = tool.buildUserPrompt({ tema: "Cámaras vintage", idioma: "es", tono: "Cercano", cantidad: "3" });
    expect(resolution.systemPrompt).toBe(expectedSystem);
    expect(resolution.userPrompt).toBe(expectedUser);
  });

  it("ai_tool: errors when the referenced tool no longer exists", () => {
    const resolution = resolveStepForExecution(step({ type: "ai_tool", toolSlug: "ghost-tool" }), {}, emptyResources);
    expect(resolution.kind).toBe("error");
  });

  it("ai_tool: errors when a required field resolves empty — never sends an incomplete prompt to buildUserPrompt", () => {
    const resolution = resolveStepForExecution(
      step({ type: "ai_tool", toolSlug: "youtube-titulos", fieldInputs: { idioma: "es", tono: "x", cantidad: "3" } }),
      {},
      emptyResources
    );
    expect(resolution.kind).toBe("error");
  });

  it("prompt_library: substitutes variables into the prompt's own content, no AI call", () => {
    const resolution = resolveStepForExecution(
      step({ type: "prompt_library", promptId: "p1", inputTemplate: undefined }),
      { producto: "Cámara" },
      { ...emptyResources, promptContent: "Escribe sobre {{producto}}" }
    );
    expect(resolution).toEqual({ kind: "resolved", output: "Escribe sobre Cámara", resolvedInputSummary: "Escribe sobre Cámara" });
  });

  it("prompt_library: appends the Brand Kit context only when useBrandKit is true", () => {
    const withFlag = resolveStepForExecution(
      step({ type: "prompt_library", promptId: "p1" }),
      {},
      { ...emptyResources, promptContent: "Texto", promptUseBrandKit: true, brandProfileContext: "Marca: Acme, tono cercano" }
    );
    expect(withFlag.kind).toBe("resolved");
    if (withFlag.kind === "resolved") expect(withFlag.output).toBe("Texto\n\nMarca: Acme, tono cercano");

    const withoutFlag = resolveStepForExecution(
      step({ type: "prompt_library", promptId: "p1" }),
      {},
      { ...emptyResources, promptContent: "Texto", promptUseBrandKit: false, brandProfileContext: "Marca: Acme" }
    );
    expect(withoutFlag.kind).toBe("resolved");
    if (withoutFlag.kind === "resolved") expect(withoutFlag.output).toBe("Texto");
  });

  it("prompt_library: errors when the prompt resource wasn't resolved (never silently proceeds)", () => {
    const resolution = resolveStepForExecution(step({ type: "prompt_library", promptId: "p1" }), {}, emptyResources);
    expect(resolution.kind).toBe("error");
  });

  it("ai_template: merges Brand Kit auto-fill variables with explicit workflow variables — explicit ones win", () => {
    const resolution = resolveStepForExecution(
      step({ type: "ai_template", templateId: "t1", inputTemplate: undefined }),
      { brand_name: "Nombre explícito" },
      { ...emptyResources, templateContent: "{{brand_name}} dice {{brand_tone}}", templateBrandVariables: { brand_name: "Nombre de marca", brand_tone: "cercano" } }
    );
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind === "resolved") expect(resolution.output).toBe("Nombre explícito dice cercano");
  });

  it("ai_template: reports missing variables before continuing — never renders with a silently-blank {{var}}", () => {
    const resolution = resolveStepForExecution(
      step({ type: "ai_template", templateId: "t1" }),
      {},
      { ...emptyResources, templateContent: "{{missing_var}}", templateBrandVariables: {} }
    );
    expect(resolution.kind).toBe("error");
  });

  it("brand_kit: returns the already-resolved BrandProfile context verbatim, via the shared constructor only", () => {
    const resolution = resolveStepForExecution(
      step({ type: "brand_kit", brandProfileId: "default" }),
      {},
      { ...emptyResources, brandProfileContext: "Marca activa: Acme" }
    );
    expect(resolution).toEqual({ kind: "resolved", output: "Marca activa: Acme", resolvedInputSummary: "Marca activa: Acme" });
  });

  it("brand_kit: errors when no Brand Kit could be resolved (no default, no ownership)", () => {
    const resolution = resolveStepForExecution(step({ type: "brand_kit" }), {}, emptyResources);
    expect(resolution.kind).toBe("error");
  });

  it("transform: applies the real applyTransform and reuses it — never a second implementation", () => {
    const resolution = resolveStepForExecution(
      step({ type: "transform", transformKind: "uppercase", inputTemplate: "{{titulo}}" }),
      { titulo: "hola" },
      emptyResources
    );
    expect(resolution).toEqual({ kind: "resolved", output: "HOLA", resolvedInputSummary: "hola" });
  });

  it("save_result: passes the resolved input through unchanged", () => {
    const resolution = resolveStepForExecution(step({ type: "save_result", inputTemplate: "{{titulo}}" }), { titulo: "Listo" }, emptyResources);
    expect(resolution).toEqual({ kind: "resolved", output: "Listo", resolvedInputSummary: "Listo" });
  });

  it("this module never imports Prisma or any database client — pure given already-fetched resources", () => {
    const source = read("src/lib/ai-workflows/execution-resolver.ts");
    expect(source).not.toMatch(/from ["']@\/lib\/db\/prisma["']/);
    expect(source).not.toMatch(/"use server"/);
  });
});

// ---------------------------------------------------------------------------
// 5. Estados de ejecución — máquina de estados pura
// ---------------------------------------------------------------------------
describe("run-state: server-verified status transitions", () => {
  it("valid WorkflowRun transitions", () => {
    expect(canTransitionRun("PENDING", "VALIDATING")).toBe(true);
    expect(canTransitionRun("VALIDATING", "RUNNING")).toBe(true);
    expect(canTransitionRun("RUNNING", "COMPLETED")).toBe(true);
    expect(canTransitionRun("RUNNING", "FAILED")).toBe(true);
    expect(canTransitionRun("RUNNING", "CANCELLED")).toBe(true);
  });

  it("invalid WorkflowRun transitions are rejected, including from every terminal status", () => {
    expect(canTransitionRun("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransitionRun("FAILED", "RUNNING")).toBe(false);
    expect(canTransitionRun("CANCELLED", "RUNNING")).toBe(false);
    expect(canTransitionRun("PENDING", "COMPLETED")).toBe(false);
  });

  it("isRunTerminal is true only for COMPLETED/FAILED/CANCELLED", () => {
    expect(isRunTerminal("COMPLETED")).toBe(true);
    expect(isRunTerminal("FAILED")).toBe(true);
    expect(isRunTerminal("CANCELLED")).toBe(true);
    expect(isRunTerminal("PENDING")).toBe(false);
    expect(isRunTerminal("RUNNING")).toBe(false);
  });

  it("valid/invalid WorkflowStepRun transitions", () => {
    expect(canTransitionStep("PENDING", "RUNNING")).toBe(true);
    expect(canTransitionStep("RUNNING", "COMPLETED")).toBe(true);
    expect(canTransitionStep("RUNNING", "FAILED")).toBe(true);
    expect(canTransitionStep("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransitionStep("SKIPPED", "RUNNING")).toBe(false);
  });

  it("isStepTerminal is true for COMPLETED/FAILED/SKIPPED/CANCELLED", () => {
    for (const status of ["COMPLETED", "FAILED", "SKIPPED", "CANCELLED"] as const) expect(isStepTerminal(status)).toBe(true);
    expect(isStepTerminal("PENDING")).toBe(false);
    expect(isStepTerminal("RUNNING")).toBe(false);
  });

  it("isNextRunnableStepIndex enforces strict sequential order — no future-step references", () => {
    const statuses = ["COMPLETED", "PENDING", "PENDING"] as const;
    expect(isNextRunnableStepIndex("RUNNING", [...statuses], 1)).toBe(true);
    expect(isNextRunnableStepIndex("RUNNING", [...statuses], 2)).toBe(false); // skipping ahead is rejected
    expect(isNextRunnableStepIndex("RUNNING", [...statuses], 0)).toBe(false); // already completed
  });

  it("isNextRunnableStepIndex refuses to start any step once the run itself isn't RUNNING", () => {
    const statuses = ["PENDING", "PENDING"] as const;
    expect(isNextRunnableStepIndex("CANCELLED", [...statuses], 0)).toBe(false);
    expect(isNextRunnableStepIndex("FAILED", [...statuses], 0)).toBe(false);
    expect(isNextRunnableStepIndex("COMPLETED", [...statuses], 0)).toBe(false);
  });

  it("isRetryableRunStatus is true only for FAILED/CANCELLED", () => {
    expect(isRetryableRunStatus("FAILED")).toBe(true);
    expect(isRetryableRunStatus("CANCELLED")).toBe(true);
    expect(isRetryableRunStatus("COMPLETED")).toBe(false);
    expect(isRetryableRunStatus("RUNNING")).toBe(false);
  });

  it("isValidIdempotencyKey accepts opaque token shapes and rejects garbage", () => {
    expect(isValidIdempotencyKey("a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c")).toBe(true); // uuid
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("has spaces in it 12345678")).toBe(false);
    expect(isValidIdempotencyKey("<script>alert(1)</script>")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Límites de seguridad — funciones puras con valores reales
// ---------------------------------------------------------------------------
describe("Execution limits: real boundary behavior", () => {
  it("exceedsMaxSteps is a strict boundary at MAX_STEPS_PER_RUN", () => {
    expect(exceedsMaxSteps(WORKFLOW_EXECUTION_LIMITS.MAX_STEPS_PER_RUN)).toBe(false);
    expect(exceedsMaxSteps(WORKFLOW_EXECUTION_LIMITS.MAX_STEPS_PER_RUN + 1)).toBe(true);
  });

  it("exceedsStepInputLimit is a strict boundary at MAX_STEP_INPUT_CHARS", () => {
    expect(exceedsStepInputLimit("a".repeat(WORKFLOW_EXECUTION_LIMITS.MAX_STEP_INPUT_CHARS))).toBe(false);
    expect(exceedsStepInputLimit("a".repeat(WORKFLOW_EXECUTION_LIMITS.MAX_STEP_INPUT_CHARS + 1))).toBe(true);
  });

  it("exceedsAccumulatedLimit sums what's already used plus the next chunk", () => {
    const limit = WORKFLOW_EXECUTION_LIMITS.MAX_ACCUMULATED_CHARS;
    expect(exceedsAccumulatedLimit(limit - 10, "a".repeat(10))).toBe(false);
    expect(exceedsAccumulatedLimit(limit - 10, "a".repeat(11))).toBe(true);
  });

  it("exceedsConcurrentRunLimit rejects at and beyond MAX_CONCURRENT_RUNS_PER_USER", () => {
    const limit = WORKFLOW_EXECUTION_LIMITS.MAX_CONCURRENT_RUNS_PER_USER;
    expect(exceedsConcurrentRunLimit(limit - 1)).toBe(false);
    expect(exceedsConcurrentRunLimit(limit)).toBe(true);
  });

  it("isRunDurationExceeded compares real Date math against MAX_RUN_DURATION_MS, never trusting a client-supplied elapsed time", () => {
    const startedAt = new Date("2026-01-01T00:00:00Z");
    const withinLimit = new Date(startedAt.getTime() + WORKFLOW_EXECUTION_LIMITS.MAX_RUN_DURATION_MS - 1000);
    const overLimit = new Date(startedAt.getTime() + WORKFLOW_EXECUTION_LIMITS.MAX_RUN_DURATION_MS + 1000);
    expect(isRunDurationExceeded(startedAt, withinLimit)).toBe(false);
    expect(isRunDurationExceeded(startedAt, overLimit)).toBe(true);
  });

  it("truncateForPersistence leaves short text untouched and truncates long text with a visible marker", () => {
    const short = "texto breve";
    expect(truncateForPersistence(short)).toBe(short);

    const long = "a".repeat(WORKFLOW_EXECUTION_LIMITS.MAX_RESULT_CHARS + 500);
    const truncated = truncateForPersistence(long);
    expect(truncated.length).toBe(WORKFLOW_EXECUTION_LIMITS.MAX_RESULT_CHARS + TRUNCATION_SUFFIX.length);
    expect(truncated.endsWith(TRUNCATION_SUFFIX)).toBe(true);
  });

  it("limits are centralized in one exported constant object, never scattered magic numbers", () => {
    const actionsSource = read("src/server/actions/workflow-execution.ts");
    expect(actionsSource).toMatch(/from "@\/lib\/ai-workflows\/limits"/);
    expect(actionsSource).not.toMatch(/MAX_STEPS_PER_RUN\s*=\s*\d/); // never redefined locally
  });
});

// ---------------------------------------------------------------------------
// 7. Seguridad — aislamiento, propiedad, workflow inactivo (inspección precisa del código real)
// ---------------------------------------------------------------------------
describe("Security: real execution enforces isolation, ownership, and active-workflow checks", () => {
  const actions = read("src/server/actions/workflow-execution.ts");

  it("startWorkflowRunAction requires project access, and beginFreshRun (which it calls) rejects an archived/inactive workflow and re-validates steps before ever touching the database", () => {
    const startFn = actions.match(/export async function startWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(startFn).toMatch(/requireProjectAccess\(input\.projectId, "VIEWER"\)/);
    expect(startFn).toMatch(/beginFreshRun\(/);
    expect(startFn).toMatch(/mode: "published",/);
    const beginFn = actions.match(/async function beginFreshRun[\s\S]*?\n(?=export interface StartWorkflowRunInput)/)![0];
    expect(beginFn).toMatch(/if \(workflow\.status === "ARCHIVED"\) return \{ error:/);
    expect(beginFn).toMatch(/if \(!workflow\.isActive\) return \{ error:/);
    expect(beginFn).toMatch(/validateWorkflowSteps\(steps\)/);
    expect(beginFn).toMatch(/exceedsConcurrentRunLimit\(activeRuns\)/);
  });

  it("beginFreshRun refuses a 'published' execution when the workflow has never been published, and never silently falls back to the draft", () => {
    const beginFn = actions.match(/async function beginFreshRun[\s\S]*?\n(?=export interface StartWorkflowRunInput)/)![0];
    expect(beginFn).toMatch(/if \(!workflow\.activeRevisionId\)/);
    expect(beginFn).toMatch(/todavía no tiene ninguna versión publicada/);
  });

  it("testDraftWorkflowRunAction exists and always uses mode: 'draft_test' with executionMode 'DRAFT_TEST' — a distinct action from the real 'Ejecutar workflow' path", () => {
    const fn = actions.match(/export async function testDraftWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/mode: "draft_test",/);
    expect(fn).toMatch(/executionMode: "DRAFT_TEST",/);
  });

  it("prepareWorkflowStepAction re-verifies the session, then delegates to prepareWorkflowStepCore (also reused by Automation Center) which re-checks project match, sequential order, and the max-duration ceiling — all server-side", () => {
    const wrapper = actions.match(/export async function prepareWorkflowStepAction[\s\S]*?\n\}/)![0];
    expect(wrapper).toMatch(/requireProjectAccess\(input\.projectId, "VIEWER"\)/);
    expect(wrapper).toMatch(/return prepareWorkflowStepCore\(user\.id, input\);/);

    const core = actions.match(/export async function prepareWorkflowStepCore[\s\S]*?\n(?=export )/)![0];
    expect(core).toMatch(/run\.projectId !== input\.projectId/);
    expect(core).toMatch(/isRunDurationExceeded\(/);
    expect(core).toMatch(/isNextRunnableStepIndex\(/);
  });

  it("buildResourcesForStep (shared in workflow-resources.ts, reused by execution AND publish-time validation) rejects a Prompt Library prompt or AI Template that belongs to a different project ('acceso al proyecto cuando corresponda')", () => {
    const resources = read("src/server/services/workflow-resources.ts");
    const fn = resources.match(/export async function buildResourcesForStep[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prompt\.projectId && prompt\.projectId !== projectId/);
    expect(fn).toMatch(/template\.projectId && template\.projectId !== projectId/);
    // And the execution actions import that exact shared implementation — never a second, local copy.
    expect(actions).toMatch(/import \{ buildAiToolBrandContext, buildResourcesForStep, buildWorkflowSnapshot \} from "@\/server\/services\/workflow-resources"/);
    expect(actions).not.toMatch(/async function buildResourcesForStep/);
  });

  it("every resource lookup reuses the existing ownership-checked getters — never a raw prisma.findUnique bypassing ownership", () => {
    const resources = read("src/server/services/workflow-resources.ts");
    expect(resources).toMatch(/import \{ getSavedPromptForUser \} from "@\/server\/services\/prompt-library"/);
    expect(resources).toMatch(/import \{ getAiTemplateForUser \} from "@\/server\/services\/ai-templates"/);
    expect(resources).toMatch(/import \{ getDefaultBrandProfileForUser, getBrandProfileForUser \} from "@\/server\/services\/brand-profiles"/);
  });

  it("no action ever trusts a client-supplied userId, status, or resolved variable map", () => {
    expect(actions).not.toMatch(/userId:\s*input\./);
    expect(actions).not.toMatch(/status:\s*input\./);
    expect(actions).not.toMatch(/resolvedVariables\s*=\s*input\./);
  });

  it("completeWorkflowStepAction only accepts a result for a step that is genuinely RUNNING — never completes an already-finished or not-yet-started step", () => {
    const fn = actions.match(/export async function completeWorkflowStepAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/stepRow\.status !== "RUNNING"/);
  });

  it("getWorkflowRunForUser / getWorkflowForUser both resolve 'not mine' and 'doesn't exist' to the same null — no cross-user existence leak", () => {
    expect(read("src/server/services/workflow-runs.ts")).toMatch(/if \(!run \|\| run\.userId !== userId\) return null;/);
    expect(read("src/server/services/ai-workflows.ts")).toMatch(/if \(!row \|\| row\.userId !== userId\) return null;/);
  });
});

// ---------------------------------------------------------------------------
// 8. Idempotencia
// ---------------------------------------------------------------------------
describe("Idempotency: DB-backed, one key = one run", () => {
  it("startWorkflowRunAction funnels through createRunFromSnapshot, which upserts on the (userId, idempotencyKey) unique constraint — the DB itself prevents a duplicate", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const startFn = actions.match(/export async function startWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(startFn).toMatch(/beginFreshRun\(/);
    const createFn = actions.match(/async function createRunFromSnapshot[\s\S]*?\n(?=\/\*\*[\s\S]*?export async function beginFreshRun)/)![0];
    expect(createFn).toMatch(/prisma\.workflowRun\.upsert\(/);
    expect(createFn).toMatch(/where: \{ userId_idempotencyKey: \{ userId: params\.userId, idempotencyKey: params\.idempotencyKey \} \}/);
    expect(createFn).toMatch(/update: \{\}/); // a replay never mutates the existing run
  });

  it("the schema enforces this at the database level with a real unique index, not just application logic", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowRun \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[userId, idempotencyKey\]\)/);
  });

  it("a run created for one workflow is refused if replayed with the same key against a different workflow", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/async function createRunFromSnapshot[\s\S]*?\n(?=\/\*\*[\s\S]*?export async function beginFreshRun)/)![0];
    expect(fn).toMatch(/if \(created\.workflowId !== params\.workflowId\) \{/);
  });

  it("distinct idempotency keys are free to create distinct runs — isValidIdempotencyKey doesn't dedupe by content, only shape", () => {
    expect(isValidIdempotencyKey("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isValidIdempotencyKey("22222222-2222-2222-2222-222222222222")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Cancelación
// ---------------------------------------------------------------------------
describe("Cancellation", () => {
  const actions = read("src/server/actions/workflow-execution.ts");

  it("cancelWorkflowRunAction delegates to the real, reusable cancelWorkflowRunCore (also reused by Automation Center) after resolving the session", () => {
    const wrapper = actions.match(/export async function cancelWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(wrapper).toMatch(/requireProjectAccess\(projectId, "VIEWER"\)/);
    expect(wrapper).toMatch(/return cancelWorkflowRunCore\(user\.id, projectId, runId\);/);
  });

  it("cancelWorkflowRunCore verifies ownership and is a no-op (not an error) on an already-terminal run", () => {
    const fn = actions.match(/export async function cancelWorkflowRunCore[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getWorkflowRunForUser\(runId, userId\)/);
    expect(fn).toMatch(/if \(isRunTerminal\(run\.status\)\) return \{\};/);
  });

  it("cancellation marks the run CANCELLED (and releases its lease), the currently-RUNNING step CANCELLED (the local engine really can abort it), and every PENDING step CANCELLED — completed steps are never touched", () => {
    const fn = actions.match(/export async function cancelWorkflowRunCore[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: "CANCELLED",\s*\n\s*cancelledAt: now,\s*\n\s*completedAt: now,/);
    expect(fn).toMatch(/leaseId: null,/);
    expect(fn).toMatch(/where: \{ workflowRunId: run\.id, status: "RUNNING" \}/);
    expect(fn).toMatch(/where: \{ workflowRunId: run\.id, status: "PENDING" \}/);
    expect(fn).not.toMatch(/status: "COMPLETED"[\s\S]{0,80}data: \{ status: "CANCELLED"/);
  });

  it("once CANCELLED, isNextRunnableStepIndex refuses every further step — the client loop cannot start a new one even if it tries", () => {
    expect(isNextRunnableStepIndex("CANCELLED", ["COMPLETED", "PENDING"], 1)).toBe(false);
  });

  it("the client orchestrator calls ai.cancel() (the real local-engine abort) in addition to the server action — an honest cancellation, not a false claim", () => {
    const panel = read("src/components/ai-workflows/workflow-execution-panel.tsx");
    expect(panel).toMatch(/ai\.cancel\(\)/);
    expect(panel).toMatch(/cancelWorkflowRunAction\(/);
  });
});

// ---------------------------------------------------------------------------
// 10. Reintentos
// ---------------------------------------------------------------------------
describe("Retry", () => {
  it("retryWorkflowRunAction only accepts a FAILED or CANCELLED run, and always requires a fresh idempotency key from the caller", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function retryWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/isRetryableRunStatus\(original\.status\)/);
    expect(fn).toMatch(/idempotencyKey: input\.idempotencyKey/);
  });

  it("retry creates a brand-new run (via beginFreshRun or createRunFromSnapshot, both of which upsert a NEW WorkflowRun keyed by the fresh idempotency key) — it never mutates or replays the original row in place", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function retryWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/beginFreshRun\(/);
    expect(fn).toMatch(/createRunFromSnapshot\(/);
    expect(fn).not.toMatch(/prisma\.workflowRun\.update\(\{ where: \{ id: input\.runId/);
    expect(fn).not.toMatch(/prisma\.workflowRun\.update\(\{ where: \{ id: original\.id/);
  });

  it("retry supports both replaying the original frozen snapshot (default) and an explicit opt-in to the Workflow's current version", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function retryWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/input\.useCurrentVersion/);
    expect(fn).toMatch(/executionMode: "RETRY_ORIGINAL_SNAPSHOT"/);
    expect(fn).toMatch(/executionMode: "RETRY_CURRENT_VERSION"/);
  });

  it("the client generates a new idempotency key on every retry click — never reuses the failed run's key", () => {
    const panel = read("src/components/ai-workflows/workflow-execution-panel.tsx");
    const retryFn = panel.match(/async function handleRetry\(useCurrentVersion[\s\S]*?\n  \}/)![0];
    expect(retryFn).toMatch(/idempotencyKeyRef\.current = newIdempotencyKey\(\);/);
  });
});

// ---------------------------------------------------------------------------
// 11. Persistencia — modelos, migración
// ---------------------------------------------------------------------------
describe("Persistence: WorkflowRun / WorkflowStepRun models and migration", () => {
  it("WorkflowRun has every field the spec requires", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowRun \{[\s\S]*?\n\}/)![0];
    for (const field of [
      "workflowId",
      "userId",
      "projectId",
      "status",
      "inputVariables",
      "finalOutput",
      "errorMessage",
      "startedAt",
      "completedAt",
      "cancelledAt",
      "createdAt",
      "updatedAt",
    ]) {
      expect(model).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("WorkflowStepRun has every field the spec requires", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowStepRun \{[\s\S]*?\n\}/)![0];
    for (const field of [
      "workflowRunId",
      "stepId",
      "stepIndex",
      "stepType",
      "status",
      "resolvedInput",
      "output",
      "errorMessage",
      "startedAt",
      "completedAt",
      "createdAt",
      "updatedAt",
    ]) {
      expect(model).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("WorkflowRunStatus and WorkflowStepRunStatus enums match exactly the states in the spec", () => {
    const schema = read("prisma/schema.prisma");
    const runEnum = schema.match(/enum WorkflowRunStatus \{[\s\S]*?\n\}/)![0];
    const stepEnum = schema.match(/enum WorkflowStepRunStatus \{[\s\S]*?\n\}/)![0];
    for (const status of ["PENDING", "VALIDATING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]) expect(runEnum).toMatch(status);
    for (const status of ["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED", "CANCELLED"]) expect(stepEnum).toMatch(status);
  });

  it("a single, additive migration exists — only CREATE TABLE/CREATE ENUM, no DROP, no destructive ALTER on any pre-existing table", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    const newMigration = migrationDirs.find((name) => name.endsWith("add_workflow_run"));
    expect(newMigration).toBeDefined();

    const sql = read(`prisma/migrations/${newMigration}/migration.sql`);
    expect(sql).toMatch(/CREATE TABLE "WorkflowRun"/);
    expect(sql).toMatch(/CREATE TABLE "WorkflowStepRun"/);
    expect(sql).toMatch(/CREATE TYPE "WorkflowRunStatus"/);
    expect(sql).toMatch(/CREATE TYPE "WorkflowStepRunStatus"/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/DROP COLUMN/);
    expect(sql).not.toMatch(/ALTER TABLE "(?!WorkflowRun|WorkflowStepRun)/);
  });

  it("every prior migration is still present — nothing was removed or renamed", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    for (const prior of [
      "20260723184900_remove_anthropic_ai_result_guest_rate_limit",
      "20260723193054_initial_schema",
      "20260723204536_add_guest_rate_limit",
      "20260724120000_add_ai_center_tool_interactions",
      "20260724130000_add_content_item_source_tool",
      "20260724140000_add_saved_prompt_library",
      "20260724150000_add_ai_templates",
      "20260724160000_add_brand_profile",
      "20260724170000_add_workflow",
    ]) {
      expect(migrationDirs).toContain(prior);
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Workspace — resultados reales, sin duplicar el sistema
// ---------------------------------------------------------------------------
describe("Workspace integration: real results reuse ContentItem, no second content system", () => {
  const actions = read("src/server/actions/workflow-execution.ts");

  it("saveWorkflowRunResultToWorkspaceAction creates a ContentItem — never a bespoke table", () => {
    const fn = actions.match(/export async function saveWorkflowRunResultToWorkspaceAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.contentItem\.create/);
  });

  it("real results are tagged distinctly from Phase 20's simulated-plan save ('workflow-run:' vs 'workflow:') — Identificable as real", () => {
    const fn = actions.match(/export async function saveWorkflowRunResultToWorkspaceAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/`workflow-run:\$\{run\.workflowId\}:\$\{run\.id\}/);

    const phase20Fn = read("src/server/actions/ai-workflows.ts").match(/export async function saveWorkflowExecutionAction[\s\S]*?\n\}/)![0];
    expect(phase20Fn).toMatch(/`workflow:\$\{workflow\.id\}`/);
  });

  it("can save either the run's final output or one specific step's own output, never both conflated", () => {
    const fn = actions.match(/export async function saveWorkflowRunResultToWorkspaceAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/input\.stepIndex !== undefined/);
    expect(fn).toMatch(/run\.finalOutput/);
  });

  it("no new ContentItem-like model or table was introduced — Workspace's own schema is untouched", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).not.toMatch(/model WorkflowResult /);
    expect(schema).not.toMatch(/model WorkflowContentItem /);
  });

  it("Phase 20's saveWorkflowExecutionAction (simulated-plan save) is completely untouched by this phase", () => {
    const source = read("src/server/actions/ai-workflows.ts");
    // \b avoids a false match inside "planWorkflowRun" — a real reference to
    // the new model/module names always has a non-word char before it.
    expect(source).not.toMatch(/\bWorkflowRun\b|\bWorkflowStepRun\b|workflow-execution/);
  });
});

// ---------------------------------------------------------------------------
// 13. Regresiones — nada existente se rompió
// ---------------------------------------------------------------------------
describe("Regressions: every prior system keeps working, untouched", () => {
  it("chat-panel.tsx (Orquestador) and intent-router.ts were NOT modified — no reference to real execution inside either", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    for (const forbidden of [/WorkflowRun/, /startWorkflowRunAction/, /workflow-execution/]) {
      expect(panel).not.toMatch(forbidden);
      expect(router).not.toMatch(forbidden);
    }
    expect(panel).toMatch(/buildIntentClassifierSystemPrompt/);
    expect(router).toMatch(/export function listRoutableTools/);
  });

  it("Chat IA's own workflow context (Phase 19/20) is untouched, and still never auto-starts a real, quota-consuming execution", () => {
    const chatPage = read("src/app/(dashboard)/dashboard/[projectId]/chat/[conversationId]/page.tsx");
    expect(chatPage).toMatch(/buildWorkflowsAssistantContext\(workflows\)/);
    expect(chatPage).not.toMatch(/startWorkflowRunAction|workflow-execution/);
  });

  it("AI Center's shared AiGenerationForm was not modified by this phase", () => {
    expect(read("src/components/ai-center/generation/ai-generation-form.tsx")).not.toMatch(/WorkflowRun|workflow-execution/);
  });

  it("Prompt Library, AI Templates, and Brand Kit core services/actions were not modified beyond what real execution reuses read-only", () => {
    for (const relativePath of [
      "src/server/actions/prompt-library.ts",
      "src/server/actions/ai-templates.ts",
      "src/server/actions/brand-profiles.ts",
    ]) {
      expect(read(relativePath)).not.toMatch(/WorkflowRun|WorkflowStepRun/);
    }
  });

  it("the local AI engine (src/lib/ai/local/engine.ts) is completely unmodified — still client-only, still the one export used everywhere", () => {
    const engine = read("src/lib/ai/local/engine.ts");
    expect(engine).toMatch(/import "client-only";/);
    expect(engine).toMatch(/export async function generateLocalText/);
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/server-engine.ts"))).toBe(false);
  });

  it("no second tool registry or duplicated AiToolDefinition list exists — execution-resolver imports the one real registry", () => {
    const resolver = read("src/lib/ai-workflows/execution-resolver.ts");
    expect(resolver).toMatch(/import \{ findToolDefinition \} from "@\/lib\/ai-center\/tools\/registry"/);
    expect(resolver).not.toMatch(/export const \w*_TOOLS/);
  });

  it("Guest and Admin were not touched by this phase", () => {
    for (const relativePath of ["src/components/guest/guest-header.tsx", "src/app/admin/layout.tsx"]) {
      if (existsSync(path.join(ROOT, relativePath))) {
        expect(read(relativePath)).not.toMatch(/WorkflowRun|workflow-execution/);
      }
    }
  });
});

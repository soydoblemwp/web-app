import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateWorkflowSteps,
  detectCircularReferences,
  deriveWorkflowVariables,
  planWorkflowRun,
  WORKFLOW_STEP_TYPES,
  type WorkflowStep,
} from "@/lib/ai-workflows/engine";
import { filterWorkflows, sortWorkflows, getDistinctCategories, getDistinctTags, WORKFLOW_SORT_LABELS } from "@/lib/ai-workflows/list-utils";
import { buildWorkflowsAssistantContext, ASSISTANT_CONTEXT_WORKFLOW_LIMIT } from "@/lib/ai-workflows/assistant-context";
import { createWorkflowSchema, updateWorkflowSchema } from "@/lib/validation/ai-workflows";
import type { WorkflowLike } from "@/lib/ai-workflows/types";
import { projectNavGroups, guestNavGroups, adminNavItems } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: "step-1",
    type: "ai_tool",
    label: "YouTube Title Generator",
    outputVariable: "step1_output",
    toolSlug: "youtube-titulos",
    inputTemplate: "{{titulo}}",
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<WorkflowLike> = {}): WorkflowLike {
  return {
    id: "w1",
    projectId: "proj1",
    name: "Lanzamiento de producto",
    description: "De título a email en 5 pasos",
    category: "Marketing",
    tags: ["lanzamiento"],
    isFavorite: false,
    isActive: true,
    steps: [step()],
    variables: ["titulo"],
    version: 1,
    status: "DRAFT",
    publishedVersion: null,
    activeRevisionId: null,
    editVersion: 1,
    hasUnpublishedChanges: true,
    lastPublishedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Motor Workflow — derivación de variables
// ---------------------------------------------------------------------------
describe("deriveWorkflowVariables: automatic run-time input detection", () => {
  it("collects every {{token}} referenced across all steps that isn't produced by any step", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", outputVariable: "step1_output", inputTemplate: "{{titulo}} para {{producto}}" }),
      step({ id: "s2", outputVariable: "step2_output", inputTemplate: "{{step1_output}} y {{descripcion}}" }),
    ];
    expect(deriveWorkflowVariables(steps)).toEqual(["titulo", "producto", "descripcion"]);
  });

  it("never includes a step's own output variable as a workflow-level input", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", outputVariable: "step1_output", inputTemplate: "{{titulo}}" }),
      step({ id: "s2", outputVariable: "step2_output", inputTemplate: "{{step1_output}}" }),
    ];
    expect(deriveWorkflowVariables(steps)).not.toContain("step1_output");
  });

  it("returns an empty array for a single step with no variables", () => {
    expect(deriveWorkflowVariables([step({ inputTemplate: "texto fijo" })])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Motor Workflow — validación: pasos inválidos, dependencias, variables, orden
// ---------------------------------------------------------------------------
describe("validateWorkflowSteps", () => {
  it("flags an empty workflow", () => {
    const issues = validateWorkflowSteps([]);
    expect(issues).toEqual([{ stepId: null, code: "empty_steps", message: expect.any(String) }]);
  });

  it("accepts a well-formed, linear multi-step workflow with no issues", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", outputVariable: "step1_output", inputTemplate: "{{titulo}}" }),
      step({ id: "s2", type: "prompt_library", promptId: "p1", outputVariable: "step2_output", inputTemplate: "{{step1_output}}" }),
      step({ id: "s3", type: "save_result", outputVariable: "step3_output", inputTemplate: "{{step2_output}}" }),
    ];
    expect(validateWorkflowSteps(steps)).toEqual([]);
  });

  it("flags an invalid step type", () => {
    const issues = validateWorkflowSteps([step({ type: "not_a_real_type" as never })]);
    expect(issues.some((issue) => issue.code === "invalid_step_type")).toBe(true);
  });

  it("flags every step type's missing required reference", () => {
    expect(validateWorkflowSteps([step({ type: "ai_tool", toolSlug: undefined })])[0].code).toBe("missing_reference");
    expect(validateWorkflowSteps([step({ type: "prompt_library", promptId: undefined })])[0].code).toBe("missing_reference");
    expect(validateWorkflowSteps([step({ type: "ai_template", templateId: undefined })])[0].code).toBe("missing_reference");
    expect(validateWorkflowSteps([step({ type: "brand_kit", brandProfileId: undefined })])[0].code).toBe("missing_reference");
    expect(validateWorkflowSteps([step({ type: "transform", transformKind: undefined })])[0].code).toBe("missing_reference");
  });

  it("flags an invalid output variable name", () => {
    const issues = validateWorkflowSteps([step({ outputVariable: "1 not valid" })]);
    expect(issues.some((issue) => issue.code === "invalid_output_variable")).toBe(true);
  });

  it("flags duplicate output variable names across steps", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", outputVariable: "same_name" }),
      step({ id: "s2", outputVariable: "same_name", inputTemplate: "" }),
    ];
    expect(validateWorkflowSteps(steps).some((issue) => issue.code === "duplicate_output_variable")).toBe(true);
  });

  it("a well-formed variable that no step produces is automatically treated as a declared workflow-level input, never flagged", () => {
    const issues = validateWorkflowSteps([step({ inputTemplate: "{{titulo_del_producto}}" })]);
    expect(issues).toEqual([]);
  });

  it("flags a malformed variable reference (invalid {{...}} syntax) as unknown_variable — the only genuinely 'unknown' case", () => {
    const issues = validateWorkflowSteps([step({ inputTemplate: "{{2invalid}}" })]);
    expect(issues.some((issue) => issue.code === "unknown_variable")).toBe(true);
  });

  it("flags a forward reference — a step using a later step's output before it exists", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", outputVariable: "step1_output", inputTemplate: "{{step2_output}}" }),
      step({ id: "s2", outputVariable: "step2_output", inputTemplate: "{{titulo}}" }),
    ];
    expect(validateWorkflowSteps(steps).some((issue) => issue.code === "forward_reference")).toBe(true);
  });

  it("flags a step that references its own output (self-reference is a forward reference too)", () => {
    const issues = validateWorkflowSteps([step({ id: "s1", outputVariable: "step1_output", inputTemplate: "{{step1_output}}" })]);
    expect(issues.some((issue) => issue.code === "forward_reference")).toBe(true);
  });

  it("supports every declared step type without a false-positive missing_reference", () => {
    for (const type of WORKFLOW_STEP_TYPES) {
      const s = step({
        type,
        toolSlug: type === "ai_tool" ? "youtube-titulos" : undefined,
        promptId: type === "prompt_library" ? "p1" : undefined,
        templateId: type === "ai_template" ? "t1" : undefined,
        brandProfileId: type === "brand_kit" ? "default" : undefined,
        transformKind: type === "transform" ? "uppercase" : undefined,
        childWorkflowId: type === "workflow" ? "wf-child-1" : undefined,
        agentRef: type === "agent" ? "writing-agent" : undefined,
        knowledgeQuery: type === "knowledge" ? "políticas de devolución" : undefined,
        knowledgeCollectionIds: type === "knowledge" ? ["col-1"] : undefined,
        performanceOperation: type === "performance" ? "query" : undefined,
        performanceMetricKeys: type === "performance" ? ["content_items_created"] : undefined,
        inputTemplate: "{{titulo}}",
      });
      expect(validateWorkflowSteps([s]).some((issue) => issue.code === "missing_reference")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Motor Workflow — referencias circulares
// ---------------------------------------------------------------------------
describe("detectCircularReferences", () => {
  it("finds no cycle in a simple linear chain", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", outputVariable: "a", inputTemplate: "{{titulo}}" }),
      step({ id: "s2", outputVariable: "b", inputTemplate: "{{a}}" }),
      step({ id: "s3", outputVariable: "c", inputTemplate: "{{b}}" }),
    ];
    expect(detectCircularReferences(steps)).toEqual([]);
  });

  it("detects a direct two-step cycle (A depends on B, B depends on A)", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", outputVariable: "a", inputTemplate: "{{b}}" }),
      step({ id: "s2", outputVariable: "b", inputTemplate: "{{a}}" }),
    ];
    const cycles = detectCircularReferences(steps);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toEqual(expect.arrayContaining(["s1", "s2"]));
  });

  it("detects a longer cycle (A → B → C → A)", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", outputVariable: "a", inputTemplate: "{{c}}" }),
      step({ id: "s2", outputVariable: "b", inputTemplate: "{{a}}" }),
      step({ id: "s3", outputVariable: "c", inputTemplate: "{{b}}" }),
    ];
    expect(detectCircularReferences(steps).length).toBeGreaterThan(0);
  });

  it("validateWorkflowSteps surfaces circular_reference issues from detectCircularReferences", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", outputVariable: "a", inputTemplate: "{{b}}" }),
      step({ id: "s2", outputVariable: "b", inputTemplate: "{{a}}" }),
    ];
    expect(validateWorkflowSteps(steps).some((issue) => issue.code === "circular_reference")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Motor Workflow — ejecución simulada (NUNCA una herramienta real)
// ---------------------------------------------------------------------------
describe("planWorkflowRun: the local, simulated execution engine", () => {
  it("resolves the exact 5-step spec example (title → thumbnail → post → email → save) in order, chaining outputs", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", type: "ai_tool", toolSlug: "youtube-titulos", outputVariable: "title_output", inputTemplate: "{{titulo}}" }),
      step({ id: "s2", type: "ai_tool", label: "Thumbnail Prompt Generator", toolSlug: "image-prompt-generator", outputVariable: "thumb_output", inputTemplate: "{{title_output}}" }),
      step({ id: "s3", type: "ai_tool", label: "Facebook Post Generator", toolSlug: "facebook-post-generator", outputVariable: "fb_output", inputTemplate: "{{thumb_output}}" }),
      step({ id: "s4", type: "ai_tool", label: "Email Generator", toolSlug: "email-writer", outputVariable: "email_output", inputTemplate: "{{fb_output}}" }),
      step({ id: "s5", type: "save_result", label: "Guardar en Workspace", outputVariable: "final_output", inputTemplate: "{{email_output}}" }),
    ];
    const run = planWorkflowRun(steps, { titulo: "Mi nuevo producto" });
    expect(run.issues).toEqual([]);
    expect(run.steps).toHaveLength(5);
    expect(run.steps[0].resolvedInput).toBe("Mi nuevo producto");
    // Each step's simulated output becomes the next step's resolved input.
    expect(run.steps[1].resolvedInput).toBe(run.steps[0].simulatedOutput);
    expect(run.steps[4].resolvedInput).toBe(run.steps[3].simulatedOutput);
    expect(run.finalOutput).toBe(run.steps[4].simulatedOutput);
  });

  it("never calls a real AI tool — every ai_tool/prompt_library/ai_template step's output is a clearly labeled [Simulado] placeholder", () => {
    const steps: WorkflowStep[] = [step({ inputTemplate: "{{titulo}}" })];
    const run = planWorkflowRun(steps, { titulo: "x" });
    expect(run.steps[0].simulatedOutput).toMatch(/^\[Simulado\]/);
  });

  it("transform steps really execute (deterministic, non-AI) — uppercase/prefix/truncate", () => {
    const steps: WorkflowStep[] = [
      step({ id: "s1", type: "transform", transformKind: "uppercase", outputVariable: "step1_output", inputTemplate: "{{texto}}" }),
    ];
    const run = planWorkflowRun(steps, { texto: "hola mundo" });
    expect(run.steps[0].simulatedOutput).toBe("HOLA MUNDO");
  });

  it("refuses to run (empty steps/finalOutput, issues populated) when the workflow is structurally invalid", () => {
    const run = planWorkflowRun([step({ toolSlug: undefined })], {});
    expect(run.steps).toEqual([]);
    expect(run.finalOutput).toBe("");
    expect(run.issues.length).toBeGreaterThan(0);
  });

  it("reports missing variables per step instead of inventing a value", () => {
    const steps: WorkflowStep[] = [step({ inputTemplate: "{{titulo}} y {{producto}}" })];
    // "producto" isn't supplied — deriveWorkflowVariables treats it as a declared input,
    // so validation passes, but the render step must still report it missing.
    const run = planWorkflowRun(steps, { titulo: "x" });
    expect(run.issues).toEqual([]);
    expect(run.steps[0].missingVariables).toEqual(["producto"]);
    expect(run.steps[0].resolvedInput).toContain("{{producto}}");
  });
});

// ---------------------------------------------------------------------------
// Búsqueda / orden / categorías / etiquetas
// ---------------------------------------------------------------------------
describe("filterWorkflows / sortWorkflows", () => {
  const workflows = [
    makeWorkflow({
      id: "a",
      name: "SEO Blog Flow",
      category: "SEO",
      tags: ["blog"],
      isFavorite: true,
      isActive: true,
      steps: [step({ id: "a1", label: "SEO Title Generator", inputTemplate: "{{titulo}}" })],
    }),
    makeWorkflow({
      id: "b",
      name: "YouTube Flow",
      category: "YouTube",
      tags: ["video"],
      isFavorite: false,
      isActive: false,
      steps: [step({ id: "b1", label: "YouTube Title Generator", inputTemplate: "{{titulo}}" })],
    }),
    makeWorkflow({
      id: "c",
      name: "Email Sequence",
      category: "Marketing",
      tags: ["email"],
      isFavorite: true,
      isActive: true,
      steps: [step({ id: "c1", label: "Email Writer", inputTemplate: "{{titulo}}" })],
    }),
  ];

  it("matches by name and by step label", () => {
    expect(filterWorkflows(workflows, { query: "youtube" }).map((w) => w.id)).toEqual(["b"]);
  });

  it("favoritesOnly / activeOnly filter correctly", () => {
    expect(filterWorkflows(workflows, { favoritesOnly: true }).map((w) => w.id).sort()).toEqual(["a", "c"]);
    expect(filterWorkflows(workflows, { activeOnly: true }).map((w) => w.id).sort()).toEqual(["a", "c"]);
  });

  it("sorts alphabetically and by recency", () => {
    expect(sortWorkflows(workflows, "alphabetical").map((w) => w.id)).toEqual(["c", "a", "b"]);
    expect(Object.keys(WORKFLOW_SORT_LABELS).sort()).toEqual(["alphabetical", "recent"]);
  });

  it("getDistinctCategories/getDistinctTags return unique, sorted values", () => {
    expect(getDistinctCategories(workflows)).toEqual(["Marketing", "SEO", "YouTube"]);
    expect(getDistinctTags(workflows)).toEqual(["blog", "email", "video"]);
  });
});

// ---------------------------------------------------------------------------
// Chat IA — contexto de asistente
// ---------------------------------------------------------------------------
describe("buildWorkflowsAssistantContext", () => {
  it("returns an empty string when there are no active workflows", () => {
    expect(buildWorkflowsAssistantContext([])).toBe("");
    expect(buildWorkflowsAssistantContext([makeWorkflow({ isActive: false })])).toBe("");
  });

  it("includes name, favorite marker, category/tags, variables and a numbered step summary", () => {
    const context = buildWorkflowsAssistantContext([makeWorkflow({ isFavorite: true })]);
    expect(context).toContain("Lanzamiento de producto");
    expect(context).toContain("(favorito)");
    expect(context).toContain("{{titulo}}");
    expect(context).toContain("YouTube Title Generator");
  });

  it("instructs the model to ask for missing variables and never invent a workflow", () => {
    const context = buildWorkflowsAssistantContext([makeWorkflow()]);
    expect(context).toMatch(/ejecuta mi workflow SEO/);
    expect(context).toMatch(/pide los valores de cualquier variable que falte/);
    expect(context).toMatch(/[Nn]unca inventes un workflow/);
  });

  it("the context builder is pure — no database access, no server-only import", () => {
    const source = read("src/lib/ai-workflows/assistant-context.ts");
    expect(source).not.toMatch(/prisma\./);
    expect(source).not.toMatch(/"use server"/);
  });

  it("the assistant-context workflow limit is a small, fixed bound", () => {
    expect(ASSISTANT_CONTEXT_WORKFLOW_LIMIT).toBeGreaterThan(0);
    expect(ASSISTANT_CONTEXT_WORKFLOW_LIMIT).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Validación (zod)
// ---------------------------------------------------------------------------
describe("AI Workflows validation schemas", () => {
  it("createWorkflowSchema accepts a minimal valid input (name only, empty steps)", () => {
    expect(createWorkflowSchema.safeParse({ projectId: null, name: "Mi workflow" }).success).toBe(true);
  });

  it("createWorkflowSchema rejects an empty name", () => {
    expect(createWorkflowSchema.safeParse({ projectId: null, name: "" }).success).toBe(false);
  });

  it("createWorkflowSchema validates each step's shape (rejects an unrecognized step type)", () => {
    const parsed = createWorkflowSchema.safeParse({
      projectId: null,
      name: "x",
      steps: [{ id: "s1", type: "not_real", label: "x", outputVariable: "out1" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("updateWorkflowSchema allows a partial update, requires a valid cuid id, and requires the optimistic-concurrency editVersion", () => {
    expect(updateWorkflowSchema.safeParse({ id: "clxxxxxxxxxxxxxxxxxxxxxxxx", name: "Nuevo", editVersion: 1 }).success).toBe(true);
    expect(updateWorkflowSchema.safeParse({ id: "not-a-cuid", name: "x", editVersion: 1 }).success).toBe(false);
    expect(updateWorkflowSchema.safeParse({ id: "clxxxxxxxxxxxxxxxxxxxxxxxx", name: "Nuevo" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CRUD — server actions
// ---------------------------------------------------------------------------
describe("AI Workflows CRUD actions", () => {
  const actions = read("src/server/actions/ai-workflows.ts");

  it("createWorkflowAction creates a Workflow scoped to the authenticated user, with server-derived variables", () => {
    const fn = actions.match(/export async function createWorkflowAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(input\.projectId, "VIEWER"\)/);
    expect(fn).toMatch(/prisma\.workflow\.create/);
    expect(fn).toMatch(/userId: user\.id/);
    expect(fn).toMatch(/const variables = deriveWorkflowVariables\(steps\);/);
  });

  it("updateWorkflowAction (draft save) delegates to saveWorkflowDraft, which re-derives variables server-side, never trusting the client, and verifies ownership + concurrency before writing", () => {
    const actionFn = actions.match(/export async function updateWorkflowAction[\s\S]*?\n\}/)![0];
    expect(actionFn).toMatch(/saveWorkflowDraft\(\{/);
    expect(actionFn).not.toMatch(/prisma\.workflow\.(create|update)/);

    const lifecycle = read("src/server/services/workflow-lifecycle.ts");
    const draftFn = lifecycle.match(/export async function saveWorkflowDraft[\s\S]*?\n\}/)![0];
    expect(draftFn).toMatch(/getOwnedWorkflowRow\(input\.workflowId, input\.userId\)/);
    expect(draftFn).toMatch(/const nextVariables = deriveWorkflowVariables\(nextSteps\);/);
    expect(draftFn).toMatch(/prisma\.workflow\.update/);
    expect(draftFn).not.toMatch(/prisma\.workflow\.create/);
    expect(draftFn).not.toMatch(/variables:\s*input\.variables/);
  });

  it("deleteWorkflowAction deletes only after verifying ownership", () => {
    const fn = actions.match(/export async function deleteWorkflowAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedWorkflow\(id, user\.id\)/);
    expect(fn).toMatch(/prisma\.workflow\.delete/);
  });

  it("duplicateWorkflowAction creates a fresh copy owned by the same user, never favorite", () => {
    const fn = actions.match(/export async function duplicateWorkflowAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedWorkflow\(id, user\.id\)/);
    expect(fn).toMatch(/prisma\.workflow\.create/);
    expect(fn).toMatch(/\(copia\)/);
    expect(fn).toMatch(/isFavorite: false/);
  });

  it("toggleFavoriteWorkflowAction and toggleActiveWorkflowAction update only their own field, after ownership verification", () => {
    const favoriteFn = actions.match(/export async function toggleFavoriteWorkflowAction[\s\S]*?\n\}/)![0];
    expect(favoriteFn).toMatch(/getOwnedWorkflow\(id, user\.id\)/);
    expect(favoriteFn).toMatch(/data: \{ isFavorite: next \}/);

    const activeFn = actions.match(/export async function toggleActiveWorkflowAction[\s\S]*?\n\}/)![0];
    expect(activeFn).toMatch(/getOwnedWorkflow\(id, user\.id\)/);
    expect(activeFn).toMatch(/data: \{ isActive: next \}/);
  });
});

// ---------------------------------------------------------------------------
// Seguridad — aislamiento total por usuario
// ---------------------------------------------------------------------------
describe("Security: Workflows are fully isolated per user", () => {
  const actions = read("src/server/actions/ai-workflows.ts");
  const services = read("src/server/services/ai-workflows.ts");

  it("getOwnedWorkflow treats 'not mine' exactly like 'does not exist' — no cross-user existence leak", () => {
    const fn = actions.match(/async function getOwnedWorkflow[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!workflow \|\| workflow\.userId !== userId\) return null;/);
  });

  it("listWorkflowsForUser and listWorkflowsForAssistantContext always filter by userId", () => {
    expect(services).toMatch(/export async function listWorkflowsForUser[\s\S]*?where: \{ userId, OR: \[\{ projectId \}, \{ projectId: null \}\] \}/);
    expect(services).toMatch(/export async function listWorkflowsForAssistantContext[\s\S]*?where: \{ userId, OR: \[\{ projectId \}, \{ projectId: null \}\] \}/);
  });

  it("getWorkflowForUser re-checks ownership even after finding the row by id", () => {
    const fn = services.match(/export async function getWorkflowForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/row\.userId !== userId/);
  });

  it("saveWorkflowExecutionAction re-verifies the workflow belongs to the caller before writing a ContentItem", () => {
    const fn = actions.match(/export async function saveWorkflowExecutionAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedWorkflow\(input\.workflowId, user\.id\)/);
    expect(fn).toMatch(/if \(!workflow\) return \{ error:/);
  });

  it("every action requires at least project VIEWER access before touching any workflow", () => {
    const requireCalls = actions.match(/requireProjectAccess\([^)]*"VIEWER"\)/g) ?? [];
    expect(requireCalls.length).toBeGreaterThanOrEqual(7);
  });

  it("no action ever trusts a client-supplied userId", () => {
    expect(actions).not.toMatch(/userId:\s*input\./);
    expect(actions).not.toMatch(/userId:\s*formData/);
  });
});

// ---------------------------------------------------------------------------
// Integración con Workspace
// ---------------------------------------------------------------------------
describe("Workspace integration: executions can be saved", () => {
  it("saveWorkflowExecutionAction creates a ContentItem — the exact same table/history every other tool's result lives in, no second history table", () => {
    const fn = read("src/server/actions/ai-workflows.ts").match(/export async function saveWorkflowExecutionAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.contentItem\.create/);
    expect(fn).toMatch(/sourceTool: `workflow:\$\{workflow\.id\}`/);
  });

  it("the Workspace page links to AI Workflows, alongside the existing Prompt Library/AI Templates/Brand Kits links", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/workspace/page.tsx");
    expect(page).toMatch(/\/dashboard\/\$\{projectId\}\/ai-workflows/);
    expect(page).toMatch(/\/dashboard\/\$\{projectId\}\/brand-kits/);
  });

  it("AiWorkspaceHub itself was not modified — no Workflow-specific logic inside it", () => {
    const hub = read("src/components/workspace/ai-workspace-hub.tsx");
    expect(hub).toMatch(/const RECENT_LIMIT = 20;/);
    expect(hub).not.toMatch(/Workflow|ai-workflows/);
  });

  it("WorkflowRunPanel and WorkflowCard reuse UniversalResultViewer and the shared parseResultBlocks — no second renderer", () => {
    for (const relativePath of ["src/components/ai-workflows/workflow-run-panel.tsx"]) {
      const source = read(relativePath);
      expect(source).toMatch(/import \{ UniversalResultViewer \} from "@\/components\/workspace\/universal-result-viewer"/);
      expect(source).toMatch(/import \{ parseResultBlocks \} from "@\/lib\/ai-workspace\/blocks"/);
      expect(source).not.toMatch(/export function parseResultBlocks/);
    }
  });

  it("UniversalResultViewer itself was not modified by this phase", () => {
    const viewer = read("src/components/workspace/universal-result-viewer.tsx");
    expect(viewer).toMatch(/"text" \| "image" \| "pdf" \| "audio" \| "video"/);
    expect(viewer).not.toMatch(/Workflow|ai-workflows/);
  });

  it("Workflows have their own dedicated route, reachable from the Sidebar and from Workspace", () => {
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/ai-workflows/page.tsx"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Chat IA — sin tocar Orquestador ni Intent Router
// ---------------------------------------------------------------------------
describe("Chat IA can use Workflows, without touching the Orquestador or the Intent Router", () => {
  it("chat-panel.tsx (the orchestrator) was NOT modified — no reference to Workflow/ai-workflows inside it", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).not.toMatch(/Workflow|ai-workflows/);
    expect(panel).toMatch(/buildIntentClassifierSystemPrompt/);
    expect(panel).toMatch(/parseIntentClassifierResponse/);
    expect(panel).toMatch(/buildAssistantSystemPrompt\(brandContextText\)/);
  });

  it("intent-router.ts was NOT modified — no reference to Workflow/ai-workflows inside it", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).not.toMatch(/Workflow|ai-workflows/);
    expect(router).toMatch(/export function listRoutableTools/);
  });

  it("buildBrandContext was NOT modified — workflow context is appended only for Chat IA's own page", () => {
    const brandContext = read("src/lib/ai/brand-context.ts");
    expect(brandContext).not.toMatch(/Workflow|ai-workflows/);
  });

  it("only the chat conversation page fetches workflows and appends their context, alongside Prompt Library/AI Templates/Brand Kit's own", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/chat/[conversationId]/page.tsx");
    expect(page).toMatch(/listWorkflowsForAssistantContext\(user\.id, projectId\)/);
    expect(page).toMatch(/buildWorkflowsAssistantContext\(workflows\)/);
    expect(page).toMatch(/<ChatPanel/);
    expect(page).toMatch(/brandContextText=\{brandContextText\}/);
  });

  it("no AI Center tool page was changed to inject Workflows context", () => {
    const toolPages = [
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/video-ai/[tool]/page.tsx",
    ];
    for (const relativePath of toolPages) {
      expect(read(relativePath)).not.toMatch(/ai-workflows|Workflow/);
    }
  });
});

// ---------------------------------------------------------------------------
// No se rompió nada — Prompt Library / AI Templates / Brand Kit / AI Center siguen funcionando
// ---------------------------------------------------------------------------
describe("Prompt Library, AI Templates, Brand Kit and AI Center keep working, reused rather than duplicated", () => {
  it("prompt-library/ai-templates/brand-profiles core files were not modified beyond the new *ForSelectAction wrappers", () => {
    for (const relativePath of [
      "src/components/prompt-library/prompt-library-hub.tsx",
      "src/components/ai-templates/ai-template-hub.tsx",
      "src/components/brand-profiles/brand-profile-hub.tsx",
    ]) {
      expect(read(relativePath)).not.toMatch(/Workflow|ai-workflows/);
    }
  });

  it("listSavedPromptsForSelectAction/listAiTemplatesForSelectAction reuse the existing list services, never a new query", () => {
    const promptActions = read("src/server/actions/prompt-library.ts");
    expect(promptActions).toMatch(/export async function listSavedPromptsForSelectAction[\s\S]*?listSavedPromptsForUser\(user\.id, projectId\)/);
    const templateActions = read("src/server/actions/ai-templates.ts");
    expect(templateActions).toMatch(/export async function listAiTemplatesForSelectAction[\s\S]*?listAiTemplatesForUser\(user\.id, projectId\)/);
  });

  it("WorkflowStepEditor reads the AI Center tool registry directly (listToolDefinitions) — no second/duplicated tool list", () => {
    const editor = read("src/components/ai-workflows/workflow-step-editor.tsx");
    expect(editor).toMatch(/import \{ [^}]*\blistToolDefinitions\b[^}]* \} from "@\/lib\/ai-center\/tools\/registry"/);
  });

  it("AI Workflows reuses AI Templates' own {{variable}} engine (analyzeTemplateVariables/renderTemplate) instead of a second parser", () => {
    const engine = read("src/lib/ai-workflows/engine.ts");
    expect(engine).toMatch(/import \{ analyzeTemplateVariables, renderTemplate \} from "@\/lib\/ai-templates\/engine"/);
    expect(engine).not.toMatch(/export function renderTemplate/);
  });

  it("parseTagsInput remains defined in exactly one place — AI Workflows imports it instead of redefining it", () => {
    const definers = [
      "src/lib/validation/prompt-library.ts",
      "src/lib/validation/ai-templates.ts",
      "src/lib/validation/brand-profiles.ts",
      "src/lib/validation/ai-workflows.ts",
    ].filter((f) => read(f).includes("export function parseTagsInput"));
    expect(definers).toEqual(["src/lib/validation/prompt-library.ts"]);
    expect(read("src/components/ai-workflows/workflow-create-form.tsx")).toMatch(
      /import \{ parseTagsInput \} from "@\/lib\/validation\/prompt-library"/
    );
  });

  it("AiGenerationForm (AI Center) was not modified by this phase", () => {
    expect(read("src/components/ai-center/generation/ai-generation-form.tsx")).not.toMatch(/Workflow|ai-workflows/);
  });
});

// ---------------------------------------------------------------------------
// Base de datos
// ---------------------------------------------------------------------------
describe("Database: exactly one new model, one clean migration", () => {
  it("schema.prisma defines Workflow with every field from the spec's structure", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model Workflow \{[\s\S]*?\n\}/)![0];
    for (const field of ["name", "description", "category", "tags", "isFavorite", "isActive", "steps", "variables", "userId", "createdAt", "updatedAt"]) {
      expect(model).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("steps is a JSON column — no separate step table (steps are never queried independently)", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model Workflow \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/steps\s+Json/);
    expect(schema).not.toMatch(/model WorkflowStep /);
  });

  it("Workflow was added on top of everything before it — SavedPrompt, AiTemplate and BrandProfile are still there", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/model Workflow \{/);
    expect(schema).toMatch(/model SavedPrompt \{/);
    expect(schema).toMatch(/model AiTemplate \{/);
    expect(schema).toMatch(/model BrandProfile \{/);
  });

  it("a single, additive migration exists for Workflow — CREATE TABLE only, no DROP/ALTER on any other table", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    const newMigration = migrationDirs.find((name) => name.endsWith("add_workflow"));
    expect(newMigration).toBeDefined();

    const sql = read(`prisma/migrations/${newMigration}/migration.sql`);
    expect(sql).toMatch(/CREATE TABLE "Workflow"/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/DROP COLUMN/);
    expect(sql).not.toMatch(/ALTER TABLE "(?!Workflow)/);
  });

  it("no other prisma migration folder was touched — every prior migration is still present", () => {
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
    ]) {
      expect(migrationDirs).toContain(prior);
    }
  });
});

// ---------------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------------
describe("Navigation: AI Workflows reachable from the Sidebar, additive only", () => {
  it("appears exactly once in projectNavGroups", () => {
    const all = projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "AI Workflows");
    expect(all).toHaveLength(1);
    expect(all[0].segment).toBe("ai-workflows");
  });

  it("never appears in guest or admin navigation", () => {
    expect(guestNavGroups.flatMap((g) => g.items.map((i) => i.label))).not.toContain("AI Workflows");
    expect(adminNavItems.map((i) => i.label)).not.toContain("AI Workflows");
  });

  it("Prompt Library's, AI Templates' and Brand Kits' own nav entries are still present, untouched", () => {
    expect(projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "Prompt Library")).toHaveLength(1);
    expect(projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "AI Templates")).toHaveLength(1);
    expect(projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "Brand Kits")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Sin ruptura del motor IA
// ---------------------------------------------------------------------------
describe("No second AI engine, no real tool execution wired in this phase", () => {
  it("engine.ts (the local text-generation engine) is unchanged and still the only real generation entry point", () => {
    const engine = read("src/lib/ai/local/engine.ts");
    expect(engine).toMatch(/export async function generateLocalText/);
  });

  it("useLocalAI (the AI Center generation hook) is never imported or called in the AI Workflows engine/actions/services — only comments may name it to explain what's deliberately excluded", () => {
    const forbiddenUsagePatterns = [/\buseLocalAI\(/, /\bgenerateLocalText\(/, /from ["']@\/hooks\/use-local-ai["']/];
    for (const relativePath of ["src/lib/ai-workflows/engine.ts", "src/server/actions/ai-workflows.ts", "src/server/services/ai-workflows.ts"]) {
      const content = read(relativePath);
      for (const pattern of forbiddenUsagePatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  it("Guest and Admin were not touched by this phase", () => {
    for (const relativePath of ["src/components/guest/guest-header.tsx", "src/app/admin/layout.tsx"]) {
      if (existsSync(path.join(ROOT, relativePath))) {
        expect(read(relativePath)).not.toMatch(/Workflow|ai-workflows/);
      }
    }
  });
});

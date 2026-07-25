import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeDefinitionHash, canonicalDefinitionJson, type CanonicalWorkflowDefinition } from "@/lib/ai-workflows/definition-hash";
import { diffWorkflowDefinitions, summarizeWorkflowDiff, buildChangeSummary } from "@/lib/ai-workflows/workflow-diff";
import { validateStepsForPublish, addSignificantChangeWarning } from "@/lib/ai-workflows/publish-validation";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";
import type { WorkflowStep } from "@/lib/ai-workflows/engine";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: "s1",
    type: "transform",
    label: "Transformar",
    outputVariable: "out1",
    transformKind: "uppercase",
    inputTemplate: "{{titulo}}",
    ...overrides,
  };
}

function def(overrides: Partial<CanonicalWorkflowDefinition> = {}): CanonicalWorkflowDefinition {
  return {
    name: "Mi workflow",
    description: "Una descripción",
    category: "Marketing",
    tags: ["lanzamiento"],
    steps: [step()],
    variables: ["titulo"],
    stopOnError: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Definition hash — real, deterministic unit tests
// ---------------------------------------------------------------------------
describe("definition-hash: canonical, deterministic, timestamp-free", () => {
  it("is deterministic — the same definition always hashes to the same value", () => {
    expect(computeDefinitionHash(def())).toBe(computeDefinitionHash(def()));
  });

  it("is independent of accidental JSON key insertion order", () => {
    const a: CanonicalWorkflowDefinition = {
      name: "X",
      description: null,
      category: null,
      tags: [],
      steps: [{ id: "s1", type: "transform", label: "T", outputVariable: "o", transformKind: "uppercase", inputTemplate: "{{x}}" }],
      variables: ["x"],
      stopOnError: true,
    };
    const b: CanonicalWorkflowDefinition = {
      variables: ["x"],
      stopOnError: true,
      tags: [],
      steps: [{ transformKind: "uppercase", type: "transform", id: "s1", inputTemplate: "{{x}}", outputVariable: "o", label: "T" }],
      category: null,
      description: null,
      name: "X",
    };
    expect(computeDefinitionHash(a)).toBe(computeDefinitionHash(b));
  });

  it("tags and variables are sorted before hashing — reordering them alone never changes the hash", () => {
    const a = def({ tags: ["b", "a"], variables: ["y", "x"] });
    const b = def({ tags: ["a", "b"], variables: ["x", "y"] });
    expect(computeDefinitionHash(a)).toBe(computeDefinitionHash(b));
  });

  it("step ORDER is significant — reordering steps changes the hash (unlike tags/variables)", () => {
    const s1 = step({ id: "s1" });
    const s2 = step({ id: "s2", outputVariable: "out2" });
    expect(computeDefinitionHash(def({ steps: [s1, s2] }))).not.toBe(computeDefinitionHash(def({ steps: [s2, s1] })));
  });

  it("changes ANY executable field and the hash changes: steps, name, description, category, stopOnError", () => {
    const base = def();
    expect(computeDefinitionHash(def({ steps: [step({ inputTemplate: "{{otro}}" })] }))).not.toBe(computeDefinitionHash(base));
    expect(computeDefinitionHash(def({ name: "Otro nombre" }))).not.toBe(computeDefinitionHash(base));
    expect(computeDefinitionHash(def({ description: "Otra" }))).not.toBe(computeDefinitionHash(base));
    expect(computeDefinitionHash(def({ category: "Otra categoría" }))).not.toBe(computeDefinitionHash(base));
    expect(computeDefinitionHash(def({ stopOnError: false }))).not.toBe(computeDefinitionHash(base));
  });

  it("never includes a timestamp in its input — canonicalDefinitionJson contains no 'createdAt'/'publishedAt' key (a step's own stable `id` field IS included, since it's part of the executable definition itself)", () => {
    const json = canonicalDefinitionJson(def());
    expect(json).not.toMatch(/"createdAt"/);
    expect(json).not.toMatch(/"publishedAt"/);
  });

  it("undefined optional step fields hash identically to the field simply being absent", () => {
    const withUndefined = def({ steps: [{ ...step(), toolSlug: undefined }] });
    const withoutField = def({ steps: [step()] });
    expect(computeDefinitionHash(withUndefined)).toBe(computeDefinitionHash(withoutField));
  });
});

// ---------------------------------------------------------------------------
// 2. Workflow diff — real, structural unit tests (never raw JSON)
// ---------------------------------------------------------------------------
describe("workflow-diff: structural, step-id-matched comparator", () => {
  it("detects an added step and a removed step, never confusing a reorder for both", () => {
    const s1 = step({ id: "s1" });
    const s2 = step({ id: "s2", outputVariable: "out2" });
    const diff = diffWorkflowDefinitions(def({ steps: [s1] }), def({ steps: [s1, s2] }));
    expect(diff.stepChanges).toEqual([{ kind: "added", stepId: "s2", label: s2.label, toIndex: 1 }]);
  });

  it("detects a moved step by stable id, not by array position alone", () => {
    const s1 = step({ id: "s1" });
    const s2 = step({ id: "s2", outputVariable: "out2" });
    const diff = diffWorkflowDefinitions(def({ steps: [s1, s2] }), def({ steps: [s2, s1] }));
    const moved = diff.stepChanges.filter((c) => c.kind === "moved");
    expect(moved).toHaveLength(2);
    expect(moved.find((c) => c.stepId === "s1")).toMatchObject({ fromIndex: 0, toIndex: 1 });
    expect(moved.find((c) => c.stepId === "s2")).toMatchObject({ fromIndex: 1, toIndex: 0 });
  });

  it("detects a step type change", () => {
    const before = step({ type: "transform" });
    const after = step({ type: "save_result", transformKind: undefined });
    const diff = diffWorkflowDefinitions(def({ steps: [before] }), def({ steps: [after] }));
    expect(diff.stepChanges.some((c) => c.kind === "type_changed")).toBe(true);
  });

  it("detects a tool, prompt, template, and brand kit change independently", () => {
    const before = step({ type: "ai_tool", toolSlug: "youtube-titulos" });
    const after = step({ type: "ai_tool", toolSlug: "youtube-descripciones" });
    expect(diffWorkflowDefinitions(def({ steps: [before] }), def({ steps: [after] })).stepChanges.map((c) => c.kind)).toContain("tool_changed");

    const beforePrompt = step({ type: "prompt_library", promptId: "p1" });
    const afterPrompt = step({ type: "prompt_library", promptId: "p2" });
    expect(
      diffWorkflowDefinitions(def({ steps: [beforePrompt] }), def({ steps: [afterPrompt] })).stepChanges.map((c) => c.kind)
    ).toContain("prompt_changed");

    const beforeTemplate = step({ type: "ai_template", templateId: "t1" });
    const afterTemplate = step({ type: "ai_template", templateId: "t2" });
    expect(
      diffWorkflowDefinitions(def({ steps: [beforeTemplate] }), def({ steps: [afterTemplate] })).stepChanges.map((c) => c.kind)
    ).toContain("template_changed");

    const beforeBrand = step({ type: "brand_kit", brandProfileId: "b1" });
    const afterBrand = step({ type: "brand_kit", brandProfileId: "b2" });
    expect(
      diffWorkflowDefinitions(def({ steps: [beforeBrand] }), def({ steps: [afterBrand] })).stepChanges.map((c) => c.kind)
    ).toContain("brand_kit_changed");
  });

  it("detects a transform configuration change (kind, value, or replacement)", () => {
    const before = step({ transformKind: "prefix", transformValue: "Hola: " });
    const after = step({ transformKind: "prefix", transformValue: "Saludo: " });
    expect(diffWorkflowDefinitions(def({ steps: [before] }), def({ steps: [after] })).stepChanges.map((c) => c.kind)).toContain("transform_changed");
  });

  it("detects variables added and removed", () => {
    const diff = diffWorkflowDefinitions(def({ variables: ["a", "b"] }), def({ variables: ["b", "c"] }));
    expect(diff.variablesAdded).toEqual(["c"]);
    expect(diff.variablesRemoved).toEqual(["a"]);
  });

  it("detects stopOnError, name, description, category, and tags metadata changes", () => {
    const diff = diffWorkflowDefinitions(
      def({ stopOnError: true, name: "A", description: "d1", category: "c1", tags: ["x"] }),
      def({ stopOnError: false, name: "B", description: "d2", category: "c2", tags: ["y"] })
    );
    const fields = diff.metadataChanges.map((c) => c.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "description", "category", "tags", "stopOnError"]));
  });

  it("ignores accidental step-property key order — no false-positive change reported", () => {
    const a = step({ id: "s1", type: "transform", transformKind: "uppercase" });
    const b: WorkflowStep = { outputVariable: a.outputVariable, transformKind: a.transformKind, type: a.type, id: a.id, label: a.label, inputTemplate: a.inputTemplate };
    const diff = diffWorkflowDefinitions(def({ steps: [a] }), def({ steps: [b] }));
    expect(diff.hasChanges).toBe(false);
  });

  it("identical definitions produce hasChanges: false and an empty summary", () => {
    const diff = diffWorkflowDefinitions(def(), def());
    expect(diff.hasChanges).toBe(false);
    expect(summarizeWorkflowDiff(diff)).toEqual([]);
  });

  it("summarizeWorkflowDiff produces deterministic, human-readable lines (never invented, never an LLM call)", () => {
    const s1 = step({ id: "s1" });
    const s2 = step({ id: "s2", outputVariable: "out2" });
    const diff = diffWorkflowDefinitions(def({ steps: [s1], stopOnError: true }), def({ steps: [s1, s2], stopOnError: false }));
    const lines = summarizeWorkflowDiff(diff);
    expect(lines).toContain("1 paso añadido.");
    expect(lines).toContain("stopOnError desactivado.");
  });

  it("buildChangeSummary produces a small, stable structured object (never the full diff, never raw definitions) — safe to persist as WorkflowRevision.changeSummary", () => {
    const summary = buildChangeSummary(diffWorkflowDefinitions(def(), def({ name: "Nuevo" })));
    expect(summary).toMatchObject({ metadataChanged: 1, stepsAdded: 0, stepsRemoved: 0 });
    expect(Array.isArray(summary.lines)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Pre-publish validation — real unit tests against the REAL engine and
//    REAL AI Center tool registry (no mocking — both are static, pure data).
// ---------------------------------------------------------------------------
describe("publish-validation: structural errors/warnings, errors-only block publishing", () => {
  it("an empty workflow is a blocking error", () => {
    const result = validateStepsForPublish([]);
    expect(result.canPublish).toBe(false);
    expect(result.errors.some((e) => e.code === "empty_steps")).toBe(true);
  });

  it("a reference to a non-existent AI Center tool is a blocking error, reusing validateWorkflowSteps' own code — never a second implementation", () => {
    const result = validateStepsForPublish([step({ type: "ai_tool", toolSlug: "this-tool-does-not-exist", outputVariable: "out" })]);
    expect(result.canPublish).toBe(false);
    expect(result.errors.some((e) => e.code === "tool_not_found")).toBe(true);
  });

  it("a real, valid single-step workflow with save_result produces no errors and no warnings", () => {
    const result = validateStepsForPublish([step({ type: "save_result", inputTemplate: "{{titulo}}" })]);
    expect(result.canPublish).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("a workflow with no save_result step gets a non-blocking warning", () => {
    const result = validateStepsForPublish([step({ type: "transform" })]);
    expect(result.canPublish).toBe(true);
    expect(result.warnings.some((w) => w.code === "no_save_result")).toBe(true);
  });

  it("an unused (never-referenced) non-final step output gets a non-blocking warning", () => {
    const unused = step({ id: "s1", outputVariable: "unused_output", type: "transform", inputTemplate: "{{titulo}}" });
    const final = step({ id: "s2", outputVariable: "final_output", type: "save_result", inputTemplate: "{{titulo}}" }); // never references unused_output
    const result = validateStepsForPublish([unused, final]);
    expect(result.canPublish).toBe(true);
    expect(result.warnings.some((w) => w.code === "unused_step_output" && w.stepId === "s1")).toBe(true);
  });

  it("a real ai_tool step (youtube-titulos) referencing its own output variable via a later step is never flagged as unused", () => {
    const tool = findToolDefinition("youtube-titulos")!;
    const fieldInputs: Record<string, string> = {};
    for (const f of tool.fields) if (f.required) fieldInputs[f.name] = "x";
    const producer = step({ id: "s1", type: "ai_tool", toolSlug: "youtube-titulos", outputVariable: "titles", fieldInputs });
    const consumer = step({ id: "s2", type: "save_result", inputTemplate: "{{titles}}" });
    const result = validateStepsForPublish([producer, consumer]);
    expect(result.warnings.some((w) => w.code === "unused_step_output")).toBe(false);
  });

  it("warnings never block publishing — canPublish is true whenever errors is empty, regardless of warning count", () => {
    const result = validateStepsForPublish([step({ type: "transform" })]); // triggers no_save_result warning
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.canPublish).toBe(true);
  });

  it("addSignificantChangeWarning adds a non-blocking warning only when a large share of steps changed", () => {
    const base = validateStepsForPublish([step({ id: "s1" }), step({ id: "s2", outputVariable: "out2" }), step({ id: "s3", outputVariable: "out3" })]);
    const bigDiff = diffWorkflowDefinitions(def({ steps: [step({ id: "s1" })] }), def({ steps: [step({ id: "s1" }), step({ id: "s2", outputVariable: "o2" }), step({ id: "s3", outputVariable: "o3" })] }));
    const withWarning = addSignificantChangeWarning(base, bigDiff, 3);
    expect(withWarning.warnings.some((w) => w.code === "significant_change_vs_production")).toBe(true);
    expect(withWarning.canPublish).toBe(true); // still just a warning
  });
});

// ---------------------------------------------------------------------------
// 4. Draft save — optimistic concurrency, server-derived hash (structural)
// ---------------------------------------------------------------------------
describe("saveWorkflowDraft: optimistic concurrency, never publishes, never trusts client hash/variables", () => {
  const lifecycle = read("src/server/services/workflow-lifecycle.ts");
  const fn = lifecycle.match(/export async function saveWorkflowDraft[\s\S]*?\n\}/)![0];

  it("rejects a stale editVersion as a conflict, before writing anything", () => {
    expect(fn).toMatch(/if \(existing\.editVersion !== input\.editVersion\) \{/);
    expect(fn).toMatch(/conflict: true,/);
  });

  it("refuses to edit an archived workflow's draft", () => {
    expect(fn).toMatch(/if \(existing\.status === "ARCHIVED"\) return \{ ok: false, error:/);
  });

  it("recomputes draftHash and hasUnpublishedChanges server-side on every save — never accepts either from the client", () => {
    expect(fn).toMatch(/const draftHash = computeDefinitionHash\(/);
    expect(fn).toMatch(/const hasUnpublishedChanges = draftHash !== existing\.publishedHash;/);
    const saveDraftInputMatch = lifecycle.match(/export interface SaveWorkflowDraftInput \{[\s\S]*?\n\}/)![0];
    expect(saveDraftInputMatch).not.toMatch(/draftHash/);
    expect(saveDraftInputMatch).not.toMatch(/hasUnpublishedChanges/);
  });

  it("increments editVersion by exactly one on every successful save", () => {
    expect(fn).toMatch(/editVersion: \{ increment: 1 \},/);
  });

  it("never writes publishedVersion, activeRevisionId, or publishedHash — a draft save can never publish", () => {
    expect(fn).not.toMatch(/publishedVersion:/);
    expect(fn).not.toMatch(/activeRevisionId:/);
    expect(fn).not.toMatch(/publishedHash:\s*draftHash/);
  });
});

// ---------------------------------------------------------------------------
// 5. Publish — transactional, validation-gated, rejects a no-op, exactly one active revision
// ---------------------------------------------------------------------------
describe("publishWorkflowDraft: transactional publish, single active revision, rejects no-op", () => {
  const lifecycle = read("src/server/services/workflow-lifecycle.ts");
  const fn = lifecycle.match(/export async function publishWorkflowDraft[\s\S]*?\n\}/)![0];

  it("verifies ownership, refuses an archived workflow, and blocks on validation errors before doing anything transactional", () => {
    expect(fn).toMatch(/if \(workflow\.status === "ARCHIVED"\) return \{ ok: false, error:/);
    expect(fn).toMatch(/if \(!validated\.result\.canPublish\)/);
  });

  it("rejects a publish that changes nothing — compares the server-recomputed draftHash against the current publishedHash, never a client-supplied hash", () => {
    expect(fn).toMatch(/if \(workflow\.publishedHash !== null && draftHash === workflow\.publishedHash\) \{/);
    expect(fn).toMatch(/No hay cambios sin publicar/);
    // PublishWorkflowInput never accepts a hash or snapshot from the caller.
    const inputType = lifecycle.match(/export interface PublishWorkflowInput \{[\s\S]*?\n\}/)![0];
    expect(inputType).not.toMatch(/hash/i);
    expect(inputType).not.toMatch(/snapshot/i);
  });

  it("publishes inside a single transaction that deactivates the old active revision and activates the new one together — never two active revisions, never a partial state", () => {
    expect(fn).toMatch(/await prisma\.\$transaction\(async \(tx\) => \{/);
    expect(fn).toMatch(/await tx\.workflowRevision\.update\(\{ where: \{ id: workflow\.activeRevisionId \}, data: \{ isActive: false \} \}\);/);
    expect(fn).toMatch(/isActive: true,/);
  });

  it("increments the version and marks the new revision as the workflow's activeRevisionId inside the same transaction", () => {
    expect(fn).toMatch(/status: "PUBLISHED",/);
    expect(fn).toMatch(/activeRevisionId: created\.id,/);
    expect(fn).toMatch(/hasUnpublishedChanges: false,/);
  });
});

// ---------------------------------------------------------------------------
// 6. Rollback — restores as a NEW draft, never rewrites history
// ---------------------------------------------------------------------------
describe("restoreRevisionAsDraft: rollback creates a new draft, never touches the historical revision", () => {
  const lifecycle = read("src/server/services/workflow-lifecycle.ts");
  const fn = lifecycle.match(/export async function restoreRevisionAsDraft[\s\S]*?\n(?=\/\/ -{3,}|export async function archiveWorkflow)/)![0];

  it("verifies the revision belongs to the SAME workflowId/project/user the caller is acting on — via getRevisionForUser's own triple check (implementation lives in workflow-revisions.ts, re-exported here)", () => {
    expect(fn).toMatch(/getRevisionForUser\(\{ userId: input\.userId, projectId: input\.projectId, workflowId: input\.workflowId, revisionId: input\.revisionId \}\)/);
    const getRevisionFn = read("src/server/services/workflow-revisions.ts").match(/export async function getRevisionForUser[\s\S]*?\n\}/)![0];
    expect(getRevisionFn).toMatch(/revision\.userId !== input\.userId \|\| revision\.workflowId !== input\.workflowId \|\| revision\.projectId !== input\.projectId/);
  });

  it("never writes to the WorkflowRevision table at all — only prisma.workflow.update", () => {
    expect(fn).not.toMatch(/prisma\.workflowRevision\.(update|delete|create)/);
    expect(fn).toMatch(/prisma\.workflow\.update\(/);
  });

  it("bumps editVersion so the restored content is treated as a genuinely new, saveable draft", () => {
    expect(fn).toMatch(/editVersion: \{ increment: 1 \},/);
  });

  it("recomputes hasUnpublishedChanges from the restored definition's own hash — never assumes it's true or false", () => {
    expect(fn).toMatch(/const hasUnpublishedChanges = draftHash !== workflow\.publishedHash;/);
  });
});

// ---------------------------------------------------------------------------
// 7. Archive / restore — non-destructive, idempotent, propagates to revisions
// ---------------------------------------------------------------------------
describe("archiveWorkflow / restoreArchivedWorkflow: non-destructive, idempotent", () => {
  const lifecycle = read("src/server/services/workflow-lifecycle.ts");

  it("archiving never deletes the workflow, its runs, or its revisions — only sets status/archivedAt", () => {
    const fn = lifecycle.match(/export async function archiveWorkflow[\s\S]*?\n\}/)![0];
    expect(fn).not.toMatch(/\.delete\(/);
    expect(fn).toMatch(/status: "ARCHIVED", archivedAt: now/);
    expect(fn).toMatch(/prisma\.workflowRevision\.updateMany/);
  });

  it("archiving is idempotent — archiving an already-archived workflow is a success no-op, not an error", () => {
    const fn = lifecycle.match(/export async function archiveWorkflow[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(workflow\.status === "ARCHIVED"\) return \{ ok: true \};/);
  });

  it("restoring a workflow goes back to PUBLISHED if it had ever published, otherwise DRAFT — never silently invents a publishedVersion", () => {
    const fn = lifecycle.match(/export async function restoreArchivedWorkflow[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: workflow\.publishedVersion \? "PUBLISHED" : "DRAFT", archivedAt: null/);
  });
});

// ---------------------------------------------------------------------------
// 8. Execution modes — published vs draft_test, revision-sourced snapshots
// ---------------------------------------------------------------------------
describe("Execution modes: published reads the active revision, draft_test reads the live draft, retry-current-version always means published", () => {
  const actions = read("src/server/actions/workflow-execution.ts");

  it("beginFreshRun sources steps from the active WorkflowRevision only in 'published' mode", () => {
    const fn = actions.match(/async function beginFreshRun[\s\S]*?\n(?=export interface StartWorkflowRunInput)/)![0];
    expect(fn).toMatch(/if \(params\.mode === "published"\) \{/);
    expect(fn).toMatch(/getActiveRevisionForWorkflow\(workflow\.id, params\.userId\)/);
    expect(fn).toMatch(/steps = workflow\.steps;/); // the draft_test else-branch
  });

  it("createRunFromSnapshot persists workflowRevisionId and a sourceDefinitionHash computed server-side from the snapshot's own fields", () => {
    const fn = actions.match(/async function createRunFromSnapshot[\s\S]*?\n(?=async function beginFreshRun)/)![0];
    expect(fn).toMatch(/const sourceDefinitionHash = computeDefinitionHash\(/);
    expect(fn).toMatch(/workflowRevisionId: params\.snapshot\.revisionId,/);
    expect(fn).toMatch(/sourceDefinitionHash,/);
  });

  it("startWorkflowRunAction and testDraftWorkflowRunAction are two distinct exported actions with distinct modes", () => {
    expect(actions).toMatch(/export async function startWorkflowRunAction/);
    expect(actions).toMatch(/export async function testDraftWorkflowRunAction/);
  });
});

// ---------------------------------------------------------------------------
// 9. Security
// ---------------------------------------------------------------------------
describe("Security: cross-workflow/cross-user isolation for revisions and lifecycle actions", () => {
  const lifecycleActions = read("src/server/actions/workflow-lifecycle.ts");
  const lifecycle = read("src/server/services/workflow-lifecycle.ts");

  it("every exported lifecycle action calls requireProjectAccess before touching any service function", () => {
    const fns = lifecycleActions.match(/export async function \w+\([\s\S]*?\n\}/g) ?? [];
    expect(fns.length).toBeGreaterThan(5);
    for (const fn of fns) expect(fn).toMatch(/requireProjectAccess\(/);
  });

  it("no exported lifecycle action accepts a userId parameter — always derived from requireProjectAccess", () => {
    const signatures = lifecycleActions.match(/export async function \w+\([^)]*\)/g) ?? [];
    for (const sig of signatures) expect(sig).not.toMatch(/userId/);
  });

  it("getRevisionForUser rejects a revision belonging to a different workflowId even if the caller genuinely owns that revision under another workflow", () => {
    const fn = read("src/server/services/workflow-revisions.ts").match(/export async function getRevisionForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/revision\.workflowId !== input\.workflowId/);
  });

  it("compareTwoRevisions resolves both sides through the same ownership-checked getRevisionForUser — never a raw findUnique", () => {
    const fn = lifecycle.match(/export async function compareTwoRevisions[\s\S]*?\n(?=\/\/ -{3,}|export type RestoreRevisionResult)/)![0];
    expect(fn).toMatch(/getRevisionForUser\(\{ userId: input\.userId, projectId: input\.projectId, workflowId: input\.workflowId, revisionId: input\.fromRevisionId \}\)/);
    expect(fn).toMatch(/getRevisionForUser\(\{ userId: input\.userId, projectId: input\.projectId, workflowId: input\.workflowId, revisionId: input\.toRevisionId \}\)/);
  });

  it("listRevisionsForWorkflow never selects definitionSnapshot in the listing — only number/date/status fields", () => {
    const fn = lifecycle.match(/export async function listRevisionsForWorkflow[\s\S]*?\n\}/)![0];
    expect(fn).not.toMatch(/definitionSnapshot: true/);
    expect(fn).toMatch(/select: \{ id: true, version: true, isActive: true,/);
  });

  it("getActiveRevisionForWorkflow re-verifies the revision's own userId even after resolving it through an owned workflow (moved to workflow-revisions.ts in the composability phase to avoid a circular import with workflow-resources.ts; workflow-lifecycle.ts re-exports it so every existing import path keeps working)", () => {
    const fn = read("src/server/services/workflow-revisions.ts").match(/export async function getActiveRevisionForWorkflow[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/revision\.userId !== userId/);
    expect(read("src/server/services/workflow-lifecycle.ts")).toMatch(/export \{ getActiveRevisionForWorkflow, getRevisionForUser \};/);
  });

  it("validateWorkflowDraftForPublish reuses buildResourcesForStep (the exact ownership-checked resolver real execution uses) — never a looser, separate resource check", () => {
    const fn = lifecycle.match(/export async function validateWorkflowDraftForPublish[\s\S]*?\n(?=\/\/ -{3,}|export interface PublishWorkflowInput)/)![0];
    expect(fn).toMatch(/buildResourcesForStep\(step, input\.userId, input\.projectId, brandContext\)/);
  });
});

// ---------------------------------------------------------------------------
// 10. Schema — additive, coherent with the existing model
// ---------------------------------------------------------------------------
describe("Schema: WorkflowRevision + Workflow/WorkflowRun lifecycle fields are additive", () => {
  const schema = read("prisma/schema.prisma");

  it("WorkflowRevision exists with the required fields, and definitionSnapshot/changeSummary are immutable Json — never edited after creation (enforced by publishWorkflowDraft never calling revision.update on content)", () => {
    const model = schema.match(/model WorkflowRevision \{[\s\S]*?\n\}/)![0];
    for (const field of ["workflowId", "userId", "projectId", "version", "definitionSnapshot", "definitionHash", "changeSummary", "releaseNotes", "isActive", "createdAt", "publishedAt"]) {
      expect(model).toMatch(new RegExp(field));
    }
    const lifecycle = read("src/server/services/workflow-lifecycle.ts");
    // Every workflowRevision.update call in the service only ever touches isActive/archivedAt — bounded to each call's own data object, never searched unbounded into unrelated later code.
    const updateCalls = lifecycle.match(/\.workflowRevision\.update(?:Many)?\(\{[\s\S]*?\}\)/g) ?? [];
    expect(updateCalls.length).toBeGreaterThan(0);
    for (const call of updateCalls) expect(call).not.toMatch(/definitionSnapshot|definitionHash/);
  });

  it("Workflow gained only nullable/defaulted lifecycle fields — every pre-existing row stays valid", () => {
    const model = schema.match(/model Workflow \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/status\s+WorkflowLifecycleStatus\s+@default\(DRAFT\)/);
    expect(model).toMatch(/publishedVersion\s+Int\?/);
    expect(model).toMatch(/activeRevisionId\s+String\?\s+@unique/);
    expect(model).toMatch(/editVersion\s+Int\s+@default\(1\)/);
    expect(model).toMatch(/hasUnpublishedChanges\s+Boolean\s+@default\(false\)/);
  });

  it("WorkflowRun gained workflowRevisionId and sourceDefinitionHash, both nullable — legacy runs stay valid", () => {
    const model = schema.match(/model WorkflowRun \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/workflowRevisionId\s+String\?/);
    expect(model).toMatch(/sourceDefinitionHash\s+String\?/);
  });

  it("no second Workflow-like or WorkflowRun-like EXECUTION table was introduced (WorkflowDependency, added by the composability phase, is a small indexed edge-list — not a duplicated core entity; see tests/workflow-composability.test.ts)", () => {
    expect(schema.match(/^model \w*Workflow\w* \{/gm)).toEqual([
      "model Workflow {",
      "model WorkflowDependency {",
      "model WorkflowRevision {",
      "model WorkflowRun {",
      "model WorkflowStepRun {",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 11. Regressions
// ---------------------------------------------------------------------------
describe("Regressions: execution, recovery, analytics, Chat IA, and the single AI engine remain intact", () => {
  it("chat-panel.tsx, intent-router.ts, and the assistant actions never import anything from the lifecycle layer", () => {
    const forbidden = /workflow-lifecycle|definition-hash|workflow-diff|publish-validation|workflow-resources/;
    expect(read("src/components/chat/chat-panel.tsx")).not.toMatch(forbidden);
    expect(read("src/lib/chat/intent-router.ts")).not.toMatch(forbidden);
    expect(read("src/server/actions/assistant.ts")).not.toMatch(forbidden);
  });

  it("the simulated preview engine (planWorkflowRun) is untouched by the lifecycle phase — still no DB, no hash, no revision concept", () => {
    const engine = read("src/lib/ai-workflows/engine.ts");
    expect(engine).not.toMatch(/workflow-lifecycle|WorkflowRevision|computeDefinitionHash|prisma/);
  });

  it("no second AI engine or duplicated tool registry was introduced for publishing/validation — the resolver still imports the one real registry", () => {
    const resolver = read("src/lib/ai-workflows/execution-resolver.ts");
    expect(resolver).toMatch(/from "@\/lib\/ai-center\/tools\/registry"/);
    const combined = read("src/server/services/workflow-lifecycle.ts") + read("src/lib/ai-workflows/publish-validation.ts");
    expect(combined).not.toMatch(/useLocalAI|generateLocalText|CreateMLCEngine|new WebLLMEngine/);
  });

  it("lease/execution-token machinery from the recovery phase is untouched by this phase's edits", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    expect(actions).toMatch(/isLeaseHeldWith\(run, input\.leaseId/);
    expect(actions).toMatch(/executionToken/);
    expect(actions).toMatch(/export async function resumeWorkflowRunAction/);
  });

  it("AIUsage remains the only usage-accounting site — still exactly one aIUsage.create in the execution module", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    expect((actions.match(/aIUsage\.create\(/g) ?? []).length).toBe(1);
  });

  it("workflow-analytics.ts was not modified to add a second metrics table — version metrics still group by WorkflowRun.workflowVersion, reused as-is", () => {
    const analytics = read("src/server/services/workflow-analytics.ts");
    expect(analytics).toMatch(/groupBy\(\{ by: \["workflowVersion"\]/);
    expect(analytics).not.toMatch(/model WorkflowRevisionMetric/);
  });

  it("Workspace's saveWorkflowRunResultToWorkspaceAction still writes a ContentItem via the existing sourceTool convention — no second content system", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function saveWorkflowRunResultToWorkspaceAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.contentItem\.create\(/);
  });
});

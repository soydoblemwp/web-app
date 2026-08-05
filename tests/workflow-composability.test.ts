import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateWorkflowSteps,
  deriveWorkflowVariables,
  planWorkflowRun,
  WORKFLOW_STEP_TYPES,
  type WorkflowStep,
} from "@/lib/ai-workflows/engine";
import { detectWorkflowCycle, reachableFrom, type WorkflowDependencyEdge } from "@/lib/ai-workflows/workflow-graph";
import { resolveStepForExecution, type ExecutionResourceContext } from "@/lib/ai-workflows/execution-resolver";
import { WORKFLOW_EXECUTION_LIMITS, exceedsMaxNestingDepth } from "@/lib/ai-workflows/limits";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: "s1",
    type: "workflow",
    label: "Ejecutar sub-workflow",
    outputVariable: "sub_output",
    childWorkflowId: "child-1",
    childRevisionMode: "latest",
    ...overrides,
  };
}

const emptyResources: ExecutionResourceContext = { brandContext: "" };

// ---------------------------------------------------------------------------
// 1. Engine — the new "workflow" step type
// ---------------------------------------------------------------------------
describe("engine.ts: 'workflow' step type — structural validation, never a second engine", () => {
  it("WORKFLOW_STEP_TYPES includes 'workflow' exactly once", () => {
    expect(WORKFLOW_STEP_TYPES.filter((t) => t === "workflow")).toHaveLength(1);
  });

  it("flags a 'workflow' step with no childWorkflowId as missing_reference", () => {
    const issues = validateWorkflowSteps([step({ childWorkflowId: undefined })]);
    expect(issues.some((i) => i.code === "missing_reference")).toBe(true);
  });

  it("flags childRevisionMode 'specific' with no childRevisionId as missing_reference", () => {
    const issues = validateWorkflowSteps([step({ childRevisionMode: "specific", childRevisionId: undefined })]);
    expect(issues.some((i) => i.code === "missing_reference")).toBe(true);
  });

  it("accepts childRevisionMode 'specific' WITH a childRevisionId — no missing_reference", () => {
    const issues = validateWorkflowSteps([step({ childRevisionMode: "specific", childRevisionId: "rev-1" })]);
    expect(issues.some((i) => i.code === "missing_reference")).toBe(false);
  });

  it("rejects an invalid childRevisionMode value", () => {
    const issues = validateWorkflowSteps([step({ childRevisionMode: "draft" as never })]);
    expect(issues.some((i) => i.code === "invalid_child_revision_mode")).toBe(true);
  });

  it("a fully-configured 'workflow' step produces zero structural issues", () => {
    const issues = validateWorkflowSteps([step({ childInputMapping: { child_var: "{{parent_input}}" } })]);
    expect(issues).toHaveLength(0);
  });

  it("childInputMapping values are scanned for {{variables}} exactly like inputTemplate/fieldInputs — a variable used ONLY inside a mapping is still correctly derived as a workflow-level input", () => {
    const vars = deriveWorkflowVariables([step({ childInputMapping: { child_topic: "{{topic}}" } })]);
    expect(vars).toContain("topic");
  });

  it("a forward-reference inside childInputMapping is caught by the same validation every other step type gets", () => {
    const producer = step({ id: "s1", outputVariable: "out1", childInputMapping: { x: "{{out2}}" } });
    const other = { ...step({ id: "s2", outputVariable: "out2", childWorkflowId: "child-2" }) };
    const issues = validateWorkflowSteps([producer, other]);
    expect(issues.some((i) => i.code === "forward_reference")).toBe(true);
  });

  it("planWorkflowRun (the PREVIEW-only engine) produces a clearly-labeled '[Simulado]' placeholder for a 'workflow' step — never a real sub-execution, never touches the DB or a second engine", () => {
    const result = planWorkflowRun([step({ childInputMapping: {} })], {});
    expect(result.issues).toHaveLength(0);
    expect(result.finalOutput).toMatch(/^\[Simulado\]/);
    expect(result.finalOutput).toMatch(/sub-workflow/);
  });
});

// ---------------------------------------------------------------------------
// 2. workflow-graph.ts — pure cycle detection (real unit tests, DFS-based,
//    modeled directly on engine.ts's own detectCircularReferences)
// ---------------------------------------------------------------------------
describe("workflow-graph.ts: detectWorkflowCycle — direct and indirect recursion protection", () => {
  it("a self-reference (A → A) is always a cycle", () => {
    const result = detectWorkflowCycle([], "A", ["A"]);
    expect(result.hasCycle).toBe(true);
    expect(result.path).toEqual(["A", "A"]);
  });

  it("a simple linear chain A → B → C is never flagged as a cycle", () => {
    const edges: WorkflowDependencyEdge[] = [{ workflowId: "B", childWorkflowId: "C" }];
    const result = detectWorkflowCycle(edges, "A", ["B"]);
    expect(result.hasCycle).toBe(false);
    expect(result.path).toBeNull();
  });

  it("detects an indirect cycle A → B → C → A in ANY pattern, not just the direct case", () => {
    const edges: WorkflowDependencyEdge[] = [
      { workflowId: "B", childWorkflowId: "C" },
      { workflowId: "C", childWorkflowId: "A" },
    ];
    const result = detectWorkflowCycle(edges, "A", ["B"]);
    expect(result.hasCycle).toBe(true);
    expect(result.path).toEqual(["A", "B", "C", "A"]);
  });

  it("a diamond (A→B, A→C, B→D, C→D) is NOT a cycle — shared dependencies are legitimate, never a false positive", () => {
    const edges: WorkflowDependencyEdge[] = [
      { workflowId: "B", childWorkflowId: "D" },
      { workflowId: "C", childWorkflowId: "D" },
    ];
    const result = detectWorkflowCycle(edges, "A", ["B", "C"]);
    expect(result.hasCycle).toBe(false);
  });

  it("a cycle among OTHER workflows that never involves the workflow being published is not falsely reported (only cycles that loop back to the publishing workflow matter here)", () => {
    // X -> Y -> X is a real cycle elsewhere in the graph, but publishing A -> B (unrelated) must not report it.
    const edges: WorkflowDependencyEdge[] = [
      { workflowId: "X", childWorkflowId: "Y" },
      { workflowId: "Y", childWorkflowId: "X" },
    ];
    const result = detectWorkflowCycle(edges, "A", ["B"]);
    expect(result.hasCycle).toBe(false);
  });

  it("a longer indirect chain (5 hops) is still correctly detected", () => {
    const edges: WorkflowDependencyEdge[] = [
      { workflowId: "B", childWorkflowId: "C" },
      { workflowId: "C", childWorkflowId: "D" },
      { workflowId: "D", childWorkflowId: "E" },
      { workflowId: "E", childWorkflowId: "A" },
    ];
    const result = detectWorkflowCycle(edges, "A", ["B"]);
    expect(result.hasCycle).toBe(true);
    expect(result.path).toEqual(["A", "B", "C", "D", "E", "A"]);
  });

  it("multiple new child ids are all considered — a cycle through the SECOND one is still caught", () => {
    const edges: WorkflowDependencyEdge[] = [{ workflowId: "C", childWorkflowId: "A" }];
    const result = detectWorkflowCycle(edges, "A", ["B", "C"]);
    expect(result.hasCycle).toBe(true);
  });
});

describe("workflow-graph.ts: reachableFrom — transitive closure, cycle-safe", () => {
  it("computes every transitively-reachable node", () => {
    const edges: WorkflowDependencyEdge[] = [
      { workflowId: "A", childWorkflowId: "B" },
      { workflowId: "B", childWorkflowId: "C" },
      { workflowId: "C", childWorkflowId: "D" },
    ];
    expect(reachableFrom(edges, "A")).toEqual(new Set(["B", "C", "D"]));
  });

  it("never infinite-loops even against a malformed cyclic graph", () => {
    const edges: WorkflowDependencyEdge[] = [
      { workflowId: "A", childWorkflowId: "B" },
      { workflowId: "B", childWorkflowId: "A" },
    ];
    expect(reachableFrom(edges, "A")).toEqual(new Set(["A", "B"]));
  });

  it("a leaf node with no outgoing edges reaches nothing", () => {
    expect(reachableFrom([{ workflowId: "A", childWorkflowId: "B" }], "B")).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// 3. execution-resolver.ts — the new "sub_workflow" resolution kind (real,
//    unmocked unit tests — same pattern as every other step type here)
// ---------------------------------------------------------------------------
describe("resolveStepForExecution: 'workflow' step → 'sub_workflow' resolution kind", () => {
  it("errors when the frozen child reference is missing from resources (child workflow/revision unavailable)", () => {
    const resolution = resolveStepForExecution(step(), {}, emptyResources);
    expect(resolution.kind).toBe("error");
  });

  it("errors when only childWorkflowId is present but childRevisionId is missing", () => {
    const resolution = resolveStepForExecution(step(), {}, { brandContext: "", childWorkflowId: "child-1" });
    expect(resolution.kind).toBe("error");
  });

  it("resolves to 'sub_workflow' and renders childInputMapping against the PARENT's own resolved variables", () => {
    const s = step({ childInputMapping: { child_topic: "Sobre {{topic}}", child_tone: "{{tone}}" } });
    const resolution = resolveStepForExecution(
      s,
      { topic: "cámaras vintage", tone: "cercano" },
      { brandContext: "", childWorkflowId: "child-1", childRevisionId: "rev-1" }
    );
    expect(resolution.kind).toBe("sub_workflow");
    if (resolution.kind === "sub_workflow") {
      expect(resolution.childInputVariables).toEqual({ child_topic: "Sobre cámaras vintage", child_tone: "cercano" });
    }
  });

  it("a missing variable referenced inside childInputMapping is a real error, not silently rendered empty", () => {
    const s = step({ childInputMapping: { child_topic: "{{undeclared_variable}}" } });
    const resolution = resolveStepForExecution(s, {}, { brandContext: "", childWorkflowId: "child-1", childRevisionId: "rev-1" });
    expect(resolution.kind).toBe("error");
  });

  it("an empty childInputMapping resolves cleanly to an empty childInputVariables object — a SubWorkflow with no inputs is legal", () => {
    const resolution = resolveStepForExecution(
      step({ childInputMapping: undefined }),
      {},
      { brandContext: "", childWorkflowId: "child-1", childRevisionId: "rev-1" }
    );
    expect(resolution.kind).toBe("sub_workflow");
    if (resolution.kind === "sub_workflow") expect(resolution.childInputVariables).toEqual({});
  });

  it("never returns systemPrompt/userPrompt for a 'workflow' step — it is never itself an ai_call, only its nested steps can be", () => {
    const resolution = resolveStepForExecution(step(), {}, { brandContext: "", childWorkflowId: "child-1", childRevisionId: "rev-1" });
    expect(resolution).not.toHaveProperty("systemPrompt");
    expect(resolution).not.toHaveProperty("userPrompt");
  });
});

// ---------------------------------------------------------------------------
// 4. Depth limiting — real unit test for the pure predicate
// ---------------------------------------------------------------------------
describe("limits.ts: exceedsMaxNestingDepth — configurable ceiling on SubWorkflow nesting", () => {
  it("depth at the limit is allowed, one past it is not", () => {
    const max = WORKFLOW_EXECUTION_LIMITS.MAX_WORKFLOW_NESTING_DEPTH;
    expect(exceedsMaxNestingDepth(max)).toBe(false);
    expect(exceedsMaxNestingDepth(max + 1)).toBe(true);
  });

  it("depth 0 (a top-level run) is always within limits", () => {
    expect(exceedsMaxNestingDepth(0)).toBe(false);
  });

  it("the limit is a real, positive, finite number — never 0 or unbounded", () => {
    expect(WORKFLOW_EXECUTION_LIMITS.MAX_WORKFLOW_NESTING_DEPTH).toBeGreaterThan(0);
    expect(Number.isFinite(WORKFLOW_EXECUTION_LIMITS.MAX_WORKFLOW_NESTING_DEPTH)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Snapshots — frozen child reference, never a live re-resolve (structural,
//    against the real source — DB-backed code, same convention as every
//    other phase's tests in this suite)
// ---------------------------------------------------------------------------
describe("Snapshots: a SubWorkflow's target revision is frozen at PARENT-snapshot-build time, never re-resolved 'latest' at run time", () => {
  const resources = read("src/server/services/workflow-resources.ts");
  const fn = resources.match(/case "workflow": \{[\s\S]*?\n    \}\n\n    case "ai_tool":/)![0];

  it("resolves the child's active revision for 'latest' mode, or the exact pinned revision for 'specific' mode — never falls back to the live draft", () => {
    expect(fn).toMatch(/getActiveRevisionForWorkflow\(child\.id, userId\)/);
    expect(fn).toMatch(/getRevisionForUser\(/);
    expect(fn).not.toMatch(/child\.steps/); // never reads the live, editable draft steps
  });

  it("verifies ownership AND project scoping before freezing anything — the exact same convention prompt_library/ai_template already use", () => {
    expect(fn).toMatch(/child\.projectId && child\.projectId !== projectId/);
    expect(fn).toMatch(/getWorkflowForUser\(step\.childWorkflowId, userId\)/);
  });

  it("refuses to freeze a reference to an ARCHIVED child workflow", () => {
    expect(fn).toMatch(/child\.status === "ARCHIVED"/);
  });

  it("freezes childRevisionId + childDefinitionHash — the hash requirement from the spec ('congelar... su hash')", () => {
    expect(fn).toMatch(/childRevisionId: revision\.id,/);
    expect(fn).toMatch(/childDefinitionHash: revision\.definitionHash,/);
  });

  it("prepareWorkflowStepAction loads the child's revision by the FROZEN childRevisionId read from the snapshot's own resources — never by re-deriving 'latest' from the live child workflow at run time", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const subWorkflowBranch = actions.match(/if \(resolution\.kind === "sub_workflow"\) \{[\s\S]*?\n  \}\n\n  const completed/)![0];
    expect(subWorkflowBranch).toMatch(/prisma\.workflowRevision\.findUnique\(\{ where: \{ id: childRevisionId \} \}\)/);
    expect(subWorkflowBranch).not.toMatch(/getActiveRevisionForWorkflow/);
  });
});

// ---------------------------------------------------------------------------
// 6. Dependencies — indexed edge-list, recomputed on publish, "quién usa /
//    de quién depende", checked before archiving
// ---------------------------------------------------------------------------
describe("Dependencies: WorkflowDependency edges recomputed on every publish, queried before archiving", () => {
  const lifecycle = read("src/server/services/workflow-lifecycle.ts");

  it("publish wholesale-replaces this workflow's own outgoing edges INSIDE the same transaction as the publish itself", () => {
    const fn = lifecycle.match(/export async function publishWorkflowDraft[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/await tx\.workflowDependency\.deleteMany\(\{ where: \{ workflowId: workflow\.id \} \}\);/);
    expect(fn).toMatch(/await tx\.workflowDependency\.createMany\(/);
  });

  it("cycle detection runs during pre-publish validation, using the REAL existing dependency graph (excluding this workflow's own stale edges) plus the draft's new ones", () => {
    const fn = lifecycle.match(/export async function validateWorkflowDraftForPublish[\s\S]*?\n(?=\/\/ -{3,}|export interface PublishWorkflowInput)/)![0];
    expect(fn).toMatch(/detectWorkflowCycle\(existingEdges, input\.workflowId, newChildIds\)/);
    expect(fn).toMatch(/\.filter\(\(edge\) => edge\.workflowId !== input\.workflowId\)/);
  });

  it("a blocking cycle error uses the code 'circular_workflow_reference' — a real PublishIssue, not a warning", () => {
    const fn = lifecycle.match(/export async function validateWorkflowDraftForPublish[\s\S]*?\n(?=\/\/ -{3,}|export interface PublishWorkflowInput)/)![0];
    expect(fn).toMatch(/"circular_workflow_reference"/);
    expect(fn).toMatch(/appendError\(/); // appendError always pushes severity "error", which blocks canPublish
  });

  it("listWorkflowsUsedBy / listWorkflowsThatUse are both scoped to the caller's own userId — never a cross-user leak", () => {
    const usedByFn = lifecycle.match(/export async function listWorkflowsUsedBy[\s\S]*?\n\}/)![0];
    const thatUseFn = lifecycle.match(/export async function listWorkflowsThatUse[\s\S]*?\n\}/)![0];
    expect(usedByFn).toMatch(/userId: input\.userId/);
    expect(thatUseFn).toMatch(/userId: input\.userId/);
  });

  it("'usado por' (dependents) is queried and surfaced to the UI BEFORE archiving — workflow-card.tsx fetches it on the archive click path", () => {
    const card = read("src/components/ai-workflows/workflow-card.tsx");
    const fn = card.match(/async function handleArchiveClick[\s\S]*?\n  \}/)![0];
    expect(fn).toMatch(/listWorkflowsThatUseAction\(projectId, workflow\.id\)/);
    expect(fn).toMatch(/setArchiveConfirm\(dependents\)/);
  });

  it("the WorkflowDependency table is a small indexed edge-list — unique per (workflowId, childWorkflowId), indexed both directions", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowDependency \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/@@unique\(\[workflowId, childWorkflowId\]\)/);
    expect(model).toMatch(/@@index\(\[workflowId\]\)/);
    expect(model).toMatch(/@@index\(\[childWorkflowId\]\)/);
  });
});

// ---------------------------------------------------------------------------
// 7. Recursion protection at RUN TIME — the second, independent layer on top
//    of publish-time cycle detection
// ---------------------------------------------------------------------------
describe("Recursion (run-time, belt-and-suspenders): ancestor-chain guard independent of the publish-time check", () => {
  const actions = read("src/server/actions/workflow-execution.ts");

  it("collectAncestorWorkflowIds always includes the CURRENT run's own workflowId, then walks parentRunId upward", () => {
    const fn = actions.match(/async function collectAncestorWorkflowIds[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/new Set<string>\(\[run\.workflowId\]\)/);
    expect(fn).toMatch(/cursor = run\.parentRunId/);
    expect(fn).toMatch(/cursor = parent\.parentRunId/);
  });

  it("the walk is bounded (never an unbounded loop even against a malformed/legacy chain)", () => {
    const fn = actions.match(/async function collectAncestorWorkflowIds[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/hops < WORKFLOW_EXECUTION_LIMITS\.MAX_WORKFLOW_NESTING_DEPTH \+ 2/);
  });

  it("the sub_workflow branch checks the ancestor set BEFORE ever creating/reusing a child run — a cycle is refused, not merely logged", () => {
    const fn = actions.match(/if \(resolution\.kind === "sub_workflow"\) \{[\s\S]*?\n  \}\n\n  const completed/)![0];
    expect(fn).toMatch(/const ancestorIds = await collectAncestorWorkflowIds\(run\);/);
    expect(fn).toMatch(/if \(ancestorIds\.has\(childWorkflowId\)\)/);
    expect(fn).toMatch(/await failRunAndRemainingSteps\(run, stepRow\.id, message\);/);
  });

  it("depth is checked strictly BEFORE the ancestor check and before any child run is created", () => {
    const fn = actions.match(/if \(resolution\.kind === "sub_workflow"\) \{[\s\S]*?\n  \}\n\n  const completed/)![0];
    const depthIndex = fn.indexOf("exceedsMaxNestingDepth");
    const ancestorIndex = fn.indexOf("collectAncestorWorkflowIds");
    const createIndex = fn.indexOf("resumeOrCreateChildRun");
    expect(depthIndex).toBeGreaterThan(-1);
    expect(depthIndex).toBeLessThan(ancestorIndex);
    expect(ancestorIndex).toBeLessThan(createIndex);
  });

  it("a child run always persists its own depth = parent.depth + 1, server-computed — never trusted from the client", () => {
    const fn = actions.match(/if \(resolution\.kind === "sub_workflow"\) \{[\s\S]*?\n  \}\n\n  const completed/)![0];
    expect(fn).toMatch(/const depth = run\.depth \+ 1;/);
    // PrepareWorkflowStepInput (the client-facing input type) never accepts a depth field.
    const inputType = actions.match(/export interface PrepareWorkflowStepInput \{[\s\S]*?\n\}/)![0];
    expect(inputType).not.toMatch(/depth/);
  });
});

// ---------------------------------------------------------------------------
// 8. Rollback still works — untouched by the composability phase
// ---------------------------------------------------------------------------
describe("Rollback: restoreRevisionAsDraft is untouched — SubWorkflow references travel with the revision like any other step field", () => {
  const lifecycle = read("src/server/services/workflow-lifecycle.ts");

  it("restoreRevisionAsDraft still only ever calls prisma.workflow.update — never touches WorkflowRevision or WorkflowDependency directly", () => {
    const fn = lifecycle.match(/export async function restoreRevisionAsDraft[\s\S]*?\n(?=\/\/ -{3,}|export async function archiveWorkflow)/)![0];
    expect(fn).not.toMatch(/prisma\.workflowRevision\.(update|delete|create)/);
    expect(fn).not.toMatch(/prisma\.workflowDependency\.(update|delete|create)/);
    expect(fn).toMatch(/prisma\.workflow\.update\(/);
  });

  it("a rolled-back draft's 'workflow' steps (including childWorkflowId/childRevisionId) are copied verbatim from the historical definitionSnapshot — never partially reconstructed", () => {
    const fn = lifecycle.match(/export async function restoreRevisionAsDraft[\s\S]*?\n(?=\/\/ -{3,}|export async function archiveWorkflow)/)![0];
    expect(fn).toMatch(/steps: def\.steps as unknown as Prisma\.InputJsonValue,/);
  });

  it("publishing again after a rollback recomputes WorkflowDependency edges exactly like any other publish — no special-cased path for a rollback-then-publish", () => {
    // publishWorkflowDraft itself doesn't branch on "was this a rollback" — it always recomputes from `steps` unconditionally.
    const fn = lifecycle.match(/export async function publishWorkflowDraft[\s\S]*?\n\}/)![0];
    expect(fn).not.toMatch(/isRollback|wasRolledBack/);
  });
});

// ---------------------------------------------------------------------------
// 9. Analytics — own vs. inherited duration, direct vs. inherited AI usage
// ---------------------------------------------------------------------------
describe("Analytics: getWorkflowRunComposition — own/inherited duration split, direct/inherited AI usage split, never a new usage-accounting system", () => {
  const analytics = read("src/server/services/workflow-analytics.ts");
  const fn = analytics.match(/export async function getWorkflowRunComposition[\s\S]*?\n\}/)![0];

  it("own duration = total duration minus the sum of DIRECT children's durations (grandchildren are already folded into their parent's own durationMs, never double-subtracted)", () => {
    expect(fn).toMatch(/const childrenDurationMs = directChildren\.reduce\(\(sum, c\) => sum \+ \(c\.durationMs \?\? 0\), 0\);/);
    expect(fn).toMatch(/const ownDurationMs = run\.durationMs !== null \? Math\.max\(0, run\.durationMs - childrenDurationMs\) : null;/);
    expect(fn).toMatch(/prisma\.workflowRun\.findMany\(\{ where: \{ parentRunId: runId \}/);
  });

  it("direct AI usage reads AIUsage.workflowRunId = this run; inherited reads it across every DESCENDANT run — both reuse the existing AIUsage correlation, never a second usage table", () => {
    expect(fn).toMatch(/prisma\.aIUsage\.count\(\{ where: \{ workflowRunId: runId \} \}\)/);
    expect(fn).toMatch(/prisma\.aIUsage\.count\(\{ where: \{ workflowRunId: \{ in: descendantIds \} \} \}\)/);
  });

  it("the descendant walk is depth-bounded by the same MAX_WORKFLOW_NESTING_DEPTH real execution itself enforces — never unbounded", () => {
    const collectFn = analytics.match(/async function collectDescendantRunIds[\s\S]*?\n\}/)![0];
    expect(collectFn).toMatch(/WORKFLOW_EXECUTION_LIMITS\.MAX_WORKFLOW_NESTING_DEPTH/);
  });

  it("ownership is verified before returning anything — 'not mine' and 'doesn't exist' both resolve to null", () => {
    expect(fn).toMatch(/run\.userId !== scope\.userId \|\| run\.projectId !== scope\.projectId\) return null;/);
  });

  it("is exposed as a server action requiring requireProjectAccess — never a client-supplied scope", () => {
    const actionsFile = read("src/server/actions/workflow-analytics.ts");
    const actionFn = actionsFile.match(/export async function getWorkflowRunCompositionAction[\s\S]*?\n\}/)![0];
    expect(actionFn).toMatch(/requireProjectAccess\(projectId, "VIEWER"\)/);
  });
});

// ---------------------------------------------------------------------------
// 10. Workspace — navigating from a result to parent/child Workflow and Run
// ---------------------------------------------------------------------------
describe("Workspace: navigation between a run and its SubWorkflow parent/children", () => {
  const runsService = read("src/server/services/workflow-runs.ts");

  it("getRunNavigationInfo resolves the parent run/workflow via the step that spawned THIS run, and lists children via the indexed parentRunId — never a JSON scan", () => {
    const fn = runsService.match(/export async function getRunNavigationInfo[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/parentStepRun: \{/);
    expect(fn).toMatch(/prisma\.workflowRun\.findMany\(\{\s*where: \{ parentRunId: runId \}/);
  });

  it("ownership is checked once, at the root lookup — ownership can never be bypassed by asking for someone else's runId", () => {
    const fn = runsService.match(/export async function getRunNavigationInfo[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!run \|\| run\.userId !== userId\) return null;/);
  });

  it("RunDetailPanel renders parent/child navigation links AND composition metrics, both fetched alongside the existing analytics detail — never a duplicated fetch of the same data", () => {
    const panel = read("src/components/ai-workflows/analytics/run-detail-panel.tsx");
    expect(panel).toMatch(/getWorkflowRunCompositionAction/);
    expect(panel).toMatch(/getRunNavigationInfoAction/);
    expect(panel).toMatch(/workflowNavHref/);
  });

  it("the navigation link lands on the AI Workflows hub with ?openWorkflow=&openRun= — WorkflowHub reads it back and opens the exact right card/run", () => {
    const panel = read("src/components/ai-workflows/analytics/run-detail-panel.tsx");
    expect(panel).toMatch(/\/dashboard\/\$\{projectId\}\/ai-workflows\?openWorkflow=\$\{workflowId\}&openRun=\$\{targetRunId\}/);

    const hub = read("src/components/ai-workflows/workflow-hub.tsx");
    expect(hub).toMatch(/searchParams\.get\("openWorkflow"\)/);
    expect(hub).toMatch(/searchParams\.get\("openRun"\)/);

    const card = read("src/components/ai-workflows/workflow-card.tsx");
    expect(card).toMatch(/initialMode\?:/);
    expect(card).toMatch(/focusRunId\?:/);
  });
});

// ---------------------------------------------------------------------------
// 11. Security — ownership through the whole chain, never another user's workflow
// ---------------------------------------------------------------------------
describe("Security: ownership verified through the entire SubWorkflow chain, never trusts client-sent snapshot/depth/ancestry", () => {
  const resources = read("src/server/services/workflow-resources.ts");
  const actions = read("src/server/actions/workflow-execution.ts");

  it("a 'workflow' step can only ever reference a child workflow the SAME user owns — getWorkflowForUser's own ownership check, never a raw findUnique", () => {
    const fn = resources.match(/case "workflow": \{[\s\S]*?\n    \}\n\n    case "ai_tool":/)![0];
    expect(fn).toMatch(/getWorkflowForUser\(step\.childWorkflowId, userId\)/);
    expect(fn).not.toMatch(/prisma\.workflow\.findUnique\(\{ where: \{ id: step\.childWorkflowId \} \}\)/);
  });

  it("the frozen revision is re-verified (userId AND workflowId) at the moment the child run is actually created — never blindly trusted from the snapshot alone", () => {
    const fn = actions.match(/if \(resolution\.kind === "sub_workflow"\) \{[\s\S]*?\n  \}\n\n  const completed/)![0];
    expect(fn).toMatch(/childRevision\.userId !== userId \|\| childRevision\.workflowId !== childWorkflowId/);
  });

  it("createRunFromSnapshot's new parentRunId/parentStepRunId/depth parameters are only ever supplied by prepareWorkflowStepAction's own server-side sub_workflow branch — never accepted from any client-facing action input", () => {
    const startInput = actions.match(/export interface StartWorkflowRunInput \{[\s\S]*?\n\}/)![0];
    const prepareInput = actions.match(/export interface PrepareWorkflowStepInput \{[\s\S]*?\n\}/)![0];
    for (const inputType of [startInput, prepareInput]) {
      expect(inputType).not.toMatch(/parentRunId/);
      expect(inputType).not.toMatch(/parentStepRunId/);
      expect(inputType).not.toMatch(/depth/);
    }
  });

  it("countActiveWorkflowRunsForUser scopes to parentRunId: null — a SubWorkflow chain's own internal nesting can never eat into (or be confused with) the user's top-level concurrent-execution quota", () => {
    const runsService = read("src/server/services/workflow-runs.ts");
    const fn = runsService.match(/export async function countActiveWorkflowRunsForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/parentRunId: null,/);
  });

  it("every new/modified exported action in workflow-execution.ts and workflow-lifecycle.ts still calls requireProjectAccess before touching data", () => {
    // beginFreshRun/prepareWorkflowStepCore/cancelWorkflowRunCore (Fase 33) are
    // an intentional, documented exception: real, reusable cores that take an
    // already-resolved userId instead of a session, so Automation Center's
    // scheduler/webhook/event-triggered runs (which have no HTTP session) can
    // call the SAME execution engine — never a duplicate. Every actual session
    // check still happens exactly once, in the thin exported *Action wrapper
    // that calls each of these before delegating.
    const SESSION_FREE_CORE_FUNCTIONS = ["beginFreshRun", "prepareWorkflowStepCore", "cancelWorkflowRunCore"];
    for (const relativePath of ["src/server/actions/workflow-execution.ts", "src/server/actions/workflow-lifecycle.ts"]) {
      const source = read(relativePath);
      const fns = (source.match(/export async function \w+\([\s\S]*?\n\}/g) ?? []).filter(
        (fn) => !SESSION_FREE_CORE_FUNCTIONS.some((name) => fn.startsWith(`export async function ${name}(`))
      );
      expect(fns.length).toBeGreaterThan(5);
      for (const fn of fns) expect(fn).toMatch(/requireProjectAccess\(/);
    }
  });

  it("resumeOrCreateChildRun never accepts a client-supplied leaseOwner for a child run — always server-generated (randomUUID), since no real browser tab drives a child run independently", () => {
    const fn = actions.match(/async function resumeOrCreateChildRun[\s\S]*?\n(?=export async function beginFreshRun)/)![0];
    expect(fn).toMatch(/leaseOwner: randomUUID\(\)/);
  });
});

// ---------------------------------------------------------------------------
// 12. Schema — additive only, coherent with the existing model
// ---------------------------------------------------------------------------
describe("Schema: composability fields/model are additive — every pre-existing row stays valid", () => {
  const schema = read("prisma/schema.prisma");

  it("WorkflowRun gained parentRunId/parentStepRunId/depth, all nullable-or-defaulted — legacy rows stay valid", () => {
    const model = schema.match(/model WorkflowRun \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/parentRunId\s+String\?/);
    expect(model).toMatch(/parentStepRunId\s+String\?\s+@unique/);
    expect(model).toMatch(/depth\s+Int\s+@default\(0\)/);
  });

  it("a migration for this phase exists, is purely additive (no DROP, no destructive ALTER on a pre-existing column), and every prior migration still exists untouched", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    const newMigration = migrationDirs.find((name) => name.endsWith("add_workflow_composability"));
    expect(newMigration).toBeDefined();

    const sql = read(`prisma/migrations/${newMigration}/migration.sql`);
    expect(sql).toMatch(/CREATE TABLE "WorkflowDependency"/);
    expect(sql).toMatch(/ADD COLUMN\s+"parentRunId" TEXT/);
    expect(sql).toMatch(/ADD COLUMN\s+"depth" INTEGER NOT NULL DEFAULT 0/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/DROP COLUMN/);

    for (const prior of ["20260724210000_add_workflow_lifecycle", "20260724200000_add_workflow_analytics"]) {
      expect(migrationDirs).toContain(prior);
    }
  });

  it("WorkflowRun's self-relation and the WorkflowStepRun back-relation are both declared — the FK lives on WorkflowRun only, never duplicated on both sides", () => {
    const model = schema.match(/model WorkflowRun \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/parentRun\s+WorkflowRun\?\s+@relation\("WorkflowRunParentChild", fields: \[parentRunId\], references: \[id\]/);
    expect(model).toMatch(/childRuns\s+WorkflowRun\[\]\s+@relation\("WorkflowRunParentChild"\)/);
    const stepRunModel = schema.match(/model WorkflowStepRun \{[\s\S]*?\n\}/)![0];
    expect(stepRunModel).not.toMatch(/childRunId\s+String/); // back-relation only, no redundant FK column
    expect(stepRunModel).toMatch(/childRun\s+WorkflowRun\?\s+@relation\("StepSpawnsChildRun"\)/);
  });
});

// ---------------------------------------------------------------------------
// 13. Regressions — no second engine, orchestrator/router/other systems intact
// ---------------------------------------------------------------------------
describe("Regressions: no second engine, real execution/recovery/lifecycle/analytics/Workspace/AI Center/Prompt Library/AI Templates/Brand Kits/Chat IA all remain intact", () => {
  it("no second AI engine was introduced — driveRun's SubWorkflow recursion reuses the exact same single `ai` (useLocalAI) instance from the ONE call at the top of the component, never a second useLocalAI() call", () => {
    const panel = read("src/components/ai-workflows/workflow-execution-panel.tsx");
    expect((panel.match(/useLocalAI\(\)/g) ?? []).length).toBe(1);
    const driveRunFn = panel.match(/async function driveRun[\s\S]*?\n(?=  async function runLoop)/)![0];
    expect(driveRunFn).toMatch(/ai\.generate\(/);
  });

  it("driveRun is genuinely recursive (calls itself for a SubWorkflow step) — this IS the 'reuse the existing engine' mechanism, not a second execution path", () => {
    const panel = read("src/components/ai-workflows/workflow-execution-panel.tsx");
    const fn = panel.match(/async function driveRun[\s\S]*?\n(?=  async function runLoop)/)![0];
    expect(fn).toMatch(/const childResult = await driveRun\(sub\.runId, sub\.leaseId, childInitial, childSetter\);/);
  });

  it("a SubWorkflow's real AI generation still logs through the ONE existing AIUsage.create call site in completeWorkflowStepAction — no new usage-accounting path was added for child runs", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    expect((actions.match(/aIUsage\.create\(/g) ?? []).length).toBe(1);
  });

  it("the resolver still imports the ONE real AI Center tool registry — no duplicated tool list for SubWorkflow resolution", () => {
    const resolver = read("src/lib/ai-workflows/execution-resolver.ts");
    expect(resolver).toMatch(/from "@\/lib\/ai-center\/tools\/registry"/);
    expect((resolver.match(/from "@\/lib\/ai-center\/tools\/registry"/g) ?? []).length).toBe(1);
  });

  it("Chat IA (chat-panel.tsx, intent-router.ts, assistant actions) never imports anything from the composability layer", () => {
    const forbidden = /workflow-graph|workflow-revisions|resumeOrCreateChildRun|childWorkflowId/;
    expect(read("src/components/chat/chat-panel.tsx")).not.toMatch(forbidden);
    expect(read("src/lib/chat/intent-router.ts")).not.toMatch(forbidden);
    expect(read("src/server/actions/assistant.ts")).not.toMatch(forbidden);
  });

  it("Prompt Library / AI Templates / Brand Kits services are untouched by this phase — still exported with their original signatures, still the ones workflow-resources.ts reuses (never re-implemented for SubWorkflow steps)", () => {
    expect(read("src/server/services/prompt-library.ts")).toMatch(/export async function getSavedPromptForUser/);
    expect(read("src/server/services/ai-templates.ts")).toMatch(/export async function getAiTemplateForUser/);
    expect(read("src/server/services/brand-profiles.ts")).toMatch(/export async function getBrandProfileForUser/);
    const resources = read("src/server/services/workflow-resources.ts");
    expect(resources).toMatch(/import \{ getSavedPromptForUser \} from "@\/server\/services\/prompt-library"/);
    expect(resources).toMatch(/import \{ getAiTemplateForUser \} from "@\/server\/services\/ai-templates"/);
  });

  it("the Orchestrator / Intent Router files were not modified to know about SubWorkflows — composability is entirely internal to the AI Workflows module", () => {
    const orchestrator = read("src/lib/chat/intent-router.ts");
    expect(orchestrator).not.toMatch(/childWorkflowId|childRevisionMode|WorkflowDependency/);
  });

  it("the simulated preview engine (planWorkflowRun) still never touches the DB, Prisma, or any lifecycle/composability concept — 'workflow' steps get a deterministic placeholder like every other type", () => {
    const engine = read("src/lib/ai-workflows/engine.ts");
    expect(engine).not.toMatch(/prisma|workflow-execution\.ts|workflow-graph|WorkflowDependency/);
  });

  it("no eval/new Function/arbitrary code execution was introduced anywhere in the composability layer", () => {
    const combined =
      read("src/lib/ai-workflows/workflow-graph.ts") +
      read("src/server/services/workflow-resources.ts") +
      read("src/server/actions/workflow-execution.ts") +
      read("src/server/services/workflow-lifecycle.ts");
    expect(combined).not.toMatch(/\beval\(/);
    expect(combined).not.toMatch(/new Function\(/);
  });

  it("Analytics' existing version/step/summary metrics queries are untouched — version metrics still group by WorkflowRun.workflowVersion as before", () => {
    const analytics = read("src/server/services/workflow-analytics.ts");
    expect(analytics).toMatch(/groupBy\(\{ by: \["workflowVersion"\]/);
  });
});

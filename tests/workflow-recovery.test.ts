import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { haveWorkflowStepsChanged, type WorkflowStep } from "@/lib/ai-workflows/engine";
import {
  canTransitionRun,
  isRunTerminal,
  isRunRecoverable,
  isRunAbandoned,
  isRetryableRunStatus,
  canReclaimStep,
} from "@/lib/ai-workflows/run-state";
import { WORKFLOW_LEASE, isLeaseActive, isLeaseHeldWith, isLeaseHeldByOther, nextLeaseExpiry } from "@/lib/ai-workflows/lease";

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
// 1. Versionado
// ---------------------------------------------------------------------------
describe("Versioning: Workflow.version only moves on real executable changes", () => {
  it("haveWorkflowStepsChanged is false for structurally identical steps, even with different key insertion order", () => {
    const a: WorkflowStep = { id: "s1", type: "transform", label: "T", outputVariable: "out", inputTemplate: "{{x}}", transformKind: "uppercase" };
    const b: WorkflowStep = { outputVariable: "out", transformKind: "uppercase", label: "T", inputTemplate: "{{x}}", id: "s1", type: "transform" };
    expect(haveWorkflowStepsChanged([a], [b])).toBe(false);
  });

  it("haveWorkflowStepsChanged is true when a step's inputTemplate, transformKind, or reference id changes", () => {
    const base = [step()];
    expect(haveWorkflowStepsChanged(base, [step({ inputTemplate: "{{otro}}" })])).toBe(true);
    expect(haveWorkflowStepsChanged(base, [step({ transformKind: "lowercase" })])).toBe(true);
    expect(
      haveWorkflowStepsChanged([step({ type: "ai_tool", toolSlug: "youtube-titulos" })], [step({ type: "ai_tool", toolSlug: "other-tool" })])
    ).toBe(true);
  });

  it("haveWorkflowStepsChanged is true when steps are reordered or a step is added/removed", () => {
    const s1 = step({ id: "s1" });
    const s2 = step({ id: "s2", outputVariable: "out2" });
    expect(haveWorkflowStepsChanged([s1, s2], [s2, s1])).toBe(true);
    expect(haveWorkflowStepsChanged([s1], [s1, s2])).toBe(true);
  });

  it("a new Workflow starts at version 1 (schema default)", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model Workflow \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/version\s+Int\s+@default\(1\)/);
  });

  it("saving a draft (updateWorkflowAction) NEVER bumps any version number — only an explicit publish does (see the draft/publish lifecycle phase, which superseded the old 'bump on every edit' behavior)", () => {
    const actions = read("src/server/actions/ai-workflows.ts");
    const fn = actions.match(/export async function updateWorkflowAction[\s\S]*?\n\}/)![0];
    expect(fn).not.toMatch(/haveWorkflowStepsChanged/);
    expect(fn).not.toMatch(/version:\s*nextVersion/);
    const lifecycle = read("src/server/services/workflow-lifecycle.ts");
    const draftFn = lifecycle.match(/export async function saveWorkflowDraft[\s\S]*?\n\}/)![0];
    expect(draftFn).not.toMatch(/publishedVersion:/);
    expect(draftFn).not.toMatch(/\bversion:\s*existing\.version/);
  });

  it("publishing (publishWorkflowDraft) is the ONLY place publishedVersion is ever incremented", () => {
    const lifecycle = read("src/server/services/workflow-lifecycle.ts");
    const publishFn = lifecycle.match(/export async function publishWorkflowDraft[\s\S]*?\n\}/)![0];
    expect(publishFn).toMatch(/const nextVersion = \(workflow\.publishedVersion \?\? 0\) \+ 1;/);
    expect(publishFn).toMatch(/publishedVersion: nextVersion,/);
  });

  it("purely visual/metadata actions (favorite, active toggle) never touch version", () => {
    const actions = read("src/server/actions/ai-workflows.ts");
    const favFn = actions.match(/export async function toggleFavoriteWorkflowAction[\s\S]*?\n\}/)![0];
    const activeFn = actions.match(/export async function toggleActiveWorkflowAction[\s\S]*?\n\}/)![0];
    expect(favFn).not.toMatch(/version/);
    expect(activeFn).not.toMatch(/version/);
  });

  it("every WorkflowRun freezes the version it ran with (workflowVersion), independent of the live Workflow.version", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowRun \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/workflowVersion\s+Int\s+@default\(1\)/);
  });
});

// ---------------------------------------------------------------------------
// 2. Snapshot inmutable
// ---------------------------------------------------------------------------
describe("Immutable run snapshot: built server-side, never trusted from the client", () => {
  it("WorkflowSnapshot freezes the workflow's name/description/category/variables/stopOnError/steps plus resolved resources and brand context", () => {
    const snapshot = read("src/lib/ai-workflows/snapshot.ts");
    expect(snapshot).toMatch(/steps: WorkflowStep\[\]/);
    expect(snapshot).toMatch(/resources: Record<string, ExecutionResourceContext>/);
    expect(snapshot).toMatch(/brandContext: string/);
    expect(snapshot).toMatch(/stopOnError: boolean/);
    expect(snapshot).toMatch(/workflowVersion: number/);
  });

  it("buildWorkflowSnapshot (shared in workflow-resources.ts) resolves every step's resources once, server-side, and fails fast (refuses the whole run) if any is unavailable", () => {
    const resources = read("src/server/services/workflow-resources.ts");
    const fn = resources.match(/export async function buildWorkflowSnapshot[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/for \(const step of source\.steps\)/);
    expect(fn).toMatch(/buildResourcesForStep\(step, userId, projectId, brandContext\)/);
    expect(fn).toMatch(/if \("error" in resolved\) return \{ error:/);
  });

  it("no server action's public *Input interface declares a snapshot, resources map, or brandContext FIELD (mentioning the concept in an explanatory doc-comment is fine, accepting it as data is not)", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const publicInterfaces = actions.match(/export interface \w+Input \{[\s\S]*?\n\}/g) ?? [];
    expect(publicInterfaces.length).toBeGreaterThan(0);
    const fieldNameRe = /^\s*(?!\/\/|\*|\/\*)(snapshot|resources|brandContext)[?:]/im;
    for (const iface of publicInterfaces) {
      const withoutComments = iface.replace(/\/\*\*[\s\S]*?\*\//g, "");
      expect(withoutComments).not.toMatch(fieldNameRe);
    }
  });

  it("prepareWorkflowStepAction reads the step definition and its resources from the persisted snapshot, not a live re-fetch, whenever one exists", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function prepareWorkflowStepAction[\s\S]*?\n(?=export async function completeWorkflowStepAction)/)![0];
    expect(fn).toMatch(/const snapshot = readSnapshot\(run\)/);
    expect(fn).toMatch(/step = snapshot\.steps\[input\.stepIndex\]/);
    expect(fn).toMatch(/resources = step \? \(snapshot\.resources\[step\.id\]/);
    // The live-fetch path is only reached in the `else` branch, for legacy pre-snapshot runs.
    expect(fn).toMatch(/Legacy run created before snapshots existed/);
  });

  it("editing a Workflow's steps after a run started never mutates that run's own frozen snapshot — the snapshot is a copy taken once, at start time, never re-read from the live Workflow row afterward", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    // createRunFromSnapshot persists `params.snapshot` (an already-resolved, in-memory object) directly — it never re-queries prisma.workflow at run-creation-completion time, so nothing written after this call can retroactively change what was stored.
    const fn = actions.match(/async function createRunFromSnapshot[\s\S]*?\n(?=async function beginFreshRun)/)![0];
    expect(fn).toMatch(/workflowSnapshot: params\.snapshot as unknown as Prisma\.InputJsonValue/);
    expect(fn).not.toMatch(/prisma\.workflow\.findUnique/);
  });
});

// ---------------------------------------------------------------------------
// 3. Recuperación tras recarga — run-state.ts pure predicates (real unit tests)
// ---------------------------------------------------------------------------
describe("isRunRecoverable / isRunTerminal: exactly the spec's table", () => {
  it("pending, validating, running, and interrupted are all recoverable; completed and cancelled are not; failed requires retry, not resume", () => {
    expect(isRunRecoverable("PENDING")).toBe(true);
    expect(isRunRecoverable("VALIDATING")).toBe(true);
    expect(isRunRecoverable("RUNNING")).toBe(true);
    expect(isRunRecoverable("INTERRUPTED")).toBe(true);
    expect(isRunRecoverable("FAILED")).toBe(false);
    expect(isRunRecoverable("COMPLETED")).toBe(false);
    expect(isRunRecoverable("CANCELLED")).toBe(false);
  });

  it("completed/failed/cancelled are terminal; interrupted is NOT terminal (it's recoverable, unlike a real dead end)", () => {
    expect(isRunTerminal("COMPLETED")).toBe(true);
    expect(isRunTerminal("FAILED")).toBe(true);
    expect(isRunTerminal("CANCELLED")).toBe(true);
    expect(isRunTerminal("INTERRUPTED")).toBe(false);
    expect(isRunTerminal("RUNNING")).toBe(false);
  });

  it("failed, cancelled, and interrupted runs can all be retried as a fresh run; completed/running/pending cannot", () => {
    expect(isRetryableRunStatus("FAILED")).toBe(true);
    expect(isRetryableRunStatus("CANCELLED")).toBe(true);
    expect(isRetryableRunStatus("INTERRUPTED")).toBe(true);
    expect(isRetryableRunStatus("COMPLETED")).toBe(false);
    expect(isRetryableRunStatus("RUNNING")).toBe(false);
  });

  it("the run transition table allows RUNNING -> INTERRUPTED -> RUNNING (resume) and INTERRUPTED -> CANCELLED, but never INTERRUPTED -> COMPLETED directly", () => {
    expect(canTransitionRun("RUNNING", "INTERRUPTED")).toBe(true);
    expect(canTransitionRun("INTERRUPTED", "RUNNING")).toBe(true);
    expect(canTransitionRun("INTERRUPTED", "CANCELLED")).toBe(true);
    expect(canTransitionRun("INTERRUPTED", "COMPLETED")).toBe(false);
  });

  it("PENDING/VALIDATING can also reach RUNNING directly — the crash-recovery path for a run that never made it past its own creation", () => {
    expect(canTransitionRun("PENDING", "RUNNING")).toBe(true);
    expect(canTransitionRun("VALIDATING", "RUNNING")).toBe(true);
  });
});

describe("isRunAbandoned: the ONLY condition that turns RUNNING into INTERRUPTED", () => {
  const now = new Date("2026-07-24T12:00:00Z");

  it("a RUNNING run with a still-valid lease is not abandoned", () => {
    const run = { status: "RUNNING" as const, leaseId: "lease-1", leaseOwner: "tab-1", leaseExpiresAt: new Date("2026-07-24T12:00:30Z") };
    expect(isRunAbandoned(run, now)).toBe(false);
  });

  it("a RUNNING run whose lease already expired IS abandoned", () => {
    const run = { status: "RUNNING" as const, leaseId: "lease-1", leaseOwner: "tab-1", leaseExpiresAt: new Date("2026-07-24T11:59:00Z") };
    expect(isRunAbandoned(run, now)).toBe(true);
  });

  it("a RUNNING run that never had a lease at all (a legacy pre-Phase-22 row) is treated as abandoned too — the same recovery path picks it up", () => {
    const run = { status: "RUNNING" as const, leaseId: null, leaseOwner: null, leaseExpiresAt: null };
    expect(isRunAbandoned(run, now)).toBe(true);
  });

  it("a COMPLETED/FAILED/CANCELLED/INTERRUPTED run is never considered abandoned, regardless of its lease — abandonment only ever applies to RUNNING", () => {
    for (const status of ["COMPLETED", "FAILED", "CANCELLED", "INTERRUPTED"] as const) {
      expect(isRunAbandoned({ status, leaseId: null, leaseOwner: null, leaseExpiresAt: null }, now)).toBe(false);
    }
  });
});

describe("canReclaimStep: only ever an abandoned RUNNING step, never a terminal one", () => {
  it("only RUNNING steps can be reclaimed", () => {
    expect(canReclaimStep("RUNNING")).toBe(true);
    expect(canReclaimStep("PENDING")).toBe(false);
    expect(canReclaimStep("COMPLETED")).toBe(false);
    expect(canReclaimStep("FAILED")).toBe(false);
    expect(canReclaimStep("SKIPPED")).toBe(false);
    expect(canReclaimStep("CANCELLED")).toBe(false);
  });
});

describe("Reload reconstructs progress from WorkflowStepRun — never re-runs a completed step", () => {
  it("findRecoverableWorkflowRunAction is read-only detection: it queries the DB for non-terminal runs and performs the same lazy abandonment check prepare/resume do", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function findRecoverableWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/status: \{ in: \["PENDING", "VALIDATING", "RUNNING", "INTERRUPTED"\] \}/);
    expect(fn).toMatch(/isRunAbandoned\(run, now\)/);
    expect(fn).toMatch(/nextPendingStepIndex: effectiveRun\.steps\.findIndex\(\(s\) => s\.status === "PENDING"\)/);
  });

  it("the client's driveRun (the per-run loop runLoop now delegates to, recursively reused for SubWorkflow children too — see the composability phase) skips every step whose initial (resumed) status isn't 'pending' — a completed step from before the reload is never re-prepared", () => {
    const panel = read("src/components/ai-workflows/workflow-execution-panel.tsx");
    const fn = panel.match(/async function driveRun[\s\S]*?\n  \}/)![0];
    expect(fn).toMatch(/if \(initialSteps\[i\]\.status !== "pending"\) continue;/);
  });

  it("resumed step state comes from mergeRecoveredSteps, which reads status/output/errorMessage from the server's recovery view, never from React state left over from before the reload", () => {
    const panel = read("src/components/ai-workflows/workflow-execution-panel.tsx");
    const fn = panel.match(/function mergeRecoveredSteps[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/recovery\.steps\.find\(\(r\) => r\.stepId === s\.stepId\)/);
    expect(fn).toMatch(/output: known\?\.output/);
  });
});

// ---------------------------------------------------------------------------
// 4. Reanudación explícita
// ---------------------------------------------------------------------------
describe("resumeWorkflowRunAction: the only path back to RUNNING, always explicit", () => {
  const actions = read("src/server/actions/workflow-execution.ts");
  const fn = actions.match(/export async function resumeWorkflowRunAction[\s\S]*?\n\}/)![0];

  it("verifies auth, project access, and ownership (via requireProjectAccess + getWorkflowRunForUser) before touching anything", () => {
    expect(fn).toMatch(/requireProjectAccess\(input\.projectId, "VIEWER"\)/);
    expect(fn).toMatch(/getWorkflowRunForUser\(input\.runId, user\.id\)/);
  });

  it("refuses a non-recoverable run (completed/cancelled) and specifically calls out failed as retry-only", () => {
    expect(fn).toMatch(/if \(!isRunRecoverable\(current\.status\)\)/);
    expect(fn).toMatch(/current\.status === "FAILED"/);
  });

  it("refuses to resume while another tab still holds a valid lease", () => {
    expect(fn).toMatch(/if \(isLeaseHeldByOther\(current, input\.leaseOwner, now\)\)/);
    expect(fn).toMatch(/Otra pestaña tiene el control activo/);
  });

  it("re-checks the max run duration on resume — an abandoned run can't be resumed forever", () => {
    expect(fn).toMatch(/isRunDurationExceeded\(current\.startedAt \?\? current\.createdAt, now\)/);
  });

  it("mints a brand-new lease and never reuses the old (expired/foreign) one", () => {
    expect(fn).toMatch(/const leaseId = randomUUID\(\);/);
    expect(fn).toMatch(/leaseId,\s*\n\s*leaseOwner: input\.leaseOwner,/);
  });

  it("never itself calls the AI engine or logs AIUsage — resuming re-arms the run, it never consumes quota by itself", () => {
    expect(fn).not.toMatch(/aIUsage\.create/);
    expect(fn).not.toMatch(/useLocalAI|generateLocalText/);
  });

  it("the client requires an explicit confirmation click (confirming-resume) before calling resumeWorkflowRunAction — never automatic on mount", () => {
    const panel = read("src/components/ai-workflows/workflow-execution-panel.tsx");
    expect(panel).not.toMatch(/useEffect\(\(\) => \{\s*handleConfirmResume/);
    expect(panel).toMatch(/"confirming-resume"/);
    expect(panel).toMatch(/onClick=\{handleConfirmResume\}/);
  });
});

// ---------------------------------------------------------------------------
// 5. Lease y heartbeat — lease.ts pure predicates (real unit tests)
// ---------------------------------------------------------------------------
describe("Lease: DB-and-timestamps only, no WebSockets/Redis/queue", () => {
  const now = new Date("2026-07-24T12:00:00Z");

  it("a lease is active exactly while leaseId is set and leaseExpiresAt is in the future", () => {
    expect(isLeaseActive({ leaseId: "L1", leaseOwner: "tab-1", leaseExpiresAt: new Date("2026-07-24T12:00:01Z") }, now)).toBe(true);
    expect(isLeaseActive({ leaseId: "L1", leaseOwner: "tab-1", leaseExpiresAt: new Date("2026-07-24T11:59:59Z") }, now)).toBe(false);
    expect(isLeaseActive({ leaseId: null, leaseOwner: null, leaseExpiresAt: null }, now)).toBe(false);
  });

  it("isLeaseHeldWith only matches the exact current, still-valid leaseId — a stolen or guessed different id never matches", () => {
    const run = { leaseId: "L1", leaseOwner: "tab-1", leaseExpiresAt: new Date("2026-07-24T12:00:30Z") };
    expect(isLeaseHeldWith(run, "L1", now)).toBe(true);
    expect(isLeaseHeldWith(run, "L2", now)).toBe(false);
    expect(isLeaseHeldWith(run, "L1", new Date("2026-07-24T12:05:00Z"))).toBe(false); // expired by then
  });

  it("isLeaseHeldByOther is true only when a DIFFERENT owner currently holds a valid lease — my own tab's lease is never 'other'", () => {
    const run = { leaseId: "L1", leaseOwner: "tab-A", leaseExpiresAt: new Date("2026-07-24T12:00:30Z") };
    expect(isLeaseHeldByOther(run, "tab-B", now)).toBe(true);
    expect(isLeaseHeldByOther(run, "tab-A", now)).toBe(false);
    // Once expired, nobody "holds" it, so it's not "held by other" either — it's just free.
    expect(isLeaseHeldByOther(run, "tab-B", new Date("2026-07-24T12:05:00Z"))).toBe(false);
  });

  it("nextLeaseExpiry extends exactly WORKFLOW_LEASE.DURATION_MS forward, and the heartbeat interval is comfortably shorter (never a single missed tick expires it)", () => {
    const expiry = nextLeaseExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(WORKFLOW_LEASE.DURATION_MS);
    expect(WORKFLOW_LEASE.HEARTBEAT_INTERVAL_MS).toBeLessThan(WORKFLOW_LEASE.DURATION_MS);
  });

  it("prepare/complete/fail all reject a call whose leaseId doesn't match the run's current, valid lease — before touching any state", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const prepareFn = actions.match(/export async function prepareWorkflowStepAction[\s\S]*?\n(?=export async function completeWorkflowStepAction)/)![0];
    const completeFn = actions.match(/export async function completeWorkflowStepAction[\s\S]*?\n(?=export interface FailWorkflowStepInput)/)![0];
    const failFn = actions.match(/export async function failWorkflowStepAction[\s\S]*?\n(?=\/\/ -{3,}|export async function renewWorkflowRunLeaseAction)/)![0];
    expect(prepareFn).toMatch(/isLeaseHeldWith\(run, input\.leaseId, now\)/);
    expect(completeFn).toMatch(/isLeaseHeldWith\(run, input\.leaseId\)/);
    expect(failFn).toMatch(/isLeaseHeldWith\(run, input\.leaseId\)/);
  });

  it("renewWorkflowRunLeaseAction (heartbeat) also requires the exact current lease and refuses on a terminal run", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function renewWorkflowRunLeaseAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/isLeaseHeldWith\(run, input\.leaseId\)/);
    expect(fn).toMatch(/isRunTerminal\(run\.status\)/);
  });

  it("cancelling always releases the lease regardless of who holds it — it's the run owner's action, not lease-gated", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function cancelWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/leaseId: null,/);
    expect(fn).not.toMatch(/isLeaseHeldWith/);
  });

  it("completing the final step and failing a run both release the lease — nothing is left for any tab to keep controlling", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const completeStepFn = actions.match(/async function completeStepAndMaybeRun[\s\S]*?\n\}/)![0];
    const failRunFn = actions.match(/async function failRunAndRemainingSteps[\s\S]*?\n\}/)![0];
    expect(completeStepFn).toMatch(/leaseId: null,/);
    expect(failRunFn).toMatch(/leaseId: null,/);
  });

  it("no WebSocket, Redis, BullMQ, Inngest, Trigger.dev, or other queue/pubsub infrastructure was introduced for this — the lease/recovery code is plain Prisma + Date arithmetic", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const lease = read("src/lib/ai-workflows/lease.ts");
    const runState = read("src/lib/ai-workflows/run-state.ts");
    const panel = read("src/components/ai-workflows/workflow-execution-panel.tsx");
    const combined = actions + lease + runState + panel;
    expect(combined).not.toMatch(/\bnew WebSocket\(|\bioredis\b|\bbullmq\b|\binngest\b|trigger\.dev/i);
  });
});

// ---------------------------------------------------------------------------
// 6. Protección contra doble ejecución de pasos — attempt/executionToken
// ---------------------------------------------------------------------------
describe("Execution tokens: one per attempt, stale ones always rejected", () => {
  it("WorkflowStepRun has attemptNumber, executionToken, preparedAt, and lastAttemptAt", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model WorkflowStepRun \{[\s\S]*?\n\}/)![0];
    expect(model).toMatch(/attemptNumber\s+Int\s+@default\(1\)/);
    expect(model).toMatch(/executionToken\s+String\?/);
    expect(model).toMatch(/preparedAt\s+DateTime\?/);
    expect(model).toMatch(/lastAttemptAt\s+DateTime\?/);
  });

  it("prepareWorkflowStepAction mints a fresh, random executionToken every time it moves a step to RUNNING and returns it to the caller", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function prepareWorkflowStepAction[\s\S]*?\n(?=export async function completeWorkflowStepAction)/)![0];
    expect(fn).toMatch(/const executionToken = randomUUID\(\);/);
    expect(fn).toMatch(/data: \{ status: "RUNNING", startedAt: stepRow\.startedAt \?\? now, executionToken, preparedAt: now, lastAttemptAt: now \}/);
    expect(fn).toMatch(/executionToken \};/);
  });

  it("completeWorkflowStepAction rejects a result whose executionToken doesn't match the step's current one — a stale attempt can never overwrite a fresher result", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function completeWorkflowStepAction[\s\S]*?\n(?=export interface FailWorkflowStepInput)/)![0];
    expect(fn).toMatch(/stepRow\.executionToken !== input\.executionToken/);
    expect(fn).toMatch(/stepRow\.status !== "RUNNING"/);
  });

  it("failWorkflowStepAction applies the exact same token+status check before recording a failure", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function failWorkflowStepAction[\s\S]*?\n(?=\/\/ -{3,}|export async function renewWorkflowRunLeaseAction)/)![0];
    expect(fn).toMatch(/stepRow\.executionToken !== input\.executionToken/);
  });

  it("attemptNumber is only ever incremented for a step still RUNNING (an abandoned attempt) — never for a PENDING or terminal step — by resumeWorkflowRunAction (top-level runs) and its SubWorkflow analogue resumeOrCreateChildRun (child runs, composability phase); nowhere else", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const resumeFn = actions.match(/export async function resumeWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(resumeFn).toMatch(/current\.steps\.find\(\(s\) => canReclaimStep\(s\.status\)\)/);
    expect(resumeFn).toMatch(/attemptNumber: \{ increment: 1 \} \}/);
    const childResumeFn = actions.match(/async function resumeOrCreateChildRun[\s\S]*?\n(?=async function beginFreshRun)/)![0];
    expect(childResumeFn).toMatch(/current\.steps\.find\(\(s\) => canReclaimStep\(s\.status\)\)/);
    expect(childResumeFn).toMatch(/attemptNumber: \{ increment: 1 \} \}/);
    // Exactly these two sites in the whole file — never a third.
    const incrementCount = (actions.match(/attemptNumber: \{ increment: 1 \}/g) ?? []).length;
    expect(incrementCount).toBe(2);
  });

  it("the client threads executionToken from prepare through to complete/fail unchanged", () => {
    const panel = read("src/components/ai-workflows/workflow-execution-panel.tsx");
    expect(panel).toMatch(/executionToken: prepared\.executionToken \?\? ""/);
  });
});

// ---------------------------------------------------------------------------
// 7. Interrupción y expiración
// ---------------------------------------------------------------------------
describe("Interruption: lazily detected, never a fake background watcher", () => {
  it("INTERRUPTED is only ever assigned at the four documented detection points — prepare, resume, findRecoverable, and the SubWorkflow analogue resumeOrCreateChildRun (composability phase) — never anywhere claiming continuous monitoring", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const assignments = actions.match(/status: "INTERRUPTED"/g) ?? [];
    // prepareWorkflowStepAction, findRecoverableWorkflowRunAction, resumeWorkflowRunAction's own normalization step, and resumeOrCreateChildRun's — each assigns it once, always lazily (on next access), never from a background watcher.
    expect(assignments.length).toBe(4);
  });

  it("no cron job, setInterval, or scheduled task server-side ever flips a run to INTERRUPTED — detection only happens inside a request handler", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    expect(actions).not.toMatch(/setInterval|setTimeout|node-cron|CronJob/);
  });

  it("the interruption reason text is honest about how it was detected (lost connection/control), never claims active background surveillance", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    expect(actions).toMatch(/Se perdió la conexión con el navegador que controlaba esta ejecución\./);
  });

  it("an interrupted run can be resumed (back to RUNNING) or retried (new run) — both remain available, matching the spec's example table", () => {
    expect(canTransitionRun("INTERRUPTED", "RUNNING")).toBe(true);
    expect(isRetryableRunStatus("INTERRUPTED")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Reintentos: reanudar vs. reintentar-snapshot-original vs. versión actual
// ---------------------------------------------------------------------------
describe("Retry: default replays the frozen snapshot verbatim; current-version is an explicit opt-in", () => {
  const actions = read("src/server/actions/workflow-execution.ts");
  const fn = actions.match(/export async function retryWorkflowRunAction[\s\S]*?\n\}/)![0];

  it("retryOfRunId is always set on the new run, pointing at the original — traceable, never overwritten", () => {
    expect(fn).toMatch(/retryOfRunId: original\.id,/);
    const createFn = actions.match(/async function createRunFromSnapshot[\s\S]*?\n(?=async function beginFreshRun)/)![0];
    expect(createFn).toMatch(/retryOfRunId: params\.retryOfRunId,/);
  });

  it("without useCurrentVersion, retry reuses original.workflowSnapshot verbatim via createRunFromSnapshot — never rebuilds it from live resources", () => {
    expect(fn).toMatch(/const originalSnapshot = readSnapshot\(original\);/);
    expect(fn).toMatch(/snapshot: originalSnapshot,/);
  });

  it("useCurrentVersion: true takes the beginFreshRun path instead, which re-resolves everything against the CURRENT Workflow", () => {
    expect(fn).toMatch(/if \(input\.useCurrentVersion \|\| !originalSnapshot\)/);
    expect(fn).toMatch(/executionMode: "RETRY_CURRENT_VERSION",/);
  });

  it("a pre-Phase-22 run with no frozen snapshot falls back gracefully to the current-version path instead of throwing", () => {
    expect(fn).toMatch(/!originalSnapshot/);
  });

  it("Workflow.version bump and WorkflowRun.workflowVersion are independent — retrying with the original snapshot keeps using the OLD version even if the Workflow has since been edited", () => {
    const createFn = actions.match(/async function createRunFromSnapshot[\s\S]*?\n(?=async function beginFreshRun)/)![0];
    expect(createFn).toMatch(/workflowVersion: params\.snapshot\.workflowVersion,/);
  });

  it("retry always requires a fresh, caller-supplied idempotency key — never reuses or replays the original run's key", () => {
    expect(fn).toMatch(/isValidIdempotencyKey\(input\.idempotencyKey\)/);
    expect(fn).not.toMatch(/idempotencyKey: original\.idempotencyKey/);
  });
});

// ---------------------------------------------------------------------------
// 9. Recursos mutables — herramientas resueltas del registro real en ejecución
// ---------------------------------------------------------------------------
describe("Mutable resources: Prompt Library/AI Template/Brand Kit frozen; AI Center tools resolved live from the one real registry", () => {
  it("ai_tool steps still resolve the tool from the real, live findToolDefinition registry at execution time — never a frozen/duplicated copy of the tool's functions", () => {
    const resolver = read("src/lib/ai-workflows/execution-resolver.ts");
    expect(resolver).toMatch(/import \{ findToolDefinition \} from "@\/lib\/ai-center\/tools\/registry";/);
    expect(resolver).toMatch(/const tool = findToolDefinition\(step\.toolSlug/);
  });

  it("a tool removed from the registry after the run started produces a clear, safe error — never a silent swap to a different tool", () => {
    const resolver = read("src/lib/ai-workflows/execution-resolver.ts");
    expect(resolver).toMatch(/if \(!tool\) return \{ kind: "error", message: `La herramienta "\$\{step\.toolSlug\}" ya no existe/);
  });

  it("Prompt Library/AI Template/Brand Kit content is resolved and frozen ONCE at snapshot-build time (buildResourcesForStep, shared in workflow-resources.ts), reused verbatim by every prepare call afterward — no per-prepare re-fetch when a snapshot exists", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const resources = read("src/server/services/workflow-resources.ts");
    const buildFn = resources.match(/export async function buildResourcesForStep[\s\S]*?\n\}/)![0];
    expect(buildFn).toMatch(/getSavedPromptForUser\(step\.promptId, userId\)/);
    expect(buildFn).toMatch(/getAiTemplateForUser\(step\.templateId, userId\)/);
    const prepareFn = actions.match(/export async function prepareWorkflowStepAction[\s\S]*?\n(?=export async function completeWorkflowStepAction)/)![0];
    // Inside the snapshot branch there's no fresh buildResourcesForStep call — only in the legacy `else`.
    const snapshotBranch = prepareFn.slice(prepareFn.indexOf("if (snapshot) {"), prepareFn.indexOf("} else {"));
    expect(snapshotBranch).not.toMatch(/buildResourcesForStep\(/);
  });
});

// ---------------------------------------------------------------------------
// 10. Seguridad
// ---------------------------------------------------------------------------
describe("Security: manipulated client state is always rejected server-side", () => {
  it("resumeWorkflowRunAction can only ever resume a run resolved via getWorkflowRunForUser — a foreign runId resolves to 'not found', never another user's run", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function resumeWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!run \|\| run\.projectId !== input\.projectId\) return \{ error: "Ejecución no encontrada\." \};/);
  });

  it("findRecoverableWorkflowRunAction is scoped by both workflowId AND userId — it can never surface another user's run", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function findRecoverableWorkflowRunAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/where: \{ workflowId, userId: user\.id, status: \{ in: \[/);
  });

  it("a manipulated/forged leaseId never matches a real one — isLeaseHeldWith does exact equality against the server-stored, server-minted value only", () => {
    const lease = read("src/lib/ai-workflows/lease.ts");
    const fn = lease.match(/export function isLeaseHeldWith[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/run\.leaseId === presentedLeaseId/);
  });

  it("a manipulated step index still can't jump ahead — isNextRunnableStepIndex re-derives the next runnable index from persisted step statuses, ignoring what the client asked for except as a check", () => {
    const runState = read("src/lib/ai-workflows/run-state.ts");
    const fn = runState.match(/export function isNextRunnableStepIndex[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/const nextIndex = stepStatuses\.findIndex\(\(status\) => status === "PENDING"\)/);
    expect(fn).toMatch(/nextIndex === requestedIndex/);
  });

  it("a manipulated/forged prior-step output can never influence resolution — resolvedVariables is built only from run.steps rows already marked COMPLETED in the database, never from any client-sent map", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function prepareWorkflowStepAction[\s\S]*?\n(?=export async function completeWorkflowStepAction)/)![0];
    expect(fn).toMatch(/for \(const s of run\.steps\) \{\s*\n\s*if \(s\.status === "COMPLETED" && s\.output\) \{/);
    expect(fn).not.toMatch(/resolvedVariables\s*=\s*input\./);
  });

  it("a user attempting to renew or cancel someone else's lease is rejected by the same ownership+lease checks — no separate, weaker path exists for heartbeat", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function renewWorkflowRunLeaseAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(input\.projectId, "VIEWER"\)/);
    expect(fn).toMatch(/getWorkflowRunForUser\(input\.runId, user\.id\)/);
  });
});

// ---------------------------------------------------------------------------
// 11. Regresiones
// ---------------------------------------------------------------------------
describe("Regressions: Chat IA / Orchestrator / Intent Router / preview / AI Center all untouched by this phase", () => {
  it("chat-panel.tsx, intent-router.ts, and the assistant actions never import anything from this phase's recovery machinery", () => {
    const forbidden = /lease\.ts|snapshot\.ts|resumeWorkflowRunAction|renewWorkflowRunLeaseAction|findRecoverableWorkflowRunAction|WorkflowSnapshot/;
    expect(read("src/components/chat/chat-panel.tsx")).not.toMatch(forbidden);
    expect(read("src/lib/chat/intent-router.ts")).not.toMatch(forbidden);
    expect(read("src/server/actions/assistant.ts")).not.toMatch(forbidden);
  });

  it("planWorkflowRun (the simulated preview) still never imports lease/snapshot/recovery machinery or the real engine", () => {
    const engine = read("src/lib/ai-workflows/engine.ts");
    expect(engine).not.toMatch(/lease\.ts|WorkflowSnapshot|useLocalAI|generateLocalText|leaseId|executionToken/);
  });

  it("Phase 21's real per-AI-step quota logging (AIUsage) is untouched — still exactly one aIUsage.create, in completeWorkflowStepAction", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const usageSites = actions.match(/aIUsage\.create\(/g) ?? [];
    expect(usageSites.length).toBe(1);
    const completeFn = actions.match(/export async function completeWorkflowStepAction[\s\S]*?\n(?=export interface FailWorkflowStepInput)/)![0];
    expect(completeFn).toMatch(/aIUsage\.create\(/);
  });

  it("no second AI engine, no duplicated tool registry — the resolver still imports the one real registry and this phase added no client for a model/provider", () => {
    const resolver = read("src/lib/ai-workflows/execution-resolver.ts");
    expect(resolver).toMatch(/from "@\/lib\/ai-center\/tools\/registry"/);
    expect((read("src/lib/ai-workflows/lease.ts") + read("src/lib/ai-workflows/snapshot.ts") + read("src/server/actions/workflow-execution.ts")).match(
      /new WebLLMEngine|CreateMLCEngine/g
    )).toBeNull();
  });

  it("Workspace integration still saves real results as ContentItem with the same sourceTool convention — no second content system introduced", () => {
    const actions = read("src/server/actions/workflow-execution.ts");
    const fn = actions.match(/export async function saveWorkflowRunResultToWorkspaceAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.contentItem\.create\(/);
    expect(fn).toMatch(/sourceTool: step \? `workflow-run:/);
  });

  it("the AI Workflows CRUD actions (create/delete/duplicate) are unaffected — only updateWorkflowAction gained the version bump", () => {
    const actions = read("src/server/actions/ai-workflows.ts");
    const createFn = actions.match(/export async function createWorkflowAction[\s\S]*?\n\}/)![0];
    const deleteFn = actions.match(/export async function deleteWorkflowAction[\s\S]*?\n\}/)![0];
    expect(createFn).not.toMatch(/haveWorkflowStepsChanged/);
    expect(deleteFn).not.toMatch(/version/);
  });
});

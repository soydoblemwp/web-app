"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireProjectAccess } from "@/lib/permissions";
import { getWorkflowForUser } from "@/server/services/ai-workflows";
import { getActiveRevisionForWorkflow } from "@/server/services/workflow-lifecycle";
import { buildAiToolBrandContext, buildResourcesForStep, buildWorkflowSnapshot } from "@/server/services/workflow-resources";
import {
  getWorkflowRunForUser,
  countActiveWorkflowRunsForUser,
  listWorkflowRunsForWorkflow,
  getRunNavigationInfo,
} from "@/server/services/workflow-runs";
import { validateWorkflowSteps, type WorkflowStep } from "@/lib/ai-workflows/engine";
import { resolveStepForExecution, type ExecutionResourceContext } from "@/lib/ai-workflows/execution-resolver";
import type { WorkflowSnapshot } from "@/lib/ai-workflows/snapshot";
import { computeDefinitionHash, type CanonicalWorkflowDefinition } from "@/lib/ai-workflows/definition-hash";
import {
  isNextRunnableStepIndex,
  isRetryableRunStatus,
  isRunTerminal,
  isRunRecoverable,
  isRunAbandoned,
  canReclaimStep,
  isValidIdempotencyKey,
} from "@/lib/ai-workflows/run-state";
import { isLeaseHeldWith, isLeaseHeldByOther, nextLeaseExpiry } from "@/lib/ai-workflows/lease";
import { normalizeWorkflowError } from "@/lib/ai-workflows/error-normalization";
import {
  WORKFLOW_EXECUTION_LIMITS,
  exceedsMaxSteps,
  exceedsStepInputLimit,
  exceedsAccumulatedLimit,
  exceedsConcurrentRunLimit,
  exceedsMaxNestingDepth,
  isRunDurationExceeded,
  truncateForPersistence,
} from "@/lib/ai-workflows/limits";
import { LOCAL_MODEL_ID } from "@/lib/ai/local/model-config";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type RunWithSteps = NonNullable<Awaited<ReturnType<typeof getWorkflowRunForUser>>>;

const INTERRUPTION_REASON = "Se perdió la conexión con el navegador que controlaba esta ejecución.";

/**
 * Publishes workflow_run.completed/failed for EVERY terminal WorkflowRun —
 * whether started normally from the UI or by the Automation Center's own
 * bridge (src/server/services/automation-workflow-bridge.ts) — so other
 * automations can react to any workflow's completion, not just ones an
 * automation itself started (spec section 8/40). A dynamic import avoids a
 * top-level circular import: automation-workflow-bridge.ts itself imports
 * beginFreshRun/prepareWorkflowStepCore/cancelWorkflowRunCore from this
 * file, so this reference must stay deferred to call time. The bridge's own
 * idempotencyKey for these two events is identical
 * (`workflow_run.completed:${id}` / `workflow_run.failed:${id}`), so when a
 * run WAS automation-driven, this call safely no-ops against the row the
 * bridge already inserted — never a duplicate.
 */
async function notifyWorkflowRunTerminal(run: RunWithSteps, status: "COMPLETED" | "FAILED") {
  const { publishAutomationEvent } = await import("@/server/services/automation-events");
  // When this WorkflowRun was itself started by an AutomationRun, carry its causation/correlation/chainDepth forward so loop detection can trace the full ancestry (spec section 31) — a manually-started run has no such row, and the fields stay unset.
  const drivingAutomationRun = await prisma.workflowAutomationRun.findUnique({
    where: { workflowRunId: run.id },
    select: { id: true, correlationId: true, chainDepth: true },
  });
  await publishAutomationEvent({
    projectId: run.projectId,
    eventKey: status === "COMPLETED" ? "workflow_run.completed" : "workflow_run.failed",
    resourceId: run.id,
    payload: { id: run.id, workflowId: run.workflowId, status },
    idempotencyKey: `workflow_run.${status === "COMPLETED" ? "completed" : "failed"}:${run.id}`,
    causationAutomationRunId: drivingAutomationRun?.id ?? null,
    correlationId: drivingAutomationRun?.correlationId ?? null,
    chainDepth: drivingAutomationRun ? drivingAutomationRun.chainDepth + 1 : undefined,
  });
}

function workflowsPath(projectId: string) {
  return `/dashboard/${projectId}/ai-workflows`;
}

function readSnapshot(run: RunWithSteps): WorkflowSnapshot | null {
  return (run.workflowSnapshot as unknown as WorkflowSnapshot | null) ?? null;
}

/** Bounded (never more than MAX_WORKFLOW_NESTING_DEPTH+2 hops — a run's own depth already caps how far this can walk) belt-and-suspenders ancestor check for SubWorkflow recursion: walks parentRunId up from `run` and collects every ancestor's workflowId, including run's own. Publish-time cycle detection (src/server/services/workflow-lifecycle.ts) is the primary defense and blocks a cycle from ever being published; this is the second, independent layer that also protects a run against a cycle introduced by a race (e.g. two publishes interleaving) or a pre-lifecycle-phase graph gap — it must never be the ONLY thing standing between a cycle and an infinite loop, but it must always be checked anyway. */
async function collectAncestorWorkflowIds(run: RunWithSteps): Promise<Set<string>> {
  const ids = new Set<string>([run.workflowId]);
  let cursor = run.parentRunId;
  let hops = 0;
  while (cursor && hops < WORKFLOW_EXECUTION_LIMITS.MAX_WORKFLOW_NESTING_DEPTH + 2) {
    const parent: { workflowId: string; parentRunId: string | null } | null = await prisma.workflowRun.findUnique({
      where: { id: cursor },
      select: { workflowId: true, parentRunId: true },
    });
    if (!parent) break;
    ids.add(parent.workflowId);
    cursor = parent.parentRunId;
    hops += 1;
  }
  return ids;
}

/** Marks the run FAILED, the triggering step (if any) FAILED, and every remaining PENDING step SKIPPED — stopOnError's server-enforced effect. Always releases the lease: a failed run has nothing left to control. Also computes and persists durationMs + a stable normalizedErrorCode for both, so analytics never needs to re-read/re-parse the raw message. */
async function failRunAndRemainingSteps(run: RunWithSteps, failedStepRunId: string | null, message: string) {
  const truncatedMessage = message.slice(0, 2000);
  const normalizedErrorCode = normalizeWorkflowError(truncatedMessage);
  const now = new Date();
  const runDurationMs = run.startedAt ? now.getTime() - run.startedAt.getTime() : null;
  const failedStep = failedStepRunId ? run.steps.find((s) => s.id === failedStepRunId) : null;
  const stepDurationMs = failedStep?.startedAt ? now.getTime() - failedStep.startedAt.getTime() : null;

  await prisma.$transaction([
    prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        errorMessage: truncatedMessage,
        normalizedErrorCode,
        completedAt: now,
        durationMs: runDurationMs,
        leaseId: null,
        leaseOwner: null,
        leaseAcquiredAt: null,
        leaseExpiresAt: null,
      },
    }),
    ...(failedStepRunId
      ? [
          prisma.workflowStepRun.update({
            where: { id: failedStepRunId },
            data: { status: "FAILED", errorMessage: truncatedMessage, normalizedErrorCode, completedAt: now, durationMs: stepDurationMs },
          }),
        ]
      : []),
    prisma.workflowStepRun.updateMany({
      where: { workflowRunId: run.id, status: "PENDING" },
      data: { status: "SKIPPED" },
    }),
  ]);
  await notifyWorkflowRunTerminal(run, "FAILED");
}

async function completeStepAndMaybeRun(run: RunWithSteps, stepIndex: number, rawOutput: string) {
  const output = truncateForPersistence(rawOutput);
  const stepRow = run.steps.find((s) => s.stepIndex === stepIndex)!;
  const now = new Date();

  const stepDurationMs = stepRow.startedAt ? now.getTime() - stepRow.startedAt.getTime() : null;
  await prisma.workflowStepRun.update({
    where: { id: stepRow.id },
    data: { status: "COMPLETED", output, completedAt: now, durationMs: stepDurationMs },
  });

  const isFinalStep = stepIndex === run.steps.length - 1;
  if (isFinalStep) {
    // The run is done — release the lease, nothing left for any tab to control.
    const runDurationMs = run.startedAt ? now.getTime() - run.startedAt.getTime() : null;
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        finalOutput: output,
        completedAt: now,
        durationMs: runDurationMs,
        leaseId: null,
        leaseOwner: null,
        leaseAcquiredAt: null,
        leaseExpiresAt: null,
      },
    });
    await notifyWorkflowRunTerminal(run, "COMPLETED");
  } else {
    // A completed step is activity — extend the lease so the next step's prepare call isn't rejected as abandoned.
    await prisma.workflowRun.update({ where: { id: run.id }, data: { leaseExpiresAt: nextLeaseExpiry(now), lastHeartbeatAt: now } });
  }

  revalidatePath(workflowsPath(run.projectId));
  return { done: true as const, output, isFinalStep };
}

// ---------------------------------------------------------------------------
// Start / retry — both funnel through createRunFromSnapshot
// ---------------------------------------------------------------------------

export interface WorkflowRunStepSummary {
  stepId: string;
  index: number;
  type: string;
  label: string;
  outputVariable: string;
}

export interface StartWorkflowRunState {
  error?: string;
  runId?: string;
  /** The lease the caller now holds for this run — must be presented back on every prepare/complete/fail/heartbeat call. */
  leaseId?: string;
  steps?: WorkflowRunStepSummary[];
}

async function createRunFromSnapshot(params: {
  userId: string;
  projectId: string;
  workflowId: string;
  snapshot: WorkflowSnapshot;
  idempotencyKey: string;
  inputVariables: Record<string, string>;
  leaseOwner: string;
  retryOfRunId: string | null;
  executionMode: string;
  /** Set only when this run is a SubWorkflow started BY a "workflow" step of another run — never set for a user-initiated run. */
  parentRunId?: string;
  parentStepRunId?: string;
  depth?: number;
}): Promise<StartWorkflowRunState> {
  // DB-backed idempotency: the unique (userId, idempotencyKey) index makes
  // this upsert atomic — a repeated call with the same key can only ever
  // resolve to the one row it created the first time.
  const sourceDefinitionHash = computeDefinitionHash({
    name: params.snapshot.name,
    description: params.snapshot.description,
    category: params.snapshot.category,
    tags: [],
    steps: params.snapshot.steps,
    variables: params.snapshot.variables,
    stopOnError: params.snapshot.stopOnError,
  });
  const created = await prisma.workflowRun.upsert({
    where: { userId_idempotencyKey: { userId: params.userId, idempotencyKey: params.idempotencyKey } },
    create: {
      workflowId: params.workflowId,
      userId: params.userId,
      projectId: params.projectId,
      idempotencyKey: params.idempotencyKey,
      status: "VALIDATING",
      workflowVersion: params.snapshot.workflowVersion,
      workflowRevisionId: params.snapshot.revisionId,
      sourceDefinitionHash,
      workflowSnapshot: params.snapshot as unknown as Prisma.InputJsonValue,
      inputVariables: params.inputVariables as Prisma.InputJsonValue,
      startedAt: new Date(),
      retryOfRunId: params.retryOfRunId,
      executionMode: params.executionMode,
      parentRunId: params.parentRunId ?? null,
      parentStepRunId: params.parentStepRunId ?? null,
      depth: params.depth ?? 0,
      steps: {
        create: params.snapshot.steps.map((step, index) => ({
          stepId: step.id,
          stepIndex: index,
          stepType: step.type,
          outputVariable: step.outputVariable,
          status: "PENDING",
        })),
      },
    },
    update: {},
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });

  if (created.workflowId !== params.workflowId) {
    return { error: "Esta clave de ejecución ya se usó para otro workflow." };
  }

  // Only the call that genuinely just created the row grants itself the
  // initial lease — an idempotent replay (upsert resolved an existing row)
  // never re-grants one, so a duplicated request can never steal control
  // from the original caller.
  const now = new Date();
  const leaseId = randomUUID();
  const finalRun =
    created.status === "VALIDATING"
      ? await prisma.workflowRun.update({
          where: { id: created.id },
          data: {
            status: "RUNNING",
            leaseId,
            leaseOwner: params.leaseOwner,
            leaseAcquiredAt: now,
            leaseExpiresAt: nextLeaseExpiry(now),
            lastHeartbeatAt: now,
          },
          include: { steps: { orderBy: { stepIndex: "asc" } } },
        })
      : created;

  revalidatePath(workflowsPath(params.projectId));
  return {
    runId: finalRun.id,
    leaseId: finalRun.leaseId ?? undefined,
    steps: finalRun.steps.map((s) => ({
      stepId: s.stepId,
      index: s.stepIndex,
      type: s.stepType,
      label: params.snapshot.steps.find((d) => d.id === s.stepId)?.label ?? s.stepType,
      outputVariable: s.outputVariable,
    })),
  };
}

export interface ResumedSubWorkflowStep {
  stepId: string;
  status: string;
  output: string | null;
  errorMessage: string | null;
  attemptNumber: number;
}

type ResumeOrCreateChildRunResult =
  | { kind: "bootstrap"; runId: string; leaseId: string; steps: WorkflowRunStepSummary[]; resumedSteps?: ResumedSubWorkflowStep[] }
  | { kind: "already_done"; output: string }
  | { kind: "already_failed"; message: string }
  | { kind: "error"; message: string };

/**
 * A "workflow" step's child run is uniquely identified by its own
 * parentStepRunId (see the @unique constraint in prisma/schema.prisma) — so
 * re-preparing that step (e.g. after resumeWorkflowRunAction reclaims an
 * orphaned RUNNING step following a disconnect mid-SubWorkflow) must never
 * blindly create a SECOND child run, which would violate that constraint
 * and would also silently abandon whatever real progress the first child
 * run already made. This looks for an existing child first and reuses it:
 * already COMPLETED → the parent step resolves immediately with its output;
 * already FAILED/CANCELLED → the parent step fails with the same reason;
 * still in flight → its lease is reacquired (exactly like
 * resumeWorkflowRunAction does for a top-level run) and driving continues
 * from wherever it left off; only a genuinely new step gets a new run.
 */
async function resumeOrCreateChildRun(params: {
  parentRunId: string;
  parentStepRunId: string;
  userId: string;
  projectId: string;
  childWorkflowId: string;
  childSnapshot: WorkflowSnapshot;
  childInputVariables: Record<string, string>;
  depth: number;
}): Promise<ResumeOrCreateChildRunResult> {
  const existing = await prisma.workflowRun.findUnique({
    where: { parentStepRunId: params.parentStepRunId },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });

  if (!existing) {
    const created = await createRunFromSnapshot({
      userId: params.userId,
      projectId: params.projectId,
      workflowId: params.childWorkflowId,
      snapshot: params.childSnapshot,
      idempotencyKey: randomUUID(),
      inputVariables: params.childInputVariables,
      leaseOwner: randomUUID(),
      retryOfRunId: null,
      executionMode: "SUB_WORKFLOW",
      parentRunId: params.parentRunId,
      parentStepRunId: params.parentStepRunId,
      depth: params.depth,
    });
    if (created.error || !created.runId || !created.leaseId || !created.steps) {
      return { kind: "error", message: created.error ?? "No se pudo iniciar el sub-workflow." };
    }
    return { kind: "bootstrap", runId: created.runId, leaseId: created.leaseId, steps: created.steps };
  }

  if (existing.status === "COMPLETED") {
    return { kind: "already_done", output: existing.finalOutput ?? "" };
  }
  if (existing.status === "FAILED" || existing.status === "CANCELLED") {
    return { kind: "already_failed", message: existing.errorMessage ?? "El sub-workflow falló." };
  }

  const now = new Date();
  let current = existing;
  if (isRunAbandoned(current, now)) {
    current = await prisma.workflowRun.update({
      where: { id: current.id },
      data: { status: "INTERRUPTED", interruptionReason: INTERRUPTION_REASON, normalizedErrorCode: "lease_expired" },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });
  }
  if (!isRunRecoverable(current.status)) {
    return { kind: "error", message: "El sub-workflow ya no se puede reanudar." };
  }

  const leaseId = randomUUID();
  const orphanedStep = current.steps.find((s) => canReclaimStep(s.status));
  await prisma.$transaction([
    prisma.workflowRun.update({
      where: { id: current.id },
      data: {
        status: "RUNNING",
        resumedAt: now,
        interruptionReason: null,
        leaseId,
        leaseOwner: randomUUID(),
        leaseAcquiredAt: now,
        leaseExpiresAt: nextLeaseExpiry(now),
        lastHeartbeatAt: now,
      },
    }),
    ...(orphanedStep ? [prisma.workflowStepRun.update({ where: { id: orphanedStep.id }, data: { status: "PENDING", attemptNumber: { increment: 1 } } })] : []),
  ]);

  const finalChild = await prisma.workflowRun.findUniqueOrThrow({ where: { id: current.id }, include: { steps: { orderBy: { stepIndex: "asc" } } } });
  return {
    kind: "bootstrap",
    runId: finalChild.id,
    leaseId,
    steps: finalChild.steps.map((s) => ({
      stepId: s.stepId,
      index: s.stepIndex,
      type: s.stepType,
      label: params.childSnapshot.steps.find((d) => d.id === s.stepId)?.label ?? s.stepType,
      outputVariable: s.outputVariable,
    })),
    resumedSteps: finalChild.steps.map((s) => ({
      stepId: s.stepId,
      status: s.status,
      output: s.output,
      errorMessage: s.errorMessage,
      attemptNumber: s.attemptNumber,
    })),
  };
}

/**
 * The real, reusable core of "start a workflow run" — takes an
 * already-resolved userId rather than reading a session, so it's callable
 * both from the normal session-based actions below AND from server-side
 * callers with no HTTP session at all (Automation Center's scheduler/event/
 * webhook-triggered runs — see src/server/services/automation-workflow-bridge.ts).
 * Exported for exactly that reuse; every actual session/permission check
 * still happens once, in each thin action below, before this is ever called.
 */
export async function beginFreshRun(params: {
  userId: string;
  projectId: string;
  workflowId: string;
  idempotencyKey: string;
  inputVariables: Record<string, string>;
  leaseOwner: string;
  retryOfRunId: string | null;
  executionMode: string;
  /** "published": read the active WorkflowRevision (real production execution) — refuses to start if the workflow was never published. "draft_test": read the live, unpublished draft ("Probar borrador") — never the default, always an explicit user choice. */
  mode: "published" | "draft_test";
}): Promise<StartWorkflowRunState> {
  if (!isValidIdempotencyKey(params.idempotencyKey)) return { error: "Clave de ejecución inválida." };

  const workflow = await getWorkflowForUser(params.workflowId, params.userId);
  if (!workflow) return { error: "Workflow no encontrado." };
  if (workflow.status === "ARCHIVED") return { error: "Este workflow está archivado. Restáuralo antes de ejecutarlo." };
  if (!workflow.isActive) return { error: "Este workflow está desactivado. Actívalo antes de ejecutarlo." };

  let steps: WorkflowStep[];
  let snapshotSource: { name: string; description: string | null; category: string | null; variables: string[]; version: number; revisionId: string | null };

  if (params.mode === "published") {
    if (!workflow.activeRevisionId) {
      return { error: "Este workflow todavía no tiene ninguna versión publicada. Publícalo antes de ejecutarlo, o usa 'Probar borrador'." };
    }
    const revision = await getActiveRevisionForWorkflow(workflow.id, params.userId);
    if (!revision) return { error: "La versión publicada de este workflow ya no está disponible." };
    const definition = revision.definitionSnapshot as unknown as CanonicalWorkflowDefinition;
    steps = definition.steps;
    snapshotSource = { name: definition.name, description: definition.description, category: definition.category, variables: definition.variables, version: revision.version, revisionId: revision.id };
  } else {
    steps = workflow.steps;
    snapshotSource = {
      name: workflow.name,
      description: workflow.description,
      category: workflow.category,
      variables: workflow.variables,
      version: workflow.publishedVersion ?? 0,
      revisionId: null,
    };
  }

  if (exceedsMaxSteps(steps.length)) {
    return { error: `Este workflow supera el máximo de ${WORKFLOW_EXECUTION_LIMITS.MAX_STEPS_PER_RUN} pasos ejecutables.` };
  }

  const issues = validateWorkflowSteps(steps);
  if (issues.length > 0) return { error: `El workflow tiene errores de validación: ${issues[0].message}` };

  const activeRuns = await countActiveWorkflowRunsForUser(params.userId);
  if (exceedsConcurrentRunLimit(activeRuns)) {
    return {
      error: `Ya tienes ${WORKFLOW_EXECUTION_LIMITS.MAX_CONCURRENT_RUNS_PER_USER} ejecuciones activas. Espera a que terminen antes de iniciar otra.`,
    };
  }

  const snapshot = await buildWorkflowSnapshot(
    {
      id: workflow.id,
      version: snapshotSource.version,
      revisionId: snapshotSource.revisionId,
      isDraftTest: params.mode === "draft_test",
      name: snapshotSource.name,
      description: snapshotSource.description,
      category: snapshotSource.category,
      variables: snapshotSource.variables,
      steps,
    },
    params.userId,
    params.projectId
  );
  if ("error" in snapshot) return { error: snapshot.error };

  return createRunFromSnapshot({
    userId: params.userId,
    projectId: params.projectId,
    workflowId: workflow.id,
    snapshot,
    idempotencyKey: params.idempotencyKey,
    inputVariables: params.inputVariables,
    leaseOwner: params.leaseOwner,
    retryOfRunId: params.retryOfRunId,
    executionMode: params.executionMode,
  });
}

export interface StartWorkflowRunInput {
  projectId: string;
  workflowId: string;
  /** Client-generated (e.g. crypto.randomUUID()) once per "Ejecutar" click — a duplicate click with the same key resolves to the same run instead of creating a second one. */
  idempotencyKey: string;
  inputVariables: Record<string, string>;
  /** Opaque, client-generated per-tab id — becomes this run's initial lease owner. */
  leaseOwner: string;
}

/** "Ejecutar workflow" — always the stable, active PUBLISHED revision. Never silently falls back to the draft; if the workflow was never published, beginFreshRun refuses with a clear message directing the user to publish or use "Probar borrador" instead. */
export async function startWorkflowRunAction(input: StartWorkflowRunInput): Promise<StartWorkflowRunState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");
  return beginFreshRun({
    userId: user.id,
    projectId: input.projectId,
    workflowId: input.workflowId,
    idempotencyKey: input.idempotencyKey,
    inputVariables: input.inputVariables,
    leaseOwner: input.leaseOwner,
    retryOfRunId: null,
    executionMode: "PUBLISHED",
    mode: "published",
  });
}

/**
 * "Probar borrador" — an explicit, quota-consuming test execution of the
 * CURRENT, possibly-unpublished draft. Uses the exact same real engine,
 * lease/heartbeat, limits, and idempotency machinery as a real execution —
 * the only difference is where the step definitions come from and the
 * executionMode ("DRAFT_TEST") stamped on the resulting WorkflowRun, so
 * analytics and history never confuse it with production traffic. Never
 * creates a WorkflowRevision — testing a draft is not publishing it.
 */
export async function testDraftWorkflowRunAction(input: StartWorkflowRunInput): Promise<StartWorkflowRunState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");
  return beginFreshRun({
    userId: user.id,
    projectId: input.projectId,
    workflowId: input.workflowId,
    idempotencyKey: input.idempotencyKey,
    inputVariables: input.inputVariables,
    leaseOwner: input.leaseOwner,
    retryOfRunId: null,
    executionMode: "DRAFT_TEST",
    mode: "draft_test",
  });
}

// ---------------------------------------------------------------------------
// Prepare / complete / fail one step
// ---------------------------------------------------------------------------

export interface PrepareWorkflowStepInput {
  projectId: string;
  runId: string;
  stepIndex: number;
  /** Must match the run's current lease exactly, or the call is rejected. */
  leaseId: string;
}

export interface PrepareWorkflowStepState {
  error?: string;
  /** true: the step already fully resolved server-side (no AI call needed) and `output` is final. */
  done?: boolean;
  output?: string;
  /** Only set when done is false — the client must send exactly these through the existing local engine (useLocalAI) and report the result via completeWorkflowStepAction, presenting `executionToken` back unchanged. */
  systemPrompt?: string;
  userPrompt?: string;
  isFinalStep?: boolean;
  /** This attempt's one-time token — required by completeWorkflowStepAction/failWorkflowStepAction; a stale token from a superseded attempt is always rejected. */
  executionToken?: string;
  /** Set only for a "workflow" step (SubWorkflow) — a CHILD run has already been created and its lease acquired; the client must drive it through the exact same runLoop it uses for any run (never a second engine), then report the child's final output back via completeWorkflowStepAction for THIS step, using `executionToken` above. `done` stays false while this is set — the step isn't resolved yet, the client just has more driving to do. */
  subWorkflow?: {
    runId: string;
    leaseId: string;
    steps: WorkflowRunStepSummary[];
    workflowId: string;
    workflowName: string;
    /** Present only when reusing a child run that had already made partial progress (e.g. after a disconnect mid-SubWorkflow) — lets the client skip already-completed child steps instead of re-running them. Absent for a brand-new child. */
    resumedSteps?: ResumedSubWorkflowStep[];
  };
}

export async function prepareWorkflowStepAction(input: PrepareWorkflowStepInput): Promise<PrepareWorkflowStepState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");
  return prepareWorkflowStepCore(user.id, input);
}

/** Real core reused by Automation Center's headless step driver (see beginFreshRun's comment above) — identical logic to the session-based action, just parametrized by an already-resolved userId. */
export async function prepareWorkflowStepCore(userId: string, input: PrepareWorkflowStepInput): Promise<PrepareWorkflowStepState> {
  const run = await getWorkflowRunForUser(input.runId, userId);
  if (!run || run.projectId !== input.projectId) return { error: "Ejecución no encontrada." };

  const now = new Date();

  if (isRunAbandoned(run, now)) {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "INTERRUPTED", interruptionReason: INTERRUPTION_REASON, normalizedErrorCode: "lease_expired" } });
    return { error: "Esta ejecución se interrumpió (se perdió el control desde el navegador). Reanúdala para continuar." };
  }
  if (!isLeaseHeldWith(run, input.leaseId, now)) {
    return { error: "El control de esta ejecución expiró o pertenece a otra pestaña. Reanúdala para continuar." };
  }
  if (isRunDurationExceeded(run.startedAt ?? run.createdAt, now)) {
    await failRunAndRemainingSteps(run, null, "Se superó el tiempo máximo permitido para esta ejecución.");
    return { error: "Se superó el tiempo máximo permitido para esta ejecución." };
  }

  const stepStatuses = run.steps.map((s) => s.status);
  if (!isNextRunnableStepIndex(run.status, stepStatuses, input.stepIndex)) {
    return { error: "Este paso no está listo para ejecutarse (fuera de orden, o la ejecución ya no está activa)." };
  }

  const stepRow = run.steps.find((s) => s.stepIndex === input.stepIndex);
  if (!stepRow) return { error: "Paso no encontrado." };

  const snapshot = readSnapshot(run);
  let step: WorkflowStep | undefined;
  let resources: ExecutionResourceContext | { error: string };

  if (snapshot) {
    // The run always executes against its own frozen definition — never the
    // live (possibly since-edited) Workflow, and never anything the client
    // could send: this is read straight from the persisted snapshot.
    step = snapshot.steps[input.stepIndex];
    resources = step ? (snapshot.resources[step.id] ?? { brandContext: snapshot.brandContext }) : { error: "Paso no encontrado en el snapshot." };
  } else {
    // Legacy run created before snapshots existed (Phase 21) — fall back to
    // a live lookup, exactly as before, for backward compatibility only.
    const workflow = await getWorkflowForUser(run.workflowId, userId);
    if (!workflow) return { error: "Workflow no encontrado." };
    step = workflow.steps[input.stepIndex];
    if (!step || step.id !== stepRow.stepId) {
      await failRunAndRemainingSteps(run, stepRow.id, "El workflow cambió desde que se inició esta ejecución.");
      return { error: "El workflow cambió desde que se inició esta ejecución." };
    }
    const brandContext = await buildAiToolBrandContext(input.projectId, userId);
    resources = await buildResourcesForStep(step, userId, input.projectId, brandContext);
  }

  if (!step || step.id !== stepRow.stepId) {
    await failRunAndRemainingSteps(run, stepRow.id, "El snapshot de esta ejecución no coincide con sus pasos persistidos.");
    return { error: "El snapshot de esta ejecución no coincide con sus pasos persistidos." };
  }
  if ("error" in resources) {
    await failRunAndRemainingSteps(run, stepRow.id, resources.error);
    return { error: resources.error };
  }

  // Every valid variable so far: the run's own inputs plus every completed step's real, persisted output — never anything client-reported.
  const resolvedVariables: Record<string, string> = { ...(run.inputVariables as Record<string, string>) };
  let accumulatedChars = 0;
  for (const s of run.steps) {
    if (s.status === "COMPLETED" && s.output) {
      resolvedVariables[s.outputVariable] = s.output;
      accumulatedChars += s.output.length;
    }
  }

  const executionToken = randomUUID();
  await prisma.workflowStepRun.update({
    where: { id: stepRow.id },
    data: { status: "RUNNING", startedAt: stepRow.startedAt ?? now, executionToken, preparedAt: now, lastAttemptAt: now },
  });
  // Preparing a step is activity — extend the lease so a long generation that follows doesn't outlive it before the client's next heartbeat tick.
  await prisma.workflowRun.update({ where: { id: run.id }, data: { leaseExpiresAt: nextLeaseExpiry(now), lastHeartbeatAt: now } });

  const resolution = resolveStepForExecution(step, resolvedVariables, resources);

  if (resolution.kind === "error") {
    await failRunAndRemainingSteps(run, stepRow.id, resolution.message);
    return { error: resolution.message };
  }

  if (exceedsStepInputLimit(resolution.resolvedInputSummary)) {
    const message = `El contenido de este paso supera el máximo de ${WORKFLOW_EXECUTION_LIMITS.MAX_STEP_INPUT_CHARS} caracteres.`;
    await failRunAndRemainingSteps(run, stepRow.id, message);
    return { error: message };
  }
  if (exceedsAccumulatedLimit(accumulatedChars, resolution.resolvedInputSummary)) {
    const message = `Esta ejecución supera el máximo de ${WORKFLOW_EXECUTION_LIMITS.MAX_ACCUMULATED_CHARS} caracteres acumulados.`;
    await failRunAndRemainingSteps(run, stepRow.id, message);
    return { error: message };
  }

  await prisma.workflowStepRun.update({
    where: { id: stepRow.id },
    data: { resolvedInput: truncateForPersistence(resolution.resolvedInputSummary) },
  });

  if (resolution.kind === "ai_call") {
    return { done: false, systemPrompt: resolution.systemPrompt, userPrompt: resolution.userPrompt, executionToken };
  }

  if (resolution.kind === "sub_workflow") {
    const depth = run.depth + 1;
    if (exceedsMaxNestingDepth(depth)) {
      const message = `Se alcanzó la profundidad máxima de sub-workflows permitida (${WORKFLOW_EXECUTION_LIMITS.MAX_WORKFLOW_NESTING_DEPTH}).`;
      await failRunAndRemainingSteps(run, stepRow.id, message);
      return { error: message };
    }

    // resources.childWorkflowId/childRevisionId are guaranteed set here —
    // resolveStepForExecution only returns "sub_workflow" after checking both.
    const childWorkflowId = resources.childWorkflowId!;
    const childRevisionId = resources.childRevisionId!;
    const childWorkflowName = resources.childWorkflowName ?? childWorkflowId;

    const ancestorIds = await collectAncestorWorkflowIds(run);
    if (ancestorIds.has(childWorkflowId)) {
      const message = "Referencia circular detectada: este paso ejecutaría un workflow que ya forma parte de la cadena de ejecución actual.";
      await failRunAndRemainingSteps(run, stepRow.id, message);
      return { error: message };
    }

    const childRevision = await prisma.workflowRevision.findUnique({ where: { id: childRevisionId } });
    if (!childRevision || childRevision.userId !== userId || childRevision.workflowId !== childWorkflowId) {
      const message = "El workflow hijo de este paso ya no está disponible.";
      await failRunAndRemainingSteps(run, stepRow.id, message);
      return { error: message };
    }
    const childDefinition = childRevision.definitionSnapshot as unknown as CanonicalWorkflowDefinition;

    const childSnapshot = await buildWorkflowSnapshot(
      {
        id: childWorkflowId,
        version: childRevision.version,
        revisionId: childRevision.id,
        isDraftTest: false,
        name: childDefinition.name,
        description: childDefinition.description,
        category: childDefinition.category,
        variables: childDefinition.variables,
        steps: childDefinition.steps,
      },
      userId,
      input.projectId
    );
    if ("error" in childSnapshot) {
      await failRunAndRemainingSteps(run, stepRow.id, childSnapshot.error);
      return { error: childSnapshot.error };
    }
    if (exceedsMaxSteps(childSnapshot.steps.length)) {
      const message = `El sub-workflow "${childWorkflowName}" supera el máximo de ${WORKFLOW_EXECUTION_LIMITS.MAX_STEPS_PER_RUN} pasos ejecutables.`;
      await failRunAndRemainingSteps(run, stepRow.id, message);
      return { error: message };
    }

    const childRun = await resumeOrCreateChildRun({
      parentRunId: run.id,
      parentStepRunId: stepRow.id,
      userId,
      projectId: input.projectId,
      childWorkflowId,
      childSnapshot,
      childInputVariables: resolution.childInputVariables,
      depth,
    });

    if (childRun.kind === "already_done") {
      const completed = await completeStepAndMaybeRun(run, input.stepIndex, childRun.output);
      return { ...completed, executionToken };
    }
    if (childRun.kind === "already_failed" || childRun.kind === "error") {
      await failRunAndRemainingSteps(run, stepRow.id, childRun.message);
      return { error: childRun.message };
    }

    return {
      done: false,
      executionToken,
      subWorkflow: {
        runId: childRun.runId,
        leaseId: childRun.leaseId,
        steps: childRun.steps,
        workflowId: childWorkflowId,
        workflowName: childWorkflowName,
        resumedSteps: childRun.resumedSteps,
      },
    };
  }

  const completed = await completeStepAndMaybeRun(run, input.stepIndex, resolution.output);
  return { ...completed, executionToken };
}

export interface CompleteWorkflowStepInput {
  projectId: string;
  runId: string;
  stepIndex: number;
  /** The real text the local engine (useLocalAI) produced for this "ai_tool" step. */
  output: string;
  leaseId: string;
  /** Must match the token prepareWorkflowStepAction returned for THIS attempt — a stale one (from a superseded attempt) is rejected, never overwrites a newer result. */
  executionToken: string;
}

/** Only ever called for an "ai_tool" step after the browser's local engine really generated `output` — the one place a real AI call gets logged via AIUsage, exactly like every other AI Center tool's save action already does. */
export async function completeWorkflowStepAction(input: CompleteWorkflowStepInput): Promise<PrepareWorkflowStepState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const run = await getWorkflowRunForUser(input.runId, user.id);
  if (!run || run.projectId !== input.projectId) return { error: "Ejecución no encontrada." };

  if (!isLeaseHeldWith(run, input.leaseId)) {
    return { error: "El control de esta ejecución expiró o pertenece a otra pestaña." };
  }

  const stepRow = run.steps.find((s) => s.stepIndex === input.stepIndex);
  if (!stepRow || stepRow.status !== "RUNNING" || stepRow.executionToken !== input.executionToken) {
    // A late result from a superseded attempt — reject it silently rather
    // than let it overwrite whatever the current attempt already produced.
    return { error: "Este intento ya no es válido (la ejecución avanzó o se reanudó desde entonces)." };
  }
  if (!input.output.trim()) return { error: "La generación no produjo ningún resultado." };

  const snapshot = readSnapshot(run);
  const toolSlug = snapshot?.steps[input.stepIndex]?.toolSlug;

  await prisma.aIUsage.create({
    data: {
      projectId: run.projectId,
      userId: user.id,
      kind: "CONTENT_GENERATION",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
      workflowId: run.workflowId,
      workflowRunId: run.id,
      workflowStepRunId: stepRow.id,
      workflowVersion: run.workflowVersion,
      toolSlug,
      executionMode: run.executionMode,
    },
  });

  return completeStepAndMaybeRun(run, input.stepIndex, input.output);
}

export interface FailWorkflowStepInput {
  projectId: string;
  runId: string;
  stepIndex: number;
  errorMessage: string;
  leaseId: string;
  executionToken: string;
}

/** Called when the browser's local engine itself fails/is cancelled mid-step — distinct from a server-side resolution error, but the same stopOnError effect applies. */
export async function failWorkflowStepAction(input: FailWorkflowStepInput): Promise<{ error?: string }> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const run = await getWorkflowRunForUser(input.runId, user.id);
  if (!run || run.projectId !== input.projectId) return { error: "Ejecución no encontrada." };
  if (!isLeaseHeldWith(run, input.leaseId)) return {};

  const stepRow = run.steps.find((s) => s.stepIndex === input.stepIndex);
  if (!stepRow || stepRow.status !== "RUNNING" || stepRow.executionToken !== input.executionToken) return {};

  await failRunAndRemainingSteps(run, stepRow.id, input.errorMessage || "La generación falló.");
  revalidatePath(workflowsPath(input.projectId));
  return {};
}

// ---------------------------------------------------------------------------
// Lease: heartbeat + explicit resume
// ---------------------------------------------------------------------------

export interface RenewLeaseInput {
  projectId: string;
  runId: string;
  leaseId: string;
}

/** Called periodically by the tab actively driving a run, while it waits on a long AI generation between prepare and complete calls (which themselves also extend the lease). */
export async function renewWorkflowRunLeaseAction(input: RenewLeaseInput): Promise<{ error?: string; leaseExpiresAt?: Date }> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");
  const run = await getWorkflowRunForUser(input.runId, user.id);
  if (!run || run.projectId !== input.projectId) return { error: "Ejecución no encontrada." };
  if (isRunTerminal(run.status)) return { error: "Esta ejecución ya terminó." };
  if (!isLeaseHeldWith(run, input.leaseId)) return { error: "El control de esta ejecución ya no es válido." };

  const now = new Date();
  const updated = await prisma.workflowRun.update({
    where: { id: run.id },
    data: { leaseExpiresAt: nextLeaseExpiry(now), lastHeartbeatAt: now },
  });
  return { leaseExpiresAt: updated.leaseExpiresAt ?? undefined };
}

export interface RecoverableRunStepView {
  stepId: string;
  index: number;
  type: string;
  status: string;
  output: string | null;
  errorMessage: string | null;
  attemptNumber: number;
}

export interface RecoverableRunView {
  runId: string;
  status: string;
  workflowVersion: number;
  currentWorkflowVersion: number;
  workflowChangedSinceRun: boolean;
  /** "PUBLISHED" | "DRAFT_TEST" | a retry variant — lets the UI keep showing "Prueba de borrador" (never "Ejecución real") for a resumed draft-test run. */
  executionMode: string;
  isLeaseHeldByOtherTab: boolean;
  lastHeartbeatAt: Date | null;
  resumedAt: Date | null;
  interruptionReason: string | null;
  nextPendingStepIndex: number;
  steps: RecoverableRunStepView[];
}

/**
 * Detects whether the caller has a recoverable (non-terminal) run for this
 * workflow, and — as part of "looking" — performs the same lazy
 * abandoned-lease detection prepare/resume do, so opening the page is one
 * of the valid detection points the spec calls for (never a background job).
 */
export async function findRecoverableWorkflowRunAction(
  projectId: string,
  workflowId: string,
  myLeaseOwner: string
): Promise<RecoverableRunView | null> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const workflow = await getWorkflowForUser(workflowId, user.id);

  const run = await prisma.workflowRun.findFirst({
    where: { workflowId, userId: user.id, status: { in: ["PENDING", "VALIDATING", "RUNNING", "INTERRUPTED"] } },
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
  if (!run) return null;

  const now = new Date();
  const effectiveRun = isRunAbandoned(run, now)
    ? await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "INTERRUPTED", interruptionReason: INTERRUPTION_REASON, normalizedErrorCode: "lease_expired" },
        include: { steps: { orderBy: { stepIndex: "asc" } } },
      })
    : run;

  return {
    runId: effectiveRun.id,
    status: effectiveRun.status,
    workflowVersion: effectiveRun.workflowVersion,
    currentWorkflowVersion: workflow?.publishedVersion ?? effectiveRun.workflowVersion,
    workflowChangedSinceRun: (workflow?.publishedVersion ?? effectiveRun.workflowVersion) !== effectiveRun.workflowVersion,
    executionMode: effectiveRun.executionMode,
    isLeaseHeldByOtherTab: isLeaseHeldByOther(effectiveRun, myLeaseOwner, now),
    lastHeartbeatAt: effectiveRun.lastHeartbeatAt,
    resumedAt: effectiveRun.resumedAt,
    interruptionReason: effectiveRun.interruptionReason,
    nextPendingStepIndex: effectiveRun.steps.findIndex((s) => s.status === "PENDING"),
    steps: effectiveRun.steps.map((s) => ({
      stepId: s.stepId,
      index: s.stepIndex,
      type: s.stepType,
      status: s.status,
      output: s.output,
      errorMessage: s.errorMessage,
      attemptNumber: s.attemptNumber,
    })),
  };
}

export interface ResumeWorkflowRunInput {
  projectId: string;
  runId: string;
  leaseOwner: string;
}

/**
 * The ONLY way a run comes back to RUNNING after PENDING/VALIDATING got
 * stuck (a crash mid-start) or RUNNING was abandoned (lease expired) —
 * never automatic, always this explicit action, so resuming never silently
 * consumes AI quota: it only re-arms the run to accept prepare calls again,
 * the very next of which still goes through every normal check (quota,
 * limits, lease) exactly like a first-time step would.
 */
export async function resumeWorkflowRunAction(input: ResumeWorkflowRunInput): Promise<StartWorkflowRunState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const run = await getWorkflowRunForUser(input.runId, user.id);
  if (!run || run.projectId !== input.projectId) return { error: "Ejecución no encontrada." };

  const now = new Date();
  let current = run;
  if (isRunAbandoned(current, now)) {
    current = await prisma.workflowRun.update({
      where: { id: current.id },
      data: { status: "INTERRUPTED", interruptionReason: INTERRUPTION_REASON, normalizedErrorCode: "lease_expired" },
      include: { steps: { orderBy: { stepIndex: "asc" } } },
    });
  }

  if (!isRunRecoverable(current.status)) {
    return {
      error:
        current.status === "FAILED"
          ? "Esta ejecución falló. Solo se puede reintentar, no reanudar."
          : "Esta ejecución ya no se puede reanudar (ya terminó).",
    };
  }
  if (isLeaseHeldByOther(current, input.leaseOwner, now)) {
    return { error: "Otra pestaña tiene el control activo de esta ejecución." };
  }
  if (isRunDurationExceeded(current.startedAt ?? current.createdAt, now)) {
    await failRunAndRemainingSteps(current, null, "Se superó el tiempo máximo permitido para esta ejecución.");
    return { error: "Se superó el tiempo máximo permitido para esta ejecución." };
  }

  const leaseId = randomUUID();
  // A step still marked RUNNING here can only be one whose previous attempt
  // was abandoned mid-flight (the run itself was just non-terminal but
  // uncontrolled) — reclaim it as a fresh, traceable attempt. A step that
  // already reached COMPLETED/FAILED/SKIPPED/CANCELLED is never touched.
  const orphanedStep = current.steps.find((s) => canReclaimStep(s.status));

  await prisma.$transaction([
    prisma.workflowRun.update({
      where: { id: current.id },
      data: {
        status: "RUNNING",
        resumedAt: now,
        interruptionReason: null,
        leaseId,
        leaseOwner: input.leaseOwner,
        leaseAcquiredAt: now,
        leaseExpiresAt: nextLeaseExpiry(now),
        lastHeartbeatAt: now,
      },
    }),
    ...(orphanedStep
      ? [prisma.workflowStepRun.update({ where: { id: orphanedStep.id }, data: { status: "PENDING", attemptNumber: { increment: 1 } } })]
      : []),
  ]);

  const finalRun = await prisma.workflowRun.findUniqueOrThrow({
    where: { id: current.id },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });

  const snapshot = readSnapshot(finalRun);
  const liveWorkflow = snapshot ? null : await getWorkflowForUser(finalRun.workflowId, user.id);
  const stepDefs = snapshot?.steps ?? liveWorkflow?.steps ?? [];

  revalidatePath(workflowsPath(input.projectId));
  return {
    runId: finalRun.id,
    leaseId,
    steps: finalRun.steps.map((s) => ({
      stepId: s.stepId,
      index: s.stepIndex,
      type: s.stepType,
      label: stepDefs.find((d) => d.id === s.stepId)?.label ?? s.stepType,
      outputVariable: s.outputVariable,
    })),
  };
}

// ---------------------------------------------------------------------------
// Cancel / retry
// ---------------------------------------------------------------------------

export async function cancelWorkflowRunAction(projectId: string, runId: string): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return cancelWorkflowRunCore(user.id, projectId, runId);
}

/** Real core reused by Automation Center (e.g. cancelling the WorkflowRun behind a cancelled/timed-out AutomationRun) — identical logic, parametrized by an already-resolved userId. */
export async function cancelWorkflowRunCore(userId: string, projectId: string, runId: string): Promise<{ error?: string }> {
  const run = await getWorkflowRunForUser(runId, userId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (isRunTerminal(run.status)) return {}; // already finished — nothing to cancel, not an error

  const now = new Date();
  const runDurationMs = run.startedAt ? now.getTime() - run.startedAt.getTime() : null;
  const runningStep = run.steps.find((s) => s.status === "RUNNING");
  const runningStepDurationMs = runningStep?.startedAt ? now.getTime() - runningStep.startedAt.getTime() : null;

  await prisma.$transaction([
    prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        completedAt: now,
        durationMs: runDurationMs,
        normalizedErrorCode: "cancelled",
        // Cancelling always invalidates the lease, regardless of who holds it.
        leaseId: null,
        leaseOwner: null,
        leaseAcquiredAt: null,
        leaseExpiresAt: null,
      },
    }),
    // A step already RUNNING gets cancelled too — the local engine really
    // does support aborting an in-flight generation (useLocalAI.cancel()),
    // so this is an honest "stopped", not a false claim.
    prisma.workflowStepRun.updateMany({
      where: { workflowRunId: run.id, status: "RUNNING" },
      data: { status: "CANCELLED", completedAt: now, durationMs: runningStepDurationMs, normalizedErrorCode: "cancelled" },
    }),
    prisma.workflowStepRun.updateMany({
      where: { workflowRunId: run.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    }),
  ]);

  revalidatePath(workflowsPath(projectId));
  return {};
}

export interface RetryWorkflowRunInput {
  projectId: string;
  runId: string;
  idempotencyKey: string;
  leaseOwner: string;
  /** false/omitted (default): replay the EXACT snapshot the original run used — never re-fetches Prompt Library/AI Template/Brand Kit/Workflow steps. true: an explicit, opt-in choice to start fresh against the Workflow's CURRENT version and current resource content instead. */
  useCurrentVersion?: boolean;
}

/** Always a fresh WorkflowRun with a new, caller-supplied idempotency key — never silently overwrites or replays the failed/cancelled/interrupted one, so there's no risk of double-charging without an explicit new click. Full-run retry only (not per-step) in this phase. */
export async function retryWorkflowRunAction(input: RetryWorkflowRunInput): Promise<StartWorkflowRunState> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");
  if (!isValidIdempotencyKey(input.idempotencyKey)) return { error: "Clave de ejecución inválida." };

  const original = await getWorkflowRunForUser(input.runId, user.id);
  if (!original) return { error: "Ejecución no encontrada." };
  if (!isRetryableRunStatus(original.status)) {
    return { error: "Solo se pueden reintentar ejecuciones fallidas, canceladas o interrumpidas." };
  }

  const originalSnapshot = readSnapshot(original);

  if (input.useCurrentVersion || !originalSnapshot) {
    // Explicit choice, or a pre-Phase-22 run with nothing frozen to replay —
    // either way, "current version" always means the current PUBLISHED
    // revision, never the draft, even if the original run was a draft test.
    return beginFreshRun({
      userId: user.id,
      projectId: input.projectId,
      workflowId: original.workflowId,
      idempotencyKey: input.idempotencyKey,
      inputVariables: original.inputVariables as Record<string, string>,
      leaseOwner: input.leaseOwner,
      retryOfRunId: original.id,
      executionMode: "RETRY_CURRENT_VERSION",
      mode: "published",
    });
  }

  if (exceedsMaxSteps(originalSnapshot.steps.length)) {
    return { error: `Este workflow supera el máximo de ${WORKFLOW_EXECUTION_LIMITS.MAX_STEPS_PER_RUN} pasos ejecutables.` };
  }
  const activeRuns = await countActiveWorkflowRunsForUser(user.id);
  if (exceedsConcurrentRunLimit(activeRuns)) {
    return {
      error: `Ya tienes ${WORKFLOW_EXECUTION_LIMITS.MAX_CONCURRENT_RUNS_PER_USER} ejecuciones activas. Espera a que terminen antes de iniciar otra.`,
    };
  }

  return createRunFromSnapshot({
    userId: user.id,
    projectId: input.projectId,
    workflowId: original.workflowId,
    snapshot: originalSnapshot,
    idempotencyKey: input.idempotencyKey,
    inputVariables: original.inputVariables as Record<string, string>,
    leaseOwner: input.leaseOwner,
    retryOfRunId: original.id,
    executionMode: "RETRY_ORIGINAL_SNAPSHOT",
  });
}

// ---------------------------------------------------------------------------
// History — read-only, client-callable (same *ForSelectAction shape used
// throughout AI Workflows) so WorkflowExecutionPanel/WorkflowRunHistory can
// fetch without a Server Component round-trip.
// ---------------------------------------------------------------------------

/** Every real run of this workflow the caller has ever started, most recent first — never another user's runs (listWorkflowRunsForWorkflow always filters by userId). */
export async function listWorkflowRunsAction(projectId: string, workflowId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return listWorkflowRunsForWorkflow(workflowId, user.id);
}

/** Full detail (with steps) of one run — ownership-checked, "not mine"/"doesn't exist" both resolve to null. */
export async function getWorkflowRunDetailAction(projectId: string, runId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const run = await getWorkflowRunForUser(runId, user.id);
  if (!run || run.projectId !== projectId) return null;
  return run;
}

/** "Ir al workflow/ejecución padre/hijo" — Workspace/analytics navigation across a SubWorkflow chain. */
export async function getRunNavigationInfoAction(projectId: string, runId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const run = await getWorkflowRunForUser(runId, user.id);
  if (!run || run.projectId !== projectId) return null;
  return getRunNavigationInfo(runId, user.id);
}

// ---------------------------------------------------------------------------
// Workspace integration — real results only (Phase 20's saveWorkflowExecutionAction,
// for the SIMULATED plan, is untouched and stays the save path for previews).
// ---------------------------------------------------------------------------

export interface SaveWorkflowRunResultInput {
  projectId: string;
  runId: string;
  /** Omit to save the run's finalOutput; set to save one specific step's own output instead. */
  stepIndex?: number;
}

export async function saveWorkflowRunResultToWorkspaceAction(
  input: SaveWorkflowRunResultInput
): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(input.projectId, "VIEWER");

  const run = await getWorkflowRunForUser(input.runId, user.id);
  if (!run || run.projectId !== input.projectId) return { error: "Ejecución no encontrada." };

  const workflow = await getWorkflowForUser(run.workflowId, user.id);
  const step = input.stepIndex !== undefined ? run.steps.find((s) => s.stepIndex === input.stepIndex) : null;
  const body = step ? step.output : run.finalOutput;
  if (!body) return { error: "No hay ningún resultado que guardar." };

  const created = await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: "OTHER",
      title: `Workflow real: ${workflow?.name ?? "Workflow"}${step ? ` — Paso ${step.stepIndex + 1}` : " — Resultado final"}`.slice(
        0,
        120
      ),
      body,
      language: "es",
      // "workflow-run:" (real, executed) vs Phase 20's "workflow:" (simulated plan) — the two are distinguishable by this prefix alone, no new column needed.
      sourceTool: step ? `workflow-run:${run.workflowId}:${run.id}:${step.stepId}` : `workflow-run:${run.workflowId}:${run.id}`,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/workspace`);
  return { id: created.id };
}

import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { MarketingBrainRun, MarketingBrainStep } from "@/generated/prisma/client";
import type { MarketingBrainStepKey } from "@/generated/prisma/enums";
import { normalizeBriefing } from "@/lib/marketing-brain/normalize";
import { buildExecutionPlan, defaultStagesConfig, STAGE_DEFINITIONS, MAX_AI_GENERATIONS_PER_RUN, type ExecutionPlan } from "@/lib/marketing-brain/plan";
import { MARKETING_BRAIN_APPROVAL_GATE_KEYS, MARKETING_BRAIN_STEP_KEYS } from "@/lib/marketing-brain/types";
import type { MarketingBrainBriefing, StagesConfig } from "@/lib/marketing-brain/types";
import { canCompleteRun, isRunTerminal, shouldBePartiallyCompleted } from "@/lib/marketing-brain/state-machine";
import * as stages from "@/server/services/marketing-brain-stages";
import { MULTI_ITEM_TOLERANT_STEP_KEYS, readStagedAdaptations, readStepFailures, type StageOutcome } from "@/server/services/marketing-brain-stages";
import { publishAutomationEvent } from "@/server/services/automation-events";

function runPath(projectId: string, runId?: string) {
  return runId ? `/dashboard/${projectId}/marketing-brain/${runId}` : `/dashboard/${projectId}/marketing-brain`;
}

async function getOwnedRun(runId: string, projectId: string) {
  const run = await prisma.marketingBrainRun.findUnique({ where: { id: runId }, include: { steps: { orderBy: { order: "asc" } } } });
  if (!run || run.projectId !== projectId) return null;
  return run;
}

function stagesConfigOf(run: MarketingBrainRun): StagesConfig {
  return run.stagesConfig as unknown as StagesConfig;
}

function briefingOf(run: Pick<MarketingBrainRun, "briefing">): MarketingBrainBriefing {
  return run.briefing as unknown as MarketingBrainBriefing;
}

function approvedBriefingOf(run: MarketingBrainRun): MarketingBrainBriefing {
  return (run.approvedBriefing ?? run.briefing) as unknown as MarketingBrainBriefing;
}

// ---------------------------------------------------------------------------
// Draft creation, briefing autosave, plan preview/config
// ---------------------------------------------------------------------------

export async function createDraftRun(projectId: string, userId: string, idempotencyKey: string) {
  const created = await prisma.marketingBrainRun.upsert({
    where: { createdById_idempotencyKey: { createdById: userId, idempotencyKey } },
    create: {
      projectId,
      createdById: userId,
      idempotencyKey,
      status: "DRAFT",
      briefing: {} as Prisma.InputJsonValue,
      stagesConfig: defaultStagesConfig() as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
  if (created.projectId !== projectId) return { error: "Esta clave ya se usó en otro proyecto." };
  revalidatePath(runPath(projectId));
  return { id: created.id };
}

export async function updateRunBriefing(projectId: string, runId: string, userId: string, patch: MarketingBrainBriefing) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "DRAFT" && run.status !== "READY") {
    return { error: "El briefing no se puede editar mientras la ejecución está en curso o ya finalizó." };
  }

  const merged = { ...briefingOf(run), ...patch };
  await prisma.marketingBrainRun.update({
    where: { id: runId },
    data: {
      briefing: merged as unknown as Prisma.InputJsonValue,
      // Editing after confirming invalidates the READY snapshot — the user must re-confirm the plan.
      ...(run.status === "READY" ? { status: "DRAFT" } : {}),
    },
  });
  revalidatePath(runPath(projectId, runId));
  return {};
}

export async function updateRunStagesConfig(projectId: string, runId: string, userId: string, config: StagesConfig) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "DRAFT" && run.status !== "READY") return { error: "La configuración de etapas no se puede editar en este estado." };

  await prisma.marketingBrainRun.update({
    where: { id: runId },
    data: { stagesConfig: config as unknown as Prisma.InputJsonValue, ...(run.status === "READY" ? { status: "DRAFT" } : {}) },
  });
  revalidatePath(runPath(projectId, runId));
  return {};
}

export function computePlanPreview(run: Pick<MarketingBrainRun, "briefing" | "stagesConfig">): ExecutionPlan {
  const normalized = normalizeBriefing(briefingOf(run));
  return buildExecutionPlan(normalized, stagesConfigOf(run as MarketingBrainRun));
}

/**
 * Confirms the plan (spec section 6): snapshots the briefing + stage config,
 * (re)creates all 12 step rows, and moves the run to READY. Safe to call
 * again while still DRAFT/READY — never touches anything once RUNNING.
 */
export async function confirmRunPlan(projectId: string, runId: string, userId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "DRAFT" && run.status !== "READY") return { error: "Esta ejecución ya no se puede confirmar." };

  const normalized = normalizeBriefing(briefingOf(run));
  if (normalized.errors.length > 0) return { error: normalized.errors[0] };

  const config = stagesConfigOf(run);
  const plan = buildExecutionPlan(normalized, config);
  if (plan.exceedsVolumeLimit) {
    return { error: `Esta ejecución generaría ${plan.totals.aiGenerations} generaciones de IA, por encima del máximo permitido (${MAX_AI_GENERATIONS_PER_RUN}). Reduce el alcance (menos piezas o plataformas) antes de confirmar.` };
  }

  if (normalized.brandProfileId) {
    const profile = await prisma.brandProfile.findUnique({ where: { id: normalized.brandProfileId } });
    if (!profile || profile.userId !== userId) return { error: "El Brand Profile seleccionado no está disponible para este usuario." };
  }
  for (const memberId of [normalized.assigneeId, normalized.approverId].filter((id): id is string => Boolean(id))) {
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: memberId } } });
    if (!member) return { error: "Uno de los responsables asignados ya no pertenece a este proyecto." };
  }

  await prisma.$transaction([
    prisma.marketingBrainStep.deleteMany({ where: { runId } }),
    prisma.marketingBrainApproval.deleteMany({ where: { runId } }),
    prisma.marketingBrainRun.update({
      where: { id: runId },
      data: {
        approvedBriefing: briefingOf(run) as unknown as Prisma.InputJsonValue,
        stagesConfig: config as unknown as Prisma.InputJsonValue,
        status: "READY",
        currentStepKey: null,
      },
    }),
    prisma.marketingBrainStep.createMany({
      data: STAGE_DEFINITIONS.map((def) => ({
        runId,
        key: def.key,
        order: def.order,
        status: config.enabled[def.key] === false ? "SKIPPED" : "PENDING",
      })),
    }),
  ]);

  revalidatePath(runPath(projectId, runId));
  return { plan };
}

export async function startRun(projectId: string, runId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "READY") return { error: "Esta ejecución no está lista para iniciarse." };

  const firstStep = run.steps.find((s) => s.status === "PENDING");
  await prisma.marketingBrainRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: run.startedAt ?? new Date(), currentStepKey: firstStep?.key ?? null },
  });
  revalidatePath(runPath(projectId, runId));
  return {};
}

// ---------------------------------------------------------------------------
// Progress + finalization helpers
// ---------------------------------------------------------------------------

async function refreshProgress(runId: string) {
  const steps = await prisma.marketingBrainStep.findMany({ where: { runId } });
  const resolved = steps.filter((s) => s.status === "COMPLETED" || s.status === "SKIPPED" || s.status === "FAILED" || s.status === "CANCELLED").length;
  const percent = steps.length === 0 ? 0 : Math.round((resolved / steps.length) * 100);
  await prisma.marketingBrainRun.update({ where: { id: runId }, data: { progressPercent: percent } });
  return steps;
}

async function finalizeIfAllStepsResolved(run: MarketingBrainRun) {
  const steps = await refreshProgress(run.id);
  const allResolved = steps.every((s) => s.status !== "PENDING" && s.status !== "RUNNING" && s.status !== "WAITING_FOR_APPROVAL");
  if (!allResolved) return null;

  const failedItemCounts = steps.map((s) => readStepFailures(s).length);
  const finalStatus = canCompleteRun(steps.map((s) => s.status))
    ? shouldBePartiallyCompleted(failedItemCounts)
      ? "PARTIALLY_COMPLETED"
      : "COMPLETED"
    : "FAILED";

  await prisma.marketingBrainRun.update({ where: { id: run.id }, data: { status: finalStatus, completedAt: new Date() } });
  const eventKey = finalStatus === "FAILED" ? "marketing_brain_run.failed" : finalStatus === "PARTIALLY_COMPLETED" ? "marketing_brain_run.partially_completed" : "marketing_brain_run.completed";
  await publishAutomationEvent({
    projectId: run.projectId,
    eventKey,
    resourceId: run.id,
    payload: { id: run.id, campaignId: run.campaignId, status: finalStatus },
    idempotencyKey: `${eventKey}:${run.id}`,
  });
  return finalStatus;
}

async function failRunAndSkipRemaining(run: MarketingBrainRun, failedStepId: string, message: string, category: string) {
  await prisma.$transaction([
    prisma.marketingBrainStep.update({ where: { id: failedStepId }, data: { status: "FAILED", errorMessage: message, errorCategory: category as never, completedAt: new Date() } }),
    prisma.marketingBrainStep.updateMany({ where: { runId: run.id, status: "PENDING" }, data: { status: "SKIPPED" } }),
    prisma.marketingBrainRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), lastErrorMessage: message, lastErrorCategory: category as never } }),
  ]);
  await publishAutomationEvent({
    projectId: run.projectId,
    eventKey: "marketing_brain_run.failed",
    resourceId: run.id,
    payload: { id: run.id, campaignId: run.campaignId, status: "FAILED" },
    idempotencyKey: `marketing_brain_run.failed:${run.id}`,
  });
  await refreshProgress(run.id);
}

// ---------------------------------------------------------------------------
// Stage dispatch tables
// ---------------------------------------------------------------------------

type DeterministicRunner = (ctx: stages.StageContext) => Promise<StageOutcome>;
const DETERMINISTIC_STAGES: Partial<Record<MarketingBrainStepKey, DeterministicRunner>> = {
  INTERPRET_BRIEFING: stages.runInterpretBriefingStage,
  PREPARE_CAMPAIGN: stages.runPrepareCampaignStage,
  PREPARE_APPROVAL: stages.runPrepareApprovalStage,
  PREPARE_CALENDAR: stages.runPrepareCalendarStage,
  SCHEDULE: stages.runScheduleStage,
};

type AiPreparer = (ctx: stages.StageContext) => Promise<StageOutcome>;
const AI_PREPARERS: Partial<Record<MarketingBrainStepKey, AiPreparer>> = {
  GENERATE_STRATEGY: stages.prepareGenerateStrategyStage,
  CREATE_PILLARS: stages.preparePillarsStage,
  CREATE_CONTENT_PLAN: stages.prepareContentPlanStage,
  GENERATE_DRAFTS: stages.prepareGenerateDraftsStage,
  ADAPT_PLATFORMS: stages.prepareAdaptPlatformsStage,
};

type AiCompleter = (ctx: stages.StageContext, output: string) => Promise<StageOutcome>;
const AI_COMPLETERS: Partial<Record<MarketingBrainStepKey, AiCompleter>> = {
  GENERATE_STRATEGY: stages.completeGenerateStrategyStage,
  CREATE_PILLARS: stages.completePillarsStage,
  CREATE_CONTENT_PLAN: stages.completeContentPlanStage,
  GENERATE_DRAFTS: stages.completeGenerateDraftsStage,
  ADAPT_PLATFORMS: stages.completeAdaptPlatformsStage,
};

async function runDependentDeterministicStage(key: MarketingBrainStepKey, ctx: stages.StageContext): Promise<StageOutcome> {
  if (key === "CREATE_PIECES") {
    const planStep = await prisma.marketingBrainStep.findUnique({ where: { runId_key: { runId: ctx.run.id, key: "CREATE_CONTENT_PLAN" } } });
    const drafts = (planStep?.output as { drafts?: unknown } | null)?.drafts ?? [];
    return stages.runCreatePiecesStage(ctx, drafts);
  }
  if (key === "CREATE_PUBLICATIONS") {
    const adaptStep = await prisma.marketingBrainStep.findUnique({ where: { runId_key: { runId: ctx.run.id, key: "ADAPT_PLATFORMS" } } });
    const adaptations = adaptStep ? readStagedAdaptations(adaptStep) : [];
    return stages.runCreatePublicationsStage(ctx, adaptations);
  }
  throw new Error(`Etapa determinista desconocida: ${key}`);
}

// ---------------------------------------------------------------------------
// The executor — one call advances the run by exactly one unit of work
// (a whole deterministic stage, or one AI item within an AI stage).
// ---------------------------------------------------------------------------

export interface ExecutorState {
  error?: string;
  done?: boolean;
  waitingForApproval?: { stepKey: MarketingBrainStepKey; label: string; rejected: boolean; comment: string | null };
  runFinalStatus?: string;
  ai?: {
    stepKey: MarketingBrainStepKey;
    systemPrompt: string;
    userPrompt: string;
    executionToken: string;
    itemLabel: string;
    itemIndex: number;
    itemsTotal: number;
  };
}

async function buildContext(run: MarketingBrainRun & { steps: MarketingBrainStep[] }, step: MarketingBrainStep, projectId: string, userId: string): Promise<stages.StageContext> {
  return { projectId, userId, run, step, normalized: normalizeBriefing(approvedBriefingOf(run)) };
}

async function persistCompleted(run: MarketingBrainRun, step: MarketingBrainStep, outcome: Extract<StageOutcome, { kind: "completed" }>) {
  await prisma.marketingBrainStep.update({
    where: { id: step.id },
    data: { status: "COMPLETED", output: outcome.output as unknown as Prisma.InputJsonValue, completedAt: new Date(), executionToken: null },
  });
  if (outcome.campaignId && !run.campaignId) {
    await prisma.marketingBrainRun.update({ where: { id: run.id }, data: { campaignId: outcome.campaignId } });
  }
  await refreshProgress(run.id);
}

export async function prepareNextStep(projectId: string, runId: string, userId: string): Promise<ExecutorState> {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };

  if (run.status === "WAITING_FOR_APPROVAL") {
    const gateStep = run.steps.find((s) => s.status === "WAITING_FOR_APPROVAL");
    if (!gateStep) return { error: "Estado inconsistente: no se encontró el paso en espera de aprobación." };
    const approval = await prisma.marketingBrainApproval.findUnique({ where: { runId_stepKey: { runId, stepKey: gateStep.key } } });
    return {
      waitingForApproval: {
        stepKey: gateStep.key,
        label: STAGE_DEFINITIONS.find((d) => d.key === gateStep.key)?.label ?? gateStep.key,
        rejected: approval?.status === "REJECTED",
        comment: approval?.comment ?? null,
      },
    };
  }

  if (run.status !== "RUNNING") return { error: "Esta ejecución no está en curso." };

  const config = stagesConfigOf(run);
  const step = run.steps.find((s) => s.status === "PENDING" || s.status === "RUNNING");
  if (!step) {
    const finalStatus = await finalizeIfAllStepsResolved(run);
    return { done: true, runFinalStatus: finalStatus ?? undefined };
  }

  if (config.approvalGates.includes(step.key)) {
    const approval = await prisma.marketingBrainApproval.upsert({
      where: { runId_stepKey: { runId, stepKey: step.key } },
      create: { runId, stepKey: step.key, status: "PENDING" },
      update: {},
    });
    if (approval.status !== "APPROVED") {
      await prisma.$transaction([
        prisma.marketingBrainStep.update({ where: { id: step.id }, data: { status: "WAITING_FOR_APPROVAL" } }),
        prisma.marketingBrainRun.update({ where: { id: runId }, data: { status: "WAITING_FOR_APPROVAL", currentStepKey: step.key } }),
      ]);
      return {
        waitingForApproval: {
          stepKey: step.key,
          label: STAGE_DEFINITIONS.find((d) => d.key === step.key)?.label ?? step.key,
          rejected: approval.status === "REJECTED",
          comment: approval.comment,
        },
      };
    }
  }

  // Atomic guard: only one caller can move PENDING -> RUNNING for this step.
  const guard = await prisma.marketingBrainStep.updateMany({
    where: { id: step.id, status: "PENDING" },
    data: { status: "RUNNING", startedAt: step.startedAt ?? new Date(), attemptCount: { increment: 1 } },
  });
  const freshStep = await prisma.marketingBrainStep.findUniqueOrThrow({ where: { id: step.id } });
  if (guard.count === 0 && freshStep.status !== "RUNNING") {
    return { error: "Este paso ya se está ejecutando en otra pestaña." };
  }

  await prisma.marketingBrainRun.update({ where: { id: runId }, data: { currentStepKey: step.key } });
  const ctx = await buildContext(run, freshStep, projectId, userId);

  const deterministic = DETERMINISTIC_STAGES[step.key];
  const outcome = deterministic
    ? await deterministic(ctx)
    : step.key === "CREATE_PIECES" || step.key === "CREATE_PUBLICATIONS"
      ? await runDependentDeterministicStage(step.key, ctx)
      : await AI_PREPARERS[step.key]!(ctx);

  return handleOutcome(run, freshStep, outcome);
}

async function handleOutcome(run: MarketingBrainRun & { steps: MarketingBrainStep[] }, step: MarketingBrainStep, outcome: StageOutcome): Promise<ExecutorState> {
  if (outcome.kind === "failed") {
    await failRunAndSkipRemaining(run, step.id, outcome.errorMessage, outcome.errorCategory);
    return { error: outcome.errorMessage };
  }
  if (outcome.kind === "completed") {
    await persistCompleted(run, step, outcome);
    return { done: true };
  }
  const executionToken = randomUUID();
  await prisma.marketingBrainStep.update({ where: { id: step.id }, data: { executionToken, totalItems: outcome.itemsTotal, currentItemIndex: outcome.itemIndex } });
  return {
    ai: {
      stepKey: step.key,
      systemPrompt: outcome.systemPrompt,
      userPrompt: outcome.userPrompt,
      executionToken,
      itemLabel: outcome.itemLabel,
      itemIndex: outcome.itemIndex,
      itemsTotal: outcome.itemsTotal,
    },
  };
}

export async function completeAiStep(projectId: string, runId: string, userId: string, output: string, executionToken: string): Promise<ExecutorState> {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "RUNNING") return { error: "Esta ejecución no está en curso." };

  const step = run.steps.find((s) => s.status === "RUNNING");
  if (!step || step.executionToken !== executionToken) {
    return { error: "Este intento ya no es válido (la ejecución avanzó o se reanudó desde entonces)." };
  }
  if (!output.trim()) return { error: "La generación no produjo ningún resultado." };

  const ctx = await buildContext(run, step, projectId, userId);
  const completer = AI_COMPLETERS[step.key]!;
  const outcome = await completer(ctx, output);

  if (outcome.kind === "failed" && (MULTI_ITEM_TOLERANT_STEP_KEYS as readonly string[]).includes(step.key)) {
    const failures = readStepFailures(step);
    failures.push({ itemKey: outcome.itemKey ?? randomUUID(), label: outcome.itemKey ?? "item", message: outcome.errorMessage });
    await prisma.marketingBrainStep.update({ where: { id: step.id }, data: { output: { ...(step.output as object), failures } as unknown as Prisma.InputJsonValue } });
    const refreshedStep = await prisma.marketingBrainStep.findUniqueOrThrow({ where: { id: step.id } });
    const nextOutcome = await AI_PREPARERS[step.key]!({ ...ctx, step: refreshedStep });
    return handleOutcome(run, refreshedStep, nextOutcome);
  }

  if (outcome.kind === "failed") {
    await failRunAndSkipRemaining(run, step.id, outcome.errorMessage, outcome.errorCategory);
    return { error: outcome.errorMessage };
  }
  if (outcome.kind !== "completed") {
    return { error: "Estado inesperado del paso — se esperaba un resultado final." };
  }

  // Item completed — persist its partial output, then check whether the stage has more items.
  await prisma.marketingBrainStep.update({ where: { id: step.id }, data: { output: outcome.output as unknown as Prisma.InputJsonValue } });
  const refreshedStep = await prisma.marketingBrainStep.findUniqueOrThrow({ where: { id: step.id } });
  const preparer = AI_PREPARERS[step.key];
  const next = preparer ? await preparer({ ...ctx, step: refreshedStep }) : outcome;
  return handleOutcome(run, refreshedStep, next);
}

export async function failAiStep(projectId: string, runId: string, userId: string, executionToken: string, errorMessage: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  const step = run.steps.find((s) => s.status === "RUNNING");
  if (!step || step.executionToken !== executionToken) return {};
  await failRunAndSkipRemaining(run, step.id, errorMessage || "La generación falló.", "AI");
  return {};
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function decideApproval(
  projectId: string,
  runId: string,
  userId: string,
  stepKey: MarketingBrainStepKey,
  decision: "APPROVED" | "REJECTED",
  comment: string
) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (!MARKETING_BRAIN_APPROVAL_GATE_KEYS.includes(stepKey)) return { error: "Esta etapa no admite un punto de aprobación." };
  const step = run.steps.find((s) => s.key === stepKey);
  if (!step || step.status !== "WAITING_FOR_APPROVAL") return { error: "Este paso no está esperando aprobación." };

  await prisma.marketingBrainApproval.upsert({
    where: { runId_stepKey: { runId, stepKey } },
    create: { runId, stepKey, status: decision, decidedById: userId, decidedAt: new Date(), comment: comment || null },
    update: { status: decision, decidedById: userId, decidedAt: new Date(), comment: comment || null },
  });

  if (decision === "APPROVED") {
    await prisma.$transaction([
      prisma.marketingBrainStep.update({ where: { id: step.id }, data: { status: "PENDING" } }),
      prisma.marketingBrainRun.update({ where: { id: runId }, data: { status: "RUNNING" } }),
    ]);
  }
  revalidatePath(runPath(projectId, runId));
  return {};
}

// ---------------------------------------------------------------------------
// Retry / cancel / resume / duplicate / archive
// ---------------------------------------------------------------------------

/** Retries a step whose overall status is FAILED (stopped the whole run) — resets it and every step SKIPPED because of it back to PENDING. */
export async function retryFailedStep(projectId: string, runId: string, userId: string, stepKey: MarketingBrainStepKey) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "FAILED") return { error: "Solo se puede reintentar una ejecución fallida." };
  const step = run.steps.find((s) => s.key === stepKey);
  if (!step || step.status !== "FAILED") return { error: "Este paso no falló — no hay nada que reintentar." };

  await prisma.$transaction([
    prisma.marketingBrainStep.update({ where: { id: step.id }, data: { status: "PENDING", errorMessage: null, errorCategory: null } }),
    prisma.marketingBrainStep.updateMany({ where: { runId, status: "SKIPPED" }, data: { status: "PENDING" } }),
    prisma.marketingBrainRun.update({ where: { id: runId }, data: { status: "RUNNING", lastErrorMessage: null, lastErrorCategory: null, attemptCount: { increment: 1 } } }),
  ]);
  revalidatePath(runPath(projectId, runId));
  return {};
}

const DOWNSTREAM_OF: Partial<Record<MarketingBrainStepKey, MarketingBrainStepKey[]>> = {
  GENERATE_DRAFTS: ["CREATE_PUBLICATIONS", "PREPARE_APPROVAL", "PREPARE_CALENDAR", "SCHEDULE"],
  ADAPT_PLATFORMS: ["CREATE_PUBLICATIONS", "PREPARE_APPROVAL", "PREPARE_CALENDAR", "SCHEDULE"],
};

/** Retries ONE failed item inside a multi-item step (GENERATE_DRAFTS/ADAPT_PLATFORMS) without redoing the others — spec section 21. Safely re-opens the deterministic downstream stages too (CREATE_PUBLICATIONS is idempotent, so re-running it after fixing an item just picks up the newly-created resource). */
export async function retryFailedItem(projectId: string, runId: string, userId: string, stepKey: MarketingBrainStepKey, itemKey: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (!isRunTerminal(run.status) && run.status !== "RUNNING") return { error: "Esta ejecución no admite reintentos en este estado." };
  const step = run.steps.find((s) => s.key === stepKey);
  if (!step || step.status !== "COMPLETED") return { error: "Este paso no ha finalizado — no hay nada que reintentar todavía." };

  const failures = readStepFailures(step).filter((f) => f.itemKey !== itemKey);
  const downstream = DOWNSTREAM_OF[stepKey] ?? [];

  await prisma.$transaction([
    prisma.marketingBrainStep.update({
      where: { id: step.id },
      data: { status: "PENDING", output: { ...(step.output as object), failures } as unknown as Prisma.InputJsonValue },
    }),
    prisma.marketingBrainStep.updateMany({ where: { runId, key: { in: downstream }, status: { in: ["COMPLETED", "SKIPPED"] } }, data: { status: "PENDING" } }),
    prisma.marketingBrainRun.update({ where: { id: runId }, data: { status: "RUNNING", currentStepKey: stepKey } }),
  ]);
  revalidatePath(runPath(projectId, runId));
  return {};
}

export async function cancelRun(projectId: string, runId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (isRunTerminal(run.status)) return {};

  await prisma.$transaction([
    prisma.marketingBrainRun.update({ where: { id: runId }, data: { status: "CANCELLED", cancelledAt: new Date(), completedAt: new Date() } }),
    prisma.marketingBrainStep.updateMany({ where: { runId, status: { in: ["PENDING", "RUNNING", "WAITING_FOR_APPROVAL"] } }, data: { status: "CANCELLED" } }),
  ]);
  revalidatePath(runPath(projectId, runId));
  return {};
}

/** Manually clears a step stuck RUNNING (e.g. the browser tab closed mid-generation) back to PENDING so the pipeline can continue — always safe because prepareNextStep's atomic guard prevents genuine double-execution regardless. */
export async function resumeRun(projectId: string, runId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (run.status !== "RUNNING" && run.status !== "WAITING_FOR_APPROVAL") return { error: "Esta ejecución no necesita reanudarse." };

  const stuckStep = run.steps.find((s) => s.status === "RUNNING");
  if (stuckStep) {
    await prisma.marketingBrainStep.update({ where: { id: stuckStep.id }, data: { status: "PENDING", executionToken: null } });
  }
  if (run.status !== "RUNNING") await prisma.marketingBrainRun.update({ where: { id: runId }, data: { status: "RUNNING" } });
  revalidatePath(runPath(projectId, runId));
  return {};
}

export async function duplicateRun(projectId: string, runId: string, userId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };

  const created = await prisma.marketingBrainRun.create({
    data: {
      projectId,
      createdById: userId,
      idempotencyKey: randomUUID(),
      status: "DRAFT",
      briefing: briefingOf(run) as unknown as Prisma.InputJsonValue,
      stagesConfig: run.stagesConfig as unknown as Prisma.InputJsonValue,
      sourceRunId: run.id,
    },
  });
  revalidatePath(runPath(projectId));
  return { id: created.id };
}

export async function archiveRun(projectId: string, runId: string) {
  const run = await getOwnedRun(runId, projectId);
  if (!run) return { error: "Ejecución no encontrada." };
  if (!isRunTerminal(run.status)) return { error: "Solo se pueden archivar ejecuciones ya finalizadas." };
  await prisma.marketingBrainRun.update({ where: { id: runId }, data: { status: "ARCHIVED" } });
  revalidatePath(runPath(projectId));
  return {};
}

export { MARKETING_BRAIN_STEP_KEYS };

import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { mbOptimizationError, type MbOptimizationActionError } from "@/lib/marketing-brain/optimization-types";
import { buildPerformanceContext } from "@/server/services/marketing-brain-performance-context";
import { buildScenarioGenerationSystemPrompt, buildScenarioGenerationUserPrompt, parseScenarioGenerationText, type ScenarioGenerationContextInput } from "@/lib/marketing-brain/scenario-ai";
import { checkForFabricatedNumericClaims } from "@/lib/marketing-brain/numeric-claims";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { PerformanceContextSelectionParsed } from "@/lib/validation/marketing-brain-optimization";

/**
 * The Marketing Brain optimization session lifecycle (Fase 35 spec sections
 * 8-12) — selection → frozen snapshot → single-shot local-AI generation
 * (same prepare/complete/fail + executionToken pattern as every other
 * AI stage in this codebase, never a second AI client) → human-only
 * approval. Never auto-approves; never mutates an already-frozen snapshot.
 */

const LOCK_DURATION_MS = 5 * 60 * 1000;

async function getOwnedSession(projectId: string, sessionId: string) {
  const row = await prisma.marketingBrainOptimizationSession.findUnique({
    where: { id: sessionId },
    include: { contextSnapshot: true, scenarios: { include: { actions: { orderBy: { order: "asc" } } } } },
  });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export async function createOptimizationSession(
  projectId: string,
  userId: string,
  input: { idempotencyKey: string; campaignId?: string | null; createdByAgentRunId?: string }
): Promise<{ id: string } | MbOptimizationActionError> {
  if (input.campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { projectId: true } });
    if (!campaign || campaign.projectId !== projectId) return mbOptimizationError("RESOURCE_NOT_FOUND", "La campaña seleccionada no existe en este proyecto.");
  }
  if (input.createdByAgentRunId) {
    const run = await prisma.aiAgentRun.findUnique({ where: { id: input.createdByAgentRunId }, select: { projectId: true } });
    if (!run || run.projectId !== projectId) return mbOptimizationError("RESOURCE_NOT_FOUND", "La ejecución de agente indicada no existe en este proyecto.");
  }

  const created = await prisma.marketingBrainOptimizationSession.upsert({
    where: { createdById_idempotencyKey: { createdById: userId, idempotencyKey: input.idempotencyKey } },
    create: {
      projectId,
      createdById: userId,
      campaignId: input.campaignId ?? null,
      createdByAgentRunId: input.createdByAgentRunId ?? null,
      idempotencyKey: input.idempotencyKey,
      status: "DRAFT",
      contextMode: "NONE",
      selection: { mode: "NONE" } as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
  if (created.projectId !== projectId) return mbOptimizationError("PERMISSION_DENIED");
  return { id: created.id };
}

export async function updateSessionSelection(
  projectId: string,
  sessionId: string,
  selection: PerformanceContextSelectionParsed
): Promise<{ id: string } | MbOptimizationActionError> {
  const session = await getOwnedSession(projectId, sessionId);
  if (!session) return mbOptimizationError("SESSION_NOT_FOUND");
  if (session.status !== "DRAFT") return mbOptimizationError("SESSION_NOT_EDITABLE");

  await prisma.marketingBrainOptimizationSession.update({
    where: { id: sessionId },
    data: { selection: selection as unknown as Prisma.InputJsonValue, contextMode: selection.mode },
  });
  return { id: sessionId };
}

/** Finds the (at most one) session a given AiAgentRun produced — the read side of the createdByAgentRunId traceability FK (Fase 35/36), used by the run detail page's bidirectional link. */
export async function getSessionCreatedByAgentRun(projectId: string, agentRunId: string) {
  const row = await prisma.marketingBrainOptimizationSession.findFirst({
    where: { projectId, createdByAgentRunId: agentRunId },
    select: { id: true, status: true, contextMode: true, campaign: { select: { id: true, name: true } } },
  });
  return row;
}

export async function listOptimizationSessions(projectId: string, filters: { campaignId?: string; status?: string } = {}) {
  return prisma.marketingBrainOptimizationSession.findMany({
    where: { projectId, ...(filters.campaignId ? { campaignId: filters.campaignId } : {}), ...(filters.status ? { status: filters.status as never } : {}) },
    include: { scenarios: { select: { id: true, kind: true, selected: true } }, campaign: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getOptimizationSessionDetail(projectId: string, sessionId: string) {
  const row = await prisma.marketingBrainOptimizationSession.findUnique({
    where: { id: sessionId },
    include: {
      contextSnapshot: true,
      campaign: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      previousVersion: { select: { id: true, version: true } },
      nextVersion: { select: { id: true, version: true } },
      scenarios: { include: { actions: { orderBy: { order: "asc" } } }, orderBy: { kind: "asc" } },
      measurementPlans: { include: { reviews: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export interface PrepareGenerationResult {
  error?: string;
  ai?: { systemPrompt: string; userPrompt: string; executionToken: string };
  alreadyGenerated?: boolean;
}

/** The "prepare" half of the single-shot AI generation — mirrors prepareNextStep across the codebase's other AI stages (Marketing Brain runs, AI Agents): freezes the context snapshot (once), then hands back a system/user prompt for the browser's local engine to run. */
export async function prepareOptimizationGeneration(projectId: string, sessionId: string, userId: string): Promise<PrepareGenerationResult> {
  const session = await getOwnedSession(projectId, sessionId);
  if (!session) return { error: "Sesión no encontrada." };
  if (session.status !== "DRAFT") return { error: "Esta sesión ya no admite generación (revísala o crea una nueva versión)." };

  const now = new Date();
  const token = randomUUID();
  const claim = await prisma.marketingBrainOptimizationSession.updateMany({
    where: { id: sessionId, status: "DRAFT", lockedAt: null },
    data: { lockedAt: now, lockedBy: token, lockExpiresAt: new Date(now.getTime() + LOCK_DURATION_MS), executionToken: token, attemptCount: { increment: 1 } },
  });
  if (claim.count === 0) return { error: "Ya hay una generación en curso para esta sesión." };

  const selection = session.selection as unknown as PerformanceContextSelectionParsed;

  let snapshot = session.contextSnapshot;
  if (!snapshot) {
    const built = await buildPerformanceContext(projectId, session.campaignId, selection);
    snapshot = await prisma.marketingBrainContextSnapshot.create({
      data: {
        sessionId,
        projectId,
        periodStart: built.periodStart,
        periodEnd: built.periodEnd,
        comparisonPeriodStart: built.comparisonPeriodStart,
        comparisonPeriodEnd: built.comparisonPeriodEnd,
        facts: built.bundle.facts as unknown as Prisma.InputJsonValue,
        derived: built.bundle.derived as unknown as Prisma.InputJsonValue,
        signals: built.bundle.signals as unknown as Prisma.InputJsonValue,
        hypotheses: built.bundle.hypotheses as unknown as Prisma.InputJsonValue,
        constraints: built.bundle.constraints as unknown as Prisma.InputJsonValue,
        missingData: built.bundle.missingData as unknown as Prisma.InputJsonValue,
        dataQualityScore: built.bundle.dataQualityScore,
        dataQualityLevel: built.bundle.dataQualityLevel,
        evidenceStrength: built.bundle.evidenceStrength,
        metricCount: built.bundle.counts.metricCount,
        resourceCount: built.bundle.counts.resourceCount,
        recommendationCount: built.bundle.counts.recommendationCount,
        experimentCount: built.bundle.counts.experimentCount,
        goalCount: built.bundle.counts.goalCount,
        benchmarkCount: built.bundle.counts.benchmarkCount,
        reportCount: built.bundle.counts.reportCount,
      },
    });
    await publishAutomationEvent({
      projectId,
      eventKey: "marketing_brain_optimization.context_selected",
      resourceId: sessionId,
      actorId: userId,
      payload: { id: sessionId, contextMode: selection.mode, dataQualityLevel: snapshot.dataQualityLevel },
      idempotencyKey: `marketing_brain_optimization.context_selected:${sessionId}`,
    });
  }

  const campaignRow = session.campaignId ? await prisma.campaign.findUnique({ where: { id: session.campaignId }, select: { name: true, objective: true, budget: true } }) : null;
  const facts = snapshot.facts as unknown as { metrics: { label: string; value: number; unit?: string; origin: string; sampleSize?: number }[]; goals: { metricKey: string; type: string; status: string; targetValue: number | null }[]; benchmarks: { metricKey: string; source: string; value: number }[]; experiments: { name: string; conclusion: string | null }[]; recommendations: { title: string; category: string; priority: string }[] };

  const promptInput: ScenarioGenerationContextInput = {
    campaignOrProjectName: campaignRow?.name ?? "Proyecto",
    objective: campaignRow?.objective ?? "",
    periodLabel: `${snapshot.periodStart.toISOString().slice(0, 10)} — ${snapshot.periodEnd.toISOString().slice(0, 10)}`,
    dataQualityLevel: snapshot.dataQualityLevel,
    evidenceStrength: snapshot.evidenceStrength,
    factsSummary: facts.metrics.map((m) => `${m.label}: ${m.value}${m.unit === "PERCENTAGE" ? "%" : ""} (origen: ${m.origin}, muestra: ${m.sampleSize ?? "?"})`),
    derivedSummary: (snapshot.derived as unknown as { label: string; value: number | null }[]).map((d) => `${d.label}: ${d.value ?? "sin datos"}`),
    signalsSummary: (snapshot.signals as unknown as { label: string; description: string }[]).map((s) => `${s.label}: ${s.description}`),
    hypothesesSummary: (snapshot.hypotheses as unknown as { label: string }[]).map((h) => h.label),
    constraintsSummary: snapshot.constraints as unknown as string[],
    missingDataSummary: snapshot.missingData as unknown as string[],
    hasBudget: Boolean(campaignRow?.budget),
    budgetLabel: campaignRow?.budget ? String(campaignRow.budget) : null,
  };

  return {
    ai: {
      systemPrompt: buildScenarioGenerationSystemPrompt(),
      userPrompt: buildScenarioGenerationUserPrompt(promptInput),
      executionToken: token,
    },
  };
}

export interface CompleteGenerationResult {
  error?: string;
  id?: string;
  scenarioCount?: number;
  hasSuspiciousNumericClaims?: boolean;
}

export async function completeOptimizationGeneration(projectId: string, sessionId: string, userId: string, output: string, executionToken: string): Promise<CompleteGenerationResult> {
  const session = await getOwnedSession(projectId, sessionId);
  if (!session) return { error: "Sesión no encontrada." };
  if (session.status !== "DRAFT" || session.executionToken !== executionToken || session.lockedBy !== executionToken) {
    return { error: "Este intento de generación ya no es válido." };
  }
  if (!output.trim()) return { error: "La generación no produjo ningún resultado." };

  const parsed = parseScenarioGenerationText(output);
  if (parsed.scenarios.length === 0) {
    await prisma.marketingBrainOptimizationSession.update({ where: { id: sessionId }, data: { lockedAt: null, lockedBy: null, lockExpiresAt: null, lastErrorMessage: "La generación no produjo ningún escenario válido." } });
    return { error: "La generación no produjo ningún escenario reconocible — inténtalo de nuevo." };
  }

  const snapshot = session.contextSnapshot;
  const allowedNumbers: string[] = [];
  if (snapshot) {
    for (const g of (snapshot.facts as unknown as { goals: { targetValue: number | null }[] }).goals) if (g.targetValue !== null) allowedNumbers.push(String(g.targetValue));
    for (const b of (snapshot.facts as unknown as { benchmarks: { value: number }[] }).benchmarks) allowedNumbers.push(String(b.value));
  }
  const numericCheck = checkForFabricatedNumericClaims(output, allowedNumbers);

  await prisma.$transaction(async (tx) => {
    await tx.marketingBrainOptimizationSession.update({
      where: { id: sessionId },
      data: {
        status: "READY_FOR_REVIEW",
        strategyBrief: parsed.brief as unknown as Prisma.InputJsonValue,
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
        lastErrorMessage: null,
      },
    });
    for (const scenario of parsed.scenarios) {
      const created = await tx.marketingBrainScenario.upsert({
        where: { sessionId_kind: { sessionId, kind: scenario.kind } },
        create: {
          sessionId,
          projectId,
          kind: scenario.kind,
          objective: scenario.objective,
          intensity: scenario.intensity,
          timeframe: scenario.timeframe,
          measurementMethod: scenario.measurementMethod,
          risks: scenario.risks,
          kpis: scenario.kpis,
          preconditions: scenario.preconditions,
          constraints: numericCheck.hasSuspiciousClaims ? [...scenario.constraints, "Contiene cifras que no provienen directamente de los datos — trátalas como hipótesis, no como hechos."] : scenario.constraints,
          resourcesRequired: scenario.resourcesRequired,
        },
        update: {
          objective: scenario.objective,
          intensity: scenario.intensity,
          timeframe: scenario.timeframe,
          measurementMethod: scenario.measurementMethod,
          risks: scenario.risks,
          kpis: scenario.kpis,
          preconditions: scenario.preconditions,
          resourcesRequired: scenario.resourcesRequired,
        },
      });
      await tx.marketingBrainScenarioAction.deleteMany({ where: { scenarioId: created.id, convertedAt: null } });
      for (let i = 0; i < scenario.actions.length; i++) {
        const action = scenario.actions[i];
        await tx.marketingBrainScenarioAction.create({
          data: { scenarioId: created.id, projectId, order: i, title: action.title.slice(0, 200), description: action.description.slice(0, 2000), channel: action.channel || null, actionType: "TASK" },
        });
      }
    }
  });

  await publishAutomationEvent({
    projectId,
    eventKey: "marketing_brain_optimization.ready_for_review",
    resourceId: sessionId,
    actorId: userId,
    payload: { id: sessionId, scenarioCount: parsed.scenarios.length },
    idempotencyKey: `marketing_brain_optimization.ready_for_review:${sessionId}`,
  });

  return { id: sessionId, scenarioCount: parsed.scenarios.length, hasSuspiciousNumericClaims: numericCheck.hasSuspiciousClaims };
}

export async function failOptimizationGeneration(projectId: string, sessionId: string, executionToken: string, errorMessage: string): Promise<{ error?: string }> {
  const session = await getOwnedSession(projectId, sessionId);
  if (!session) return { error: "Sesión no encontrada." };
  if (session.executionToken !== executionToken || session.lockedBy !== executionToken) return {};

  await prisma.marketingBrainOptimizationSession.update({
    where: { id: sessionId },
    data: { lockedAt: null, lockedBy: null, lockExpiresAt: null, lastErrorMessage: errorMessage || "La generación falló." },
  });
  return {};
}

export async function selectScenario(projectId: string, sessionId: string, kind: "CONSERVATIVE" | "BALANCED" | "EXPANSIVE"): Promise<{ id: string } | MbOptimizationActionError> {
  const session = await getOwnedSession(projectId, sessionId);
  if (!session) return mbOptimizationError("SESSION_NOT_FOUND");
  if (session.status !== "READY_FOR_REVIEW") return mbOptimizationError("SESSION_NOT_EDITABLE", "Solo puedes elegir un escenario mientras la sesión está en revisión.");
  const target = session.scenarios.find((s) => s.kind === kind);
  if (!target) return mbOptimizationError("SCENARIO_NOT_FOUND");

  await prisma.$transaction([
    prisma.marketingBrainScenario.updateMany({ where: { sessionId }, data: { selected: false } }),
    prisma.marketingBrainScenario.update({ where: { id: target.id }, data: { selected: true } }),
  ]);
  await publishAutomationEvent({
    projectId,
    eventKey: "marketing_brain_optimization.scenario_selected",
    resourceId: sessionId,
    payload: { id: sessionId, kind },
    idempotencyKey: `marketing_brain_optimization.scenario_selected:${sessionId}:${kind}`,
  });
  return { id: sessionId };
}

/**
 * The ONLY path to APPROVED/REJECTED — always requires a real, authenticated
 * human user (spec section 12: no cron/automation/agent/workflow can ever
 * reach this). Editing an already-decided session never mutates it: see
 * createOptimizationSessionVersion below.
 */
export async function decideOptimizationSession(
  projectId: string,
  sessionId: string,
  userId: string,
  decision: "APPROVED" | "REJECTED",
  comment: string | undefined,
  selectedScenarioKind: "CONSERVATIVE" | "BALANCED" | "EXPANSIVE" | undefined
): Promise<{ id: string } | MbOptimizationActionError> {
  const session = await getOwnedSession(projectId, sessionId);
  if (!session) return mbOptimizationError("SESSION_NOT_FOUND");
  if (session.status !== "READY_FOR_REVIEW") return mbOptimizationError("SESSION_NOT_EDITABLE", "Esta sesión no está lista para una decisión.");
  if (decision === "APPROVED" && !selectedScenarioKind && !session.scenarios.some((s) => s.selected)) {
    return mbOptimizationError("SELECTION_INVALID", "Selecciona un escenario antes de aprobar.");
  }

  if (selectedScenarioKind) {
    const result = await selectScenario(projectId, sessionId, selectedScenarioKind);
    if ("error" in result) return result;
  }

  await prisma.marketingBrainOptimizationSession.update({
    where: { id: sessionId },
    data: { status: decision, decidedById: userId, decidedAt: new Date(), decisionComment: comment ?? null },
  });

  await publishAutomationEvent({
    projectId,
    eventKey: decision === "APPROVED" ? "marketing_brain_optimization.approved" : "marketing_brain_optimization.rejected",
    resourceId: sessionId,
    actorId: userId,
    payload: { id: sessionId },
    idempotencyKey: `${decision === "APPROVED" ? "marketing_brain_optimization.approved" : "marketing_brain_optimization.rejected"}:${sessionId}`,
  });

  return { id: sessionId };
}

export async function archiveOptimizationSession(projectId: string, sessionId: string): Promise<{ id: string } | MbOptimizationActionError> {
  const session = await getOwnedSession(projectId, sessionId);
  if (!session) return mbOptimizationError("SESSION_NOT_FOUND");

  await prisma.marketingBrainOptimizationSession.update({ where: { id: sessionId }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  await publishAutomationEvent({
    projectId,
    eventKey: "marketing_brain_optimization.archived",
    resourceId: sessionId,
    idempotencyKey: `marketing_brain_optimization.archived:${sessionId}`,
    payload: { id: sessionId },
  });
  return { id: sessionId };
}

/**
 * Editing an approved/rejected/archived session never silently mutates it
 * (spec section 12) — this creates a brand-new DRAFT session carrying the
 * same selection forward, linked via previousVersionId, so the original
 * decision + its frozen snapshot stay exactly as they were.
 */
export async function createOptimizationSessionVersion(projectId: string, sessionId: string, userId: string, idempotencyKey: string): Promise<{ id: string } | MbOptimizationActionError> {
  const session = await getOwnedSession(projectId, sessionId);
  if (!session) return mbOptimizationError("SESSION_NOT_FOUND");

  const created = await prisma.marketingBrainOptimizationSession.upsert({
    where: { createdById_idempotencyKey: { createdById: userId, idempotencyKey } },
    create: {
      projectId,
      createdById: userId,
      campaignId: session.campaignId,
      idempotencyKey,
      status: "DRAFT",
      contextMode: session.contextMode,
      selection: session.selection as unknown as Prisma.InputJsonValue,
      version: session.version + 1,
      previousVersionId: session.id,
    },
    update: {},
  });
  return { id: created.id };
}

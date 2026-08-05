import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { AiAgentRun, AiAgentRunStep } from "@/generated/prisma/client";
import { agentPerformanceStrategistInputSchema, type AgentPerformanceStrategistInput } from "@/lib/validation/agent-performance-strategist";
import { performanceContextSelectionSchema, type PerformanceContextSelectionParsed } from "@/lib/validation/marketing-brain-optimization";
import { buildScenarioGenerationSystemPrompt } from "@/lib/marketing-brain/scenario-ai";
import { buildPerformanceContext } from "@/server/services/marketing-brain-performance-context";
import {
  createOptimizationSession,
  updateSessionSelection,
  createOptimizationSessionVersion,
  prepareOptimizationGeneration,
  completeOptimizationGeneration,
  getOptimizationSessionDetail,
} from "@/server/services/marketing-brain-optimization";
import { createMeasurementPlan, generateMeasurementReview, listMeasurementPlans } from "@/server/services/marketing-brain-measurement";
import { refreshProgress, finalizeIfAllStepsResolved, failRunAndSkipRemaining } from "@/server/services/agent-run-lifecycle";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { classifyAgentModeRisk } from "@/lib/agents/governance-risk";
import { evaluateRunGovernance } from "@/server/services/agent-governance";

/**
 * Performance Strategist (Fase 36) — the AI Agent capability that turns the
 * previously-passive `createdByAgentRunId` traceability field (Fase 35) into
 * a real, governed way for an agent to analyze Performance Center data and
 * PREPARE (never approve/convert/publish/schedule) Marketing Brain
 * optimization artifacts. Reuses Fase 35's context builder, scenario
 * generation prompt/parser, and measurement services directly — no second
 * engine, no second numeric-claims/evidence-strength implementation.
 *
 * Every mode only ever leaves DRAFT-state, reversible, human-reviewable
 * artifacts: a DRAFT MarketingBrainOptimizationSession, DRAFT scenarios, or a
 * DRAFT measurement plan/review. Nothing here can reach APPROVED, convert a
 * scenario action into a real resource, publish, schedule, or close an
 * experiment — those remain exclusively human, through the exact same
 * actions Fase 35 built (decideOptimizationSession, convertScenarioAction).
 */

interface StepInput {
  values: Record<string, unknown>;
  context: Record<string, unknown>;
}

interface PrepareResult {
  error?: string;
  done?: boolean;
  runFinalStatus?: string;
  ai?: { stepOrder: number; systemPrompt: string; userPrompt: string; executionToken: string };
}

async function ownedCampaign(projectId: string, campaignId?: string): Promise<string | null> {
  if (!campaignId) return null;
  const row = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { projectId: true } });
  return row?.projectId === projectId ? campaignId : null;
}
async function ownedContentItem(projectId: string, id?: string): Promise<string | null> {
  if (!id) return null;
  const row = await prisma.contentItem.findUnique({ where: { id }, select: { projectId: true } });
  return row?.projectId === projectId ? id : null;
}
async function ownedSocialPost(projectId: string, id?: string): Promise<string | null> {
  if (!id) return null;
  const row = await prisma.socialPost.findUnique({ where: { id }, select: { projectId: true } });
  return row?.projectId === projectId ? id : null;
}
async function ownedSession(projectId: string, id?: string) {
  if (!id) return null;
  const row = await getOptimizationSessionDetail(projectId, id);
  return row;
}

function periodBounds(periodDays: number | undefined): { periodStart: string; periodEnd: string } {
  const end = new Date();
  const start = new Date(end.getTime() - (periodDays ?? 90) * 86_400_000);
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

async function buildSelection(projectId: string, input: AgentPerformanceStrategistInput, campaignId: string | null): Promise<PerformanceContextSelectionParsed> {
  const { periodStart, periodEnd } = periodBounds(input.periodDays);
  const contentItemId = await ownedContentItem(projectId, input.contentItemId);
  const socialPostId = await ownedSocialPost(projectId, input.socialPostId);

  const resourceType = contentItemId ? "CONTENT_ITEM" : socialPostId ? "SOCIAL_POST" : campaignId ? "CAMPAIGN" : "PROJECT";
  const resourceIds = contentItemId ? [contentItemId] : socialPostId ? [socialPostId] : campaignId ? [campaignId] : [];

  const raw = {
    mode: input.contextMode ?? "RECOMMENDED",
    periodStart,
    periodEnd,
    compareToPreviousPeriod: false,
    resourceType,
    resourceIds,
    metricKeys: input.metricKeys ?? [],
    goalIds: [],
    benchmarkIds: [],
    experimentIds: [],
    recommendationIds: [],
    reportIds: [],
  };
  return performanceContextSelectionSchema.parse(raw);
}

/** ANALYZE mode never touches MarketingBrainOptimizationSession/Scenario — spec section 6.1: "no debe crear automáticamente una estrategia". Its result lives only on the AiAgentRunStep's own output. */
async function prepareAnalyze(projectId: string, run: AiAgentRun, step: AiAgentRunStep, input: AgentPerformanceStrategistInput, campaignId: string | null): Promise<PrepareResult> {
  const selection = await buildSelection(projectId, input, campaignId);
  const built = await buildPerformanceContext(projectId, campaignId, selection);

  const factsSummary = built.bundle.facts.metrics.map((m) => `${m.label}: ${m.value}${m.unit === "PERCENTAGE" ? "%" : ""} (origen: ${m.origin}, muestra: ${m.sampleSize ?? "?"})`);
  const signalsSummary = built.bundle.signals.map((s) => `${s.label}: ${s.description}`);

  const token = randomUUID();
  await prisma.aiAgentRunStep.update({
    where: { id: step.id },
    data: {
      executionToken: token,
      input: { values: { ...input, resolvedCampaignId: campaignId }, context: {}, analysisOnly: true, periodStart: built.periodStart.toISOString(), periodEnd: built.periodEnd.toISOString() } as unknown as Prisma.InputJsonValue,
    },
  });

  const { buildScenarioGenerationUserPrompt } = await import("@/lib/marketing-brain/scenario-ai");
  const userPrompt = buildScenarioGenerationUserPrompt({
    campaignOrProjectName: "Proyecto",
    objective: input.objective ?? "",
    periodLabel: `${built.periodStart.toISOString().slice(0, 10)} — ${built.periodEnd.toISOString().slice(0, 10)}`,
    dataQualityLevel: built.bundle.dataQualityLevel,
    evidenceStrength: built.bundle.evidenceStrength,
    factsSummary,
    derivedSummary: built.bundle.derived.map((d) => `${d.label}: ${d.value ?? "sin datos"}`),
    signalsSummary,
    hypothesesSummary: built.bundle.hypotheses.map((h) => h.label),
    constraintsSummary: [...built.bundle.constraints, ...(input.constraintsNote ? [input.constraintsNote] : [])],
    missingDataSummary: built.bundle.missingData,
    hasBudget: Boolean(input.budget),
    budgetLabel: input.budget ? `${input.budget} ${input.currency ?? ""}`.trim() : null,
  });

  return { ai: { stepOrder: step.order, systemPrompt: buildScenarioGenerationSystemPrompt(false), userPrompt, executionToken: token } };
}

async function prepareStrategyGeneration(projectId: string, userId: string, run: AiAgentRun, step: AiAgentRunStep, sessionId: string, executionToken: string, mode: string): Promise<PrepareResult> {
  const prepared = await prepareOptimizationGeneration(projectId, sessionId, userId);
  if (prepared.error || !prepared.ai) {
    await failRunAndSkipRemaining(run, step.id, prepared.error ?? "No se pudo preparar la generación de la estrategia.", "DEPENDENCY");
    return { error: prepared.error ?? "No se pudo preparar la generación." };
  }
  await prisma.aiAgentRunStep.update({
    where: { id: step.id },
    data: { executionToken, input: { values: { sessionId, generationToken: prepared.ai.executionToken, mode }, context: {} } as unknown as Prisma.InputJsonValue },
  });
  return { ai: { stepOrder: step.order, systemPrompt: prepared.ai.systemPrompt, userPrompt: prepared.ai.userPrompt, executionToken } };
}

/**
 * The flagship per-mode governance case (Fase 37 spec section 19) — the SAME
 * five Performance Strategist modes carry genuinely different risk (ANALYZE
 * is the only READ_ONLY mode this codebase has; everything else is
 * DRAFT_WRITE) and a project policy can configure each individually (e.g.
 * ANALYZE allowed, PREPARE_STRATEGY/REVIEW_EXISTING requiring approval,
 * PREPARE_MEASUREMENT/PREPARE_REVIEW allowed). Evaluated here, not
 * generically in agent-orchestrator.ts, precisely because the mode is only
 * known once this function has parsed the step's real input.
 */
export async function preparePerformanceStrategistStep(projectId: string, userId: string, run: AiAgentRun, step: AiAgentRunStep): Promise<PrepareResult> {
  const rawValues = ((run.approvedInput ?? run.input) as unknown as StepInput | null)?.values ?? {};
  const parsed = agentPerformanceStrategistInputSchema.safeParse(rawValues);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Entrada no válida para Performance Strategist.";
    await failRunAndSkipRemaining(run, step.id, message, "VALIDATION");
    return { error: message };
  }
  const input = parsed.data;
  const campaignId = await ownedCampaign(projectId, input.campaignId);

  const governance = await evaluateRunGovernance({
    projectId,
    userId,
    hasProjectAccess: true,
    agentRef: "performance-strategist",
    mode: input.mode,
    operationType: "PREPARE_STEP",
    riskLevel: classifyAgentModeRisk("performance-strategist", input.mode),
  });
  if (governance.decision !== "ALLOW") return { error: governance.reason };

  if (input.mode === "ANALYZE") {
    return prepareAnalyze(projectId, run, step, input, campaignId);
  }

  if (input.mode === "PREPARE_STRATEGY") {
    const idempotencyKey = `agent-run:${run.id}`;
    const created = await createOptimizationSession(projectId, userId, { idempotencyKey, campaignId, createdByAgentRunId: run.id });
    if ("error" in created) {
      await failRunAndSkipRemaining(run, step.id, created.error, "DEPENDENCY");
      return { error: created.error };
    }
    const selection = await buildSelection(projectId, input, campaignId);
    const updated = await updateSessionSelection(projectId, created.id, selection);
    if ("error" in updated) {
      await failRunAndSkipRemaining(run, step.id, updated.error, "DEPENDENCY");
      return { error: updated.error };
    }
    const token = randomUUID();
    return prepareStrategyGeneration(projectId, userId, run, step, created.id, token, input.mode);
  }

  if (input.mode === "REVIEW_EXISTING") {
    const session = await ownedSession(projectId, input.optimizationSessionId);
    if (!session) {
      const message = "La sesión de optimización indicada no existe en este proyecto.";
      await failRunAndSkipRemaining(run, step.id, message, "DEPENDENCY");
      return { error: message };
    }

    let targetSessionId = session.id;
    if (session.status !== "DRAFT") {
      // Never edit an already-generated (READY_FOR_REVIEW/APPROVED/REJECTED) version directly — always a new DRAFT version, preserving the original decision/snapshot intact (spec section 16).
      const versioned = await createOptimizationSessionVersion(projectId, session.id, userId, `agent-run:${run.id}`);
      if ("error" in versioned) {
        await failRunAndSkipRemaining(run, step.id, versioned.error, "DEPENDENCY");
        return { error: versioned.error };
      }
      targetSessionId = versioned.id;
      await publishAutomationEvent({
        projectId,
        eventKey: "agent_run.performance_strategist_draft_revised",
        resourceId: run.id,
        actorId: userId,
        payload: { id: run.id, sessionId: targetSessionId, previousSessionId: session.id },
        idempotencyKey: `agent_run.performance_strategist_draft_revised:${run.id}`,
      });
    }

    const selection = await buildSelection(projectId, input, campaignId ?? session.campaignId);
    const updated = await updateSessionSelection(projectId, targetSessionId, selection);
    if ("error" in updated) {
      await failRunAndSkipRemaining(run, step.id, updated.error, "DEPENDENCY");
      return { error: updated.error };
    }
    const token = randomUUID();
    return prepareStrategyGeneration(projectId, userId, run, step, targetSessionId, token, input.mode);
  }

  if (input.mode === "PREPARE_MEASUREMENT") {
    const session = await ownedSession(projectId, input.optimizationSessionId);
    if (!session || session.status !== "APPROVED") {
      const message = "Solo puedes preparar un plan de medición para una sesión aprobada de este proyecto.";
      await failRunAndSkipRemaining(run, step.id, message, "VALIDATION");
      return { error: message };
    }
    const primaryMetricKey = input.metricKeys?.[0];
    if (!primaryMetricKey) {
      const message = "Selecciona al menos una métrica para el plan de medición.";
      await failRunAndSkipRemaining(run, step.id, message, "VALIDATION");
      return { error: message };
    }
    // PREPARE_MEASUREMENT/PREPARE_REVIEW are fully deterministic (no AI round-trip) — the prepare and
    // the write happen in the same call, so the "before completing an important write" gate (spec
    // section 18) is re-checked here too, right before the real mutating call.
    const measurementWriteGovernance = await evaluateRunGovernance({
      projectId,
      userId,
      hasProjectAccess: true,
      agentRef: "performance-strategist",
      mode: input.mode,
      operationType: "COMPLETE_WRITE",
      riskLevel: classifyAgentModeRisk("performance-strategist", input.mode),
    });
    if (measurementWriteGovernance.decision !== "ALLOW") return { error: measurementWriteGovernance.reason };
    const resourceType = session.campaignId ? "CAMPAIGN" : "PROJECT";
    const trackingStart = new Date();
    const trackingEnd = new Date(trackingStart.getTime() + (input.periodDays ?? 30) * 86_400_000);

    const result = await createMeasurementPlan(projectId, userId, {
      sessionId: session.id,
      primaryMetricKey,
      secondaryMetricKeys: (input.metricKeys ?? []).slice(1, 6),
      resourceType: resourceType as never,
      campaignId: resourceType === "CAMPAIGN" ? (session.campaignId ?? undefined) : undefined,
      trackingStart: trackingStart.toISOString(),
      trackingEnd: trackingEnd.toISOString(),
    });
    if ("error" in result) {
      await failRunAndSkipRemaining(run, step.id, result.error, "DEPENDENCY");
      return { error: result.error };
    }
    await publishAutomationEvent({
      projectId,
      eventKey: "agent_run.performance_strategist_measurement_drafted",
      resourceId: run.id,
      actorId: userId,
      payload: { id: run.id, sessionId: session.id, planId: result.id },
      idempotencyKey: `agent_run.performance_strategist_measurement_drafted:${run.id}`,
    });
    return completeDeterministicStep(run, step, { mode: input.mode, sessionId: session.id, planId: result.id });
  }

  if (input.mode === "PREPARE_REVIEW") {
    const session = await ownedSession(projectId, input.optimizationSessionId);
    if (!session) {
      const message = "La sesión de optimización indicada no existe en este proyecto.";
      await failRunAndSkipRemaining(run, step.id, message, "VALIDATION");
      return { error: message };
    }
    const plans = await listMeasurementPlans(projectId, session.id);
    const plan = plans.find((p) => p.status === "ACTIVE") ?? plans[0];
    if (!plan) {
      const message = "Esta sesión todavía no tiene un plan de medición preparado.";
      await failRunAndSkipRemaining(run, step.id, message, "VALIDATION");
      return { error: message };
    }
    const reviewWriteGovernance = await evaluateRunGovernance({
      projectId,
      userId,
      hasProjectAccess: true,
      agentRef: "performance-strategist",
      mode: input.mode,
      operationType: "COMPLETE_WRITE",
      riskLevel: classifyAgentModeRisk("performance-strategist", input.mode),
    });
    if (reviewWriteGovernance.decision !== "ALLOW") return { error: reviewWriteGovernance.reason };
    const result = await generateMeasurementReview(projectId, userId, plan.id);
    if ("error" in result) {
      await failRunAndSkipRemaining(run, step.id, result.error, "DEPENDENCY");
      return { error: result.error };
    }
    await publishAutomationEvent({
      projectId,
      eventKey: "agent_run.performance_strategist_review_drafted",
      resourceId: run.id,
      actorId: userId,
      payload: { id: run.id, sessionId: session.id, reviewId: result.id },
      idempotencyKey: `agent_run.performance_strategist_review_drafted:${run.id}`,
    });
    return completeDeterministicStep(run, step, { mode: input.mode, sessionId: session.id, planId: plan.id, reviewId: result.id });
  }

  const message = "Modo no reconocido.";
  await failRunAndSkipRemaining(run, step.id, message, "VALIDATION");
  return { error: message };
}

/** PREPARE_MEASUREMENT/PREPARE_REVIEW are fully deterministic (spec sections 21-22: "la IA no debe decidir REACHED/NOT_REACHED/causalidad") — no local-AI round-trip is honestly needed, so the step completes synchronously here, exactly like Marketing Brain's own non-AI pipeline stages (INTERPRET_BRIEFING/PREPARE_CAMPAIGN). */
async function completeDeterministicStep(run: AiAgentRun, step: AiAgentRunStep, output: Record<string, unknown>): Promise<PrepareResult> {
  await prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { status: "COMPLETED", output: output as unknown as Prisma.InputJsonValue, completedAt: new Date(), executionToken: null } });
  await refreshProgress(run.id);
  const finalStatus = await finalizeIfAllStepsResolved(run);
  return { done: true, runFinalStatus: finalStatus ?? undefined };
}

export interface CompleteResult {
  error?: string;
  done?: boolean;
  runFinalStatus?: string;
}

export async function completePerformanceStrategistStep(projectId: string, userId: string, run: AiAgentRun, step: AiAgentRunStep, output: string, executionToken: string): Promise<CompleteResult> {
  if (step.executionToken !== executionToken) return { error: "Este intento ya no es válido (la ejecución avanzó o se reanudó desde entonces)." };
  const stepInput = (step.input as unknown as { values?: Record<string, unknown>; analysisOnly?: boolean } | null) ?? {};
  const mode = stepInput.analysisOnly ? "ANALYZE" : ((stepInput.values?.mode as string | undefined) ?? "PREPARE_STRATEGY");

  // ANALYZE never persists a real Marketing Brain resource (READ_ONLY — see governance-risk.ts), so it
  // is intentionally NOT gated as COMPLETE_WRITE here; PREPARE_STRATEGY/REVIEW_EXISTING both create/
  // update a real DRAFT MarketingBrainOptimizationSession below, which IS a write.
  if (mode !== "ANALYZE") {
    const governance = await evaluateRunGovernance({
      projectId,
      userId,
      hasProjectAccess: true,
      agentRef: "performance-strategist",
      mode,
      operationType: "COMPLETE_WRITE",
      riskLevel: classifyAgentModeRisk("performance-strategist", mode),
      expectedOutputChars: output.length,
    });
    if (governance.decision !== "ALLOW") return { error: governance.reason };
  }

  if (stepInput.analysisOnly) {
    const { parseScenarioGenerationText } = await import("@/lib/marketing-brain/scenario-ai");
    const { checkForFabricatedNumericClaims } = await import("@/lib/marketing-brain/numeric-claims");
    const parsed = parseScenarioGenerationText(output);
    if (!parsed.brief.executiveSummary && parsed.brief.dataBackedFindings.length === 0) {
      await failRunAndSkipRemaining(run, step.id, "La IA no devolvió un análisis utilizable. Puedes reintentar.", "OUTPUT_SCHEMA");
      return { error: "La IA no devolvió un análisis utilizable." };
    }
    const numericCheck = checkForFabricatedNumericClaims(output, []);
    const insufficientData = parsed.brief.dataBackedFindings.length === 0;
    if (insufficientData) {
      await publishAutomationEvent({
        projectId,
        eventKey: "agent_run.performance_strategist_insufficient_data",
        resourceId: run.id,
        actorId: userId,
        payload: { id: run.id, mode: "ANALYZE" },
        idempotencyKey: `agent_run.performance_strategist_insufficient_data:${run.id}`,
      });
    }
    const resultOutput = {
      mode: "ANALYZE",
      summary: parsed.brief.executiveSummary,
      observedFacts: parsed.brief.dataBackedFindings,
      hypotheses: parsed.brief.hypotheses,
      missingData: parsed.brief.dataLimitations,
      hasSuspiciousNumericClaims: numericCheck.hasSuspiciousClaims,
      suspiciousNumbers: numericCheck.suspiciousNumbers,
      insufficientData,
    };
    await prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { status: "COMPLETED", output: resultOutput as unknown as Prisma.InputJsonValue, completedAt: new Date(), executionToken: null } });
    await refreshProgress(run.id);
    const finalStatus = await finalizeIfAllStepsResolved(run);
    return { done: true, runFinalStatus: finalStatus ?? undefined };
  }

  const sessionId = stepInput.values?.sessionId as string | undefined;
  const generationToken = stepInput.values?.generationToken as string | undefined;
  if (!sessionId || !generationToken) {
    await failRunAndSkipRemaining(run, step.id, "No se encontró la sesión asociada a esta generación.", "INTERNAL_SAFE");
    return { error: "No se encontró la sesión asociada a esta generación." };
  }

  const completed = await completeOptimizationGeneration(projectId, sessionId, userId, output, generationToken);
  if (completed.error) {
    await failRunAndSkipRemaining(run, step.id, completed.error, "OUTPUT_SCHEMA");
    return { error: completed.error };
  }

  await publishAutomationEvent({
    projectId,
    eventKey: "agent_run.performance_strategist_draft_created",
    resourceId: run.id,
    actorId: userId,
    payload: { id: run.id, sessionId, scenarioCount: completed.scenarioCount ?? 0 },
    idempotencyKey: `agent_run.performance_strategist_draft_created:${run.id}`,
  });

  const resultOutput = { mode: "PREPARE_STRATEGY", sessionId, scenarioCount: completed.scenarioCount ?? 0, hasSuspiciousNumericClaims: completed.hasSuspiciousNumericClaims ?? false };
  await prisma.aiAgentRunStep.update({ where: { id: step.id }, data: { status: "COMPLETED", output: resultOutput as unknown as Prisma.InputJsonValue, completedAt: new Date(), executionToken: null } });
  await refreshProgress(run.id);
  const finalStatus = await finalizeIfAllStepsResolved(run);
  return { done: true, runFinalStatus: finalStatus ?? undefined };
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { mean } from "@/lib/performance/statistics";
import { safeRatio } from "@/lib/performance/derived-metrics";
import { computeDataQuality } from "@/lib/performance/data-quality";
import { findMetricDefinition, isCustomMetricKey } from "@/lib/performance/metrics-catalog";
import { evaluateGoal } from "@/server/services/performance-goals";
import { mbOptimizationError, type MbOptimizationActionError } from "@/lib/marketing-brain/optimization-types";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { CreateMeasurementPlanInput } from "@/lib/validation/marketing-brain-optimization";

/**
 * Post-hoc measurement of an approved strategy (Fase 35 spec section 14) —
 * the baseline is captured ONCE from real data and never recalculated
 * retrospectively; a review never marks REACHED/NOT_REACHED without enough
 * data (INDETERMINATE is a first-class, honest outcome); causality is never
 * asserted without a genuinely linked, concluded experiment for the exact
 * same metric/resource.
 */

interface ResourceFilter {
  contentItemId?: string;
  campaignId?: string;
  socialPostId?: string;
}

async function aggregateMetric(projectId: string, metricKey: string, filter: ResourceFilter, start: Date, end: Date): Promise<{ value: number | null; sampleSize: number; daysSinceLastUpdate: number; distinctDays: number }> {
  const def = isCustomMetricKey(metricKey) ? null : findMetricDefinition(metricKey);
  const records = await prisma.performanceMetricRecord.findMany({
    where: { projectId, metricKey, isArchived: false, ...filter, measuredAt: { gte: start, lte: end } },
    select: { value: true, measuredAt: true },
    orderBy: { measuredAt: "asc" },
  });
  if (records.length === 0) return { value: null, sampleSize: 0, daysSinceLastUpdate: 999, distinctDays: 0 };

  const values = records.map((r) => Number(r.value));
  const aggregated = def?.aggregation === "AVERAGE" || def?.aggregation === "RATE" ? mean(values)! : def?.aggregation === "MAX" ? Math.max(...values) : def?.aggregation === "MIN" ? Math.min(...values) : def?.aggregation === "LAST" ? values[values.length - 1] : values.reduce((a, b) => a + b, 0);
  const latest = records[records.length - 1].measuredAt;
  return { value: aggregated, sampleSize: records.length, daysSinceLastUpdate: Math.floor((Date.now() - latest.getTime()) / 86_400_000), distinctDays: new Set(records.map((r) => r.measuredAt.toISOString().slice(0, 10))).size };
}

function qualityLabelFor(expectedDays: number, actualDays: number, daysSinceLastUpdate: number, sampleSize: number): string {
  return computeDataQuality({
    expectedPoints: Math.max(1, expectedDays),
    actualPoints: actualDays,
    daysSinceLastUpdate,
    duplicateCount: 0,
    conflictCount: 0,
    missingValueCount: 0,
    totalValueCount: sampleSize,
    granularityConsistent: true,
    longestGapRatio: expectedDays > 0 ? Math.max(0, 1 - actualDays / expectedDays) : 1,
  }).level;
}

function resourceFilterFor(resourceType: string, contentItemId?: string, campaignId?: string, socialPostId?: string): ResourceFilter {
  if (resourceType === "CONTENT_ITEM" && contentItemId) return { contentItemId };
  if (resourceType === "CAMPAIGN" && campaignId) return { campaignId };
  if (resourceType === "SOCIAL_POST" && socialPostId) return { socialPostId };
  return {};
}

export async function createMeasurementPlan(projectId: string, userId: string, input: CreateMeasurementPlanInput): Promise<{ id: string } | MbOptimizationActionError> {
  const session = await prisma.marketingBrainOptimizationSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.projectId !== projectId) return mbOptimizationError("SESSION_NOT_FOUND");
  if (session.status !== "APPROVED") return mbOptimizationError("SESSION_NOT_EDITABLE", "Solo puedes crear un plan de seguimiento para una estrategia aprobada.");

  if (input.contentItemId) {
    const row = await prisma.contentItem.findUnique({ where: { id: input.contentItemId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return mbOptimizationError("RESOURCE_NOT_FOUND");
  }
  if (input.campaignId) {
    const row = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return mbOptimizationError("RESOURCE_NOT_FOUND");
  }
  if (input.socialPostId) {
    const row = await prisma.socialPost.findUnique({ where: { id: input.socialPostId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return mbOptimizationError("RESOURCE_NOT_FOUND");
  }
  if (input.goalId) {
    const row = await prisma.performanceGoal.findUnique({ where: { id: input.goalId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return mbOptimizationError("RESOURCE_NOT_FOUND");
  }

  const filter = resourceFilterFor(input.resourceType, input.contentItemId, input.campaignId, input.socialPostId);
  const trackingStart = new Date(input.trackingStart);
  const baselineWindowStart = new Date(trackingStart.getTime() - 30 * 86_400_000);
  const baseline = await aggregateMetric(projectId, input.primaryMetricKey, filter, baselineWindowStart, trackingStart);
  const baselineQuality = baseline.sampleSize > 0 ? qualityLabelFor(30, baseline.distinctDays, baseline.daysSinceLastUpdate, baseline.sampleSize) : "INSUFFICIENT";

  const created = await prisma.marketingBrainMeasurementPlan.create({
    data: {
      sessionId: input.sessionId,
      projectId,
      createdById: userId,
      primaryMetricKey: input.primaryMetricKey,
      secondaryMetricKeys: input.secondaryMetricKeys,
      resourceType: input.resourceType,
      contentItemId: input.contentItemId ?? null,
      campaignId: input.campaignId ?? null,
      socialPostId: input.socialPostId ?? null,
      goalId: input.goalId ?? null,
      trackingStart,
      trackingEnd: new Date(input.trackingEnd),
      comparisonPeriodStart: input.comparisonPeriodStart ? new Date(input.comparisonPeriodStart) : null,
      comparisonPeriodEnd: input.comparisonPeriodEnd ? new Date(input.comparisonPeriodEnd) : null,
      baselineValue: baseline.value,
      baselineQuality,
      baselineSampleSize: baseline.sampleSize,
      baselineCapturedAt: new Date(),
      status: "ACTIVE",
    },
  });

  await publishAutomationEvent({
    projectId,
    eventKey: "marketing_brain_optimization.measurement_started",
    resourceId: created.id,
    actorId: userId,
    payload: { id: created.id, primaryMetricKey: input.primaryMetricKey },
    idempotencyKey: `marketing_brain_optimization.measurement_started:${created.id}`,
  });

  return { id: created.id };
}

export async function listMeasurementPlans(projectId: string, sessionId?: string) {
  return prisma.marketingBrainMeasurementPlan.findMany({
    where: { projectId, ...(sessionId ? { sessionId } : {}) },
    include: { reviews: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMeasurementPlanDetail(projectId: string, planId: string) {
  const row = await prisma.marketingBrainMeasurementPlan.findUnique({ where: { id: planId }, include: { reviews: { orderBy: { createdAt: "desc" } }, goal: true } });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

/** Generates (or updates, if regenerated the same day) a post-hoc review — never marks success/failure without enough data, never asserts causality without a genuinely concluded experiment for this exact metric/resource. */
export async function generateMeasurementReview(projectId: string, userId: string, planId: string): Promise<{ id: string } | MbOptimizationActionError> {
  const plan = await prisma.marketingBrainMeasurementPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.projectId !== projectId) return mbOptimizationError("PLAN_NOT_FOUND");
  if (plan.status === "CANCELLED") return mbOptimizationError("PLAN_NOT_ACTIVE");

  const filter = resourceFilterFor(plan.resourceType, plan.contentItemId ?? undefined, plan.campaignId ?? undefined, plan.socialPostId ?? undefined);
  const now = new Date();
  const currentWindowStart = new Date(Math.max(plan.trackingStart.getTime(), now.getTime() - 30 * 86_400_000));
  const currentWindowEnd = now < plan.trackingEnd ? now : plan.trackingEnd;
  const current = await aggregateMetric(projectId, plan.primaryMetricKey, filter, currentWindowStart, currentWindowEnd);
  const currentQuality = current.sampleSize > 0 ? qualityLabelFor(30, current.distinctDays, current.daysSinceLastUpdate, current.sampleSize) : "INSUFFICIENT";

  const limitations: string[] = [];
  const baselineValue = plan.baselineValue !== null ? Number(plan.baselineValue) : null;
  if (baselineValue === null) limitations.push("No se pudo capturar una línea base real antes de iniciar el seguimiento.");
  if (current.value === null) limitations.push("Todavía no hay mediciones reales en el periodo de seguimiento.");
  if (!plan.goalId) limitations.push("Este plan no tiene un objetivo asociado — no se puede evaluar cumplimiento, solo el cambio observado.");
  if (current.sampleSize > 0 && current.sampleSize < 5) limitations.push(`La muestra actual es pequeña (${current.sampleSize} mediciones).`);

  let absoluteDiff: number | null = null;
  let percentDiff: number | null = null;
  if (baselineValue !== null && current.value !== null) {
    absoluteDiff = current.value - baselineValue;
    percentDiff = safeRatio(absoluteDiff, baselineValue, true).value;
  }

  let goalOutcome: "REACHED" | "NOT_REACHED" | "INDETERMINATE" = "INDETERMINATE";
  if (plan.goalId) {
    const evaluation = await evaluateGoal(projectId, plan.goalId);
    if (!("error" in evaluation)) {
      goalOutcome = evaluation.reached === null ? "INDETERMINATE" : evaluation.reached ? "REACHED" : "NOT_REACHED";
    }
  }

  const relatedAnomalies = await prisma.performanceAnomaly.findMany({
    where: { projectId, metricKey: plan.primaryMetricKey, detectedAt: { gte: plan.trackingStart }, ...filter },
    select: { id: true, severity: true, detectedAt: true },
    take: 10,
  });
  const relatedExperiments = await prisma.performanceExperiment.findMany({
    where: { projectId, primaryMetricKey: plan.primaryMetricKey, status: { in: ["COMPLETED", "INCONCLUSIVE"] }, ...(plan.campaignId ? { campaignId: plan.campaignId } : {}) },
    select: { id: true, name: true, status: true, conclusion: true, winnerVariantId: true },
    take: 10,
  });

  const backingExperiment = relatedExperiments.find((e) => e.status === "COMPLETED" && e.winnerVariantId);
  const causalityStatement = backingExperiment ? "EXPERIMENT_BACKED" : baselineValue !== null && current.value !== null && absoluteDiff !== 0 ? "OBSERVED_DURING_PERIOD" : "CANNOT_CONFIRM";

  const conclusionParts: string[] = [];
  if (baselineValue === null || current.value === null) {
    conclusionParts.push("No hay datos suficientes para comparar el antes y el después de forma confiable.");
  } else {
    const direction = absoluteDiff! > 0 ? "aumentó" : absoluteDiff! < 0 ? "disminuyó" : "se mantuvo estable";
    conclusionParts.push(`La métrica "${plan.primaryMetricKey}" ${direction}${percentDiff !== null ? ` (${percentDiff > 0 ? "+" : ""}${Math.round(percentDiff)}%)` : ""} entre la línea base y el periodo de seguimiento.`);
  }
  if (causalityStatement === "EXPERIMENT_BACKED") conclusionParts.push(`Un experimento concluido ("${backingExperiment!.name}") respalda esta relación.`);
  else if (causalityStatement === "OBSERVED_DURING_PERIOD") conclusionParts.push("Este es un cambio observado durante el periodo — no se puede confirmar causalidad sin un experimento.");
  else conclusionParts.push("No se puede confirmar causalidad con la información disponible.");
  if (plan.goalId) conclusionParts.push(goalOutcome === "REACHED" ? "El objetivo asociado fue alcanzado." : goalOutcome === "NOT_REACHED" ? "El objetivo asociado no fue alcanzado." : "No hay datos suficientes para determinar si el objetivo fue alcanzado.");

  const idempotencyKey = `${planId}:${now.toISOString().slice(0, 10)}`;
  const review = await prisma.marketingBrainMeasurementReview.upsert({
    where: { idempotencyKey },
    create: {
      planId,
      projectId,
      createdById: userId,
      idempotencyKey,
      initialValue: baselineValue,
      currentValue: current.value,
      absoluteDiff,
      percentDiff,
      initialQuality: plan.baselineQuality,
      currentQuality,
      goalOutcome,
      relatedAnomalies: relatedAnomalies as unknown as Prisma.InputJsonValue,
      relatedExperiments: relatedExperiments.map((e) => ({ id: e.id, name: e.name, status: e.status, conclusion: e.conclusion })) as unknown as Prisma.InputJsonValue,
      limitations,
      conclusion: conclusionParts.join(" "),
      causalityStatement,
    },
    update: {
      currentValue: current.value,
      absoluteDiff,
      percentDiff,
      currentQuality,
      goalOutcome,
      relatedAnomalies: relatedAnomalies as unknown as Prisma.InputJsonValue,
      relatedExperiments: relatedExperiments.map((e) => ({ id: e.id, name: e.name, status: e.status, conclusion: e.conclusion })) as unknown as Prisma.InputJsonValue,
      limitations,
      conclusion: conclusionParts.join(" "),
      causalityStatement,
      generatedAt: now,
    },
  });

  if (now >= plan.trackingEnd && plan.status === "ACTIVE") {
    await prisma.marketingBrainMeasurementPlan.update({ where: { id: planId }, data: { status: "COMPLETED" } });
  }

  await publishAutomationEvent({
    projectId,
    eventKey: goalOutcome === "INDETERMINATE" ? "marketing_brain_optimization.review_indeterminate" : "marketing_brain_optimization.review_available",
    resourceId: review.id,
    actorId: userId,
    payload: { id: review.id, goalOutcome },
    idempotencyKey: `marketing_brain_optimization.review_available:${review.id}`,
  });
  if (goalOutcome === "REACHED") {
    await publishAutomationEvent({
      projectId,
      eventKey: "marketing_brain_optimization.goal_reached",
      resourceId: review.id,
      actorId: userId,
      payload: { id: review.id },
      idempotencyKey: `marketing_brain_optimization.goal_reached:${review.id}`,
    });
  }

  return { id: review.id };
}

export async function cancelMeasurementPlan(projectId: string, planId: string): Promise<{ id: string } | MbOptimizationActionError> {
  const plan = await prisma.marketingBrainMeasurementPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.projectId !== projectId) return mbOptimizationError("PLAN_NOT_FOUND");
  await prisma.marketingBrainMeasurementPlan.update({ where: { id: planId }, data: { status: "CANCELLED" } });
  return { id: planId };
}

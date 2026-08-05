import "server-only";
import { prisma } from "@/lib/db/prisma";
import { performanceError, type PerformanceActionError } from "@/lib/performance/types";
import { findMetricDefinition, isCustomMetricKey } from "@/lib/performance/metrics-catalog";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { CreateGoalInput, CreateBenchmarkInput } from "@/lib/validation/performance";

/**
 * Goals and benchmarks (spec sections 24) — targets are evaluated against
 * REAL aggregated PerformanceMetricRecord values, never a fabricated
 * "on track" status. Benchmarks are always computed from real internal data
 * or an explicit manual value the user typed — never "industry benchmark"
 * invented numbers (spec section 24: "no llames 'benchmark del sector' a un
 * número inventado").
 */

async function resolveOwnedGoalResource(projectId: string, campaignId?: string, contentItemId?: string): Promise<PerformanceActionError | null> {
  if (campaignId) {
    const row = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }
  if (contentItemId) {
    const row = await prisma.contentItem.findUnique({ where: { id: contentItemId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }
  return null;
}

export async function createGoal(projectId: string, userId: string, input: CreateGoalInput): Promise<{ id: string } | PerformanceActionError> {
  const ownership = await resolveOwnedGoalResource(projectId, input.campaignId, input.contentItemId);
  if (ownership) return ownership;

  if (!isCustomMetricKey(input.metricKey) && !findMetricDefinition(input.metricKey)) return performanceError("METRIC_DEFINITION_NOT_FOUND");

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  if (periodEnd.getTime() < periodStart.getTime()) return performanceError("METRIC_PERIOD_INVALID");

  if ((input.type === "MINIMUM" || input.type === "MAXIMUM" || input.type === "GROWTH" || input.type === "MAINTAIN") && input.targetValue === undefined) {
    return performanceError("METRIC_INVALID", "Este tipo de objetivo requiere un valor objetivo.");
  }
  if (input.type === "RANGE" && (input.targetMin === undefined || input.targetMax === undefined)) {
    return performanceError("METRIC_INVALID", "Un objetivo de rango requiere un mínimo y un máximo.");
  }

  const created = await prisma.performanceGoal.create({
    data: {
      projectId,
      createdById: userId,
      resourceType: input.resourceType,
      campaignId: input.campaignId ?? null,
      contentItemId: input.contentItemId ?? null,
      platform: input.platform ?? null,
      metricKey: input.metricKey,
      type: input.type,
      targetValue: input.targetValue ?? null,
      targetMin: input.targetMin ?? null,
      targetMax: input.targetMax ?? null,
      periodStart,
      periodEnd,
    },
  });
  return { id: created.id };
}

export async function listGoals(projectId: string, filters: { campaignId?: string; contentItemId?: string; status?: string } = {}) {
  return prisma.performanceGoal.findMany({
    where: { projectId, ...(filters.campaignId ? { campaignId: filters.campaignId } : {}), ...(filters.contentItemId ? { contentItemId: filters.contentItemId } : {}), ...(filters.status ? { status: filters.status as never } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

async function aggregateMetricValue(projectId: string, metricKey: string, filters: { campaignId?: string | null; contentItemId?: string | null; platform?: string | null }, periodStart: Date, periodEnd: Date): Promise<number | null> {
  const def = isCustomMetricKey(metricKey) ? null : findMetricDefinition(metricKey);
  const records = await prisma.performanceMetricRecord.findMany({
    where: {
      projectId,
      metricKey,
      isArchived: false,
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.contentItemId ? { contentItemId: filters.contentItemId } : {}),
      ...(filters.platform ? { platform: filters.platform } : {}),
      measuredAt: { gte: periodStart, lte: periodEnd },
    },
    select: { value: true },
  });
  if (records.length === 0) return null;
  const values = records.map((r) => Number(r.value));
  if (def?.aggregation === "AVERAGE" || def?.aggregation === "RATE") return values.reduce((a, b) => a + b, 0) / values.length;
  if (def?.aggregation === "MAX") return Math.max(...values);
  if (def?.aggregation === "MIN") return Math.min(...values);
  if (def?.aggregation === "LAST") return values[values.length - 1];
  return values.reduce((a, b) => a + b, 0);
}

export interface GoalEvaluation {
  currentValue: number | null;
  reached: boolean | null;
}

/** Evaluates a single goal against real aggregated data — never marks REACHED/MISSED when there simply isn't enough data yet (returns reached: null in that case, meaning "still unknown"). */
export async function evaluateGoal(projectId: string, goalId: string): Promise<GoalEvaluation | PerformanceActionError> {
  const goal = await prisma.performanceGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");

  const currentValue = await aggregateMetricValue(projectId, goal.metricKey, { campaignId: goal.campaignId, contentItemId: goal.contentItemId, platform: goal.platform }, goal.periodStart, goal.periodEnd);
  if (currentValue === null) return { currentValue: null, reached: null };

  let reached: boolean;
  if (goal.type === "MINIMUM" || goal.type === "GROWTH") reached = currentValue >= Number(goal.targetValue);
  else if (goal.type === "MAXIMUM") reached = currentValue <= Number(goal.targetValue);
  else if (goal.type === "MAINTAIN") reached = Math.abs(currentValue - Number(goal.targetValue)) <= Number(goal.targetValue) * 0.05;
  else if (goal.type === "RANGE") reached = currentValue >= Number(goal.targetMin) && currentValue <= Number(goal.targetMax);
  else reached = false; // CUSTOM goals require a human decision, never an automatic true/false.

  return { currentValue, reached };
}

/** Batch: re-evaluates every ACTIVE goal whose period has ended, transitioning it to REACHED/MISSED — never leaves it ACTIVE forever, never marks it without real data (spec section 24). Returns the goals that just transitioned so the caller can publish automation events. */
export async function processExpiredGoals(limit = 100): Promise<{ goalId: string; projectId: string; reached: boolean }[]> {
  const now = new Date();
  const expiredGoals = await prisma.performanceGoal.findMany({ where: { status: "ACTIVE", periodEnd: { lt: now } }, take: limit });
  const transitions: { goalId: string; projectId: string; reached: boolean }[] = [];

  for (const goal of expiredGoals) {
    const evaluation = await evaluateGoal(goal.projectId, goal.id);
    if ("error" in evaluation) continue;
    if (evaluation.reached === null) {
      await prisma.performanceGoal.update({ where: { id: goal.id }, data: { status: "EXPIRED" } });
      continue;
    }
    const claim = await prisma.performanceGoal.updateMany({ where: { id: goal.id, status: "ACTIVE" }, data: { status: evaluation.reached ? "REACHED" : "MISSED", reachedAt: evaluation.reached ? now : null } });
    if (claim.count > 0) {
      transitions.push({ goalId: goal.id, projectId: goal.projectId, reached: evaluation.reached });
      await publishAutomationEvent({
        projectId: goal.projectId,
        eventKey: evaluation.reached ? "PERFORMANCE_GOAL_REACHED" : "PERFORMANCE_GOAL_MISSED",
        resourceId: goal.id,
        payload: { id: goal.id, metricKey: goal.metricKey, campaignId: goal.campaignId },
        idempotencyKey: `${evaluation.reached ? "PERFORMANCE_GOAL_REACHED" : "PERFORMANCE_GOAL_MISSED"}:${goal.id}`,
      });
    }
  }
  return transitions;
}

export async function archiveGoal(projectId: string, goalId: string): Promise<{ id: string } | PerformanceActionError> {
  const goal = await prisma.performanceGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  await prisma.performanceGoal.update({ where: { id: goalId }, data: { status: "ARCHIVED" } });
  return { id: goalId };
}

// --- Benchmarks --------------------------------------------------------------

export async function createBenchmark(projectId: string, userId: string, input: CreateBenchmarkInput): Promise<{ id: string } | PerformanceActionError> {
  if (input.campaignId) {
    const row = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }
  if (!isCustomMetricKey(input.metricKey) && !findMetricDefinition(input.metricKey)) return performanceError("METRIC_DEFINITION_NOT_FOUND");

  let value = input.value;
  if (input.source !== "MANUAL_VALUE") {
    const computed = await computeRealBenchmarkValue(projectId, input.metricKey, input.source, input.campaignId);
    if (computed === null) return performanceError("INSUFFICIENT_DATA", "No hay datos internos suficientes para calcular este benchmark todavía.");
    value = computed;
  }

  const created = await prisma.performanceBenchmark.create({
    data: { projectId, createdById: input.source === "MANUAL_VALUE" ? userId : null, metricKey: input.metricKey, source: input.source, campaignId: input.campaignId ?? null, label: input.label ?? null, value },
  });
  return { id: created.id };
}

async function computeRealBenchmarkValue(projectId: string, metricKey: string, source: string, campaignId?: string): Promise<number | null> {
  if (source === "INTERNAL_AVERAGE" || source === "INTERNAL_MEDIAN") {
    const records = await prisma.performanceMetricRecord.findMany({ where: { projectId, metricKey, isArchived: false, ...(campaignId ? { campaignId } : {}) }, select: { value: true } });
    if (records.length === 0) return null;
    const values = records.map((r) => Number(r.value)).sort((a, b) => a - b);
    if (source === "INTERNAL_MEDIAN") {
      const mid = Math.floor(values.length / 2);
      return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
    }
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  if (source === "BEST_HISTORICAL") {
    const best = await prisma.performanceMetricRecord.findFirst({ where: { projectId, metricKey, isArchived: false, ...(campaignId ? { campaignId } : {}) }, orderBy: { value: "desc" }, select: { value: true } });
    return best ? Number(best.value) : null;
  }
  if (source === "PREVIOUS_PERIOD" || source === "PREVIOUS_CAMPAIGN") {
    const latest = await prisma.performanceMetricRecord.findFirst({ where: { projectId, metricKey, isArchived: false, ...(campaignId ? { campaignId } : {}) }, orderBy: { measuredAt: "desc" }, select: { value: true } });
    return latest ? Number(latest.value) : null;
  }
  return null;
}

export async function listBenchmarks(projectId: string, metricKey?: string) {
  return prisma.performanceBenchmark.findMany({ where: { projectId, ...(metricKey ? { metricKey } : {}) }, orderBy: { computedAt: "desc" } });
}

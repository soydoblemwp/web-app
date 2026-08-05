import "server-only";
import { prisma } from "@/lib/db/prisma";
import { performanceError, type PerformanceActionError } from "@/lib/performance/types";
import { findMetricDefinition, isCustomMetricKey } from "@/lib/performance/metrics-catalog";
import { mean, median, stddev, twoSampleTTestApprox } from "@/lib/performance/statistics";
import { PERFORMANCE_LIMITS, exceedsExperimentVariantLimit } from "@/lib/performance/limits";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { CreateExperimentInput, CreateVariantInput, DecideExperimentWinnerInput } from "@/lib/validation/performance";

/**
 * Internal experiments (spec sections 20-22) — never presented as an
 * external, provider-run A/B test; this is entirely internal
 * measurement/comparison. Winner declaration goes through
 * analyzeExperiment's statistics (twoSampleTTestApprox), and is never
 * finalized without an explicit human decision (decideExperimentWinner) —
 * the analysis only ever RECOMMENDS, it doesn't unilaterally close the
 * experiment.
 */

async function getOwnedExperiment(projectId: string, experimentId: string) {
  const row = await prisma.performanceExperiment.findUnique({ where: { id: experimentId }, include: { variants: true } });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export async function createExperiment(projectId: string, userId: string, input: CreateExperimentInput): Promise<{ id: string } | PerformanceActionError> {
  if (!isCustomMetricKey(input.primaryMetricKey) && !findMetricDefinition(input.primaryMetricKey)) return performanceError("METRIC_DEFINITION_NOT_FOUND");
  if (input.campaignId) {
    const row = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }
  if (input.contentItemId) {
    const row = await prisma.contentItem.findUnique({ where: { id: input.contentItemId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }

  const created = await prisma.performanceExperiment.create({
    data: {
      projectId,
      createdById: userId,
      name: input.name,
      hypothesis: input.hypothesis,
      objective: input.objective || null,
      type: input.type,
      primaryMetricKey: input.primaryMetricKey,
      secondaryMetricKeys: input.secondaryMetricKeys,
      resourceType: input.resourceType,
      contentItemId: input.contentItemId ?? null,
      campaignId: input.campaignId ?? null,
      platform: input.platform ?? null,
      periodStart: input.periodStart ? new Date(input.periodStart) : null,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
      expectedSampleSize: input.expectedSampleSize ?? null,
      completionCriteria: input.completionCriteria || null,
      status: "DRAFT",
    },
  });
  return { id: created.id };
}

export async function listExperiments(projectId: string, filters: { status?: string; campaignId?: string } = {}) {
  return prisma.performanceExperiment.findMany({
    where: { projectId, ...(filters.status ? { status: filters.status as never } : {}), ...(filters.campaignId ? { campaignId: filters.campaignId } : {}) },
    include: { variants: { select: { id: true, label: true, isControl: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getExperimentDetail(projectId: string, experimentId: string) {
  const row = await prisma.performanceExperiment.findUnique({
    where: { id: experimentId },
    include: {
      variants: { include: { metrics: true, createdByAgentRun: { select: { id: true, officialAgentKey: true, customAgentId: true } }, confirmedBy: { select: { id: true, name: true } } } },
      winnerVariant: { select: { id: true, label: true } },
      recommendations: { select: { id: true, title: true, status: true } },
    },
  });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export async function createVariant(projectId: string, userId: string, input: CreateVariantInput): Promise<{ id: string } | PerformanceActionError> {
  const experiment = await getOwnedExperiment(projectId, input.experimentId);
  if (!experiment) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  if (!["DRAFT", "READY", "RUNNING", "PAUSED"].includes(experiment.status)) return performanceError("EXPERIMENT_ALREADY_COMPLETED");
  if (exceedsExperimentVariantLimit(experiment.variants.length + 1)) return performanceError("EXPERIMENT_INVALID", `Se alcanzó el máximo de variantes permitidas (${PERFORMANCE_LIMITS.MAX_EXPERIMENT_VARIANTS}).`);

  if (input.contentVersionId) {
    const row = await prisma.contentVersion.findUnique({ where: { id: input.contentVersionId }, select: { contentItem: { select: { projectId: true } } } });
    if (!row || row.contentItem.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }
  if (input.socialPostId) {
    const row = await prisma.socialPost.findUnique({ where: { id: input.socialPostId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }
  if (input.createdByAgentRunId) {
    const run = await prisma.aiAgentRun.findUnique({ where: { id: input.createdByAgentRunId }, select: { projectId: true } });
    if (!run || run.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }

  const created = await prisma.performanceExperimentVariant.create({
    data: {
      experimentId: input.experimentId,
      label: input.label,
      isControl: input.isControl,
      contentVersionId: input.contentVersionId ?? null,
      socialPostId: input.socialPostId ?? null,
      text: input.text || null,
      createdByAgentRunId: input.createdByAgentRunId ?? null,
      agentKeyUsed: input.agentKeyUsed ?? null,
      confirmedById: input.createdByAgentRunId ? userId : null,
      status: "DRAFT",
    },
  });
  return { id: created.id };
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["READY", "CANCELLED", "ARCHIVED"],
  READY: ["RUNNING", "CANCELLED", "ARCHIVED"],
  RUNNING: ["PAUSED", "COMPLETED", "INCONCLUSIVE", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  INCONCLUSIVE: ["RUNNING", "ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: [],
};

export async function transitionExperimentStatus(projectId: string, experimentId: string, nextStatus: string): Promise<{ id: string } | PerformanceActionError> {
  const experiment = await getOwnedExperiment(projectId, experimentId);
  if (!experiment) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  if (!VALID_TRANSITIONS[experiment.status]?.includes(nextStatus)) return performanceError("EXPERIMENT_NOT_READY", `No se puede pasar de ${experiment.status} a ${nextStatus}.`);
  if (nextStatus === "RUNNING" && experiment.variants.length < 2) return performanceError("EXPERIMENT_INVALID", "Un experimento necesita al menos control y una variante para iniciarse.");

  await prisma.performanceExperiment.update({ where: { id: experimentId }, data: { status: nextStatus as never } });
  if (nextStatus === "RUNNING") {
    await publishAutomationEvent({
      projectId,
      eventKey: "PERFORMANCE_EXPERIMENT_STARTED",
      resourceId: experimentId,
      payload: { id: experimentId, name: experiment.name, type: experiment.type },
      idempotencyKey: `PERFORMANCE_EXPERIMENT_STARTED:${experimentId}`,
    });
  }
  return { id: experimentId };
}

export interface ExperimentAnalysisResult {
  variants: { variantId: string; label: string; isControl: boolean; sampleSize: number; mean: number | null }[];
  comparisons: { variantId: string; label: string; vsControl: ReturnType<typeof twoSampleTTestApprox> }[];
  recommendedWinnerVariantId: string | null;
  inconclusiveReason: string | null;
}

/**
 * Statistical analysis (spec section 22) — computes real sample sizes/means
 * and a two-sample comparison against control. Never declares a winner when
 * the sample is below PERFORMANCE_LIMITS.MIN_EXPERIMENT_SAMPLE_SIZE, when
 * the comparison isn't statistically significant, or when there's no
 * control variant to compare against — always explains why, never silently
 * picks one.
 */
export async function analyzeExperiment(projectId: string, experimentId: string): Promise<ExperimentAnalysisResult | PerformanceActionError> {
  const experiment = await getOwnedExperiment(projectId, experimentId);
  if (!experiment) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");

  const control = experiment.variants.find((v) => v.isControl);
  const variantValues = new Map<string, number[]>();
  for (const variant of experiment.variants) {
    const records = await prisma.performanceMetricRecord.findMany({ where: { experimentVariantId: variant.id, metricKey: experiment.primaryMetricKey, isArchived: false }, select: { value: true } });
    variantValues.set(variant.id, records.map((r) => Number(r.value)));
  }

  const variantsSummary = experiment.variants.map((v) => {
    const values = variantValues.get(v.id) ?? [];
    return { variantId: v.id, label: v.label, isControl: v.isControl, sampleSize: values.length, mean: mean(values) };
  });

  for (const v of experiment.variants) {
    const values = variantValues.get(v.id) ?? [];
    await prisma.performanceExperimentMetric.upsert({
      where: { variantId_metricKey: { variantId: v.id, metricKey: experiment.primaryMetricKey } },
      create: { experimentId, variantId: v.id, metricKey: experiment.primaryMetricKey, sampleSize: values.length, mean: mean(values), median: median(values), stddev: stddev(values), value: mean(values) ?? 0 },
      update: { sampleSize: values.length, mean: mean(values), median: median(values), stddev: stddev(values), value: mean(values) ?? 0 },
    });
  }

  if (!control) {
    return { variants: variantsSummary, comparisons: [], recommendedWinnerVariantId: null, inconclusiveReason: "El experimento no tiene una variante de control definida." };
  }
  const controlValues = variantValues.get(control.id) ?? [];
  if (controlValues.length < PERFORMANCE_LIMITS.MIN_EXPERIMENT_SAMPLE_SIZE) {
    return { variants: variantsSummary, comparisons: [], recommendedWinnerVariantId: null, inconclusiveReason: `La variante de control solo tiene ${controlValues.length} muestra(s) — se requieren al menos ${PERFORMANCE_LIMITS.MIN_EXPERIMENT_SAMPLE_SIZE}.` };
  }

  const def = isCustomMetricKey(experiment.primaryMetricKey) ? null : findMetricDefinition(experiment.primaryMetricKey);
  const higherIsBetter = def?.direction !== "LOWER_IS_BETTER";

  const comparisons: ExperimentAnalysisResult["comparisons"] = [];
  let bestVariantId: string | null = null;
  let bestMean = higherIsBetter ? -Infinity : Infinity;
  let anySignificant = false;

  for (const variant of experiment.variants) {
    if (variant.id === control.id) continue;
    const values = variantValues.get(variant.id) ?? [];
    if (values.length < PERFORMANCE_LIMITS.MIN_EXPERIMENT_SAMPLE_SIZE) {
      comparisons.push({ variantId: variant.id, label: variant.label, vsControl: null });
      continue;
    }
    const testResult = twoSampleTTestApprox(controlValues, values);
    comparisons.push({ variantId: variant.id, label: variant.label, vsControl: testResult });
    if (testResult?.significantAt95) {
      anySignificant = true;
      const variantMean = testResult.meanB;
      if ((higherIsBetter && variantMean > bestMean) || (!higherIsBetter && variantMean < bestMean)) {
        bestMean = variantMean;
        bestVariantId = variant.id;
      }
    }
  }

  if (!anySignificant) {
    return { variants: variantsSummary, comparisons, recommendedWinnerVariantId: null, inconclusiveReason: "Ninguna variante mostró una diferencia estadísticamente significativa frente al control." };
  }

  // Compare the best significant variant against control's own mean too, in case control itself is best.
  const controlMean = mean(controlValues)!;
  const isControlBest = (higherIsBetter && controlMean >= bestMean) || (!higherIsBetter && controlMean <= bestMean);

  return { variants: variantsSummary, comparisons, recommendedWinnerVariantId: isControlBest ? control.id : bestVariantId, inconclusiveReason: null };
}

export async function decideExperimentWinner(projectId: string, experimentId: string, input: DecideExperimentWinnerInput): Promise<{ id: string } | PerformanceActionError> {
  const experiment = await getOwnedExperiment(projectId, experimentId);
  if (!experiment) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  if (!["RUNNING", "PAUSED"].includes(experiment.status)) return performanceError("EXPERIMENT_NOT_READY");
  if (input.winnerVariantId && !experiment.variants.some((v) => v.id === input.winnerVariantId)) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");

  const finalStatus = input.winnerVariantId ? "COMPLETED" : "INCONCLUSIVE";
  await prisma.performanceExperiment.update({
    where: { id: experimentId },
    data: { status: finalStatus, winnerVariantId: input.winnerVariantId ?? null, conclusion: input.conclusion },
  });
  await publishAutomationEvent({
    projectId,
    eventKey: finalStatus === "COMPLETED" ? "PERFORMANCE_EXPERIMENT_COMPLETED" : "PERFORMANCE_EXPERIMENT_INCONCLUSIVE",
    resourceId: experimentId,
    payload: { id: experimentId, name: experiment.name, winnerVariantId: input.winnerVariantId ?? null },
    idempotencyKey: `${finalStatus}:${experimentId}`,
  });
  return { id: experimentId };
}

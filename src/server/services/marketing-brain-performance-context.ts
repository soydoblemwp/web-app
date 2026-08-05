import "server-only";
import { prisma } from "@/lib/db/prisma";
import { classifyTrend } from "@/lib/performance/trends";
import { detectValueAnomaly } from "@/lib/performance/anomalies";
import { bucketByPeriod } from "@/lib/performance/periods";
import { computeDataQuality } from "@/lib/performance/data-quality";
import { findMetricDefinition, isCustomMetricKey } from "@/lib/performance/metrics-catalog";
import { mean } from "@/lib/performance/statistics";
import { classifyEvidenceStrength } from "@/lib/marketing-brain/evidence-strength";
import { MB_OPTIMIZATION_LIMITS } from "@/lib/marketing-brain/optimization-limits";
import type { PerformanceContextSelectionParsed } from "@/lib/validation/marketing-brain-optimization";
import type {
  PerformanceContextBundle,
  ContextFactEntry,
  ContextDerivedEntry,
  ContextSignalEntry,
  ContextHypothesisEntry,
} from "@/lib/marketing-brain/performance-context-types";

/**
 * Deterministic Performance Center context builder for Marketing Brain
 * (Fase 35 spec sections 6-8) — the ONLY place that turns a user/recommended
 * selection into the facts/derived/signals/hypotheses/constraints/missingData
 * bundle a strategy generation (and its frozen snapshot) is built from.
 * Reuses every existing Performance Center primitive (data quality, trend
 * classification, anomaly detection, metric catalog) — never a second
 * metrics engine. Every ID is re-validated against `projectId` here; a
 * caller must never pass client-supplied IDs straight through untrusted.
 */

const DEFAULT_METRIC_KEYS_BY_RESOURCE: Record<string, string[]> = {
  CONTENT_ITEM: ["content_items_created", "content_seo_score", "content_versions_created", "engagement_rate"],
  CAMPAIGN: ["campaign_pieces_completed", "campaign_pieces_planned", "engagement_rate", "content_completion_rate"],
  SOCIAL_POST: ["engagement_rate", "impressions", "reach", "likes"],
  PROJECT: ["content_items_created", "campaigns_created", "engagement_rate"],
};

function emptyBundle(): PerformanceContextBundle {
  return {
    facts: { metrics: [], goals: [], benchmarks: [], experiments: [], recommendations: [], reports: [] },
    derived: [],
    signals: [],
    hypotheses: [],
    constraints: [],
    missingData: ["No se seleccionó contexto de rendimiento para esta generación."],
    dataQualityScore: 0,
    dataQualityLevel: "INSUFFICIENT",
    evidenceStrength: "INSUFFICIENT",
    counts: { metricCount: 0, resourceCount: 0, recommendationCount: 0, experimentCount: 0, goalCount: 0, benchmarkCount: 0, reportCount: 0 },
  };
}

async function resolveResourceLabels(projectId: string, resourceType: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  if (resourceType === "CONTENT_ITEM") {
    const rows = await prisma.contentItem.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, title: true } });
    return new Map(rows.map((r) => [r.id, r.title]));
  }
  if (resourceType === "CAMPAIGN") {
    const rows = await prisma.campaign.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
  if (resourceType === "SOCIAL_POST") {
    const rows = await prisma.socialPost.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, internalTitle: true, platform: true } });
    return new Map(rows.map((r) => [r.id, r.internalTitle || r.platform]));
  }
  return new Map();
}

async function recommendedResourceIds(projectId: string, resourceType: string, campaignId: string | null): Promise<string[]> {
  const take = MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_RESOURCES;
  if (resourceType === "CAMPAIGN") {
    const rows = await prisma.campaign.findMany({ where: { projectId, ...(campaignId ? { id: campaignId } : {}) }, select: { id: true }, orderBy: { updatedAt: "desc" }, take });
    return rows.map((r) => r.id);
  }
  if (resourceType === "CONTENT_ITEM") {
    const rows = await prisma.contentItem.findMany({ where: { projectId, deletedAt: null, isArchived: false, ...(campaignId ? { campaignLinks: { some: { campaign: { id: campaignId } } } } : {}) }, select: { id: true }, orderBy: { updatedAt: "desc" }, take });
    return rows.map((r) => r.id);
  }
  if (resourceType === "SOCIAL_POST") {
    const rows = await prisma.socialPost.findMany({ where: { projectId, ...(campaignId ? { campaignId } : {}) }, select: { id: true }, orderBy: { updatedAt: "desc" }, take });
    return rows.map((r) => r.id);
  }
  return [];
}

async function filterOwnedResourceIds(projectId: string, resourceType: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  if (resourceType === "CONTENT_ITEM") {
    const rows = await prisma.contentItem.findMany({ where: { id: { in: ids }, projectId }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  if (resourceType === "CAMPAIGN") {
    const rows = await prisma.campaign.findMany({ where: { id: { in: ids }, projectId }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  if (resourceType === "SOCIAL_POST") {
    const rows = await prisma.socialPost.findMany({ where: { id: { in: ids }, projectId }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  return [];
}

function resourceFilterFor(resourceType: string, resourceIds: string[]): Record<string, unknown> {
  if (resourceIds.length === 0) return {};
  if (resourceType === "CONTENT_ITEM") return { contentItemId: { in: resourceIds } };
  if (resourceType === "CAMPAIGN") return { campaignId: { in: resourceIds } };
  if (resourceType === "SOCIAL_POST") return { socialPostId: { in: resourceIds } };
  return {};
}

export async function buildPerformanceContext(
  projectId: string,
  campaignIdHint: string | null,
  rawSelection: PerformanceContextSelectionParsed
): Promise<{ bundle: PerformanceContextBundle; periodStart: Date; periodEnd: Date; comparisonPeriodStart: Date | null; comparisonPeriodEnd: Date | null; resolvedResourceType: string; resolvedResourceIds: string[] }> {
  if (rawSelection.mode === "NONE") {
    return { bundle: emptyBundle(), periodStart: new Date(), periodEnd: new Date(), comparisonPeriodStart: null, comparisonPeriodEnd: null, resolvedResourceType: "PROJECT", resolvedResourceIds: [] };
  }

  const periodEnd = rawSelection.periodEnd ? new Date(rawSelection.periodEnd) : new Date();
  const periodStart = rawSelection.periodStart ? new Date(rawSelection.periodStart) : new Date(periodEnd.getTime() - 90 * 86_400_000);
  const periodDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000));
  let comparisonPeriodStart: Date | null = null;
  let comparisonPeriodEnd: Date | null = null;
  if (rawSelection.compareToPreviousPeriod) {
    comparisonPeriodEnd = new Date(periodStart.getTime());
    comparisonPeriodStart = new Date(periodStart.getTime() - periodDays * 86_400_000);
  }

  const resourceType = rawSelection.resourceType ?? (campaignIdHint ? "CAMPAIGN" : "PROJECT");

  let resourceIds = rawSelection.resourceIds ?? [];
  let metricKeys = rawSelection.metricKeys ?? [];
  let goalIds = rawSelection.goalIds ?? [];
  let benchmarkIds = rawSelection.benchmarkIds ?? [];
  let experimentIds = rawSelection.experimentIds ?? [];
  let recommendationIds = rawSelection.recommendationIds ?? [];
  const reportIds = rawSelection.reportIds ?? [];

  if (rawSelection.mode === "RECOMMENDED") {
    if (resourceIds.length === 0 && resourceType !== "PROJECT") resourceIds = await recommendedResourceIds(projectId, resourceType, campaignIdHint);
    if (metricKeys.length === 0) metricKeys = (DEFAULT_METRIC_KEYS_BY_RESOURCE[resourceType] ?? []).slice(0, MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_METRICS);
    if (goalIds.length === 0) {
      const rows = await prisma.performanceGoal.findMany({ where: { projectId, status: "ACTIVE", ...(campaignIdHint ? { campaignId: campaignIdHint } : {}) }, select: { id: true }, take: MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_GOALS, orderBy: { createdAt: "desc" } });
      goalIds = rows.map((r) => r.id);
    }
    if (benchmarkIds.length === 0 && metricKeys.length > 0) {
      const rows = await prisma.performanceBenchmark.findMany({ where: { projectId, metricKey: { in: metricKeys } }, select: { id: true }, take: MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_BENCHMARKS, orderBy: { createdAt: "desc" } });
      benchmarkIds = rows.map((r) => r.id);
    }
    if (experimentIds.length === 0) {
      const rows = await prisma.performanceExperiment.findMany({ where: { projectId, status: "COMPLETED", ...(campaignIdHint ? { campaignId: campaignIdHint } : {}) }, select: { id: true }, take: MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_EXPERIMENTS, orderBy: { updatedAt: "desc" } });
      experimentIds = rows.map((r) => r.id);
    }
    if (recommendationIds.length === 0) {
      const rows = await prisma.performanceRecommendation.findMany({ where: { projectId, status: { in: ["NEW", "ACCEPTED"] }, ...(campaignIdHint ? { campaignId: campaignIdHint } : {}) }, select: { id: true }, take: MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_RECOMMENDATIONS, orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
      recommendationIds = rows.map((r) => r.id);
    }
    // reportIds intentionally NOT auto-selected in RECOMMENDED mode — reports are a heavier, explicit inclusion the user opts into manually.
  }

  // Never trust client-supplied IDs — every one is re-validated against this project.
  resourceIds = resourceType === "PROJECT" ? [] : await filterOwnedResourceIds(projectId, resourceType, resourceIds.slice(0, MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_RESOURCES));
  metricKeys = metricKeys.filter((k) => isCustomMetricKey(k) || findMetricDefinition(k)).slice(0, MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_METRICS);

  const [goalRows, benchmarkRows, experimentRows, recommendationRows, reportRows] = await Promise.all([
    goalIds.length ? prisma.performanceGoal.findMany({ where: { id: { in: goalIds }, projectId } }) : Promise.resolve([]),
    benchmarkIds.length ? prisma.performanceBenchmark.findMany({ where: { id: { in: benchmarkIds }, projectId } }) : Promise.resolve([]),
    experimentIds.length ? prisma.performanceExperiment.findMany({ where: { id: { in: experimentIds }, projectId }, include: { winnerVariant: { select: { label: true } } } }) : Promise.resolve([]),
    recommendationIds.length ? prisma.performanceRecommendation.findMany({ where: { id: { in: recommendationIds }, projectId } }) : Promise.resolve([]),
    reportIds.length ? prisma.performanceReport.findMany({ where: { id: { in: reportIds }, projectId } }) : Promise.resolve([]),
  ]);

  const resourceLabels = await resolveResourceLabels(projectId, resourceType, resourceIds);
  const resourceFilter = resourceFilterFor(resourceType, resourceIds);

  const metrics: ContextFactEntry[] = [];
  const derived: ContextDerivedEntry[] = [];
  const signals: ContextSignalEntry[] = [];
  const hypotheses: ContextHypothesisEntry[] = [];
  const constraints: string[] = [];
  const missingData: string[] = [];

  let totalRecords = 0;
  let totalExpectedDays = 0;
  let totalActualDays = 0;
  let lastMeasuredAt: Date | null = null;
  const originsSeen = new Set<string>();

  for (const metricKey of metricKeys) {
    const def = isCustomMetricKey(metricKey) ? null : findMetricDefinition(metricKey);
    const records = await prisma.performanceMetricRecord.findMany({
      where: { projectId, metricKey, isArchived: false, ...resourceFilter, measuredAt: { gte: periodStart, lte: periodEnd } },
      select: { value: true, source: true, measuredAt: true, unit: true },
      orderBy: { measuredAt: "asc" },
    });

    if (records.length === 0) {
      missingData.push(`No hay mediciones de "${def?.name ?? metricKey}" en el periodo seleccionado.`);
      continue;
    }

    const values = records.map((r) => Number(r.value));
    const aggregated = def?.aggregation === "AVERAGE" || def?.aggregation === "RATE" ? mean(values)! : def?.aggregation === "MAX" ? Math.max(...values) : def?.aggregation === "MIN" ? Math.min(...values) : def?.aggregation === "LAST" ? values[values.length - 1] : values.reduce((a, b) => a + b, 0);
    const origins = new Set(records.map((r) => r.source));
    origins.forEach((o) => originsSeen.add(o));
    const latest = records[records.length - 1].measuredAt;
    if (!lastMeasuredAt || latest > lastMeasuredAt) lastMeasuredAt = latest;

    metrics.push({
      key: metricKey,
      label: def?.name ?? metricKey,
      value: Math.round(aggregated * 100) / 100,
      unit: def?.unit,
      origin: origins.size === 1 ? [...origins][0] : "MIXED",
      sampleSize: records.length,
      measuredAt: latest.toISOString(),
      resourceLabel: resourceIds.length === 1 ? resourceLabels.get(resourceIds[0]) : undefined,
    });

    totalRecords += records.length;
    const distinctDays = new Set(records.map((r) => r.measuredAt.toISOString().slice(0, 10))).size;
    totalExpectedDays += periodDays;
    totalActualDays += distinctDays;

    const bucketed = bucketByPeriod(records.map((r) => ({ date: r.measuredAt, value: Number(r.value) })), "DAY", "UTC");
    const trend = classifyTrend(bucketed.map((b) => ({ date: b.date, value: b.value })));
    if (trend.direction === "RISING" || trend.direction === "FALLING") {
      signals.push({ type: "TREND", key: `trend:${metricKey}`, label: def?.name ?? metricKey, description: `Tendencia ${trend.direction === "RISING" ? "al alza" : "a la baja"} (${trend.changePercent !== null ? `${trend.changePercent > 0 ? "+" : ""}${Math.round(trend.changePercent)}%` : "cambio no cuantificable"}) sobre ${trend.sampleSize} puntos.` });
      hypotheses.push({ key: `hyp:${metricKey}`, label: `Es posible que "${def?.name ?? metricKey}" siga esta tendencia si nada más cambia — no confirmado.`, basedOn: [`trend:${metricKey}`] });
    } else if (trend.direction === "VOLATILE") {
      signals.push({ type: "TREND", key: `trend:${metricKey}`, label: def?.name ?? metricKey, severity: "MEDIUM", description: "Serie volátil — sin una dirección clara en el periodo." });
    }

    if (bucketed.length >= 6) {
      const candidate = bucketed[bucketed.length - 1].value;
      const history = bucketed.slice(0, -1).map((b) => b.value);
      const anomaly = detectValueAnomaly(history, candidate);
      if (anomaly?.isAnomaly) {
        signals.push({ type: "ANOMALY", key: `anomaly:${metricKey}`, label: def?.name ?? metricKey, severity: anomaly.severity, description: `Valor reciente atípico frente a su propio histórico (método: ${anomaly.method}).` });
      }
    }
  }

  if (metrics.length === 0) missingData.push("Ninguna de las métricas seleccionadas tiene datos reales en el periodo — el contexto quedará prácticamente vacío.");

  for (const g of goalRows) {
    if (!metricKeys.includes(g.metricKey)) constraints.push(`El objetivo de "${g.metricKey}" no coincide con ninguna métrica seleccionada — se incluye igualmente como referencia.`);
  }

  const dataQuality = computeDataQuality({
    expectedPoints: Math.max(1, totalExpectedDays),
    actualPoints: totalActualDays,
    daysSinceLastUpdate: lastMeasuredAt ? Math.floor((Date.now() - lastMeasuredAt.getTime()) / 86_400_000) : 999,
    duplicateCount: 0,
    conflictCount: 0,
    missingValueCount: 0,
    totalValueCount: totalRecords,
    granularityConsistent: true,
    longestGapRatio: totalExpectedDays > 0 ? Math.max(0, 1 - totalActualDays / totalExpectedDays) : 1,
  });
  constraints.push(...dataQuality.warnings);

  const evidenceStrength = classifyEvidenceStrength({
    dataQualityScore: dataQuality.score,
    coverage: dataQuality.factors.coverage,
    recency: dataQuality.factors.recency,
    sampleSize: totalRecords,
    hasBenchmark: benchmarkRows.length > 0,
    hasGoal: goalRows.length > 0,
    hasExperiment: experimentRows.length > 0,
  });

  if (originsSeen.has("ESTIMATED")) constraints.push("Parte de los datos incluidos son estimaciones, no mediciones directas.");
  if (recommendationRows.length === 0) missingData.push("No hay recomendaciones activas relacionadas con este contexto.");
  if (experimentRows.length === 0) missingData.push("No hay experimentos concluidos relacionados con este contexto.");

  const bundle: PerformanceContextBundle = {
    facts: {
      metrics,
      goals: goalRows.map((g) => ({ metricKey: g.metricKey, type: g.type, status: g.status, targetValue: g.targetValue ? Number(g.targetValue) : null })),
      benchmarks: benchmarkRows.map((b) => ({ metricKey: b.metricKey, source: b.source, value: Number(b.value), label: b.label })),
      experiments: experimentRows.map((e) => ({ name: e.name, type: e.type, status: e.status, conclusion: e.conclusion, winnerLabel: e.winnerVariant?.label ?? null })),
      recommendations: recommendationRows.map((r) => ({ title: r.title, category: r.category, priority: r.priority, status: r.status })),
      reports: reportRows.map((r) => ({ title: r.title, type: r.type, periodStart: r.periodStart.toISOString(), periodEnd: r.periodEnd.toISOString() })),
    },
    derived,
    signals,
    hypotheses,
    constraints: [...new Set(constraints)],
    missingData: [...new Set(missingData)],
    dataQualityScore: dataQuality.score,
    dataQualityLevel: dataQuality.level,
    evidenceStrength,
    counts: {
      metricCount: metrics.length,
      resourceCount: resourceIds.length,
      recommendationCount: recommendationRows.length,
      experimentCount: experimentRows.length,
      goalCount: goalRows.length,
      benchmarkCount: benchmarkRows.length,
      reportCount: reportRows.length,
    },
  };

  return { bundle, periodStart, periodEnd, comparisonPeriodStart, comparisonPeriodEnd, resolvedResourceType: resourceType, resolvedResourceIds: resourceIds };
}

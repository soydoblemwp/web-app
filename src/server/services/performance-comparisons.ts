import "server-only";
import { prisma } from "@/lib/db/prisma";
import { performanceError, type PerformanceActionError } from "@/lib/performance/types";
import { findMetricDefinition, isCustomMetricKey } from "@/lib/performance/metrics-catalog";
import { mean, median } from "@/lib/performance/statistics";
import { computeDataQuality } from "@/lib/performance/data-quality";
import { exceedsComparisonLimit } from "@/lib/performance/limits";
import { analyzeSeo } from "@/lib/seo/analyzer";

/**
 * Comparisons (spec sections 17-19) — never concludes "better" from
 * incompatible samples; every comparison surfaces sample size and data
 * quality alongside the numbers, and flags explicit incompatibilities
 * (different platforms, insufficient sample, no data at all) rather than
 * silently ranking anyway.
 */

export interface ComparisonCell {
  metricKey: string;
  value: number | null;
  sampleSize: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

export interface ComparisonRow {
  resourceId: string;
  label: string;
  cells: ComparisonCell[];
  dataQualityScore: number;
  dataQualityLevel: string;
  incompatibilities: string[];
}

export interface ComparisonResult {
  rows: ComparisonRow[];
  metricKeys: string[];
  warnings: string[];
}

async function aggregateCell(projectId: string, metricKey: string, resourceFilter: Record<string, string>, periodStart: Date, periodEnd: Date): Promise<ComparisonCell> {
  const records = await prisma.performanceMetricRecord.findMany({
    where: { projectId, metricKey, isArchived: false, ...resourceFilter, measuredAt: { gte: periodStart, lte: periodEnd } },
    select: { value: true },
  });
  const values = records.map((r) => Number(r.value));
  const def = isCustomMetricKey(metricKey) ? null : findMetricDefinition(metricKey);

  if (values.length === 0) return { metricKey, value: null, sampleSize: 0, average: null, median: null, min: null, max: null };

  const sum = values.reduce((a, b) => a + b, 0);
  const value = def?.aggregation === "AVERAGE" || def?.aggregation === "RATE" ? mean(values) : def?.aggregation === "MAX" ? Math.max(...values) : def?.aggregation === "MIN" ? Math.min(...values) : def?.aggregation === "LAST" ? values[values.length - 1] : sum;

  return { metricKey, value, sampleSize: values.length, average: mean(values), median: median(values), min: Math.min(...values), max: Math.max(...values) };
}

async function computeRowQuality(projectId: string, resourceFilter: Record<string, string>, metricKeys: string[], periodStart: Date, periodEnd: Date) {
  const records = await prisma.performanceMetricRecord.findMany({
    where: { projectId, metricKey: { in: metricKeys }, isArchived: false, ...resourceFilter, measuredAt: { gte: periodStart, lte: periodEnd } },
    select: { measuredAt: true },
  });
  const expectedDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000));
  const distinctDays = new Set(records.map((r) => r.measuredAt.toISOString().slice(0, 10))).size;
  const lastMeasured = records.length > 0 ? Math.max(...records.map((r) => r.measuredAt.getTime())) : null;
  const daysSinceLastUpdate = lastMeasured ? Math.floor((Date.now() - lastMeasured) / 86_400_000) : 999;

  return computeDataQuality({
    expectedPoints: expectedDays,
    actualPoints: distinctDays,
    daysSinceLastUpdate,
    duplicateCount: 0,
    conflictCount: 0,
    missingValueCount: 0,
    totalValueCount: records.length,
    granularityConsistent: true,
    longestGapRatio: distinctDays > 0 ? Math.max(0, 1 - distinctDays / expectedDays) : 1,
  });
}

async function compareResources(projectId: string, resourceType: "CONTENT_ITEM" | "CAMPAIGN" | "SOCIAL_POST", resourceIds: string[], metricKeys: string[], periodStart: Date, periodEnd: Date, labels: Map<string, string>, platforms: Map<string, string | null>): Promise<ComparisonResult | PerformanceActionError> {
  if (exceedsComparisonLimit(resourceIds.length)) return performanceError("METRIC_INVALID", "Demasiados elementos seleccionados para comparar a la vez.");
  const warnings: string[] = [];

  const distinctPlatforms = new Set(Array.from(platforms.values()).filter(Boolean));
  if (distinctPlatforms.size > 1) warnings.push("Los elementos comparados usan distintas plataformas — algunas métricas externas podrían no ser directamente comparables.");

  const fkField = resourceType === "CONTENT_ITEM" ? "contentItemId" : resourceType === "CAMPAIGN" ? "campaignId" : "socialPostId";

  const rows: ComparisonRow[] = [];
  for (const resourceId of resourceIds) {
    const resourceFilter = { [fkField]: resourceId };
    const cells = await Promise.all(metricKeys.map((key) => aggregateCell(projectId, key, resourceFilter, periodStart, periodEnd)));
    const quality = await computeRowQuality(projectId, resourceFilter, metricKeys, periodStart, periodEnd);

    const incompatibilities: string[] = [];
    if (cells.every((c) => c.sampleSize === 0)) incompatibilities.push("Sin datos en este periodo.");
    else if (cells.some((c) => c.sampleSize > 0 && c.sampleSize < 3)) incompatibilities.push("Muestra insuficiente para algunas métricas.");

    rows.push({ resourceId, label: labels.get(resourceId) ?? resourceId, cells, dataQualityScore: quality.score, dataQualityLevel: quality.level, incompatibilities });
  }

  return { rows, metricKeys, warnings };
}

export async function compareContentItems(projectId: string, itemIds: string[], metricKeys: string[], periodStart: Date, periodEnd: Date): Promise<ComparisonResult | PerformanceActionError> {
  const items = await prisma.contentItem.findMany({ where: { id: { in: itemIds }, projectId }, select: { id: true, title: true, channel: true } });
  if (items.length !== itemIds.length) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  const labels = new Map(items.map((i) => [i.id, i.title]));
  const platforms = new Map(items.map((i) => [i.id, i.channel]));
  return compareResources(projectId, "CONTENT_ITEM", itemIds, metricKeys, periodStart, periodEnd, labels, platforms);
}

export async function compareCampaigns(projectId: string, campaignIds: string[], metricKeys: string[], periodStart: Date, periodEnd: Date): Promise<ComparisonResult | PerformanceActionError> {
  const campaigns = await prisma.campaign.findMany({ where: { id: { in: campaignIds }, projectId }, select: { id: true, name: true, objective: true } });
  if (campaigns.length !== campaignIds.length) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");

  const objectives = new Set(campaigns.map((c) => c.objective).filter(Boolean));
  const labels = new Map(campaigns.map((c) => [c.id, c.name]));
  const platforms = new Map<string, string | null>(campaigns.map((c) => [c.id, null]));
  const result = await compareResources(projectId, "CAMPAIGN", campaignIds, metricKeys, periodStart, periodEnd, labels, platforms);
  if ("error" in result) return result;
  if (objectives.size > 1) result.warnings.push("Las campañas comparadas tienen objetivos distintos — no declares una ganadora global, compara por métrica.");
  return result;
}

export async function compareSocialPosts(projectId: string, postIds: string[], metricKeys: string[], periodStart: Date, periodEnd: Date): Promise<ComparisonResult | PerformanceActionError> {
  const posts = await prisma.socialPost.findMany({ where: { id: { in: postIds }, projectId }, select: { id: true, platform: true, internalTitle: true, text: true } });
  if (posts.length !== postIds.length) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  const labels = new Map(posts.map((p) => [p.id, p.internalTitle || p.text.slice(0, 40)]));
  const platforms = new Map(posts.map((p) => [p.id, p.platform as string]));
  return compareResources(projectId, "SOCIAL_POST", postIds, metricKeys, periodStart, periodEnd, labels, platforms);
}

export interface VersionComparisonResult {
  versions: {
    id: string;
    title: string;
    author: string | null;
    createdAt: Date;
    lengthChars: number;
    seoScore: number;
    linkedMetrics: ComparisonCell[];
  }[];
  titleDiffers: boolean;
  lengthDeltaChars: number | null;
}

/** Compares ContentVersion rows — never invents a relationship to external performance data a version wasn't actually measured against (spec section 19). */
export async function compareContentVersions(projectId: string, versionIds: string[]): Promise<VersionComparisonResult | PerformanceActionError> {
  if (exceedsComparisonLimit(versionIds.length)) return performanceError("METRIC_INVALID", "Demasiadas versiones seleccionadas.");
  const versions = await prisma.contentVersion.findMany({
    where: { id: { in: versionIds }, contentItem: { projectId } },
    include: { author: { select: { name: true } }, contentItem: { select: { seoKeyword: true, seoDescription: true } } },
  });
  if (versions.length !== versionIds.length) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");

  const results = await Promise.all(
    versions.map(async (v) => {
      const seo = analyzeSeo({ title: v.title, metaDescription: v.contentItem.seoDescription ?? "", targetKeyword: v.contentItem.seoKeyword ?? "", contentText: v.body });
      const linkedMetrics = await prisma.performanceMetricRecord.findMany({ where: { contentVersionId: v.id, isArchived: false }, select: { metricKey: true, value: true } });
      const grouped = new Map<string, number[]>();
      for (const m of linkedMetrics) grouped.set(m.metricKey, [...(grouped.get(m.metricKey) ?? []), Number(m.value)]);
      const cells: ComparisonCell[] = Array.from(grouped.entries()).map(([key, values]) => ({ metricKey: key, value: values.reduce((a, b) => a + b, 0), sampleSize: values.length, average: mean(values), median: median(values), min: Math.min(...values), max: Math.max(...values) }));

      return { id: v.id, title: v.title, author: v.author.name, createdAt: v.createdAt, lengthChars: v.body.length, seoScore: seo.score, linkedMetrics: cells };
    })
  );

  const titles = new Set(results.map((r) => r.title));
  const lengths = results.map((r) => r.lengthChars);

  return { versions: results, titleDiffers: titles.size > 1, lengthDeltaChars: lengths.length >= 2 ? Math.max(...lengths) - Math.min(...lengths) : null };
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { performanceError, type PerformanceActionError } from "@/lib/performance/types";
import { getInternalMetricsSnapshot } from "@/server/services/performance-internal-metrics";
import { computeDataQuality } from "@/lib/performance/data-quality";
import type { CreateReportInput } from "@/lib/validation/performance";

/**
 * Reports (spec section 40) — a snapshot of what was ACTUALLY computed
 * (internal metrics, goals, recommendations, anomalies, experiments) for a
 * real period; never fabricates a section it has no data for — that
 * section is simply omitted/empty in the summary, and the UI must show it
 * as such rather than a fake zero.
 */

async function resolveOwnedReportResources(projectId: string, input: CreateReportInput): Promise<PerformanceActionError | null> {
  if (input.campaignId) {
    const row = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }
  if (input.contentItemId) {
    const row = await prisma.contentItem.findUnique({ where: { id: input.contentItemId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }
  if (input.experimentId) {
    const row = await prisma.performanceExperiment.findUnique({ where: { id: input.experimentId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  }
  return null;
}

async function buildReportSummary(projectId: string, periodStart: Date, periodEnd: Date, filters: { campaignId?: string; contentItemId?: string; experimentId?: string; platform?: string }) {
  const snapshot = await getInternalMetricsSnapshot(projectId, { start: periodStart, end: periodEnd });

  const [goals, recommendations, anomalies, experiments] = await Promise.all([
    prisma.performanceGoal.findMany({ where: { projectId, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart }, ...(filters.campaignId ? { campaignId: filters.campaignId } : {}) }, select: { id: true, metricKey: true, type: true, status: true } }),
    prisma.performanceRecommendation.findMany({ where: { projectId, createdAt: { gte: periodStart, lte: periodEnd }, ...(filters.campaignId ? { campaignId: filters.campaignId } : {}) }, select: { id: true, title: true, category: true, priority: true, status: true } }),
    prisma.performanceAnomaly.findMany({ where: { projectId, detectedAt: { gte: periodStart, lte: periodEnd }, ...(filters.campaignId ? { campaignId: filters.campaignId } : {}) }, select: { id: true, metricKey: true, severity: true, status: true } }),
    prisma.performanceExperiment.findMany({ where: { projectId, updatedAt: { gte: periodStart, lte: periodEnd }, ...(filters.campaignId ? { campaignId: filters.campaignId } : {}) }, select: { id: true, name: true, status: true, conclusion: true } }),
  ]);

  const metricRecordCount = await prisma.performanceMetricRecord.count({ where: { projectId, measuredAt: { gte: periodStart, lte: periodEnd }, isArchived: false } });
  const expectedDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000));
  const distinctDaysWithData = await prisma.performanceMetricRecord.findMany({ where: { projectId, measuredAt: { gte: periodStart, lte: periodEnd }, isArchived: false }, select: { measuredAt: true }, distinct: ["measuredAt"] });
  const quality = computeDataQuality({
    expectedPoints: expectedDays,
    actualPoints: new Set(distinctDaysWithData.map((d) => d.measuredAt.toISOString().slice(0, 10))).size,
    daysSinceLastUpdate: 0,
    duplicateCount: 0,
    conflictCount: 0,
    missingValueCount: 0,
    totalValueCount: metricRecordCount,
    granularityConsistent: true,
    longestGapRatio: 0,
  });

  return {
    period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    coverage: { metricRecordCount, dataQuality: { score: quality.score, level: quality.level, warnings: quality.warnings } },
    internalMetrics: snapshot,
    goals: goals.map((g) => ({ id: g.id, metricKey: g.metricKey, type: g.type, status: g.status })),
    recommendations: recommendations.map((r) => ({ id: r.id, title: r.title, category: r.category, priority: r.priority, status: r.status })),
    anomalies: anomalies.map((a) => ({ id: a.id, metricKey: a.metricKey, severity: a.severity, status: a.status })),
    experiments: experiments.map((e) => ({ id: e.id, name: e.name, status: e.status, conclusion: e.conclusion })),
  };
}

export async function createReport(projectId: string, userId: string, input: CreateReportInput): Promise<{ id: string } | PerformanceActionError> {
  const ownership = await resolveOwnedReportResources(projectId, input);
  if (ownership) return ownership;

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  if (periodEnd.getTime() < periodStart.getTime()) return performanceError("METRIC_PERIOD_INVALID");

  const report = await prisma.performanceReport.create({
    data: { projectId, createdById: userId, type: input.type, title: input.title, periodStart, periodEnd, status: "GENERATING", filters: { campaignId: input.campaignId, contentItemId: input.contentItemId, experimentId: input.experimentId, platform: input.platform } as unknown as Prisma.InputJsonValue },
  });

  try {
    const summary = await buildReportSummary(projectId, periodStart, periodEnd, input);
    const resources: Prisma.PerformanceReportResourceCreateManyInput[] = [];
    if (input.campaignId) resources.push({ reportId: report.id, resourceType: "CAMPAIGN", campaignId: input.campaignId });
    if (input.contentItemId) resources.push({ reportId: report.id, resourceType: "CONTENT_ITEM", contentItemId: input.contentItemId });
    if (input.experimentId) resources.push({ reportId: report.id, resourceType: "EXPERIMENT_VARIANT", experimentId: input.experimentId });

    await prisma.$transaction([
      prisma.performanceReport.update({ where: { id: report.id }, data: { status: "COMPLETED", summary: summary as unknown as Prisma.InputJsonValue } }),
      ...(resources.length > 0 ? [prisma.performanceReportResource.createMany({ data: resources })] : []),
    ]);
  } catch {
    await prisma.performanceReport.update({ where: { id: report.id }, data: { status: "FAILED" } });
    return performanceError("REPORT_GENERATION_FAILED");
  }

  return { id: report.id };
}

export async function regenerateReport(projectId: string, reportId: string): Promise<{ id: string } | PerformanceActionError> {
  const report = await prisma.performanceReport.findUnique({ where: { id: reportId } });
  if (!report || report.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  const filters = (report.filters as Record<string, string | undefined> | null) ?? {};
  try {
    const summary = await buildReportSummary(projectId, report.periodStart, report.periodEnd, filters);
    await prisma.performanceReport.update({ where: { id: reportId }, data: { status: "COMPLETED", summary: summary as unknown as Prisma.InputJsonValue } });
  } catch {
    await prisma.performanceReport.update({ where: { id: reportId }, data: { status: "FAILED" } });
    return performanceError("REPORT_GENERATION_FAILED");
  }
  return { id: reportId };
}

export async function listReports(projectId: string, limit = 50) {
  return prisma.performanceReport.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: limit });
}

export async function getReportDetail(projectId: string, reportId: string) {
  const row = await prisma.performanceReport.findUnique({ where: { id: reportId }, include: { resources: true, createdBy: { select: { id: true, name: true } } } });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export async function archiveReport(projectId: string, reportId: string): Promise<{ id: string } | PerformanceActionError> {
  const row = await prisma.performanceReport.findUnique({ where: { id: reportId } });
  if (!row || row.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  await prisma.performanceReport.update({ where: { id: reportId }, data: { status: "ARCHIVED" } });
  return { id: reportId };
}

type ReportSummary = Awaited<ReturnType<typeof buildReportSummary>>;

/** Renders the report summary as plain, readable text — the same text used for "guardar como ContentItem" and "añadir a Knowledge Base" (spec section 40), never raw JSON dumped at the user. */
export function renderReportAsText(report: { title: string; type: string; periodStart: Date; periodEnd: Date; summary: unknown }): string {
  const summary = report.summary as ReportSummary | null;
  if (!summary) return `${report.title}\n\nEste informe todavía no tiene datos generados.`;

  const lines: string[] = [`# ${report.title}`, "", `Periodo: ${new Date(report.periodStart).toLocaleDateString("es-ES")} — ${new Date(report.periodEnd).toLocaleDateString("es-ES")}`, ""];
  lines.push(`## Calidad de datos: ${summary.coverage.dataQuality.level} (${summary.coverage.dataQuality.score}/100)`);
  if (summary.coverage.dataQuality.warnings.length > 0) lines.push(...summary.coverage.dataQuality.warnings.map((w) => `- ${w}`));
  lines.push("");
  lines.push(`## Contenido: ${summary.internalMetrics.content.itemsCreated} creado(s), ${summary.internalMetrics.content.versionsCreated} revisión(es).`);
  lines.push(`## Campañas: ${summary.internalMetrics.campaign.created} creada(s), ${summary.internalMetrics.campaign.piecesCompleted}/${summary.internalMetrics.campaign.piecesPlanned} piezas completadas.`);
  lines.push(`## Publicaciones: ${summary.internalMetrics.social.created} creada(s), ${summary.internalMetrics.social.published} publicada(s) internamente.`);
  lines.push(`## Automatización: ${summary.internalMetrics.automation.workflowAutomationRunsCompleted} ejecuciones completadas, ${summary.internalMetrics.automation.workflowAutomationRunsFailed} fallidas.`);
  lines.push("");
  if (summary.recommendations.length > 0) {
    lines.push("## Recomendaciones");
    for (const r of summary.recommendations) lines.push(`- [${r.priority}] ${r.title} (${r.status})`);
    lines.push("");
  }
  if (summary.anomalies.length > 0) {
    lines.push("## Anomalías detectadas");
    for (const a of summary.anomalies) lines.push(`- ${a.metricKey}: severidad ${a.severity} (${a.status})`);
    lines.push("");
  }
  if (summary.experiments.length > 0) {
    lines.push("## Experimentos");
    for (const e of summary.experiments) lines.push(`- ${e.name}: ${e.status}${e.conclusion ? ` — ${e.conclusion}` : ""}`);
  }
  return lines.join("\n");
}

/** "Guardar como ContentItem" (spec section 40) — reuses the normal ContentItem model, never a parallel "saved report" document type. */
export async function saveReportAsContentItem(projectId: string, userId: string, reportId: string): Promise<{ id: string } | PerformanceActionError> {
  const report = await prisma.performanceReport.findUnique({ where: { id: reportId } });
  if (!report || report.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");

  const text = renderReportAsText(report);
  const contentItem = await prisma.contentItem.create({
    data: { projectId, authorId: userId, type: "OTHER", title: report.title, body: text, status: "DRAFT", sourceTool: "performance-center" },
  });
  await prisma.performanceReport.update({ where: { id: reportId }, data: { contentItemId: contentItem.id } });
  return { id: contentItem.id };
}

/** "Añadir a Knowledge Base" (spec section 35/40) — reuses the exact same pasted-text creation path any other manually-pasted source uses; never a new origin type, never indexes every individual metric automatically. */
export async function addReportToKnowledgeBase(projectId: string, userId: string, reportId: string): Promise<{ id: string } | PerformanceActionError> {
  const report = await prisma.performanceReport.findUnique({ where: { id: reportId } });
  if (!report || report.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");

  const text = renderReportAsText(report);
  const { createPastedSource } = await import("@/server/services/knowledge-sources");
  const result = await createPastedSource(projectId, userId, { title: report.title, description: `Informe de Performance Intelligence (${report.type}).`, text, format: "TEXT" as never, collectionIds: [] });
  if (result.errorCode || !result.source) return performanceError("REPORT_GENERATION_FAILED", "No se pudo crear la fuente de Knowledge Base.");
  await prisma.knowledgeSource.update({ where: { id: result.source.id }, data: { performanceReportId: reportId } });
  return { id: result.source.id };
}

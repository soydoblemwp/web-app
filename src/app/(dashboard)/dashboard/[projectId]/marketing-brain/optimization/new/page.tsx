import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireProjectAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { createOptimizationSessionAction, updateSessionSelectionAction } from "@/server/actions/marketing-brain-optimization";
import type { PerformanceContextSelectionInput } from "@/lib/marketing-brain/performance-context-types";

/**
 * Entry point for "Usar en Marketing Brain" / "Optimizar con estos datos"
 * links from Performance Center (spec section 16). Only ever accepts plain
 * identifiers via the URL — every one is re-validated against THIS project
 * here, on the server, before anything is created. Nothing about a metric
 * value, a conclusion, or free text is ever trusted from the query string.
 */
export default async function NewOptimizationSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const user = await requireProjectAccess(projectId, "EDITOR");

  let campaignId: string | null = null;
  if (sp.campaignId) {
    const row = await prisma.campaign.findUnique({ where: { id: sp.campaignId }, select: { projectId: true } });
    if (row?.projectId === projectId) campaignId = sp.campaignId;
  }

  if (!campaignId && sp.recommendationId) {
    const rec = await prisma.performanceRecommendation.findUnique({ where: { id: sp.recommendationId }, select: { projectId: true, campaignId: true } });
    if (rec?.projectId === projectId) campaignId = rec.campaignId ?? null;
  }
  if (!campaignId && sp.experimentId) {
    const exp = await prisma.performanceExperiment.findUnique({ where: { id: sp.experimentId }, select: { projectId: true, campaignId: true } });
    if (exp?.projectId === projectId) campaignId = exp.campaignId ?? null;
  }
  if (!campaignId && sp.goalId) {
    const goal = await prisma.performanceGoal.findUnique({ where: { id: sp.goalId }, select: { projectId: true, campaignId: true } });
    if (goal?.projectId === projectId) campaignId = goal.campaignId ?? null;
  }

  const resourceType = sp.resourceType === "CONTENT_ITEM" || sp.resourceType === "CAMPAIGN" || sp.resourceType === "SOCIAL_POST" ? sp.resourceType : undefined;
  let resourceIds: string[] = [];
  if (resourceType && sp.resourceIds) {
    const candidates = sp.resourceIds.split(",").filter(Boolean).slice(0, 20);
    if (resourceType === "CONTENT_ITEM") resourceIds = (await prisma.contentItem.findMany({ where: { id: { in: candidates }, projectId }, select: { id: true } })).map((r) => r.id);
    else if (resourceType === "CAMPAIGN") resourceIds = (await prisma.campaign.findMany({ where: { id: { in: candidates }, projectId }, select: { id: true } })).map((r) => r.id);
    else resourceIds = (await prisma.socialPost.findMany({ where: { id: { in: candidates }, projectId }, select: { id: true } })).map((r) => r.id);
  }

  const metricKeys = sp.metricKeys ? sp.metricKeys.split(",").filter(Boolean).slice(0, 12) : [];
  const goalIds: string[] = [];
  if (sp.goalId) {
    const goal = await prisma.performanceGoal.findUnique({ where: { id: sp.goalId }, select: { projectId: true } });
    if (goal?.projectId === projectId) goalIds.push(sp.goalId);
  }
  const experimentIds: string[] = [];
  if (sp.experimentId) {
    const exp = await prisma.performanceExperiment.findUnique({ where: { id: sp.experimentId }, select: { projectId: true } });
    if (exp?.projectId === projectId) experimentIds.push(sp.experimentId);
  }
  const recommendationIds: string[] = [];
  if (sp.recommendationId) {
    const rec = await prisma.performanceRecommendation.findUnique({ where: { id: sp.recommendationId }, select: { projectId: true } });
    if (rec?.projectId === projectId) recommendationIds.push(sp.recommendationId);
  }
  const reportIds: string[] = [];
  if (sp.reportId) {
    const report = await prisma.performanceReport.findUnique({ where: { id: sp.reportId }, select: { projectId: true } });
    if (report?.projectId === projectId) reportIds.push(sp.reportId);
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 90 * 86_400_000);

  const selection: PerformanceContextSelectionInput = {
    mode: "MANUAL",
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    resourceType: resourceType ?? (campaignId ? "CAMPAIGN" : "PROJECT"),
    resourceIds: resourceIds.length > 0 ? resourceIds : campaignId ? [campaignId] : [],
    metricKeys,
    goalIds,
    experimentIds,
    recommendationIds,
    reportIds,
  };

  const created = await createOptimizationSessionAction(projectId, { idempotencyKey: `mb-opt-entry:${user.id}:${randomUUID()}`, campaignId });
  if (created.errorMessage || !created.id) {
    redirect(`/dashboard/${projectId}/marketing-brain/optimization`);
  }
  await updateSessionSelectionAction(projectId, created.id!, selection);
  redirect(`/dashboard/${projectId}/marketing-brain/optimization/${created.id}`);
}

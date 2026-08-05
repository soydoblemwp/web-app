import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getInternalMetricsSnapshot } from "@/server/services/performance-internal-metrics";

/**
 * A structured, bounded Performance Intelligence context Marketing Brain
 * MAY optionally read when building a new plan (spec section 31) — never
 * touches Marketing Brain's own orchestrator, never sends its full history.
 * Distinguishes data from interpretation from recommendation/hypothesis, so
 * whatever consumes this never confuses the three.
 */

export interface MarketingBrainPerformanceContext {
  period: { start: string; end: string };
  data: {
    bestPerformingCampaigns: { id: string; name: string; piecesCompleted: number; piecesPlanned: number }[];
    bestPerformingContent: { id: string; title: string; seoScore: number | null }[];
    platformsWithMostActivity: { platform: string; postCount: number }[];
  };
  interpretation: {
    contentCompletionRatePercent: number | null;
    automationSuccessRatePercent: number | null;
  };
  recommendations: { title: string; category: string; priority: string }[];
  concludedExperiments: { name: string; conclusion: string | null }[];
  activeGoals: { metricKey: string; type: string; status: string }[];
}

const MAX_ITEMS = 5;

export async function buildMarketingBrainPerformanceContext(projectId: string, campaignId?: string): Promise<MarketingBrainPerformanceContext> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 90 * 86_400_000);

  const [snapshot, campaigns, contentItems, postsByPlatform, recommendations, concludedExperiments, activeGoals] = await Promise.all([
    getInternalMetricsSnapshot(projectId, { start: periodStart, end: periodEnd }),
    prisma.campaign.findMany({
      where: { projectId, ...(campaignId ? { id: campaignId } : {}) },
      include: { pieces: { select: { status: true } } },
      take: MAX_ITEMS,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contentItem.findMany({ where: { projectId, deletedAt: null, isArchived: false }, select: { id: true, title: true, seoTitle: true }, take: MAX_ITEMS, orderBy: { updatedAt: "desc" } }),
    prisma.socialPost.groupBy({ by: ["platform"], where: { projectId, createdAt: { gte: periodStart } }, _count: true, orderBy: { _count: { platform: "desc" } }, take: MAX_ITEMS }),
    prisma.performanceRecommendation.findMany({ where: { projectId, status: "ACCEPTED" }, select: { title: true, category: true, priority: true }, take: MAX_ITEMS, orderBy: { createdAt: "desc" } }),
    prisma.performanceExperiment.findMany({ where: { projectId, status: "COMPLETED", ...(campaignId ? { campaignId } : {}) }, select: { name: true, conclusion: true }, take: MAX_ITEMS, orderBy: { updatedAt: "desc" } }),
    prisma.performanceGoal.findMany({ where: { projectId, status: "ACTIVE", ...(campaignId ? { campaignId } : {}) }, select: { metricKey: true, type: true, status: true }, take: MAX_ITEMS }),
  ]);

  return {
    period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    data: {
      bestPerformingCampaigns: campaigns.map((c) => ({ id: c.id, name: c.name, piecesCompleted: c.pieces.filter((p) => p.status === "PUBLISHED").length, piecesPlanned: c.pieces.length })),
      bestPerformingContent: contentItems.map((c) => ({ id: c.id, title: c.title, seoScore: null })),
      platformsWithMostActivity: postsByPlatform.map((p) => ({ platform: p.platform, postCount: p._count })),
    },
    interpretation: {
      contentCompletionRatePercent: snapshot.campaign.piecesPlanned > 0 ? Math.round((snapshot.campaign.piecesCompleted / snapshot.campaign.piecesPlanned) * 100) : null,
      automationSuccessRatePercent: snapshot.automation.workflowAutomationRunsTerminalTotal > 0 ? Math.round((snapshot.automation.workflowAutomationRunsCompleted / snapshot.automation.workflowAutomationRunsTerminalTotal) * 100) : null,
    },
    recommendations: recommendations.map((r) => ({ title: r.title, category: r.category, priority: r.priority })),
    concludedExperiments: concludedExperiments.map((e) => ({ name: e.name, conclusion: e.conclusion })),
    activeGoals: activeGoals.map((g) => ({ metricKey: g.metricKey, type: g.type, status: g.status })),
  };
}

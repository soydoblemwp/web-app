import "server-only";
import { prisma } from "@/lib/db/prisma";

export async function getProjectDashboardData(projectId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    recentContent,
    pendingPosts,
    activeCampaigns,
    upcomingPosts,
    activeAutomations,
    monitorsWithIssues,
    brokenLinks,
    connectedIntegrations,
    aiUsageThisMonth,
  ] = await Promise.all([
    prisma.contentItem.findMany({
      where: { projectId, isArchived: false, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.socialPost.count({
      where: { projectId, status: { in: ["DRAFT", "IN_REVIEW", "APPROVED"] } },
    }),
    prisma.campaign.findMany({
      where: { projectId, status: "ACTIVE" },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.socialPost.findMany({
      where: { projectId, status: "SCHEDULED", scheduledAt: { gte: now } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.automation.count({ where: { projectId, isActive: true } }),
    prisma.monitor.count({ where: { projectId, lastStatus: { in: ["CHANGED", "ERROR"] } } }),
    prisma.linkCheck.count({ where: { projectId, status: "BROKEN", isIgnored: false } }),
    prisma.integration.count({ where: { projectId, status: "CONNECTED" } }),
    prisma.aIUsage.aggregate({
      where: { projectId, createdAt: { gte: monthStart } },
      _sum: { inputTokens: true, outputTokens: true },
      _count: true,
    }),
  ]);

  const [socialPostsByStatus, contentByStatus] = await Promise.all([
    prisma.socialPost.groupBy({ by: ["status"], where: { projectId }, _count: true }),
    prisma.contentItem.groupBy({ by: ["status"], where: { projectId, deletedAt: null }, _count: true }),
  ]);

  return {
    recentContent,
    pendingPosts,
    activeCampaigns,
    upcomingPosts,
    activeAutomations,
    monitorsWithIssues,
    brokenLinks,
    connectedIntegrations,
    aiUsageThisMonth: {
      generations: aiUsageThisMonth._count,
      tokens: (aiUsageThisMonth._sum.inputTokens ?? 0) + (aiUsageThisMonth._sum.outputTokens ?? 0),
    },
    socialPostsByStatus,
    contentByStatus,
  };
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { MarketingBrainRunStatus } from "@/generated/prisma/enums";

const memberSelect = { id: true, name: true, email: true, image: true } as const;

export interface MarketingBrainRunFilters {
  status?: MarketingBrainRunStatus;
  campaignId?: string;
  createdById?: string;
  search?: string;
  createdFrom?: Date;
  createdTo?: Date;
}

function whereFromFilters(projectId: string, filters: MarketingBrainRunFilters) {
  return {
    projectId,
    status: filters.status,
    campaignId: filters.campaignId,
    createdById: filters.createdById,
    createdAt:
      filters.createdFrom || filters.createdTo
        ? { gte: filters.createdFrom, lte: filters.createdTo }
        : undefined,
  };
}

export async function listMarketingBrainRuns(projectId: string, filters: MarketingBrainRunFilters = {}) {
  const runs = await prisma.marketingBrainRun.findMany({
    where: whereFromFilters(projectId, filters),
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: memberSelect },
      campaign: { select: { id: true, name: true, status: true } },
      _count: { select: { steps: true, resources: true } },
    },
    take: 200,
  });

  if (!filters.search) return runs;
  const needle = filters.search.toLowerCase();
  return runs.filter((run) => {
    const briefing = run.briefing as { productOrService?: string; objective?: string; description?: string } | null;
    const haystack = [run.campaign?.name, briefing?.productOrService, briefing?.objective, briefing?.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export async function getMarketingBrainRunDetail(runId: string) {
  return prisma.marketingBrainRun.findUnique({
    where: { id: runId },
    include: {
      createdBy: { select: memberSelect },
      campaign: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
      sourceRun: { select: { id: true, campaignId: true } },
      steps: { orderBy: { order: "asc" } },
      approvals: { include: { decidedBy: { select: memberSelect } } },
      resources: {
        orderBy: { createdAt: "asc" },
        include: {
          campaign: { select: { id: true, name: true } },
          pillar: { select: { id: true, name: true } },
          piece: { select: { id: true, title: true, platform: true } },
          contentItem: { select: { id: true, title: true } },
          socialPost: { select: { id: true, platform: true, status: true, internalTitle: true } },
        },
      },
    },
  });
}

export async function countActiveMarketingBrainRuns(projectId: string, createdById: string) {
  return prisma.marketingBrainRun.count({
    where: { projectId, createdById, status: { in: ["RUNNING", "WAITING_FOR_APPROVAL"] } },
  });
}

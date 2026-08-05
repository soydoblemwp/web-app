import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AiAgentRunStatus } from "@/generated/prisma/enums";

const memberSelect = { id: true, name: true, email: true, image: true } as const;

export interface AgentRunFilters {
  status?: AiAgentRunStatus;
  officialAgentKey?: string;
  customAgentId?: string;
  teamId?: string;
  createdById?: string;
  search?: string;
}

export async function listAgentRuns(projectId: string, filters: AgentRunFilters = {}) {
  const runs = await prisma.aiAgentRun.findMany({
    where: {
      projectId,
      status: filters.status,
      officialAgentKey: filters.officialAgentKey,
      customAgentId: filters.customAgentId,
      teamId: filters.teamId,
      createdById: filters.createdById,
    },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: memberSelect },
      customAgent: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      _count: { select: { steps: true, resources: true } },
    },
    take: 200,
  });

  if (!filters.search) return runs;
  const needle = filters.search.toLowerCase();
  return runs.filter((run) => {
    const haystack = [run.officialAgentKey, run.customAgent?.name, run.team?.name].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

export async function getAgentRunDetail(runId: string) {
  return prisma.aiAgentRun.findUnique({
    where: { id: runId },
    include: {
      createdBy: { select: memberSelect },
      customAgent: { select: { id: true, name: true, icon: true } },
      team: { include: { members: { orderBy: { order: "asc" } } } },
      brandProfile: { select: { id: true, name: true } },
      sourceRun: { select: { id: true } },
      steps: { orderBy: { order: "asc" } },
      approvals: { include: { decidedBy: { select: memberSelect } } },
      resources: {
        orderBy: { createdAt: "asc" },
        include: {
          contentItem: { select: { id: true, title: true } },
          campaign: { select: { id: true, name: true } },
          pillar: { select: { id: true, name: true } },
          piece: { select: { id: true, title: true } },
          socialPost: { select: { id: true, platform: true, status: true, internalTitle: true } },
          fileAsset: { select: { id: true, displayName: true, originalName: true } },
        },
      },
    },
  });
}

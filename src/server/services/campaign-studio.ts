import "server-only";
import { prisma } from "@/lib/db/prisma";

const memberSelect = { id: true, name: true, email: true, image: true } as const;

export async function listCampaignStudioCampaigns(
  projectId: string,
  filters: { status?: string; search?: string } = {}
) {
  return prisma.campaign.findMany({
    where: {
      projectId,
      status: filters.status && filters.status !== "ALL" ? (filters.status as never) : undefined,
      name: filters.search ? { contains: filters.search, mode: "insensitive" } : undefined,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      brandProfile: { select: { id: true, name: true } },
      _count: { select: { pieces: true, pillars: true } },
    },
  });
}

export async function getCampaignStudioCampaign(campaignId: string) {
  return prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      brandProfile: { select: { id: true, name: true } },
      owner: { select: memberSelect },
      strategy: true,
      pillars: { orderBy: { order: "asc" } },
      metricGoals: { orderBy: { metricType: "asc" } },
      _count: { select: { pieces: true } },
    },
  });
}

export async function listCampaignPieces(campaignId: string) {
  return prisma.campaignContentPiece.findMany({
    where: { campaignId },
    orderBy: [{ status: "asc" }, { order: "asc" }],
    include: {
      pillar: { select: { id: true, name: true, color: true } },
      assignee: { select: memberSelect },
      author: { select: memberSelect },
      updatedBy: { select: memberSelect },
      contentItem: { select: { id: true, title: true, status: true } },
      _count: { select: { comments: true } },
    },
  });
}

export async function getCampaignPiece(pieceId: string) {
  return prisma.campaignContentPiece.findUnique({
    where: { id: pieceId },
    include: {
      pillar: true,
      assignee: { select: memberSelect },
      author: { select: memberSelect },
      updatedBy: { select: memberSelect },
      contentItem: { select: { id: true, title: true, status: true } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: memberSelect } } },
    },
  });
}

export async function listProjectMembersForCampaignStudio(projectId: string) {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: memberSelect } },
  });
  return members.map((m) => ({ ...m.user, role: m.role }));
}

export async function listCampaignTemplates(projectId: string) {
  return prisma.campaignTemplate.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: memberSelect } },
  });
}

export async function listCampaignStrategyVersions(strategyId: string) {
  return prisma.campaignStrategyVersion.findMany({
    where: { strategyId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: memberSelect } },
  });
}

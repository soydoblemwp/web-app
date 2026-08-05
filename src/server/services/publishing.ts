import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SocialPostStatus } from "@/generated/prisma/enums";

const memberSelect = { id: true, name: true, email: true, image: true } as const;

export interface PublishingFilters {
  platform?: string;
  status?: SocialPostStatus;
  campaignId?: string;
  assigneeId?: string;
  approverId?: string;
  priority?: string;
  brandProfileId?: string;
  search?: string;
}

function whereFromFilters(projectId: string, filters: PublishingFilters) {
  return {
    projectId,
    platform: filters.platform ? (filters.platform as never) : undefined,
    status: filters.status,
    campaignId: filters.campaignId,
    assigneeId: filters.assigneeId,
    approverId: filters.approverId,
    priority: filters.priority ? (filters.priority as never) : undefined,
    brandProfileId: filters.brandProfileId,
    internalTitle: filters.search ? { contains: filters.search, mode: "insensitive" as const } : undefined,
  };
}

export async function listPublications(projectId: string, filters: PublishingFilters = {}) {
  return prisma.socialPost.findMany({
    where: whereFromFilters(projectId, filters),
    orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
    include: {
      campaign: { select: { id: true, name: true } },
      brandProfile: { select: { id: true, name: true } },
      assignee: { select: memberSelect },
      approver: { select: memberSelect },
      author: { select: memberSelect },
      sourcePiece: { select: { id: true, title: true } },
      media: { include: { fileAsset: true }, orderBy: { order: "asc" } },
      _count: { select: { approvalEvents: true, attempts: true } },
    },
  });
}

export async function getPublication(id: string) {
  return prisma.socialPost.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true } },
      brandProfile: { select: { id: true, name: true } },
      assignee: { select: memberSelect },
      approver: { select: memberSelect },
      approvedBy: { select: memberSelect },
      author: { select: memberSelect },
      sourceContent: { select: { id: true, title: true } },
      sourcePiece: { select: { id: true, title: true, campaignId: true } },
      series: true,
      media: { include: { fileAsset: true }, orderBy: { order: "asc" } },
      approvalEvents: { orderBy: { createdAt: "asc" }, include: { actor: { select: memberSelect } } },
      attempts: { orderBy: { createdAt: "desc" } },
      versions: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function listMediaLibrary(
  projectId: string,
  filters: { search?: string; tag?: string; kind?: string; includeArchived?: boolean } = {}
) {
  return prisma.fileAsset.findMany({
    where: {
      projectId,
      isArchived: filters.includeArchived ? undefined : false,
      kind: filters.kind ? (filters.kind as never) : undefined,
      tags: filters.tag ? { has: filters.tag } : undefined,
      OR: filters.search
        ? [
            { displayName: { contains: filters.search, mode: "insensitive" } },
            { originalName: { contains: filters.search, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: memberSelect } },
  });
}

export async function listPublicationTemplates(projectId: string) {
  return prisma.publicationTemplate.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: memberSelect } },
  });
}

export async function listPublicationSeries(projectId: string) {
  return prisma.publicationSeries.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { posts: true } } },
  });
}

export async function getChecklistTemplate(projectId: string, platform: string) {
  return prisma.publishingChecklistTemplate.findUnique({
    where: { projectId_platform: { projectId, platform: platform as never } },
  });
}

export async function listChecklistTemplates(projectId: string) {
  return prisma.publishingChecklistTemplate.findMany({ where: { projectId } });
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { SocialPlatform, SocialPostStatus } from "@/generated/prisma/enums";

export interface SocialPostFilters {
  platform?: SocialPlatform;
  status?: SocialPostStatus;
  campaignId?: string;
}

export async function listSocialPosts(projectId: string, filters: SocialPostFilters = {}) {
  return prisma.socialPost.findMany({
    where: {
      projectId,
      platform: filters.platform,
      status: filters.status,
      campaignId: filters.campaignId,
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    include: { campaign: { select: { name: true } } },
  });
}

export async function getSocialPost(id: string) {
  return prisma.socialPost.findUnique({
    where: { id },
    include: {
      campaign: true,
      versions: { orderBy: { createdAt: "desc" } },
      metrics: { orderBy: { recordedAt: "desc" } },
    },
  });
}

export async function listConnectedPlatforms(projectId: string) {
  return prisma.socialPlatformConnection.findMany({ where: { projectId } });
}

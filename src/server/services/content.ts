import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ContentStatus, ContentType } from "@/generated/prisma/enums";

export interface ContentFilters {
  status?: ContentStatus;
  type?: ContentType;
  favoriteOnly?: boolean;
  search?: string;
}

export async function listContentItems(projectId: string, filters: ContentFilters) {
  return prisma.contentItem.findMany({
    where: {
      projectId,
      deletedAt: null,
      isArchived: false,
      status: filters.status,
      type: filters.type,
      isFavorite: filters.favoriteOnly ? true : undefined,
      title: filters.search ? { contains: filters.search, mode: "insensitive" } : undefined,
    },
    orderBy: { updatedAt: "desc" },
    include: { author: { select: { name: true, email: true } }, tags: { include: { tag: true } } },
  });
}

export async function getContentItem(id: string) {
  return prisma.contentItem.findUnique({
    where: { id },
    include: {
      author: { select: { name: true, email: true } },
      versions: { orderBy: { createdAt: "desc" } },
      tags: { include: { tag: true } },
    },
  });
}

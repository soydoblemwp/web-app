import "server-only";
import { prisma } from "@/lib/db/prisma";

/** Tool slugs the user has marked as favorite, across all their projects. */
export async function listFavoriteToolSlugs(userId: string): Promise<string[]> {
  const rows = await prisma.aiToolInteraction.findMany({
    where: { userId, type: "FAVORITE" },
    select: { toolSlug: true },
  });
  return rows.map((row) => row.toolSlug);
}

/** Most recently used tool slugs for the user, newest first. */
export async function listRecentToolSlugs(userId: string, limit = 6): Promise<string[]> {
  const rows = await prisma.aiToolInteraction.findMany({
    where: { userId, type: "RECENT_USE" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { toolSlug: true },
  });
  return rows.map((row) => row.toolSlug);
}

"use server";

import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";

/**
 * Read-only fetch for the composer's approval history panel. Takes only
 * `postId` — the project (and therefore the access check) is derived from
 * the post's own row, never trusted from the client (spec section 19).
 */
export async function getApprovalHistoryAction(postId: string) {
  const post = await prisma.socialPost.findUnique({ where: { id: postId }, select: { projectId: true } });
  if (!post) return [];
  await requireProjectAccess(post.projectId, "VIEWER");

  const events = await prisma.publicationApprovalEvent.findMany({
    where: { socialPostId: postId },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { name: true, email: true } } },
  });

  return events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() }));
}

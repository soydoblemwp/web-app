"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { findAiTool } from "@/lib/ai-center/registry";

/**
 * Toggles a favorite for the current user. `projectId` is only used to
 * confirm real project membership (same guard every other project action
 * uses) and to revalidate the right page — the favorite itself belongs to
 * the user, not the project.
 */
export async function toggleAiToolFavoriteAction(projectId: string, toolSlug: string): Promise<void> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  if (!findAiTool(toolSlug)) return;

  const existing = await prisma.aiToolInteraction.findUnique({
    where: { userId_toolSlug_type: { userId: user.id, toolSlug, type: "FAVORITE" } },
  });

  if (existing) {
    await prisma.aiToolInteraction.delete({ where: { id: existing.id } });
  } else {
    await prisma.aiToolInteraction.create({
      data: { userId: user.id, projectId, toolSlug, type: "FAVORITE" },
    });
  }

  revalidatePath(`/dashboard/${projectId}/ai-center`);
}

/** Records that the user opened a tool, for the "recent tools" list. Never blocks navigation. */
export async function recordAiToolUsageAction(projectId: string, toolSlug: string): Promise<void> {
  const user = await requireProjectAccess(projectId, "VIEWER");
  if (!findAiTool(toolSlug)) return;

  await prisma.aiToolInteraction.upsert({
    where: { userId_toolSlug_type: { userId: user.id, toolSlug, type: "RECENT_USE" } },
    update: { updatedAt: new Date(), projectId },
    create: { userId: user.id, projectId, toolSlug, type: "RECENT_USE" },
  });

  revalidatePath(`/dashboard/${projectId}/ai-center`);
}

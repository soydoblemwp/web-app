import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ASSISTANT_CONTEXT_TEMPLATE_LIMIT } from "@/lib/ai-templates/assistant-context";

/**
 * Every AI Template visible to this user within the given project: their
 * own global templates (projectId null) plus their own templates scoped to
 * this specific project. Never another user's rows — userId is always part
 * of the where clause, never optional. Same isolation shape as
 * listSavedPromptsForUser in src/server/services/prompt-library.ts.
 */
export async function listAiTemplatesForUser(userId: string, projectId: string) {
  return prisma.aiTemplate.findMany({
    where: { userId, OR: [{ projectId }, { projectId: null }] },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getAiTemplateForUser(id: string, userId: string) {
  const template = await prisma.aiTemplate.findUnique({ where: { id } });
  if (!template || template.userId !== userId) return null;
  return template;
}

/** Bounded, favorites-first selection used to build Chat IA's assistant context (see src/lib/ai-templates/assistant-context.ts). */
export async function listTemplatesForAssistantContext(userId: string, projectId: string) {
  return prisma.aiTemplate.findMany({
    where: { userId, OR: [{ projectId }, { projectId: null }] },
    orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
    take: ASSISTANT_CONTEXT_TEMPLATE_LIMIT,
  });
}

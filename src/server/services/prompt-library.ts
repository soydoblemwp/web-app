import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ASSISTANT_CONTEXT_PROMPT_LIMIT } from "@/lib/prompt-library/assistant-context";

/**
 * Every saved prompt visible to this user within the given project: their
 * own global prompts (projectId null, usable from any project) plus their
 * own prompts scoped to this specific project. Never another user's rows —
 * userId is always part of the where clause, never optional.
 */
export async function listSavedPromptsForUser(userId: string, projectId: string) {
  return prisma.savedPrompt.findMany({
    where: { userId, OR: [{ projectId }, { projectId: null }] },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSavedPromptForUser(id: string, userId: string) {
  const prompt = await prisma.savedPrompt.findUnique({ where: { id } });
  if (!prompt || prompt.userId !== userId) return null;
  return prompt;
}

/**
 * Bounded, favorites-first selection used to build Chat IA's assistant
 * context (see src/lib/prompt-library/assistant-context.ts) — never the
 * full list, so the local model's context stays small regardless of how
 * many prompts the user has saved.
 */
export async function listPromptsForAssistantContext(userId: string, projectId: string) {
  return prisma.savedPrompt.findMany({
    where: { userId, OR: [{ projectId }, { projectId: null }] },
    orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
    take: ASSISTANT_CONTEXT_PROMPT_LIMIT,
  });
}

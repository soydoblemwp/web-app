import "server-only";
import { prisma } from "@/lib/db/prisma";

export async function listConversations(projectId: string, userId: string) {
  return prisma.aIConversation.findMany({
    where: { projectId, userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getConversationWithMessages(conversationId: string) {
  return prisma.aIConversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

/**
 * Same fetch as getConversationWithMessages, but also verifies the
 * conversation actually belongs to this project and this user before
 * returning it — never trust a conversationId from the client alone. Used
 * by the Chat IA route, which (unlike the older Asistente IA page) has no
 * separate inline ownership check of its own.
 */
export async function getConversationForProject(projectId: string, conversationId: string, userId: string) {
  const conversation = await getConversationWithMessages(conversationId);
  if (!conversation || conversation.projectId !== projectId || conversation.userId !== userId) return null;
  return conversation;
}

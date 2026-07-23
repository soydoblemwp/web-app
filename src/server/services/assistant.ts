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

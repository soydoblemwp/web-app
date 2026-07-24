"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { LOCAL_MODEL_ID } from "@/lib/ai/local/model-config";

export async function createConversationAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const conversation = await prisma.aIConversation.create({
    data: { projectId, userId: user.id },
  });
  redirect(`/dashboard/${projectId}/assistant/${conversation.id}`);
}

export interface SaveAssistantExchangeInput {
  projectId: string;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
}

export interface SaveAssistantExchangeState {
  error?: string;
}

/**
 * Persists a user/assistant message pair the browser already generated
 * locally (see src/lib/ai/local). No AI runs here — this action only ever
 * receives the final text, never a prompt, and never talks to any AI
 * provider. Both messages are saved together, after generation succeeds, so
 * a cancelled or failed generation never leaves an orphaned user message.
 */
export async function saveAssistantExchangeAction(
  input: SaveAssistantExchangeInput
): Promise<SaveAssistantExchangeState> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.userMessage.trim()) return { error: "Escribe un mensaje." };
  if (!input.assistantMessage.trim()) return { error: "No hay respuesta generada que guardar." };

  const conversation = await prisma.aIConversation.findUnique({ where: { id: input.conversationId } });
  if (!conversation || conversation.projectId !== input.projectId) {
    return { error: "Conversación no encontrada." };
  }

  await prisma.$transaction([
    prisma.aIMessage.create({
      data: { conversationId: input.conversationId, role: "user", content: input.userMessage },
    }),
    prisma.aIMessage.create({
      data: { conversationId: input.conversationId, role: "assistant", content: input.assistantMessage },
    }),
    prisma.aIConversation.update({ where: { id: input.conversationId }, data: { updatedAt: new Date() } }),
  ]);

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "CHAT_MESSAGE",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/assistant/${input.conversationId}`);
  return {};
}

export async function renameConversationAction(projectId: string, conversationId: string, title: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.aIConversation.update({ where: { id: conversationId }, data: { title: title.slice(0, 200) || "Sin título" } });
  revalidatePath(`/dashboard/${projectId}/assistant`);
}

export async function deleteConversationAction(projectId: string, conversationId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.aIConversation.delete({ where: { id: conversationId } });
  revalidatePath(`/dashboard/${projectId}/assistant`);
  redirect(`/dashboard/${projectId}/assistant`);
}

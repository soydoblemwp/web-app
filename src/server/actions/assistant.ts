"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { LOCAL_MODEL_ID } from "@/lib/ai/local/model-config";

async function createConversationRow(projectId: string, userId: string) {
  return prisma.aIConversation.create({ data: { projectId, userId } });
}

/**
 * Confirms a conversation truly belongs to this project AND this user
 * before any mutation — a conversationId is client-supplied, so it is never
 * trusted on its own. Shared by every rename/delete action below.
 */
async function ensureConversationOwnership(projectId: string, conversationId: string, userId: string) {
  const conversation = await prisma.aIConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.projectId !== projectId || conversation.userId !== userId) return null;
  return conversation;
}

export async function createConversationAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const conversation = await createConversationRow(projectId, user.id);
  redirect(`/dashboard/${projectId}/assistant/${conversation.id}`);
}

/** Same creation as createConversationAction, redirecting into the Chat IA route instead of the older Asistente IA one. */
export async function createChatConversationAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const conversation = await createConversationRow(projectId, user.id);
  redirect(`/dashboard/${projectId}/chat/${conversation.id}`);
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
 * Shared by both the Asistente IA panel and the Chat IA panel.
 */
export async function saveAssistantExchangeAction(
  input: SaveAssistantExchangeInput
): Promise<SaveAssistantExchangeState> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.userMessage.trim()) return { error: "Escribe un mensaje." };
  if (!input.assistantMessage.trim()) return { error: "No hay respuesta generada que guardar." };

  const conversation = await ensureConversationOwnership(input.projectId, input.conversationId, user.id);
  if (!conversation) return { error: "Conversación no encontrada." };

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
  revalidatePath(`/dashboard/${input.projectId}/chat/${input.conversationId}`);
  revalidatePath(`/dashboard/${input.projectId}/chat`);
  return {};
}

export async function renameConversationAction(projectId: string, conversationId: string, title: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const conversation = await ensureConversationOwnership(projectId, conversationId, user.id);
  if (!conversation) return;

  await prisma.aIConversation.update({ where: { id: conversationId }, data: { title: title.slice(0, 200) || "Sin título" } });
  revalidatePath(`/dashboard/${projectId}/assistant`);
  revalidatePath(`/dashboard/${projectId}/chat`);
}

export async function deleteConversationAction(projectId: string, conversationId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const conversation = await ensureConversationOwnership(projectId, conversationId, user.id);
  if (!conversation) return;

  await prisma.aIConversation.delete({ where: { id: conversationId } });
  revalidatePath(`/dashboard/${projectId}/assistant`);
  redirect(`/dashboard/${projectId}/assistant`);
}

/** Same delete as deleteConversationAction, redirecting back into the Chat IA list instead. */
export async function deleteChatConversationAction(projectId: string, conversationId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const conversation = await ensureConversationOwnership(projectId, conversationId, user.id);
  if (!conversation) return;

  await prisma.aIConversation.delete({ where: { id: conversationId } });
  revalidatePath(`/dashboard/${projectId}/chat`);
  redirect(`/dashboard/${projectId}/chat`);
}

/**
 * Saves a full conversation transcript into the project's content library
 * as a ContentItem, tagged with the same "asistente-chat" tool slug the AI
 * Center registry already uses for the assistant — so it shows up in the
 * Workspace correctly labeled, with zero changes to the Workspace or the AI
 * Center registry themselves. Reuses ContentItem; no new table.
 */
export async function saveConversationToWorkspaceAction(projectId: string, conversationId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const conversation = await ensureConversationOwnership(projectId, conversationId, user.id);
  if (!conversation) return { error: "Conversación no encontrada." };

  const messages = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  if (messages.length === 0) return { error: "La conversación todavía no tiene mensajes." };

  const transcript = messages
    .map((message) => `${message.role === "user" ? "Usuario" : "Asistente"}: ${message.content}`)
    .join("\n\n");

  await prisma.contentItem.create({
    data: {
      projectId,
      authorId: user.id,
      type: "OTHER",
      title: conversation.title.slice(0, 120),
      body: transcript,
      language: "es",
      sourceTool: "asistente-chat",
    },
  });

  revalidatePath(`/dashboard/${projectId}/content`);
  revalidatePath(`/dashboard/${projectId}/workspace`);
  return {};
}

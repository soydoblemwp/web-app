"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { generateAIContent } from "@/lib/ai/service";
import { AIProviderError } from "@/lib/ai/types";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { buildAssistantSystemPrompt } from "@/lib/ai/prompts/assistant";

const MAX_HISTORY_MESSAGES = 20;

export async function createConversationAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const conversation = await prisma.aIConversation.create({
    data: { projectId, userId: user.id },
  });
  redirect(`/dashboard/${projectId}/assistant/${conversation.id}`);
}

export interface SendMessageFormState {
  error?: string;
}

export async function sendMessageAction(
  projectId: string,
  conversationId: string,
  _prevState: SendMessageFormState,
  formData: FormData
): Promise<SendMessageFormState> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const text = String(formData.get("message") ?? "").trim();
  if (!text) return { error: "Escribe un mensaje." };
  if (text.length > 8000) return { error: "El mensaje es demasiado largo." };

  const conversation = await prisma.aIConversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: MAX_HISTORY_MESSAGES } },
  });
  if (!conversation || conversation.projectId !== projectId) {
    return { error: "Conversación no encontrada." };
  }

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } });
  const system = buildAssistantSystemPrompt(buildBrandContext(project, brandKit));

  await prisma.aIMessage.create({
    data: { conversationId, role: "user", content: text },
  });

  let result;
  try {
    result = await generateAIContent({
      projectId,
      userId: user.id,
      kind: "CHAT_MESSAGE",
      system,
      history: conversation.messages.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
      prompt: text,
      skipCache: true,
    });
  } catch (error) {
    return { error: error instanceof AIProviderError ? error.message : "No se pudo generar una respuesta." };
  }

  await prisma.$transaction([
    prisma.aIMessage.create({
      data: { conversationId, role: "assistant", content: result.text },
    }),
    prisma.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ]);

  revalidatePath(`/dashboard/${projectId}/assistant/${conversationId}`);
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

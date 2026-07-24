"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { LOCAL_MODEL_ID } from "@/lib/ai/local/model-config";

export interface SaveGeneratedReplyInput {
  projectId: string;
  context: string;
  platform: string;
  body: string;
  language: string;
}

export interface SaveGeneratedReplyState {
  error?: string;
}

/**
 * Persists a reply draft the browser already generated locally (see
 * src/lib/ai/local). No AI runs here — this action only ever receives the
 * final text, never a prompt, and never talks to any AI provider.
 */
export async function saveGeneratedReplyAction(
  input: SaveGeneratedReplyInput
): Promise<SaveGeneratedReplyState | never> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.context.trim()) return { error: "Pega el mensaje al que quieres responder." };
  if (!input.body.trim()) return { error: "No hay respuesta generada que guardar." };

  const contentItem = await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: "OTHER",
      title: `Respuesta (${input.platform}): ${input.context.slice(0, 60)}`,
      body: input.body,
      language: input.language,
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "REPLY",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/replies`);
  redirect(`/dashboard/${input.projectId}/content/${contentItem.id}`);
}

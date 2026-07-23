"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { generateAIContent } from "@/lib/ai/service";
import { AIProviderError } from "@/lib/ai/types";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { buildReplyPrompt, buildReplySystemPrompt } from "@/lib/ai/prompts/reply";

export interface ReplyFormState {
  error?: string;
}

export async function generateReplyAction(
  projectId: string,
  _prevState: ReplyFormState,
  formData: FormData
): Promise<ReplyFormState> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const context = String(formData.get("context") ?? "").trim();
  const replyType = String(formData.get("replyType") ?? "Comentario");
  const platform = String(formData.get("platform") ?? "General");
  const tone = String(formData.get("tone") ?? "Cercano y profesional");
  const language = String(formData.get("language") ?? "es");

  if (!context) return { error: "Pega el mensaje al que quieres responder." };
  if (context.length > 4000) return { error: "El mensaje es demasiado largo." };

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } });
  const system = buildReplySystemPrompt(buildBrandContext(project, brandKit));
  const prompt = buildReplyPrompt({ context, replyType, platform, tone, language });

  let result;
  try {
    result = await generateAIContent({ projectId, userId: user.id, kind: "REPLY", system, prompt });
  } catch (error) {
    return { error: error instanceof AIProviderError ? error.message : "No se pudo generar la respuesta." };
  }

  const contentItem = await prisma.contentItem.create({
    data: {
      projectId,
      authorId: user.id,
      type: "OTHER",
      title: `Respuesta (${platform}): ${context.slice(0, 60)}`,
      body: result.text,
      language,
    },
  });

  revalidatePath(`/dashboard/${projectId}/replies`);
  redirect(`/dashboard/${projectId}/content/${contentItem.id}`);
}

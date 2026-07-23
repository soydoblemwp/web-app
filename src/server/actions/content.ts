"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { generateContentSchema, updateContentItemSchema } from "@/lib/validation/content";
import { generateAIContent } from "@/lib/ai/service";
import { AIProviderError } from "@/lib/ai/types";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { buildContentGenerationPrompt, buildContentGenerationSystemPrompt } from "@/lib/ai/prompts/content";

export interface GenerateContentFormState {
  error?: string;
}

export async function generateContentAction(
  _prevState: GenerateContentFormState,
  formData: FormData
): Promise<GenerateContentFormState> {
  const projectId = String(formData.get("projectId") ?? "");
  const user = await requireProjectAccess(projectId, "EDITOR");

  const parsed = generateContentSchema.safeParse({
    projectId,
    type: formData.get("type"),
    topic: formData.get("topic"),
    objective: formData.get("objective") ?? "",
    audience: formData.get("audience") ?? "",
    tone: formData.get("tone") ?? "",
    language: formData.get("language") || "es",
    keywords: formData.get("keywords") ?? "",
    forbiddenWords: formData.get("forbiddenWords") ?? "",
    cta: formData.get("cta") ?? "",
    useBrandKit: formData.get("useBrandKit") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const brandKit = parsed.data.useBrandKit
    ? await prisma.brandKit.findUnique({ where: { projectId }, include: { terms: true } })
    : null;

  const system = buildContentGenerationSystemPrompt(buildBrandContext(project, brandKit));
  const prompt = buildContentGenerationPrompt(parsed.data);

  let generated;
  try {
    generated = await generateAIContent({
      projectId,
      userId: user.id,
      kind: "CONTENT_GENERATION",
      system,
      prompt,
    });
  } catch (error) {
    return { error: error instanceof AIProviderError ? error.message : "No se pudo generar el contenido." };
  }

  const title = parsed.data.topic.slice(0, 120);
  const contentItem = await prisma.contentItem.create({
    data: {
      projectId,
      authorId: user.id,
      type: parsed.data.type,
      title,
      body: generated.text,
      language: parsed.data.language,
      targetAudience: parsed.data.audience || null,
      tone: parsed.data.tone || null,
      keywords: parsed.data.keywords ? parsed.data.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
      cta: parsed.data.cta || null,
    },
  });

  revalidatePath(`/dashboard/${projectId}/content`);
  redirect(`/dashboard/${projectId}/content/${contentItem.id}`);
}

export async function updateContentItemAction(projectId: string, formData: FormData) {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const parsed = updateContentItemSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title") || undefined,
    body: formData.get("body") ?? undefined,
  });
  if (!parsed.success) return;

  const current = await prisma.contentItem.findUnique({ where: { id: parsed.data.id } });
  if (!current || current.projectId !== projectId) return;

  await prisma.$transaction([
    prisma.contentVersion.create({
      data: {
        contentItemId: current.id,
        authorId: user.id,
        title: current.title,
        body: current.body,
      },
    }),
    prisma.contentItem.update({
      where: { id: current.id },
      data: {
        title: parsed.data.title ?? current.title,
        body: parsed.data.body ?? current.body,
      },
    }),
  ]);

  revalidatePath(`/dashboard/${projectId}/content/${current.id}`);
}

export async function changeContentStatusAction(projectId: string, contentId: string, status: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.contentItem.update({ where: { id: contentId }, data: { status: status as never } });
  revalidatePath(`/dashboard/${projectId}/content/${contentId}`);
  revalidatePath(`/dashboard/${projectId}/content`);
}

export async function toggleFavoriteContentAction(projectId: string, contentId: string, next: boolean) {
  await requireProjectAccess(projectId, "VIEWER");
  await prisma.contentItem.update({ where: { id: contentId }, data: { isFavorite: next } });
  revalidatePath(`/dashboard/${projectId}/content`);
}

export async function archiveContentAction(projectId: string, contentId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.contentItem.update({ where: { id: contentId }, data: { isArchived: true } });
  revalidatePath(`/dashboard/${projectId}/content`);
  redirect(`/dashboard/${projectId}/content`);
}

export async function deleteContentAction(projectId: string, contentId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.contentItem.update({ where: { id: contentId }, data: { deletedAt: new Date() } });
  revalidatePath(`/dashboard/${projectId}/content`);
  redirect(`/dashboard/${projectId}/content`);
}

export async function duplicateContentAction(projectId: string, contentId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const original = await prisma.contentItem.findUnique({ where: { id: contentId } });
  if (!original || original.projectId !== projectId) return;

  const copy = await prisma.contentItem.create({
    data: {
      projectId,
      authorId: user.id,
      type: original.type,
      title: `${original.title} (copia)`,
      body: original.body,
      language: original.language,
      targetAudience: original.targetAudience,
      tone: original.tone,
      keywords: original.keywords,
      cta: original.cta,
      sourceContentId: original.id,
    },
  });

  revalidatePath(`/dashboard/${projectId}/content`);
  redirect(`/dashboard/${projectId}/content/${copy.id}`);
}

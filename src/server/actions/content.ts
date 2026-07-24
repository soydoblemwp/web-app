"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { updateContentItemSchema } from "@/lib/validation/content";
import { LOCAL_MODEL_ID } from "@/lib/ai/local/model-config";
import type { ContentType } from "@/generated/prisma/enums";

export interface SaveGeneratedContentInput {
  projectId: string;
  type: ContentType;
  topic: string;
  body: string;
  language: string;
  audience?: string;
  tone?: string;
  keywords?: string;
  cta?: string;
}

export interface SaveGeneratedContentState {
  error?: string;
}

/**
 * Persists a piece of content the browser already generated locally (see
 * src/lib/ai/local). No AI runs here — this action only ever receives the
 * final text, never a prompt, and never talks to any AI provider.
 */
export async function saveGeneratedContentAction(
  input: SaveGeneratedContentInput
): Promise<SaveGeneratedContentState | never> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.topic.trim()) return { error: "Describe el tema del contenido." };
  if (!input.body.trim()) return { error: "No hay contenido generado que guardar." };

  const title = input.topic.slice(0, 120);
  const contentItem = await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: input.type,
      title,
      body: input.body,
      language: input.language,
      targetAudience: input.audience || null,
      tone: input.tone || null,
      keywords: input.keywords ? input.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
      cta: input.cta || null,
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "CONTENT_GENERATION",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/content`);
  redirect(`/dashboard/${input.projectId}/content/${contentItem.id}`);
}

export interface SaveGeneratedSocialIdeasInput {
  projectId: string;
  topic: string;
  platform: string;
  body: string;
  language: string;
}

/** Same local-generation-then-save pattern as saveGeneratedContentAction, for the "Ideas para redes sociales" tool. */
export async function saveGeneratedSocialIdeasAction(
  input: SaveGeneratedSocialIdeasInput
): Promise<SaveGeneratedContentState> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.topic.trim()) return { error: "Describe sobre qué quieres ideas." };
  if (!input.body.trim()) return { error: "No hay ideas generadas que guardar." };

  await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: "SOCIAL_TEXT",
      title: `Ideas para ${input.platform}: ${input.topic}`.slice(0, 120),
      body: input.body,
      language: input.language,
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "CONTENT_GENERATION",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/content`);
  return {};
}

export interface SaveGeneratedContentAdaptationInput {
  projectId: string;
  targetPlatform: string;
  body: string;
  language: string;
}

/** Same local-generation-then-save pattern as saveGeneratedContentAction, for the "Adaptador de contenido" tool. */
export async function saveGeneratedContentAdaptationAction(
  input: SaveGeneratedContentAdaptationInput
): Promise<SaveGeneratedContentState> {
  const user = await requireProjectAccess(input.projectId, "EDITOR");

  if (!input.body.trim()) return { error: "No hay contenido adaptado que guardar." };

  await prisma.contentItem.create({
    data: {
      projectId: input.projectId,
      authorId: user.id,
      type: "OTHER",
      title: `Adaptado para ${input.targetPlatform}`.slice(0, 120),
      body: input.body,
      language: input.language,
    },
  });

  await prisma.aIUsage.create({
    data: {
      projectId: input.projectId,
      userId: user.id,
      kind: "ADAPTATION",
      provider: "local-browser",
      model: LOCAL_MODEL_ID,
    },
  });

  revalidatePath(`/dashboard/${input.projectId}/content`);
  return {};
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

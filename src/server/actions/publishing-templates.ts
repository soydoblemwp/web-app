"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireProjectAccess } from "@/lib/permissions";
import { createPublicationTemplateSchema, checklistTemplateItemsSchema } from "@/lib/validation/publishing";
import { defaultChecklistForPlatform } from "@/lib/publishing/checklists";
import type { SocialPlatform } from "@/generated/prisma/enums";

function revalidateHub(projectId: string) {
  revalidatePath(`/dashboard/${projectId}/publishing`);
}

export async function savePublicationAsTemplateAction(
  projectId: string,
  input: unknown
): Promise<{ error?: string; id?: string }> {
  const parsed = createPublicationTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const post = await prisma.socialPost.findUnique({ where: { id: parsed.data.postId } });
  if (!post || post.projectId !== projectId) return { error: "Publicación no encontrada." };

  const structure = {
    platform: post.platform,
    format: post.format,
    text: post.text,
    cta: post.cta,
    hashtags: post.hashtags,
    firstComment: post.firstComment,
    brandProfileId: post.brandProfileId,
    checklist: defaultChecklistForPlatform(post.platform),
  };

  const template = await prisma.publicationTemplate.create({
    data: {
      projectId,
      createdById: user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      platform: post.platform,
      structure: structure as unknown as Prisma.InputJsonValue,
    },
  });

  revalidateHub(projectId);
  return { id: template.id };
}

export async function deletePublicationTemplateAction(projectId: string, templateId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const template = await prisma.publicationTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.projectId !== projectId) return { error: "Plantilla no encontrada." };
  await prisma.publicationTemplate.delete({ where: { id: templateId } });
  revalidateHub(projectId);
  return {};
}

export async function saveChecklistTemplateAction(
  projectId: string,
  platform: SocialPlatform,
  items: unknown,
  blocksPublish: boolean
): Promise<{ error?: string }> {
  const parsedItems = checklistTemplateItemsSchema.safeParse(items);
  if (!parsedItems.success) return { error: "Checklist no válido." };

  await requireProjectAccess(projectId, "MANAGER");

  await prisma.publishingChecklistTemplate.upsert({
    where: { projectId_platform: { projectId, platform } },
    create: { projectId, platform, items: parsedItems.data as unknown as Prisma.InputJsonValue, blocksPublish },
    update: { items: parsedItems.data as unknown as Prisma.InputJsonValue, blocksPublish },
  });

  revalidateHub(projectId);
  return {};
}

export async function updatePublicationChecklistStateAction(
  projectId: string,
  postId: string,
  state: Record<string, boolean>
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const post = await prisma.socialPost.findUnique({ where: { id: postId } });
  if (!post || post.projectId !== projectId) return { error: "Publicación no encontrada." };

  const template = await prisma.publishingChecklistTemplate.findUnique({
    where: { projectId_platform: { projectId, platform: post.platform } },
  });
  if (template?.blocksPublish) {
    const items = template.items as { id: string }[];
    const allDone = items.every((item) => state[item.id] === true);
    if (!allDone && (post.status === "SCHEDULED" || post.status === "PUBLISHING")) {
      return { error: "Este proyecto exige completar el checklist antes de programar esta plataforma." };
    }
  }

  await prisma.socialPost.update({ where: { id: postId }, data: { checklistState: state as unknown as Prisma.InputJsonValue } });
  revalidateHub(projectId);
  return {};
}

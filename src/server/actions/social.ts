"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { createSocialPostSchema } from "@/lib/validation/social";
import type { SocialPlatform } from "@/generated/prisma/enums";
import { publishAutomationEvent } from "@/server/services/automation-events";

export interface SocialPostFormState {
  error?: string;
}

export async function createSocialPostAction(
  projectId: string,
  _prevState: SocialPostFormState,
  formData: FormData
): Promise<SocialPostFormState> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const hashtagsRaw = String(formData.get("hashtags") ?? "");
  const parsed = createSocialPostSchema.safeParse({
    projectId,
    platform: formData.get("platform"),
    postType: formData.get("postType") || "post",
    internalTitle: formData.get("internalTitle") ?? "",
    text: formData.get("text"),
    scheduledAt: formData.get("scheduledAt") || "",
    campaignId: formData.get("campaignId") || "",
    hashtags: hashtagsRaw ? hashtagsRaw.split(",").map((h) => h.trim()).filter(Boolean) : [],
    cta: formData.get("cta") ?? "",
    link: formData.get("link") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const data = parsed.data;
  const post = await prisma.socialPost.create({
    data: {
      projectId,
      authorId: user.id,
      platform: data.platform,
      postType: data.postType,
      internalTitle: data.internalTitle || null,
      text: data.text,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      status: data.scheduledAt ? "SCHEDULED" : "DRAFT",
      campaignId: data.campaignId || null,
      hashtags: data.hashtags,
      cta: data.cta || null,
      link: data.link || null,
      notes: data.notes || null,
    },
  });

  await publishAutomationEvent({
    projectId,
    eventKey: "social_post.created",
    resourceId: post.id,
    actorId: user.id,
    payload: { id: post.id, platform: post.platform, status: post.status },
    idempotencyKey: `social_post.created:${post.id}`,
  });

  revalidatePath(`/dashboard/${projectId}/social`);
  revalidatePath(`/dashboard/${projectId}/calendar`);
  redirect(`/dashboard/${projectId}/social/${post.id}`);
}

export async function updateSocialPostAction(projectId: string, formData: FormData) {
  await requireProjectAccess(projectId, "EDITOR");
  const id = String(formData.get("id") ?? "");
  const current = await prisma.socialPost.findUnique({ where: { id } });
  if (!current || current.projectId !== projectId) return;

  await prisma.$transaction([
    prisma.socialPostVersion.create({ data: { socialPostId: id, text: current.text } }),
    prisma.socialPost.update({
      where: { id },
      data: {
        text: String(formData.get("text") ?? current.text),
        internalTitle: String(formData.get("internalTitle") ?? "") || null,
        notes: String(formData.get("notes") ?? "") || null,
      },
    }),
  ]);

  revalidatePath(`/dashboard/${projectId}/social/${id}`);
}

const VALID_STATUSES = ["IDEA", "DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED", "ARCHIVED"];

export async function changeSocialPostStatusAction(projectId: string, postId: string, status: string) {
  await requireProjectAccess(projectId, "EDITOR");
  if (!VALID_STATUSES.includes(status)) return;
  const before = await prisma.socialPost.findUnique({ where: { id: postId }, select: { status: true, platform: true, projectId: true } });
  if (!before || before.projectId !== projectId) return;
  await prisma.socialPost.update({ where: { id: postId }, data: { status: status as never } });

  if (before.status !== status) {
    await publishAutomationEvent({
      projectId,
      eventKey: "social_post.status_changed",
      resourceId: postId,
      payload: { id: postId, platform: before.platform, status, previous: before.status, current: status, changedFields: ["status"] },
      idempotencyKey: `social_post.status_changed:${postId}:${before.status}:${status}:${Date.now()}`,
    });
  }

  revalidatePath(`/dashboard/${projectId}/social`);
  revalidatePath(`/dashboard/${projectId}/social/${postId}`);
  revalidatePath(`/dashboard/${projectId}/calendar`);
}

export async function rescheduleSocialPostAction(projectId: string, postId: string, isoDate: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.socialPost.update({
    where: { id: postId },
    data: { scheduledAt: isoDate ? new Date(isoDate) : null, status: isoDate ? "SCHEDULED" : "DRAFT" },
  });
  revalidatePath(`/dashboard/${projectId}/calendar`);
  revalidatePath(`/dashboard/${projectId}/social/${postId}`);
}

export async function duplicateSocialPostAction(projectId: string, postId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const original = await prisma.socialPost.findUnique({ where: { id: postId } });
  if (!original || original.projectId !== projectId) return;

  const copy = await prisma.socialPost.create({
    data: {
      projectId,
      authorId: user.id,
      platform: original.platform,
      postType: original.postType,
      internalTitle: original.internalTitle ? `${original.internalTitle} (copia)` : null,
      text: original.text,
      hashtags: original.hashtags,
      cta: original.cta,
      link: original.link,
      status: "DRAFT",
    },
  });

  revalidatePath(`/dashboard/${projectId}/social`);
  redirect(`/dashboard/${projectId}/social/${copy.id}`);
}

export async function addSocialMetricAction(projectId: string, postId: string, formData: FormData) {
  await requireProjectAccess(projectId, "EDITOR");
  const toInt = (value: FormDataEntryValue | null) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  await prisma.socialMetric.create({
    data: {
      socialPostId: postId,
      source: "manual",
      views: toInt(formData.get("views")),
      likes: toInt(formData.get("likes")),
      comments: toInt(formData.get("comments")),
      shares: toInt(formData.get("shares")),
      clicks: toInt(formData.get("clicks")),
    },
  });

  revalidatePath(`/dashboard/${projectId}/social/${postId}`);
  revalidatePath(`/dashboard/${projectId}/analytics`);
}

export interface ScheduleContentForPublicationInput {
  contentId: string;
  platform: SocialPlatform;
  text: string;
  scheduledAt: string;
  timezone: string;
  campaignId?: string | null;
  tags?: string[];
}

/**
 * Editor sidebar "Publicación" tab — schedules a ContentItem onto a channel
 * by creating (or reusing) a SocialPost, the same model the existing
 * Calendar page already reads (see src/app/(dashboard)/dashboard/[projectId]/calendar/page.tsx,
 * which queries SocialPost.scheduledAt directly). "Evita duplicados": looks
 * up an existing SocialPost for this exact {content, platform} pair first —
 * scheduling the same content to the same channel twice reschedules the one
 * post instead of creating a second calendar entry.
 */
export async function scheduleContentForPublicationAction(
  projectId: string,
  input: ScheduleContentForPublicationInput
): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  if (!input.text.trim()) return { error: "El texto de la publicación no puede estar vacío." };

  const contentItem = await prisma.contentItem.findUnique({ where: { id: input.contentId } });
  if (!contentItem || contentItem.projectId !== projectId) return { error: "Contenido no encontrado." };

  const existing = await prisma.socialPost.findFirst({
    where: { projectId, sourceContentId: input.contentId, platform: input.platform },
  });

  const scheduledData = {
    text: input.text,
    scheduledAt: new Date(input.scheduledAt),
    timezone: input.timezone,
    status: "SCHEDULED" as const,
    campaignId: input.campaignId || null,
    tags: input.tags ?? [],
  };

  const post = existing
    ? await prisma.socialPost.update({ where: { id: existing.id }, data: scheduledData })
    : await prisma.socialPost.create({
        data: {
          projectId,
          authorId: user.id,
          platform: input.platform,
          postType: "post",
          internalTitle: contentItem.title.slice(0, 120),
          sourceContentId: input.contentId,
          ...scheduledData,
        },
      });

  await prisma.contentItem.update({ where: { id: input.contentId }, data: { status: "SCHEDULED" } });

  revalidatePath(`/dashboard/${projectId}/calendar`);
  revalidatePath(`/dashboard/${projectId}/content/${input.contentId}`);
  return { id: post.id };
}

/** Every SocialPost currently scheduled/published from this ContentItem — editor sidebar's "Publicación" tab. */
export async function listContentSchedulesAction(projectId: string, contentId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return prisma.socialPost.findMany({
    where: { projectId, sourceContentId: contentId },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, platform: true, scheduledAt: true, timezone: true, status: true, campaignId: true, tags: true },
  });
}

export async function deleteSocialPostAction(projectId: string, postId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.socialPost.delete({ where: { id: postId } });
  revalidatePath(`/dashboard/${projectId}/social`);
  revalidatePath(`/dashboard/${projectId}/calendar`);
  redirect(`/dashboard/${projectId}/social`);
}

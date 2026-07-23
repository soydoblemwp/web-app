"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { createSocialPostSchema } from "@/lib/validation/social";

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
  await prisma.socialPost.update({ where: { id: postId }, data: { status: status as never } });
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

export async function deleteSocialPostAction(projectId: string, postId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.socialPost.delete({ where: { id: postId } });
  revalidatePath(`/dashboard/${projectId}/social`);
  revalidatePath(`/dashboard/${projectId}/calendar`);
  redirect(`/dashboard/${projectId}/social`);
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import {
  publicationPatchSchema,
  createPublicationSchema,
  createPublicationCommentSchema,
  createPublicationSeriesSchema,
} from "@/lib/validation/publishing";
import { canSchedule, canApprove } from "@/lib/publishing/status";
import { generateRecurrenceInstances } from "@/lib/publishing/recurrence";
import type { SocialPostStatus } from "@/generated/prisma/enums";

async function getOwnedPost(postId: string, projectId: string) {
  const post = await prisma.socialPost.findUnique({ where: { id: postId } });
  if (!post || post.projectId !== projectId) return null;
  return post;
}

function revalidateHub(projectId: string, postId?: string) {
  revalidatePath(`/dashboard/${projectId}/publishing`);
  if (postId) revalidatePath(`/dashboard/${projectId}/publishing/${postId}`);
}

/**
 * The one place a SocialPost gets created for this hub — every origin
 * (blank, a ContentItem, a Campaign Studio piece, a campaign, a template, a
 * duplicate) funnels through here. Never a second document/post model.
 */
export async function createPublicationAction(
  projectId: string,
  input: unknown
): Promise<{ error?: string; id?: string }> {
  const parsed = createPublicationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const d = parsed.data;

  const user = await requireProjectAccess(projectId, "EDITOR");

  let text = d.text;
  let campaignId = d.campaignId ?? null;
  let sourceContentId: string | null = null;
  let sourcePieceId: string | null = d.sourcePieceId ?? null;
  let brandProfileId: string | null = null;

  if (d.sourceContentId) {
    const content = await prisma.contentItem.findUnique({ where: { id: d.sourceContentId } });
    if (!content || content.projectId !== projectId) return { error: "Contenido no encontrado." };
    sourceContentId = content.id;
    if (!text.trim()) text = content.body;
    brandProfileId = content.brandProfileId;
  }

  if (d.sourcePieceId) {
    const piece = await prisma.campaignContentPiece.findUnique({ where: { id: d.sourcePieceId }, include: { campaign: true } });
    if (!piece || piece.campaign.projectId !== projectId) return { error: "Pieza de campaña no encontrada." };
    sourcePieceId = piece.id;
    campaignId = campaignId ?? piece.campaignId;
    if (!text.trim() && piece.idea) text = piece.idea;
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.projectId !== projectId) return { error: "Campaña no encontrada." };
    brandProfileId = brandProfileId ?? campaign.brandProfileId;
  }

  let templateStructure: Record<string, unknown> | null = null;
  if (d.templateId) {
    const template = await prisma.publicationTemplate.findUnique({ where: { id: d.templateId } });
    if (!template || template.projectId !== projectId) return { error: "Plantilla no encontrada." };
    templateStructure = template.structure as Record<string, unknown>;
  }

  let duplicateFrom: Awaited<ReturnType<typeof prisma.socialPost.findUnique>> = null;
  if (d.duplicateFromId) {
    duplicateFrom = await getOwnedPost(d.duplicateFromId, projectId);
    if (!duplicateFrom) return { error: "Publicación original no encontrada." };
  }

  const post = await prisma.socialPost.create({
    data: {
      projectId,
      authorId: user.id,
      platform: d.platform,
      postType: d.platform.toLowerCase(),
      internalTitle: d.internalTitle,
      text: text || duplicateFrom?.text || "",
      status: "DRAFT",
      campaignId,
      sourceContentId,
      sourcePieceId,
      brandProfileId,
      templateSourceId: d.templateId ?? null,
      cta: (templateStructure?.cta as string | undefined) ?? duplicateFrom?.cta ?? null,
      hashtags: (templateStructure?.hashtags as string[] | undefined) ?? duplicateFrom?.hashtags ?? [],
      firstComment: (templateStructure?.firstComment as string | undefined) ?? duplicateFrom?.firstComment ?? null,
      format: (templateStructure?.format as string | undefined) ?? duplicateFrom?.format ?? null,
      // Deliberately never copied from a duplicate source: scheduledAt, publishedAt, externalId,
      // status/attempt/error state, approval history — a duplicate is always a fresh draft.
    },
  });

  revalidateHub(projectId, post.id);
  return { id: post.id };
}

/**
 * Composer autosave — a true partial patch (only fields present are
 * written), with optimistic concurrency: if `expectedUpdatedAt` doesn't
 * match the row's current `updatedAt`, the save is rejected instead of
 * silently overwriting a more recent change (spec section 17).
 */
export async function updatePublicationAction(
  projectId: string,
  postId: string,
  patch: unknown,
  expectedUpdatedAt?: string
): Promise<{ error?: string; updatedAt?: string }> {
  const parsed = publicationPatchSchema.partial().safeParse(patch);
  if (!parsed.success) return { error: "No se pudo guardar la publicación." };

  await requireProjectAccess(projectId, "EDITOR");
  const current = await getOwnedPost(postId, projectId);
  if (!current) return { error: "Publicación no encontrada." };

  if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== current.updatedAt.getTime()) {
    return { error: "Esta publicación cambió en otra pestaña o por otra persona. Recarga antes de seguir editando." };
  }

  const d = parsed.data;
  if (d.status === "SCHEDULED") {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (!canSchedule(current.status, project.requireApprovalBeforePublish)) {
      return { error: "Esta publicación requiere aprobación antes de poder programarse." };
    }
  }

  const updated = await prisma.socialPost.update({
    where: { id: postId },
    data: {
      ...(d.internalTitle !== undefined ? { internalTitle: d.internalTitle } : {}),
      ...(d.platform !== undefined ? { platform: d.platform, postType: d.platform.toLowerCase() } : {}),
      ...(d.format !== undefined ? { format: d.format || null } : {}),
      ...(d.text !== undefined ? { text: d.text } : {}),
      ...(d.firstComment !== undefined ? { firstComment: d.firstComment || null } : {}),
      ...(d.hashtags !== undefined ? { hashtags: d.hashtags } : {}),
      ...(d.cta !== undefined ? { cta: d.cta || null } : {}),
      ...(d.link !== undefined ? { link: d.link || null } : {}),
      ...(d.altText !== undefined ? { altText: d.altText || null } : {}),
      ...(d.scheduledAt !== undefined ? { scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null } : {}),
      ...(d.timezone !== undefined ? { timezone: d.timezone || "UTC" } : {}),
      ...(d.assigneeId !== undefined ? { assigneeId: d.assigneeId } : {}),
      ...(d.approverId !== undefined ? { approverId: d.approverId } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.priority !== undefined ? { priority: d.priority } : {}),
      ...(d.campaignId !== undefined ? { campaignId: d.campaignId } : {}),
      ...(d.brandProfileId !== undefined ? { brandProfileId: d.brandProfileId } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    },
  });

  revalidateHub(projectId, postId);
  return { updatedAt: updated.updatedAt.toISOString() };
}

export async function deletePublicationAction(projectId: string, postId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const post = await getOwnedPost(postId, projectId);
  if (!post) return { error: "Publicación no encontrada." };
  await prisma.socialPost.delete({ where: { id: postId } });
  revalidateHub(projectId);
  return {};
}

export async function duplicatePublicationAction(projectId: string, postId: string): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const original = await getOwnedPost(postId, projectId);
  if (!original) return { error: "Publicación no encontrada." };

  const copy = await prisma.socialPost.create({
    data: {
      projectId,
      authorId: user.id,
      platform: original.platform,
      postType: original.postType,
      internalTitle: `${original.internalTitle ?? "Publicación"} (copia)`,
      text: original.text,
      status: "DRAFT",
      campaignId: original.campaignId,
      sourceContentId: original.sourceContentId,
      sourcePieceId: original.sourcePieceId,
      brandProfileId: original.brandProfileId,
      format: original.format,
      cta: original.cta,
      hashtags: original.hashtags,
      firstComment: original.firstComment,
      link: original.link,
      altText: original.altText,
      priority: original.priority,
      tags: original.tags,
      // Never copied: scheduledAt, publishedAt, externalId, attempts, errors, approval history, queue state.
    },
  });

  revalidateHub(projectId, copy.id);
  return { id: copy.id };
}

/**
 * Every approval-flow transition (submit/approve/request changes/comment/
 * cancel) goes through here, always logging a PublicationApprovalEvent —
 * the real, queryable "historial de decisiones" the spec asks for.
 */
export async function recordApprovalDecisionAction(
  projectId: string,
  postId: string,
  input: unknown
): Promise<{ error?: string }> {
  const parsed = createPublicationCommentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const post = await getOwnedPost(postId, projectId);
  if (!post) return { error: "Publicación no encontrada." };

  if (parsed.data.action === "APPROVED") {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    if (!canApprove({ actorId: user.id, authorId: post.authorId, allowSelfApproval: project.allowSelfApproval })) {
      return { error: "No puedes aprobar tu propia publicación en este proyecto." };
    }
  }

  const statusByAction: Partial<Record<string, SocialPostStatus>> = {
    SUBMITTED: "IN_REVIEW",
    APPROVED: "APPROVED",
    CHANGES_REQUESTED: "CHANGES_REQUESTED",
    CANCELLED: "CANCELLED",
  };
  const nextStatus = statusByAction[parsed.data.action];

  await prisma.$transaction([
    prisma.publicationApprovalEvent.create({
      data: { socialPostId: postId, actorId: user.id, action: parsed.data.action, comment: parsed.data.comment || null },
    }),
    prisma.socialPost.update({
      where: { id: postId },
      data: {
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(parsed.data.action === "APPROVED" ? { approvedById: user.id, approvedAt: new Date() } : {}),
      },
    }),
  ]);

  revalidateHub(projectId, postId);
  return {};
}

export interface SchedulePublicationInput {
  scheduledAt: string;
  timezone: string;
}

export async function schedulePublicationAction(
  projectId: string,
  postId: string,
  input: SchedulePublicationInput
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const post = await getOwnedPost(postId, projectId);
  if (!post) return { error: "Publicación no encontrada." };

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (!canSchedule(post.status, project.requireApprovalBeforePublish)) {
    return { error: "Esta publicación requiere aprobación antes de poder programarse." };
  }

  await prisma.socialPost.update({
    where: { id: postId },
    data: { scheduledAt: new Date(input.scheduledAt), timezone: input.timezone || "UTC", status: "SCHEDULED" },
  });

  revalidateHub(projectId, postId);
  return {};
}

export async function cancelSchedulingAction(projectId: string, postId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const post = await getOwnedPost(postId, projectId);
  if (!post) return { error: "Publicación no encontrada." };

  await prisma.socialPost.update({
    where: { id: postId },
    data: { scheduledAt: null, status: "DRAFT", queuePosition: null, isPaused: false },
  });

  revalidateHub(projectId, postId);
  return {};
}

export async function moveScheduledDateAction(
  projectId: string,
  postId: string,
  input: { scheduledAt: string; timezone?: string }
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const post = await getOwnedPost(postId, projectId);
  if (!post) return { error: "Publicación no encontrada." };

  await prisma.socialPost.update({
    where: { id: postId },
    data: { scheduledAt: new Date(input.scheduledAt), ...(input.timezone ? { timezone: input.timezone } : {}) },
  });

  revalidateHub(projectId, postId);
  return {};
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export async function reorderPublicationQueueAction(projectId: string, orderedIds: string[]): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const owned = await prisma.socialPost.findMany({ where: { projectId, id: { in: orderedIds } }, select: { id: true } });
  const ownedIds = new Set(owned.map((p) => p.id));
  if (!orderedIds.every((id) => ownedIds.has(id))) return { error: "Publicación no encontrada." };

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.socialPost.update({ where: { id }, data: { queuePosition: index } }))
  );
  revalidateHub(projectId);
  return {};
}

export async function setQueuePausedAction(projectId: string, postId: string, paused: boolean): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const post = await getOwnedPost(postId, projectId);
  if (!post) return { error: "Publicación no encontrada." };
  await prisma.socialPost.update({ where: { id: postId }, data: { isPaused: paused } });
  revalidateHub(projectId, postId);
  return {};
}

/**
 * Retries a failed publication attempt. No real provider is connected yet
 * (Fase 29 spec section 15) — this creates the next PublicationAttempt row
 * in WAITING state, exactly like a real retry would, without ever claiming
 * a fake success. See src/lib/publishing/providers for the adapters this
 * will eventually call.
 */
export async function retryPublicationAction(projectId: string, postId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const post = await getOwnedPost(postId, projectId);
  if (!post) return { error: "Publicación no encontrada." };
  if (post.isRetryable === false) return { error: "Este error no es reintentable." };

  await prisma.$transaction([
    prisma.publicationAttempt.create({
      data: { socialPostId: postId, provider: post.platform.toLowerCase(), attemptNumber: post.attemptCount + 1, status: "WAITING" },
    }),
    prisma.socialPost.update({
      where: { id: postId },
      data: { attemptCount: { increment: 1 }, status: "SCHEDULED", lastErrorMessage: null, lastErrorCode: null, isRetryable: null },
    }),
  ]);

  revalidateHub(projectId, postId);
  return {};
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

export async function createPublicationSeriesAction(
  projectId: string,
  input: unknown
): Promise<{ error?: string; created?: number; seriesId?: string }> {
  const parsed = createPublicationSeriesSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const d = parsed.data;

  const user = await requireProjectAccess(projectId, "EDITOR");

  const startDate = new Date(d.startDate);
  const endDate = d.endDate ? new Date(d.endDate) : null;
  const instances = generateRecurrenceInstances(
    { frequency: d.frequency, daysOfWeek: d.daysOfWeek, intervalDays: d.intervalDays ?? null, startDate, endDate },
    d.maxInstances
  );
  if (instances.length === 0) return { error: "No se generó ninguna fecha con esta configuración." };

  const series = await prisma.publicationSeries.create({
    data: {
      projectId,
      createdById: user.id,
      frequency: d.frequency,
      daysOfWeek: d.daysOfWeek,
      intervalDays: d.intervalDays ?? null,
      startDate,
      endDate,
      lastGeneratedAt: new Date(),
    },
  });

  // De-duplicate: never create a second post for the same platform at the same instant (spec section 9).
  const existing = await prisma.socialPost.findMany({
    where: { projectId, platform: d.platform, scheduledAt: { in: instances } },
    select: { scheduledAt: true },
  });
  const existingTimes = new Set(existing.map((p) => p.scheduledAt?.getTime()));
  const toCreate = instances.filter((date) => !existingTimes.has(date.getTime()));

  await prisma.socialPost.createMany({
    data: toCreate.map((date) => ({
      projectId,
      authorId: user.id,
      platform: d.platform,
      postType: d.platform.toLowerCase(),
      internalTitle: d.internalTitle,
      text: d.text,
      status: "SCHEDULED" as const,
      scheduledAt: date,
      seriesId: series.id,
    })),
  });

  revalidateHub(projectId);
  return { created: toCreate.length, seriesId: series.id };
}

export async function cancelPublicationSeriesAction(projectId: string, seriesId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const series = await prisma.publicationSeries.findUnique({ where: { id: seriesId } });
  if (!series || series.projectId !== projectId) return { error: "Serie no encontrada." };

  // Only cancels future, not-yet-published instances — never touches history.
  await prisma.socialPost.updateMany({
    where: { seriesId, status: { in: ["SCHEDULED", "DRAFT", "APPROVED"] } },
    data: { status: "CANCELLED", seriesId: null },
  });
  await prisma.publicationSeries.delete({ where: { id: seriesId } });

  revalidateHub(projectId);
  return {};
}

// ---------------------------------------------------------------------------
// Project-level editorial policy
// ---------------------------------------------------------------------------

export async function updatePublishingPolicyAction(
  projectId: string,
  input: { requireApprovalBeforePublish?: boolean; allowSelfApproval?: boolean }
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "MANAGER");
  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.requireApprovalBeforePublish !== undefined ? { requireApprovalBeforePublish: input.requireApprovalBeforePublish } : {}),
      ...(input.allowSelfApproval !== undefined ? { allowSelfApproval: input.allowSelfApproval } : {}),
    },
  });
  revalidateHub(projectId);
  return {};
}

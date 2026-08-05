"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import {
  createCampaignPieceSchema,
  updateCampaignPieceSchema,
  createCampaignCommentSchema,
} from "@/lib/validation/campaign-studio";
import type { CampaignPieceStatus, CampaignPiecePriority } from "@/generated/prisma/enums";
import type { GeneratedPieceDraft } from "@/lib/campaign-studio/plan-ai";
import { publishAutomationEvent } from "@/server/services/automation-events";

async function getOwnedCampaign(campaignId: string, projectId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.projectId !== projectId) return null;
  return campaign;
}

async function getOwnedPiece(pieceId: string, campaignId: string) {
  const piece = await prisma.campaignContentPiece.findUnique({ where: { id: pieceId } });
  if (!piece || piece.campaignId !== campaignId) return null;
  return piece;
}

function revalidateCampaign(projectId: string, campaignId: string) {
  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
}

export async function createCampaignPieceAction(
  projectId: string,
  campaignId: string,
  input: unknown
): Promise<{ error?: string; id?: string }> {
  const parsed = createCampaignPieceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const maxOrder = await prisma.campaignContentPiece.aggregate({
    where: { campaignId, status: parsed.data.status ?? "IDEA" },
    _max: { order: true },
  });

  const created = await prisma.campaignContentPiece.create({
    data: {
      campaignId,
      pillarId: parsed.data.pillarId || null,
      title: parsed.data.title,
      idea: parsed.data.idea || null,
      platform: parsed.data.platform,
      format: parsed.data.format || null,
      objective: parsed.data.objective || null,
      cta: parsed.data.cta || null,
      scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : null,
      scheduledTime: parsed.data.scheduledTime || null,
      status: parsed.data.status ?? "IDEA",
      priority: parsed.data.priority ?? "MEDIUM",
      assigneeId: parsed.data.assigneeId || null,
      keywords: parsed.data.keywords ?? [],
      notes: parsed.data.notes || null,
      authorId: user.id,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });

  await publishAutomationEvent({
    projectId,
    eventKey: "campaign_content_piece.created",
    resourceId: created.id,
    actorId: user.id,
    payload: { id: created.id, title: created.title, campaignId, status: created.status, platform: created.platform },
    idempotencyKey: `campaign_content_piece.created:${created.id}`,
  });

  revalidateCampaign(projectId, campaignId);
  return { id: created.id };
}

/** Bulk-saves AI-generated piece drafts (see src/lib/campaign-studio/plan-ai.ts), resolving pillar names to ids where they match. */
export async function createCampaignPiecesFromDraftsAction(
  projectId: string,
  campaignId: string,
  drafts: GeneratedPieceDraft[]
): Promise<{ error?: string; created?: number }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  if (drafts.length === 0) return { error: "No hay piezas generadas que guardar." };

  const pillars = await prisma.campaignPillar.findMany({ where: { campaignId }, select: { id: true, name: true } });
  const pillarByName = new Map(pillars.map((p) => [p.name.toLowerCase().trim(), p.id]));

  const maxOrder = await prisma.campaignContentPiece.aggregate({ where: { campaignId, status: "IDEA" }, _max: { order: true } });
  let order = (maxOrder._max.order ?? -1) + 1;

  await prisma.campaignContentPiece.createMany({
    data: drafts.map((draft) => {
      const parsedDate = draft.date && !Number.isNaN(Date.parse(draft.date)) ? new Date(draft.date) : null;
      return {
        campaignId,
        pillarId: pillarByName.get(draft.pillarName.toLowerCase().trim()) ?? null,
        title: draft.title.slice(0, 300),
        idea: draft.idea || null,
        platform: draft.platform,
        format: draft.format || null,
        objective: draft.objective || null,
        cta: draft.cta || null,
        scheduledDate: parsedDate,
        scheduledTime: draft.time || null,
        status: "IDEA" as const,
        priority: "MEDIUM" as const,
        keywords: draft.keywords,
        notes: draft.notes || null,
        authorId: user.id,
        order: order++,
      };
    }),
  });

  revalidateCampaign(projectId, campaignId);
  return { created: drafts.length };
}

export async function updateCampaignPieceAction(projectId: string, campaignId: string, input: unknown): Promise<{ error?: string }> {
  const parsed = updateCampaignPieceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  const piece = await getOwnedPiece(parsed.data.id, campaignId);
  if (!piece) return { error: "Pieza no encontrada." };

  const { id, scheduledDate, ...rest } = parsed.data;
  const updated = await prisma.campaignContentPiece.update({
    where: { id },
    data: {
      ...rest,
      ...(scheduledDate !== undefined ? { scheduledDate: scheduledDate ? new Date(scheduledDate) : null } : {}),
      updatedById: user.id,
    },
  });

  await publishAutomationEvent({
    projectId,
    eventKey: "campaign_content_piece.updated",
    resourceId: id,
    actorId: user.id,
    payload: { id, title: updated.title, campaignId, status: updated.status, previous: piece.status, current: updated.status, changedFields: piece.status !== updated.status ? ["status"] : [] },
    idempotencyKey: `campaign_content_piece.updated:${id}:${updated.updatedAt.toISOString()}`,
  });

  revalidateCampaign(projectId, campaignId);
  return {};
}

export async function deleteCampaignPieceAction(projectId: string, campaignId: string, pieceId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  const piece = await getOwnedPiece(pieceId, campaignId);
  if (!piece) return { error: "Pieza no encontrada." };

  await prisma.campaignContentPiece.delete({ where: { id: pieceId } });
  revalidateCampaign(projectId, campaignId);
  return {};
}

export async function duplicateCampaignPieceAction(
  projectId: string,
  campaignId: string,
  pieceId: string
): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  const piece = await getOwnedPiece(pieceId, campaignId);
  if (!piece) return { error: "Pieza no encontrada." };

  const created = await prisma.campaignContentPiece.create({
    data: {
      campaignId,
      pillarId: piece.pillarId,
      title: `${piece.title} (copia)`.slice(0, 300),
      idea: piece.idea,
      platform: piece.platform,
      format: piece.format,
      objective: piece.objective,
      cta: piece.cta,
      scheduledDate: piece.scheduledDate,
      scheduledTime: piece.scheduledTime,
      status: "IDEA",
      priority: piece.priority,
      keywords: piece.keywords,
      notes: piece.notes,
      authorId: user.id,
      order: piece.order,
      // contentItemId, comments, assignee — deliberately never copied.
    },
  });

  revalidateCampaign(projectId, campaignId);
  return { id: created.id };
}

/** Kanban drag persistence — sets both the new status column and the card's order within it. */
export async function moveCampaignPieceAction(
  projectId: string,
  campaignId: string,
  pieceId: string,
  input: { status: CampaignPieceStatus; order: number }
): Promise<{ error?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  const piece = await getOwnedPiece(pieceId, campaignId);
  if (!piece) return { error: "Pieza no encontrada." };

  await prisma.campaignContentPiece.update({
    where: { id: pieceId },
    data: { status: input.status, order: input.order, updatedById: user.id },
  });

  revalidateCampaign(projectId, campaignId);
  return {};
}

export interface BatchPiecePatch {
  status?: CampaignPieceStatus;
  assigneeId?: string | null;
  priority?: CampaignPiecePriority;
  scheduledDate?: string | null;
  addKeywords?: string[];
}

/** Section 8's batch operations (assign/status/date/tags/priority) — one transaction, all-or-nothing per field but independent of the per-piece draft-generation loop the client drives separately. */
export async function batchUpdateCampaignPiecesAction(
  projectId: string,
  campaignId: string,
  pieceIds: string[],
  patch: BatchPiecePatch
): Promise<{ error?: string; updated?: number }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const owned = await prisma.campaignContentPiece.findMany({
    where: { campaignId, id: { in: pieceIds } },
    select: { id: true, keywords: true },
  });
  if (owned.length === 0) return { error: "No se encontraron piezas." };

  await prisma.$transaction(
    owned.map((piece) =>
      prisma.campaignContentPiece.update({
        where: { id: piece.id },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
          ...(patch.priority ? { priority: patch.priority } : {}),
          ...(patch.scheduledDate !== undefined
            ? { scheduledDate: patch.scheduledDate ? new Date(patch.scheduledDate) : null }
            : {}),
          ...(patch.addKeywords?.length
            ? { keywords: Array.from(new Set([...piece.keywords, ...patch.addKeywords])) }
            : {}),
          updatedById: user.id,
        },
      })
    )
  );

  revalidateCampaign(projectId, campaignId);
  return { updated: owned.length };
}

export async function batchDeleteCampaignPiecesAction(
  projectId: string,
  campaignId: string,
  pieceIds: string[]
): Promise<{ error?: string; deleted?: number }> {
  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const result = await prisma.campaignContentPiece.deleteMany({ where: { campaignId, id: { in: pieceIds } } });
  revalidateCampaign(projectId, campaignId);
  return { deleted: result.count };
}

export async function batchDuplicateCampaignPiecesAction(
  projectId: string,
  campaignId: string,
  pieceIds: string[]
): Promise<{ error?: string; created?: number }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const owned = await prisma.campaignContentPiece.findMany({ where: { campaignId, id: { in: pieceIds } } });
  if (owned.length === 0) return { error: "No se encontraron piezas." };

  await prisma.campaignContentPiece.createMany({
    data: owned.map((piece) => ({
      campaignId,
      pillarId: piece.pillarId,
      title: `${piece.title} (copia)`.slice(0, 300),
      idea: piece.idea,
      platform: piece.platform,
      format: piece.format,
      objective: piece.objective,
      cta: piece.cta,
      scheduledDate: piece.scheduledDate,
      scheduledTime: piece.scheduledTime,
      status: "IDEA" as const,
      priority: piece.priority,
      keywords: piece.keywords,
      notes: piece.notes,
      authorId: user.id,
      order: piece.order,
    })),
  });

  revalidateCampaign(projectId, campaignId);
  return { created: owned.length };
}

/**
 * "Crear contenido" (spec section 7) — the ONE place a real ContentItem gets
 * created from a planned piece. Links back via CampaignContent (the existing
 * join model, reused as-is) and CampaignContentPiece.contentItemId; copies
 * channel/objective/cta/keywords/brandProfileId from the piece/campaign.
 * `draftBody` (if provided) was already generated client-side via
 * useLocalAI — this action only ever persists text, exactly like every other
 * "save what the browser generated" action in this codebase (see
 * saveGeneratedContentAction in src/server/actions/content.ts).
 */
export async function createContentFromPieceAction(
  projectId: string,
  campaignId: string,
  pieceId: string,
  input: { draftBody?: string }
): Promise<{ error?: string; contentItemId?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  const piece = await getOwnedPiece(pieceId, campaignId);
  if (!piece) return { error: "Pieza no encontrada." };
  if (piece.contentItemId) return { error: "Esta pieza ya tiene contenido creado.", contentItemId: piece.contentItemId };

  const contentItem = await prisma.contentItem.create({
    data: {
      projectId,
      authorId: user.id,
      type: "OTHER",
      title: piece.title,
      body: input.draftBody?.trim() || "",
      channel: piece.platform,
      objective: piece.objective,
      cta: piece.cta,
      keywords: piece.keywords,
      brandProfileId: campaign.brandProfileId,
      sourceTool: "campaign-studio",
    },
  });

  await prisma.$transaction([
    prisma.campaignContent.create({ data: { campaignId, contentItemId: contentItem.id } }),
    prisma.campaignContentPiece.update({
      where: { id: pieceId },
      data: {
        contentItemId: contentItem.id,
        updatedById: user.id,
        status: piece.status === "IDEA" ? "PENDING" : piece.status,
      },
    }),
  ]);

  revalidateCampaign(projectId, campaignId);
  revalidatePath(`/dashboard/${projectId}/content/${contentItem.id}`);
  return { contentItemId: contentItem.id };
}

export async function createCampaignPieceCommentAction(
  projectId: string,
  campaignId: string,
  input: unknown
): Promise<{ error?: string; id?: string }> {
  const parsed = createCampaignCommentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  const piece = await getOwnedPiece(parsed.data.pieceId, campaignId);
  if (!piece) return { error: "Pieza no encontrada." };

  const comment = await prisma.campaignPieceComment.create({
    data: {
      pieceId: parsed.data.pieceId,
      authorId: user.id,
      body: parsed.data.body,
      mentionedUserIds: parsed.data.mentionedUserIds,
    },
  });

  revalidateCampaign(projectId, campaignId);
  return { id: comment.id };
}

export async function listCampaignPieceCommentsAction(projectId: string, campaignId: string, pieceId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return [];
  const piece = await getOwnedPiece(pieceId, campaignId);
  if (!piece) return [];

  return prisma.campaignPieceComment.findMany({
    where: { pieceId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true, image: true } } },
  });
}

export async function resolveCampaignPieceCommentAction(
  projectId: string,
  campaignId: string,
  commentId: string,
  resolved: boolean
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const comment = await prisma.campaignPieceComment.findUnique({ where: { id: commentId }, include: { piece: true } });
  if (!comment || comment.piece.campaignId !== campaignId) return { error: "Comentario no encontrado." };

  await prisma.campaignPieceComment.update({ where: { id: commentId }, data: { resolved } });
  revalidateCampaign(projectId, campaignId);
  return {};
}

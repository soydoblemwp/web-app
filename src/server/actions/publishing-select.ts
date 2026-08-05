"use server";

import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { listPublicationTemplates, listPublicationSeries, listChecklistTemplates, listMediaLibrary } from "@/server/services/publishing";

/** Read-only fetches for the composer's "origin" pickers and the Biblioteca/plantillas views — reuses ContentItem/CampaignContentPiece directly, never a parallel index. */
export async function listContentItemsForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return prisma.contentItem.findMany({
    where: { projectId, deletedAt: null, isArchived: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, type: true, updatedAt: true },
    take: 100,
  });
}

export async function listCampaignPiecesForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return prisma.campaignContentPiece.findMany({
    where: { campaign: { projectId } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, platform: true, campaignId: true, campaign: { select: { name: true } } },
    take: 100,
  });
}

export async function listPublicationTemplatesForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listPublicationTemplates(projectId);
}

export async function listPublicationsForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return prisma.socialPost.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, internalTitle: true, platform: true },
    take: 100,
  });
}

export async function listPublicationSeriesForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listPublicationSeries(projectId);
}

export async function listChecklistTemplatesForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listChecklistTemplates(projectId);
}

export async function listMediaLibraryForSelectAction(
  projectId: string,
  filters: { search?: string; tag?: string; kind?: string; includeArchived?: boolean } = {}
) {
  await requireProjectAccess(projectId, "VIEWER");
  return listMediaLibrary(projectId, filters);
}

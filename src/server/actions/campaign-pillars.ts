"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { createCampaignPillarSchema, updateCampaignPillarSchema } from "@/lib/validation/campaign-studio";
import type { GeneratedPillarDraft } from "@/lib/campaign-studio/pillar-ai";

async function getOwnedCampaign(campaignId: string, projectId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.projectId !== projectId) return null;
  return campaign;
}

async function getOwnedPillar(pillarId: string, campaignId: string) {
  const pillar = await prisma.campaignPillar.findUnique({ where: { id: pillarId } });
  if (!pillar || pillar.campaignId !== campaignId) return null;
  return pillar;
}

export async function createCampaignPillarAction(
  projectId: string,
  campaignId: string,
  input: unknown
): Promise<{ error?: string; id?: string }> {
  const parsed = createCampaignPillarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const count = await prisma.campaignPillar.count({ where: { campaignId } });
  const created = await prisma.campaignPillar.create({
    data: { campaignId, ...parsed.data, order: count },
  });

  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return { id: created.id };
}

export async function updateCampaignPillarAction(
  projectId: string,
  campaignId: string,
  pillarId: string,
  input: unknown
): Promise<{ error?: string }> {
  const parsed = updateCampaignPillarSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  const pillar = await getOwnedPillar(pillarId, campaignId);
  if (!pillar) return { error: "Pilar no encontrado." };

  await prisma.campaignPillar.update({ where: { id: pillarId }, data: parsed.data });
  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return {};
}

export async function deleteCampaignPillarAction(projectId: string, campaignId: string, pillarId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  const pillar = await getOwnedPillar(pillarId, campaignId);
  if (!pillar) return { error: "Pilar no encontrado." };

  await prisma.campaignPillar.delete({ where: { id: pillarId } });
  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return {};
}

export async function reorderCampaignPillarsAction(
  projectId: string,
  campaignId: string,
  orderedIds: string[]
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const owned = await prisma.campaignPillar.findMany({ where: { campaignId }, select: { id: true } });
  const ownedIds = new Set(owned.map((p) => p.id));
  if (!orderedIds.every((id) => ownedIds.has(id))) return { error: "Pilar no encontrado." };

  await prisma.$transaction(orderedIds.map((id, index) => prisma.campaignPillar.update({ where: { id }, data: { order: index } })));
  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return {};
}

/** Bulk-saves AI-generated pillar drafts (see src/lib/campaign-studio/pillar-ai.ts) in one transaction. */
export async function createCampaignPillarsFromDraftsAction(
  projectId: string,
  campaignId: string,
  drafts: GeneratedPillarDraft[]
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };
  if (drafts.length === 0) return { error: "No hay pilares generados que guardar." };

  const count = await prisma.campaignPillar.count({ where: { campaignId } });
  await prisma.campaignPillar.createMany({
    data: drafts.map((draft, index) => ({
      campaignId,
      name: draft.name.slice(0, 200),
      description: draft.description || null,
      objective: draft.objective || null,
      percentage: draft.percentage,
      formats: draft.formats,
      platforms: draft.platforms,
      topics: draft.topics,
      order: count + index,
    })),
  });

  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return {};
}

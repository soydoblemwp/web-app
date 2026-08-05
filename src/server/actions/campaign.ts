"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { createCampaignSchema, campaignStatusValues } from "@/lib/validation/social";
import { publishAutomationEvent } from "@/server/services/automation-events";

export interface CampaignFormState {
  error?: string;
}

export async function createCampaignAction(
  projectId: string,
  _prevState: CampaignFormState,
  formData: FormData
): Promise<CampaignFormState> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const parsed = createCampaignSchema.safeParse({
    projectId,
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    objective: formData.get("objective") ?? "",
    audience: formData.get("audience") ?? "",
    startDate: formData.get("startDate") || "",
    endDate: formData.get("endDate") || "",
    primaryCTA: formData.get("primaryCTA") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const data = parsed.data;
  const campaign = await prisma.campaign.create({
    data: {
      projectId,
      ownerId: user.id,
      name: data.name,
      description: data.description || null,
      objective: data.objective || null,
      audience: data.audience || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      primaryCTA: data.primaryCTA || null,
    },
  });

  await publishAutomationEvent({
    projectId,
    eventKey: "campaign.created",
    resourceId: campaign.id,
    actorId: user.id,
    payload: { id: campaign.id, name: campaign.name, status: campaign.status },
    idempotencyKey: `campaign.created:${campaign.id}`,
  });

  revalidatePath(`/dashboard/${projectId}/campaigns`);
  redirect(`/dashboard/${projectId}/campaigns/${campaign.id}`);
}

export async function changeCampaignStatusAction(projectId: string, campaignId: string, status: string) {
  await requireProjectAccess(projectId, "EDITOR");
  if (!campaignStatusValues.includes(status as never)) return;
  const updated = await prisma.campaign.update({ where: { id: campaignId }, data: { status: status as never } });

  await publishAutomationEvent({
    projectId,
    eventKey: "campaign.updated",
    resourceId: campaignId,
    payload: { id: campaignId, name: updated.name, status: updated.status },
    idempotencyKey: `campaign.updated:${campaignId}:${updated.status}:${Date.now()}`,
  });

  revalidatePath(`/dashboard/${projectId}/campaigns`);
  revalidatePath(`/dashboard/${projectId}/campaigns/${campaignId}`);
}

export async function deleteCampaignAction(projectId: string, campaignId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.campaign.delete({ where: { id: campaignId } });
  revalidatePath(`/dashboard/${projectId}/campaigns`);
  redirect(`/dashboard/${projectId}/campaigns`);
}

/** Read-only fetch for client components (editor sidebar's "Publicación" tab campaign picker) — same direct-Prisma pattern the campaigns list page itself uses (no dedicated campaign service layer exists in this codebase). */
export async function listCampaignsForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return prisma.campaign.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, status: true },
  });
}

/**
 * First-ever writer for CampaignContent (previously nothing in this codebase
 * created this join row — the campaign detail page has always shown "Sin
 * contenidos asociados... próximamente"). `upsert` on the composite PK makes
 * linking idempotent — re-linking the same content to the same campaign is a
 * no-op, never a duplicate-key error.
 */
export async function linkContentToCampaignAction(
  projectId: string,
  campaignId: string,
  contentItemId: string
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");

  const [campaign, contentItem] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.contentItem.findUnique({ where: { id: contentItemId } }),
  ]);
  if (!campaign || campaign.projectId !== projectId) return { error: "Campaña no encontrada." };
  if (!contentItem || contentItem.projectId !== projectId) return { error: "Contenido no encontrado." };

  await prisma.campaignContent.upsert({
    where: { campaignId_contentItemId: { campaignId, contentItemId } },
    create: { campaignId, contentItemId },
    update: {},
  });

  revalidatePath(`/dashboard/${projectId}/campaigns/${campaignId}`);
  revalidatePath(`/dashboard/${projectId}/content/${contentItemId}`);
  return {};
}

export async function unlinkContentFromCampaignAction(
  projectId: string,
  campaignId: string,
  contentItemId: string
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");

  await prisma.campaignContent.deleteMany({ where: { campaignId, contentItemId } });

  revalidatePath(`/dashboard/${projectId}/campaigns/${campaignId}`);
  revalidatePath(`/dashboard/${projectId}/content/${contentItemId}`);
  return {};
}

/** Which campaign(s) (if any) a given ContentItem is currently linked to — editor sidebar's "Publicación" tab. */
export async function listContentCampaignLinksAction(projectId: string, contentItemId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const links = await prisma.campaignContent.findMany({
    where: { contentItemId, campaign: { projectId } },
    select: { campaign: { select: { id: true, name: true } } },
  });
  return links.map((link) => link.campaign);
}

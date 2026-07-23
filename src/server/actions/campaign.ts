"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { createCampaignSchema, campaignStatusValues } from "@/lib/validation/social";

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

  revalidatePath(`/dashboard/${projectId}/campaigns`);
  redirect(`/dashboard/${projectId}/campaigns/${campaign.id}`);
}

export async function changeCampaignStatusAction(projectId: string, campaignId: string, status: string) {
  await requireProjectAccess(projectId, "EDITOR");
  if (!campaignStatusValues.includes(status as never)) return;
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: status as never } });
  revalidatePath(`/dashboard/${projectId}/campaigns`);
  revalidatePath(`/dashboard/${projectId}/campaigns/${campaignId}`);
}

export async function deleteCampaignAction(projectId: string, campaignId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.campaign.delete({ where: { id: campaignId } });
  revalidatePath(`/dashboard/${projectId}/campaigns`);
  redirect(`/dashboard/${projectId}/campaigns`);
}

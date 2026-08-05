"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { createCampaignMetricGoalSchema, updateCampaignMetricValueSchema } from "@/lib/validation/campaign-studio";

async function getOwnedCampaign(campaignId: string, projectId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.projectId !== projectId) return null;
  return campaign;
}

export async function createCampaignMetricGoalAction(
  projectId: string,
  campaignId: string,
  input: unknown
): Promise<{ error?: string; id?: string }> {
  const parsed = createCampaignMetricGoalSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const goal = await prisma.campaignMetricGoal.upsert({
    where: { campaignId_metricType: { campaignId, metricType: parsed.data.metricType } },
    create: { campaignId, metricType: parsed.data.metricType, targetValue: parsed.data.targetValue },
    update: { targetValue: parsed.data.targetValue },
  });

  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return { id: goal.id };
}

/** Manual result registration (spec section 11 — no external social API is connected in this phase). */
export async function updateCampaignMetricValueAction(
  projectId: string,
  campaignId: string,
  input: unknown
): Promise<{ error?: string }> {
  const parsed = updateCampaignMetricValueSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const goal = await prisma.campaignMetricGoal.findUnique({ where: { id: parsed.data.metricGoalId } });
  if (!goal || goal.campaignId !== campaignId) return { error: "Objetivo no encontrado." };

  await prisma.campaignMetricGoal.update({
    where: { id: parsed.data.metricGoalId },
    data: { currentValue: parsed.data.currentValue },
  });

  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return {};
}

export async function deleteCampaignMetricGoalAction(
  projectId: string,
  campaignId: string,
  metricGoalId: string
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const campaign = await getOwnedCampaign(campaignId, projectId);
  if (!campaign) return { error: "Campaña no encontrada." };

  const goal = await prisma.campaignMetricGoal.findUnique({ where: { id: metricGoalId } });
  if (!goal || goal.campaignId !== campaignId) return { error: "Objetivo no encontrado." };

  await prisma.campaignMetricGoal.delete({ where: { id: metricGoalId } });
  revalidatePath(`/dashboard/${projectId}/campaign-studio/${campaignId}`);
  return {};
}

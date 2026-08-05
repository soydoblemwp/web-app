"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { sendWebhookTest } from "@/server/services/automation-webhooks";

/** Read-only webhook config panel data — the public URL/secret existence, never the decrypted secret itself (it was only ever shown once, at creation/rotation time). */
export async function getWebhookConfigAction(projectId: string, automationId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const trigger = await prisma.workflowAutomationTrigger.findUnique({
    where: { automationId },
    select: { type: true, webhookPublicId: true, webhookReceivedCount: true, webhookLastReceivedAt: true, automation: { select: { projectId: true } } },
  });
  if (!trigger || trigger.automation.projectId !== projectId || trigger.type !== "WEBHOOK") return null;
  return { publicId: trigger.webhookPublicId, receivedCount: trigger.webhookReceivedCount, lastReceivedAt: trigger.webhookLastReceivedAt };
}

export async function listRecentWebhookDeliveriesAction(projectId: string, automationId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const trigger = await prisma.workflowAutomationTrigger.findUnique({ where: { automationId }, select: { automation: { select: { projectId: true } } } });
  if (!trigger || trigger.automation.projectId !== projectId) return [];
  return prisma.workflowAutomationWebhookDelivery.findMany({
    where: { automationId },
    orderBy: { receivedAt: "desc" },
    take: 25,
    select: { id: true, deliveryId: true, status: true, bodySizeBytes: true, errorMessage: true, receivedAt: true },
  });
}

export async function sendWebhookTestAction(projectId: string, automationId: string): Promise<{ ok: boolean; error?: string; runId?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  return sendWebhookTest(projectId, automationId);
}

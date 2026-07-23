"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { executeAutomation } from "@/server/services/automation";

export interface AutomationFormState {
  error?: string;
}

const TRIGGER_TYPES = ["MANUAL", "SCHEDULE_DAILY", "SCHEDULE_WEEKLY"];
const ACTION_TYPES = ["CREATE_NOTIFICATION", "RUN_MONITOR", "RUN_LINK_CHECK"];

export async function createAutomationAction(
  projectId: string,
  _prevState: AutomationFormState,
  formData: FormData
): Promise<AutomationFormState> {
  await requireProjectAccess(projectId, "EDITOR");

  const name = String(formData.get("name") ?? "").trim();
  const triggerType = String(formData.get("triggerType") ?? "MANUAL");
  const actionType = String(formData.get("actionType") ?? "CREATE_NOTIFICATION");

  if (!name) return { error: "El nombre es obligatorio." };
  if (!TRIGGER_TYPES.includes(triggerType)) return { error: "Disparador no válido." };
  if (!ACTION_TYPES.includes(actionType)) return { error: "Acción no válida." };

  const config: Record<string, string> = {};
  if (actionType === "CREATE_NOTIFICATION") {
    config.title = String(formData.get("notificationTitle") ?? "").slice(0, 200);
    config.message = String(formData.get("notificationMessage") ?? "").slice(0, 1000);
  } else if (actionType === "RUN_MONITOR") {
    const monitorId = String(formData.get("monitorId") ?? "");
    if (!monitorId) return { error: "Selecciona un monitor." };
    config.monitorId = monitorId;
  } else if (actionType === "RUN_LINK_CHECK") {
    const url = String(formData.get("linkUrl") ?? "");
    if (!url) return { error: "Indica una URL." };
    config.url = url;
  }

  await prisma.automation.create({
    data: {
      projectId,
      name,
      description: String(formData.get("description") ?? "") || null,
      triggerType: triggerType as never,
      actions: { create: { actionType: actionType as never, config, order: 0 } },
    },
  });

  revalidatePath(`/dashboard/${projectId}/automations`);
  return {};
}

export async function runAutomationNowAction(projectId: string, automationId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await executeAutomation(automationId, `manual-${Date.now()}`);
  revalidatePath(`/dashboard/${projectId}/automations`);
}

export async function toggleAutomationActiveAction(projectId: string, automationId: string, isActive: boolean) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.automation.update({ where: { id: automationId }, data: { isActive } });
  revalidatePath(`/dashboard/${projectId}/automations`);
}

export async function deleteAutomationAction(projectId: string, automationId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  await prisma.automation.delete({ where: { id: automationId } });
  revalidatePath(`/dashboard/${projectId}/automations`);
}

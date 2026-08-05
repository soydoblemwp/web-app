import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { NotificationType } from "@/generated/prisma/enums";

/**
 * Reuses the existing Notification model/system (spec section 35: "usa el
 * sistema de notificaciones existente si está disponible") — never a
 * parallel one. Deduplicated via WorkflowAutomationNotificationState's
 * unique dedupeKey, so retries/re-processing never spam the same
 * automation+run+kind twice.
 */
export type AutomationNotificationKind =
  | "APPROVAL_PENDING"
  | "RUN_FAILED"
  | "RETRY_EXHAUSTED"
  | "AUTOMATION_PAUSED"
  | "WEBHOOK_REJECTED_REPEATEDLY"
  | "TIMEOUT"
  | "LOOP_DETECTED"
  | "RUN_COMPLETED"
  | "NEEDS_MANUAL_STEP";

const KIND_TITLES: Record<AutomationNotificationKind, string> = {
  APPROVAL_PENDING: "Aprobación pendiente",
  RUN_FAILED: "Ejecución fallida",
  RETRY_EXHAUSTED: "Se agotaron los reintentos",
  AUTOMATION_PAUSED: "Automatización pausada",
  WEBHOOK_REJECTED_REPEATEDLY: "Webhook rechazado repetidamente",
  TIMEOUT: "Tiempo de espera superado",
  LOOP_DETECTED: "Posible bucle detectado",
  RUN_COMPLETED: "Ejecución completada",
  NEEDS_MANUAL_STEP: "Se necesita un paso manual",
};

const KIND_MESSAGES: Record<AutomationNotificationKind, string> = {
  APPROVAL_PENDING: "Una ejecución de automatización está esperando tu aprobación.",
  RUN_FAILED: "Una ejecución de automatización falló.",
  RETRY_EXHAUSTED: "Una automatización agotó sus reintentos configurados.",
  AUTOMATION_PAUSED: "Una automatización se pausó automáticamente.",
  WEBHOOK_REJECTED_REPEATEDLY: "Un webhook está recibiendo solicitudes inválidas repetidamente.",
  TIMEOUT: "Una ejecución de automatización superó el tiempo máximo permitido.",
  LOOP_DETECTED: "Se detectó un posible bucle entre automatizaciones y no se ejecutó.",
  RUN_COMPLETED: "Una ejecución de automatización se completó.",
  NEEDS_MANUAL_STEP: "Una ejecución necesita que abras AI Workflows para generar un paso de IA manualmente.",
};

function mapKindToNotificationType(kind: AutomationNotificationKind): NotificationType {
  if (kind === "RUN_FAILED" || kind === "RETRY_EXHAUSTED" || kind === "TIMEOUT" || kind === "LOOP_DETECTED") return "AUTOMATION_FAILED";
  return "GENERIC";
}

export async function notifyAutomationEvent(automationId: string, runId: string | null, kind: AutomationNotificationKind): Promise<void> {
  const automation = await prisma.workflowAutomation.findUnique({ where: { id: automationId } });
  if (!automation) return;

  const dedupeKey = `${automationId}:${runId ?? "none"}:${kind}`;
  const existing = await prisma.workflowAutomationNotificationState.findUnique({ where: { dedupeKey } });
  if (existing) return;

  try {
    await prisma.$transaction([
      prisma.notification.create({
        data: {
          projectId: automation.projectId,
          userId: automation.createdById,
          type: mapKindToNotificationType(kind),
          title: `${KIND_TITLES[kind]}: ${automation.name}`,
          message: KIND_MESSAGES[kind],
          resourceUrl: runId ? `/dashboard/${automation.projectId}/automations/runs/${runId}` : `/dashboard/${automation.projectId}/automations/${automationId}`,
        },
      }),
      prisma.workflowAutomationNotificationState.create({ data: { automationId, runId, kind, dedupeKey } }),
    ]);
  } catch {
    // Unique constraint race on dedupeKey — another concurrent call already recorded this exact notification. Never duplicate.
  }
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import { managersAndOwner } from "@/server/services/agent-governance-notifications";

/**
 * Reuses the existing `Notification` model + the generic `managersAndOwner`
 * helper directly (Fase 40 spec section 19: "reutiliza Notification para
 * avisar a usuarios autorizados. No simules correo electronico.") - same
 * `notifyOnce` dedup pattern as agent-governance-notifications.ts /
 * google-notifications.ts.
 */
async function notifyOnce(userId: string, projectId: string, title: string, message: string, resourceUrl: string) {
  const existing = await prisma.notification.findFirst({ where: { userId, resourceUrl, type: "GENERIC", isRead: false } });
  if (existing) return;
  await prisma.notification.create({ data: { projectId, userId, type: "GENERIC", title, message, resourceUrl } });
}

export async function notifyHandoffRequested(projectId: string, handoffId: string, subject: string) {
  const recipients = await managersAndOwner(projectId);
  const url = `/dashboard/${projectId}/customer-support/handoffs`;
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "Nueva solicitud de atencion humana", `Un visitante solicito ayuda humana: "${subject}"`, url)));
}

export async function notifyNegativeFeedback(projectId: string, conversationPublicId: string) {
  const recipients = await managersAndOwner(projectId);
  const url = `/dashboard/${projectId}/customer-support/conversations`;
  await Promise.all(
    recipients.map((userId) => notifyOnce(userId, projectId, "Feedback negativo recibido", `Una respuesta del agente de soporte recibio feedback negativo (conversacion ${conversationPublicId}).`, url))
  );
}

export async function notifyKnowledgeSourceOutdated(projectId: string, title: string) {
  const recipients = await managersAndOwner(projectId);
  const url = `/dashboard/${projectId}/customer-support/knowledge`;
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "Fuente de conocimiento desactualizada", `La fuente "${title}" cambio desde la ultima sincronizacion y necesita revision.`, url)));
}

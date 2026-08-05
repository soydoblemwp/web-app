import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { NotificationType } from "@/generated/prisma/enums";
import { managersAndOwner } from "@/server/services/agent-governance-notifications";

/**
 * Reuses the existing `Notification` model directly (Fase 39 spec section
 * 30: "reutiliza Notification... no simules notificaciones externas") — no
 * new notification system, no email (no real email-per-notification
 * infrastructure exists for this kind of event). `managersAndOwner` is
 * reused as-is from the Fase 37 governance notifications module — it is a
 * generic "who manages this project" query, not AI-governance-specific.
 */
async function notifyOnce(userId: string, projectId: string, type: NotificationType, title: string, message: string, resourceUrl: string) {
  const existing = await prisma.notification.findFirst({ where: { userId, resourceUrl, type, isRead: false } });
  if (existing) return;
  await prisma.notification.create({ data: { projectId, userId, type, title, message, resourceUrl } });
}

function integrationUrl(projectId: string) {
  return `/dashboard/${projectId}/integrations/google`;
}

export async function notifyGoogleConnected(projectId: string, connectedById: string, email: string | null) {
  const recipients = (await managersAndOwner(projectId)).filter((id) => id !== connectedById);
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", "Google conectado", `Se conectó una cuenta de Google${email ? ` (${email})` : ""} — selecciona las propiedades a sincronizar.`, integrationUrl(projectId))));
}

export async function notifyGoogleReauthRequired(projectId: string) {
  const recipients = await managersAndOwner(projectId);
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "INTEGRATION_DISCONNECTED", "Google requiere reconexión", "La autorización de Google venció — reconecta la cuenta para reanudar la sincronización.", integrationUrl(projectId))));
}

export async function notifyGoogleSyncPartial(projectId: string, resourceName: string) {
  const recipients = await managersAndOwner(projectId);
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", "Sincronización parcial de Google", `La sincronización de "${resourceName}" se completó parcialmente — revisa el historial.`, integrationUrl(projectId))));
}

export async function notifyGoogleSyncFailed(projectId: string, resourceName: string) {
  const recipients = await managersAndOwner(projectId);
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", "Sincronización de Google fallida", `La sincronización de "${resourceName}" falló — revisa el historial.`, integrationUrl(projectId))));
}

export async function notifyGoogleResourceLostAccess(projectId: string, resourceName: string) {
  const recipients = await managersAndOwner(projectId);
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", "Se perdió acceso a una propiedad de Google", `"${resourceName}" ya no es accesible con la cuenta de Google conectada.`, integrationUrl(projectId))));
}

export async function notifyGoogleDataStale(projectId: string, resourceName: string, daysStale: number) {
  const recipients = await managersAndOwner(projectId);
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", "Datos de Google desactualizados", `"${resourceName}" no se sincroniza desde hace ${daysStale} día(s).`, integrationUrl(projectId))));
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { NotificationType } from "@/generated/prisma/enums";

/**
 * Reuses the existing `Notification` model directly (Fase 37 spec section
 * 29: "reutiliza el sistema de notificaciones existente... no crees un
 * sistema nuevo") — same model `automation-notifications.ts` already writes
 * to. `Notification` has no unique constraint to lean on, so dedup here is a
 * lightweight best-effort check (an existing UNREAD notification with the
 * same user/resource/type is treated as "already notified") rather than a
 * new dedupe-state table — acceptable for an advisory UX signal, unlike the
 * hard governance decisions themselves, which are never re-derived this way.
 */
async function notifyOnce(userId: string, projectId: string, type: NotificationType, title: string, message: string, resourceUrl: string) {
  const existing = await prisma.notification.findFirst({ where: { userId, resourceUrl, type, isRead: false } });
  if (existing) return;
  await prisma.notification.create({ data: { projectId, userId, type, title, message, resourceUrl } });
}

export async function managersAndOwner(projectId: string): Promise<string[]> {
  const [members, project] = await Promise.all([
    prisma.projectMember.findMany({ where: { projectId, role: { in: ["MANAGER", "OWNER"] } }, select: { userId: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } }),
  ]);
  return Array.from(new Set([...members.map((m) => m.userId), ...(project ? [project.ownerId] : [])]));
}

export async function notifyGovernanceApprovalPending(projectId: string, approvalId: string, agentRef: string) {
  const recipients = await managersAndOwner(projectId);
  const url = `/dashboard/${projectId}/agents/governance`;
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", "Aprobación de agente pendiente", `El agente "${agentRef}" tiene una ejecución esperando tu aprobación.`, url)));
}

export async function notifyGovernanceRunDenied(projectId: string, userId: string, agentRef: string, reason: string) {
  const url = `/dashboard/${projectId}/agents/governance`;
  await notifyOnce(userId, projectId, "GENERIC", "Ejecución de agente rechazada", `Tu ejecución de "${agentRef}" fue rechazada por la política de gobernanza: ${reason}`, url);
}

export async function notifyGovernanceBudgetAlert(projectId: string, metric: string, window: string, exhausted: boolean) {
  const recipients = await managersAndOwner(projectId);
  const url = `/dashboard/${projectId}/agents/governance`;
  const title = exhausted ? "Presupuesto de agentes agotado" : "Presupuesto de agentes cerca del límite";
  const message = `El presupuesto de ${metric} (${window}) ${exhausted ? "se agotó" : "está cerca de agotarse"}.`;
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "USAGE_LIMIT_NEAR", title, message, url)));
}

export async function notifyGovernanceEmergencyStop(projectId: string, enabled: boolean) {
  const recipients = await managersAndOwner(projectId);
  const url = `/dashboard/${projectId}/agents/governance`;
  const title = enabled ? "Parada de emergencia activada" : "Parada de emergencia desactivada";
  const message = enabled ? "Se bloquearon nuevas ejecuciones, reintentos y reanudaciones de agentes de IA en este proyecto." : "Los agentes de IA de este proyecto volvieron a operar normalmente.";
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", title, message, url)));
}

export async function notifyGovernanceAgentPaused(projectId: string, agentRef: string, paused: boolean) {
  const recipients = await managersAndOwner(projectId);
  const url = `/dashboard/${projectId}/agents/governance`;
  const title = paused ? "Agente pausado" : "Agente reanudado";
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", title, `El agente "${agentRef}" fue ${paused ? "pausado" : "reanudado"}.`, url)));
}

/** Fase 38 spec section 35: a sensitive policy change needs a real human decision before it can activate. */
export async function notifyPolicyChangeApprovalPending(projectId: string, requestedById: string) {
  const recipients = (await managersAndOwner(projectId)).filter((id) => id !== requestedById);
  const url = `/dashboard/${projectId}/agents/governance`;
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", "Cambio de política pendiente de aprobación", "Un cambio sensible de política de gobernanza de agentes necesita tu decisión.", url)));
}

/** Fase 38 — a rollout in SHADOW/LIMITED is showing a meaningful number of decisions that would differ from the currently active policy. */
export async function notifyShadowRolloutDivergence(projectId: string, differenceCount: number) {
  const recipients = await managersAndOwner(projectId);
  const url = `/dashboard/${projectId}/agents/governance`;
  await Promise.all(
    recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", "Rollout en sombra con diferencias notables", `Un rollout SHADOW/LIMITED lleva ${differenceCount} decisiones distintas a la política activa — revísalo antes de promoverlo.`, url))
  );
}

export async function notifyPolicyRollbackCreated(projectId: string, actorId: string, sourceVersion: number) {
  const recipients = (await managersAndOwner(projectId)).filter((id) => id !== actorId);
  const url = `/dashboard/${projectId}/agents/governance`;
  await Promise.all(recipients.map((userId) => notifyOnce(userId, projectId, "GENERIC", "Rollback de política creado", `Se creó un nuevo borrador restaurando la versión ${sourceVersion}.`, url)));
}

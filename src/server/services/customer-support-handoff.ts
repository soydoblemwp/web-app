import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { CUSTOMER_SUPPORT_LIMITS } from "@/lib/customer-support/limits";
import { logCustomerSupportAction } from "@/server/services/customer-support-audit";
import { notifyHandoffRequested } from "@/server/services/customer-support-notifications";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { markConversationEscalated } from "@/server/services/customer-support-conversation";

/**
 * Human handoff requests (Fase 40 spec section 19) - reuses `Notification`
 * (via customer-support-notifications.ts) to alert authorized users, never
 * a simulated email. Internal notes are never exposed through any
 * widget-facing endpoint (only through the dashboard's project-scoped
 * server actions).
 */

interface InternalNote {
  authorId: string;
  note: string;
  createdAt: string;
}

export async function createHandoff(params: {
  projectId: string;
  conversationId: string;
  subject: string;
  category: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  sanitizedMessage: string;
  originPage: string | null;
  isTest: boolean;
}) {
  const handoff = await prisma.customerSupportHandoff.create({
    data: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      subject: params.subject.slice(0, CUSTOMER_SUPPORT_LIMITS.HANDOFF_SUBJECT_MAX_LENGTH),
      category: params.category,
      priority: params.priority,
      sanitizedMessage: params.sanitizedMessage,
      originPage: params.originPage,
    },
  });
  await markConversationEscalated(params.conversationId);

  if (!params.isTest) {
    await notifyHandoffRequested(params.projectId, handoff.id, handoff.subject).catch(() => null);
    await publishAutomationEvent({
      projectId: params.projectId,
      eventKey: "customer_support.handoff_requested",
      payload: { handoffId: handoff.id, category: params.category, priority: params.priority },
      idempotencyKey: `customer_support.handoff_requested:${handoff.id}`,
    }).catch(() => null);
  }
  return handoff;
}

export interface HandoffFilter {
  status?: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignedToId?: string;
  cursor?: string;
  limit?: number;
}

export async function listHandoffs(projectId: string, filter: HandoffFilter = {}) {
  const limit = Math.min(filter.limit ?? 20, 100);
  const where: Record<string, unknown> = { projectId };
  if (filter.status) where.status = filter.status;
  if (filter.priority) where.priority = filter.priority;
  if (filter.assignedToId) where.assignedToId = filter.assignedToId;

  const rows = await prisma.customerSupportHandoff.findMany({
    where: where as never,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: { assignedTo: { select: { id: true, name: true, email: true } }, conversation: { select: { id: true, publicId: true, language: true } } },
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { handoffs: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

export async function getHandoff(projectId: string, handoffId: string) {
  const handoff = await prisma.customerSupportHandoff.findUnique({
    where: { id: handoffId },
    include: { assignedTo: { select: { id: true, name: true, email: true } }, conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!handoff || handoff.projectId !== projectId) return null;
  return handoff;
}

export async function assignHandoff(projectId: string, userId: string, handoffId: string, assignedToId: string) {
  const handoff = await getHandoff(projectId, handoffId);
  if (!handoff) return { error: "Solicitud no encontrada." };
  const updated = await prisma.customerSupportHandoff.update({ where: { id: handoffId }, data: { assignedToId, status: handoff.status === "OPEN" ? "IN_REVIEW" : handoff.status } });
  await logCustomerSupportAction(projectId, userId, "customer_support.handoff_assigned", "CustomerSupportHandoff", handoffId, { assignedToId });
  return { handoff: updated };
}

export async function addHandoffNote(projectId: string, userId: string, handoffId: string, note: string) {
  const handoff = await getHandoff(projectId, handoffId);
  if (!handoff) return { error: "Solicitud no encontrada." };
  const existing = ((handoff.internalNotes as unknown as InternalNote[] | null) ?? []).slice(-CUSTOMER_SUPPORT_LIMITS.MAX_INTERNAL_NOTES + 1);
  const nextNotes: InternalNote[] = [...existing, { authorId: userId, note: note.slice(0, CUSTOMER_SUPPORT_LIMITS.HANDOFF_NOTE_MAX_LENGTH), createdAt: new Date().toISOString() }];
  const updated = await prisma.customerSupportHandoff.update({ where: { id: handoffId }, data: { internalNotes: nextNotes as unknown as Prisma.InputJsonValue } });
  return { handoff: updated };
}

export async function updateHandoffStatus(projectId: string, userId: string, handoffId: string, status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED") {
  const handoff = await getHandoff(projectId, handoffId);
  if (!handoff) return { error: "Solicitud no encontrada." };
  const updated = await prisma.customerSupportHandoff.update({
    where: { id: handoffId },
    data: { status, ...(status === "RESOLVED" ? { resolvedAt: new Date() } : {}), ...(status === "CLOSED" ? { closedAt: new Date() } : {}) },
  });
  await logCustomerSupportAction(projectId, userId, `customer_support.handoff_${status.toLowerCase()}`, "CustomerSupportHandoff", handoffId);
  if (status === "RESOLVED") {
    await publishAutomationEvent({
      projectId,
      eventKey: "customer_support.handoff_resolved",
      actorId: userId,
      payload: { handoffId },
      idempotencyKey: `customer_support.handoff_resolved:${handoffId}`,
    }).catch(() => null);
  }
  return { handoff: updated };
}

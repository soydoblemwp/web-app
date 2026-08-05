import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { notifyNegativeFeedback } from "@/server/services/customer-support-notifications";
import { publishAutomationEvent } from "@/server/services/automation-events";

/**
 * Conversation/message persistence (Fase 40 spec sections 17, 20-21) - never
 * a sequential id as the public identifier (spec: "no uses IDs
 * secuenciales"), and every lookup by publicId also re-checks
 * `visitorKeyHash` so a visitor can never open someone else's conversation
 * (spec: "un visitante no puede abrir una conversacion de otra persona").
 */

function generateConversationPublicId(): string {
  return randomBytes(16).toString("hex");
}

export async function createConversation(params: {
  projectId: string;
  visitorKeyHash: string;
  userId?: string | null;
  language: string;
  originPage: string | null;
  isTest: boolean;
}) {
  return prisma.customerSupportConversation.create({
    data: {
      projectId: params.projectId,
      publicId: generateConversationPublicId(),
      visitorKeyHash: params.visitorKeyHash,
      userId: params.userId ?? null,
      language: params.language,
      originPage: params.originPage,
      isTest: params.isTest,
    },
  });
}

/** Re-checks visitorKeyHash - never returns a conversation to a caller that didn't originate it (spec section 17). */
export async function getOwnedConversationByPublicId(projectId: string, publicId: string, visitorKeyHash: string) {
  const conversation = await prisma.customerSupportConversation.findUnique({ where: { publicId } });
  if (!conversation || conversation.projectId !== projectId || conversation.visitorKeyHash !== visitorKeyHash) return null;
  return conversation;
}

export async function getConversationForProject(projectId: string, conversationId: string) {
  const conversation = await prisma.customerSupportConversation.findUnique({ where: { id: conversationId }, include: { messages: { orderBy: { createdAt: "asc" } }, handoffs: true } });
  if (!conversation || conversation.projectId !== projectId) return null;
  return conversation;
}

export interface AppendMessageInput {
  role: "VISITOR" | "AGENT" | "SYSTEM";
  content: string;
  responseType?: "FAQ" | "KNOWLEDGE" | "AI_ASSISTED" | "FALLBACK" | null;
  evidence?: "HIGH" | "MEDIUM" | "LOW" | "NONE" | null;
  sourcesUsed?: unknown;
  aiAgentRunId?: string | null;
  latencyMs?: number | null;
  status?: "SENT" | "REDACTED";
}

export async function appendMessage(conversationId: string, projectId: string, input: AppendMessageInput) {
  const [message] = await prisma.$transaction([
    prisma.customerSupportMessage.create({
      data: {
        conversationId,
        projectId,
        role: input.role,
        content: input.content,
        responseType: input.responseType ?? null,
        evidence: input.evidence ?? null,
        sourcesUsed: (input.sourcesUsed ?? undefined) as Prisma.InputJsonValue | undefined,
        aiAgentRunId: input.aiAgentRunId ?? null,
        latencyMs: input.latencyMs ?? null,
        status: input.status ?? "SENT",
      },
    }),
    prisma.customerSupportConversation.update({
      where: { id: conversationId },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
        ...(input.role === "AGENT" ? { lastResponseType: input.responseType ?? null, lastEvidence: input.evidence ?? null } : {}),
      },
    }),
  ]);
  return message;
}

export async function markConversationEscalated(conversationId: string) {
  await prisma.customerSupportConversation.update({ where: { id: conversationId }, data: { escalated: true, status: "ESCALATED" } });
}

export async function updateConversationStatus(projectId: string, conversationId: string, status: "ACTIVE" | "RESOLVED" | "ESCALATED" | "CLOSED") {
  const conversation = await getConversationForProject(projectId, conversationId);
  if (!conversation) return { error: "Conversacion no encontrada." };
  const updated = await prisma.customerSupportConversation.update({
    where: { id: conversationId },
    data: { status, ...(status === "CLOSED" || status === "RESOLVED" ? { closedAt: new Date() } : {}) },
  });
  return { conversation: updated };
}

// ---------------------------------------------------------------------------
// Feedback (spec section 21) - idempotent, tied to exactly one message.
// ---------------------------------------------------------------------------

export type RecordFeedbackResult = { ok: true; alreadyRecorded: boolean } | { ok: false; error: string };

export async function recordFeedback(projectId: string, messageId: string, feedback: "POSITIVE" | "NEGATIVE"): Promise<RecordFeedbackResult> {
  const message = await prisma.customerSupportMessage.findUnique({ where: { id: messageId } });
  if (!message || message.projectId !== projectId) return { ok: false, error: "Mensaje no encontrado." };
  if (message.role !== "AGENT") return { ok: false, error: "Solo se puede calificar una respuesta del agente." };

  // Idempotent via a conditioned updateMany keyed on the PREVIOUS feedback value being NONE — a repeat
  // submission of the same feedback is a no-op, never double-counted (spec: "no permitas manipular el
  // conteo repitiendo la misma solicitud").
  const claim = await prisma.customerSupportMessage.updateMany({ where: { id: messageId, feedback: "NONE" }, data: { feedback } });
  if (claim.count === 0) {
    return { ok: true, alreadyRecorded: true };
  }

  if (feedback === "NEGATIVE") {
    const conversation = await prisma.customerSupportConversation.findUnique({ where: { id: message.conversationId } });
    if (conversation) {
      await notifyNegativeFeedback(projectId, conversation.publicId).catch(() => null);
      await publishAutomationEvent({
        projectId,
        eventKey: "customer_support.negative_feedback",
        payload: { messageId },
        idempotencyKey: `customer_support.negative_feedback:${messageId}`,
      }).catch(() => null);
    }
  }

  return { ok: true, alreadyRecorded: false };
}

// ---------------------------------------------------------------------------
// Listing (dashboard bandeja, spec section 20)
// ---------------------------------------------------------------------------

export interface ConversationFilter {
  status?: "ACTIVE" | "RESOLVED" | "ESCALATED" | "CLOSED";
  category?: string;
  language?: string;
  escalated?: boolean;
  originPage?: string;
  resolvedByFaq?: boolean;
  resolvedByAi?: boolean;
  positiveFeedback?: boolean;
  negativeFeedback?: boolean;
  cursor?: string;
  limit?: number;
}

export async function listConversations(projectId: string, filter: ConversationFilter = {}) {
  const limit = Math.min(filter.limit ?? 20, 100);
  const where: Record<string, unknown> = { projectId, isTest: false };
  if (filter.status) where.status = filter.status;
  if (filter.category) where.category = filter.category;
  if (filter.language) where.language = filter.language;
  if (filter.escalated !== undefined) where.escalated = filter.escalated;
  if (filter.originPage) where.originPage = filter.originPage;
  if (filter.resolvedByFaq) where.lastResponseType = "FAQ";
  if (filter.resolvedByAi) where.lastResponseType = "AI_ASSISTED";
  if (filter.positiveFeedback) where.messages = { some: { feedback: "POSITIVE" } };
  if (filter.negativeFeedback) where.messages = { some: { feedback: "NEGATIVE" } };

  const rows = await prisma.customerSupportConversation.findMany({
    where: where as never,
    orderBy: { startedAt: "desc" },
    take: limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { conversations: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

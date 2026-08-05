import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { CustomerSupportConfig } from "@/generated/prisma/client";
import { appConfig } from "@/lib/config";
import { sanitizeVisitorText, isBlankMessage } from "@/lib/customer-support/sanitize";
import { redactSecrets } from "@/lib/customer-support/secrets";
import { isPathAllowedForWidget, isOriginAllowed, normalizeVisitorPage } from "@/lib/customer-support/page-match";
import { hashRateLimitKey, checkAndRecordRateLimit } from "@/server/services/customer-support-rate-limit";
import { getConfigByPublicId } from "@/server/services/customer-support-config";
import { createConversation, getOwnedConversationByPublicId, appendMessage } from "@/server/services/customer-support-conversation";
import { createHandoff } from "@/server/services/customer-support-handoff";
import { recordFeedback } from "@/server/services/customer-support-conversation";
import { startPublicSupportRun, completePublicSupportRun, failPublicSupportRun } from "@/server/services/agent-customer-support";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { DeterministicAnswer } from "@/server/services/customer-support-chat";
import type { CustomerSupportChatResponse } from "@/lib/customer-support/structured-output";
import type { WidgetChatRequest } from "@/lib/validation/customer-support";

/**
 * The public widget endpoint's real orchestration (Fase 40 spec section 25)
 * - resolves a project ONLY via the opaque `publicId`, applies rate limits,
 * sanitizes/redacts, and never trusts anything the visitor sends beyond
 * their own message text and the session token used to scope their own
 * conversation.
 */

export type WidgetResult = { status: number; body: Record<string, unknown> };

function deniedResult(status: number, error: string): WidgetResult {
  return { status, body: { error } };
}

function answerToResponse(answer: DeterministicAnswer, conversationPublicId: string, messageId: string): CustomerSupportChatResponse {
  return {
    answer: answer.answer,
    evidence: answer.evidence,
    sources: answer.sources,
    links: answer.links,
    category: answer.category,
    suggestions: answer.suggestions,
    needsHuman: answer.needsHuman,
    humanReason: answer.humanReason,
    responseType: answer.responseType,
    conversationPublicId,
    messageId,
  };
}

type ActiveConfigResult = { ok: true; config: CustomerSupportConfig } | { ok: false; error: WidgetResult };

/**
 * Authorizes the request's Origin against THIS project's real hostname
 * bindings (Fase 40's third correction, spec section 7: "no permitas
 * utilizar el publicId de un proyecto desde un dominio no autorizado") —
 * never a second project's publicId usable from a hostname it doesn't own.
 * Same-origin (this app's own domain — covers both the dashboard-mode
 * widget and the shared public marketing pages) is always authorized;
 * `config.allowedDomains` remains available for the optional external embed
 * (never implemented in this pass, kept as a real, working allowlist for
 * when it is). Absent Origin header (common on same-origin/legacy requests)
 * is not treated as a failure — publicId + active-status + per-conversation
 * ownership already gate everything else.
 */
async function isOriginAuthorizedForConfig(originHeader: string | null, config: CustomerSupportConfig): Promise<boolean> {
  const appHostname = new URL(appConfig.url).hostname;
  if (isOriginAllowed(originHeader, config.allowedDomains, appHostname)) return true;
  if (!originHeader) return true;

  let hostname: string;
  try {
    hostname = new URL(originHeader).hostname;
  } catch {
    return false;
  }
  const site = await prisma.customerSupportPublicSite.findUnique({ where: { normalizedHostname: hostname.toLowerCase() } });
  return Boolean(site && site.status === "ACTIVE" && site.projectId === config.projectId);
}

async function resolveActiveConfig(publicId: string, originHeader: string | null): Promise<ActiveConfigResult> {
  const config = await getConfigByPublicId(publicId);
  if (!config) return { ok: false, error: deniedResult(404, "Configuracion no encontrada.") };
  if (!config.active) return { ok: false, error: deniedResult(403, "El agente de soporte no esta activo para este proyecto.") };
  if (!(await isOriginAuthorizedForConfig(originHeader, config))) {
    return { ok: false, error: deniedResult(403, "Este dominio no esta autorizado para este agente.") };
  }
  return { ok: true, config };
}

export async function handleVisitorMessage(req: Extract<WidgetChatRequest, { action: "message" }>, ipHash: string, originHeader: string | null): Promise<WidgetResult> {
  const resolved = await resolveActiveConfig(req.publicId, originHeader);
  if (!resolved.ok) return resolved.error;
  const { config } = resolved;
  const projectId = config.projectId;

  // The visitor may only ever report a bare relative path — a full URL can never be used to dodge the included/excluded check below (spec section 8: "el cliente no debe poder utilizar una URL completa").
  const normalizedPage = normalizeVisitorPage(req.page);
  if (!normalizedPage) return deniedResult(400, "Pagina de origen no valida.");
  if (!isPathAllowedForWidget(normalizedPage, config.includedPaths, config.excludedPaths)) {
    return deniedResult(403, "El widget no esta habilitado en esta pagina.");
  }

  const visitorKeyHash = hashRateLimitKey(`${projectId}:${req.visitorSessionToken}`);
  const messageLimit = await checkAndRecordRateLimit(visitorKeyHash, "MESSAGE", projectId);
  if (!messageLimit.allowed) return deniedResult(429, "Enviaste demasiados mensajes. Intenta de nuevo en un momento.");
  const ipLimit = await checkAndRecordRateLimit(ipHash, "MESSAGE", projectId);
  if (!ipLimit.allowed) return deniedResult(429, "Demasiadas solicitudes desde tu red. Intenta de nuevo en un momento.");

  if (isBlankMessage(req.message)) return deniedResult(400, "Escribe una pregunta.");
  const redaction = redactSecrets(req.message);
  const sanitized = sanitizeVisitorText(redaction.sanitized);

  let conversation = req.conversationPublicId ? await getOwnedConversationByPublicId(projectId, req.conversationPublicId, visitorKeyHash) : null;
  const isNewConversation = !conversation;
  if (!conversation) {
    conversation = await createConversation({ projectId, visitorKeyHash, language: req.language ?? config.language, originPage: normalizedPage.slice(0, 300), isTest: req.isTest });
    if (!req.isTest) {
      await publishAutomationEvent({
        projectId,
        eventKey: "customer_support.conversation_started",
        payload: { conversationId: conversation.id, originPage: normalizedPage.slice(0, 300) },
        idempotencyKey: `customer_support.conversation_started:${conversation.id}`,
      }).catch(() => null);
    }
  }
  if (conversation.messageCount >= config.maxMessagesPerConversation) {
    return deniedResult(429, "Esta conversacion alcanzo el limite de mensajes.");
  }

  await appendMessage(conversation.id, projectId, {
    role: "VISITOR",
    content: sanitized,
    status: redaction.redacted ? "REDACTED" : "SENT",
  });

  const owner = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!owner) return deniedResult(404, "Proyecto no encontrado.");

  const startedAt = Date.now();
  const turn = await startPublicSupportRun(projectId, owner.ownerId, sanitized, req.language ?? config.language, req.supportsLocalAI);

  if (turn.kind === "DENIED") {
    const answer: DeterministicAnswer = {
      kind: "DETERMINISTIC",
      responseType: "FALLBACK",
      answer: config.offHoursMessage || "El agente no esta disponible en este momento. Puedes solicitar atencion humana.",
      evidence: "NONE",
      sources: [],
      links: [],
      category: null,
      suggestions: [],
      needsHuman: true,
      humanReason: turn.reason,
    };
    const message = await appendMessage(conversation.id, projectId, { role: "AGENT", content: answer.answer, responseType: answer.responseType, evidence: answer.evidence, latencyMs: Date.now() - startedAt });
    return { status: 200, body: { ...answerToResponse(answer, conversation.publicId, message.id), isNewConversation } };
  }

  if (turn.kind === "ANSWERED") {
    const message = await appendMessage(conversation.id, projectId, {
      role: "AGENT",
      content: turn.answer.answer,
      responseType: turn.answer.responseType,
      evidence: turn.answer.evidence,
      sourcesUsed: turn.answer.sources,
      aiAgentRunId: turn.runId,
      latencyMs: Date.now() - startedAt,
    });
    if (!req.isTest) await emitAnswerEvent(projectId, conversation.id, turn.answer);
    return { status: 200, body: { ...answerToResponse(turn.answer, conversation.publicId, message.id), isNewConversation } };
  }

  // GENERATING - the widget must now call the local AI engine itself and report back via "complete".
  return {
    status: 200,
    body: {
      needsGeneration: true,
      runId: turn.runId,
      executionToken: turn.executionToken,
      systemPrompt: turn.systemPrompt,
      userPrompt: turn.userPrompt,
      conversationPublicId: conversation.publicId,
      isNewConversation,
    },
  };
}

async function emitAnswerEvent(projectId: string, conversationId: string, answer: DeterministicAnswer) {
  const eventKey = answer.evidence === "NONE" ? "customer_support.answer_not_found" : "customer_support.answer_generated";
  await publishAutomationEvent({
    projectId,
    eventKey,
    payload: eventKey === "customer_support.answer_not_found" ? { conversationId } : { conversationId, responseType: answer.responseType, evidence: answer.evidence },
    idempotencyKey: `${eventKey}:${conversationId}:${Date.now()}`,
  }).catch(() => null);
}

export async function handleGenerationComplete(req: Extract<WidgetChatRequest, { action: "complete" }>, originHeader: string | null): Promise<WidgetResult> {
  const resolved = await resolveActiveConfig(req.publicId, originHeader);
  if (!resolved.ok) return resolved.error;
  const { config } = resolved;
  const projectId = config.projectId;

  const visitorKeyHash = hashRateLimitKey(`${projectId}:${req.visitorSessionToken}`);
  const conversation = await getOwnedConversationByPublicId(projectId, req.conversationPublicId, visitorKeyHash);
  if (!conversation) return deniedResult(404, "Conversacion no encontrada.");

  const result = await completePublicSupportRun(projectId, req.runId, req.executionToken, req.generatedText);
  if ("error" in result) return deniedResult(400, result.error);

  const message = await appendMessage(conversation.id, projectId, {
    role: "AGENT",
    content: result.answer.answer,
    responseType: result.answer.responseType,
    evidence: result.answer.evidence,
    sourcesUsed: result.answer.sources,
    aiAgentRunId: req.runId,
  });
  await emitAnswerEvent(projectId, conversation.id, result.answer);
  return { status: 200, body: answerToResponse(result.answer, conversation.publicId, message.id) };
}

export async function handleGenerationFailed(req: Extract<WidgetChatRequest, { action: "generation_failed" }>, originHeader: string | null): Promise<WidgetResult> {
  const resolved = await resolveActiveConfig(req.publicId, originHeader);
  if (!resolved.ok) return resolved.error;
  const projectId = resolved.config.projectId;

  const visitorKeyHash = hashRateLimitKey(`${projectId}:${req.visitorSessionToken}`);
  const conversation = await getOwnedConversationByPublicId(projectId, req.conversationPublicId, visitorKeyHash);
  if (!conversation) return deniedResult(404, "Conversacion no encontrada.");

  await failPublicSupportRun(projectId, req.runId, req.executionToken, req.reason ?? "La generacion en el navegador fallo.");
  const answer: DeterministicAnswer = {
    kind: "DETERMINISTIC",
    responseType: "FALLBACK",
    answer: "No se pudo generar una respuesta en tu navegador. Puedes solicitar atencion humana.",
    evidence: "NONE",
    sources: [],
    links: [],
    category: null,
    suggestions: [],
    needsHuman: true,
    humanReason: "Fallo de generacion local en el navegador.",
  };
  const message = await appendMessage(conversation.id, projectId, { role: "AGENT", content: answer.answer, responseType: answer.responseType, evidence: answer.evidence });
  return { status: 200, body: answerToResponse(answer, conversation.publicId, message.id) };
}

export async function handleFeedback(req: Extract<WidgetChatRequest, { action: "feedback" }>, originHeader: string | null): Promise<WidgetResult> {
  const resolved = await resolveActiveConfig(req.publicId, originHeader);
  if (!resolved.ok) return resolved.error;
  const projectId = resolved.config.projectId;

  const visitorKeyHash = hashRateLimitKey(`${projectId}:${req.visitorSessionToken}`);
  const feedbackLimit = await checkAndRecordRateLimit(visitorKeyHash, "FEEDBACK", projectId);
  if (!feedbackLimit.allowed) return deniedResult(429, "Demasiadas solicitudes. Intenta de nuevo en un momento.");

  const conversation = await getOwnedConversationByPublicId(projectId, req.conversationPublicId, visitorKeyHash);
  if (!conversation) return deniedResult(404, "Conversacion no encontrada.");

  const message = await prisma.customerSupportMessage.findUnique({ where: { id: req.messageId } });
  if (!message || message.conversationId !== conversation.id) return deniedResult(404, "Mensaje no encontrado.");

  const result = await recordFeedback(projectId, req.messageId, req.feedback);
  if (!result.ok) return deniedResult(400, result.error);
  return { status: 200, body: { ok: true, alreadyRecorded: result.alreadyRecorded } };
}

export async function handleHandoffRequest(req: Extract<WidgetChatRequest, { action: "handoff" }>, originHeader: string | null): Promise<WidgetResult> {
  const resolved = await resolveActiveConfig(req.publicId, originHeader);
  if (!resolved.ok) return resolved.error;
  const { config } = resolved;
  const projectId = config.projectId;
  if (!config.humanHandoffEnabled) return deniedResult(403, "La atencion humana no esta habilitada para este agente.");

  const normalizedPage = normalizeVisitorPage(req.page);
  if (!normalizedPage) return deniedResult(400, "Pagina de origen no valida.");

  const visitorKeyHash = hashRateLimitKey(`${projectId}:${req.visitorSessionToken}`);
  const handoffLimit = await checkAndRecordRateLimit(visitorKeyHash, "HANDOFF", projectId);
  if (!handoffLimit.allowed) return deniedResult(429, "Ya enviaste varias solicitudes de atencion humana. Intenta mas tarde.");

  const conversation = await getOwnedConversationByPublicId(projectId, req.conversationPublicId, visitorKeyHash);
  if (!conversation) return deniedResult(404, "Conversacion no encontrada.");

  const redaction = redactSecrets(req.message);
  const sanitizedMessage = sanitizeVisitorText(redaction.sanitized, 2000);
  const subject = sanitizeVisitorText(req.subject, 200);

  const handoff = await createHandoff({
    projectId,
    conversationId: conversation.id,
    subject,
    category: req.category ?? null,
    priority: "MEDIUM",
    sanitizedMessage,
    originPage: normalizedPage.slice(0, 300),
    isTest: conversation.isTest,
  });

  return { status: 200, body: { ok: true, handoffId: handoff.id } };
}

/** Rate-limits new-session creation specifically (spec section 26: "creacion de sesiones") — call before the very first message of a brand-new visitorSessionToken. */
export async function checkSessionCreationRateLimit(ipHash: string, projectId: string | null): Promise<boolean> {
  const result = await checkAndRecordRateLimit(ipHash, "SESSION_CREATE", projectId);
  return result.allowed;
}

import { z } from "zod";
import { CUSTOMER_SUPPORT_LIMITS } from "@/lib/customer-support/limits";

/**
 * All Zod validation for the Customer Support Agent (Fase 40 spec section
 * 35: "El visitante no puede suministrar libremente projectId, rol,
 * configuracion, fuentes, evidencia, prompt, IDs internos, estado,
 * permisos"). Every widget-facing schema below intentionally has NO field
 * for any of those - only `publicId` (opaque), a session token, and the
 * visitor's own text.
 */

const publicSessionFields = {
  publicId: z.string().trim().min(1).max(64),
  visitorSessionToken: z.string().trim().min(16).max(128),
};

export const widgetMessageSchema = z.object({
  ...publicSessionFields,
  action: z.literal("message"),
  conversationPublicId: z.string().trim().max(64).optional(),
  message: z.string().trim().min(1).max(CUSTOMER_SUPPORT_LIMITS.MAX_MESSAGE_LENGTH),
  page: z.string().trim().max(300),
  language: z.string().trim().max(10).optional(),
  supportsLocalAI: z.boolean(),
  isTest: z.boolean().optional().default(false),
});

export const widgetCompleteSchema = z.object({
  ...publicSessionFields,
  action: z.literal("complete"),
  conversationPublicId: z.string().trim().min(1).max(64),
  runId: z.string().trim().min(1).max(64),
  executionToken: z.string().trim().min(1).max(64),
  generatedText: z.string().trim().min(1).max(CUSTOMER_SUPPORT_LIMITS.MAX_ANSWER_LENGTH),
});

export const widgetGenerationFailedSchema = z.object({
  ...publicSessionFields,
  action: z.literal("generation_failed"),
  conversationPublicId: z.string().trim().min(1).max(64),
  runId: z.string().trim().min(1).max(64),
  executionToken: z.string().trim().min(1).max(64),
  reason: z.string().trim().max(300).optional(),
});

export const widgetFeedbackSchema = z.object({
  ...publicSessionFields,
  action: z.literal("feedback"),
  conversationPublicId: z.string().trim().min(1).max(64),
  messageId: z.string().trim().min(1).max(64),
  feedback: z.enum(["POSITIVE", "NEGATIVE"]),
});

export const widgetHandoffSchema = z.object({
  ...publicSessionFields,
  action: z.literal("handoff"),
  conversationPublicId: z.string().trim().min(1).max(64),
  subject: z.string().trim().min(1).max(CUSTOMER_SUPPORT_LIMITS.HANDOFF_SUBJECT_MAX_LENGTH),
  category: z.string().trim().max(100).optional(),
  message: z.string().trim().min(1).max(CUSTOMER_SUPPORT_LIMITS.MAX_MESSAGE_LENGTH),
  page: z.string().trim().max(300),
});

export const widgetChatRequestSchema = z.discriminatedUnion("action", [widgetMessageSchema, widgetCompleteSchema, widgetGenerationFailedSchema, widgetFeedbackSchema, widgetHandoffSchema]);
export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;

// ---------------------------------------------------------------------------
// Dashboard (authenticated) input schemas
// ---------------------------------------------------------------------------

export const faqInputSchema = z.object({
  question: z.string().trim().min(1).max(CUSTOMER_SUPPORT_LIMITS.MAX_QUESTION_LENGTH),
  answer: z.string().trim().min(1).max(CUSTOMER_SUPPORT_LIMITS.MAX_ANSWER_LENGTH),
  category: z.string().trim().max(100).nullable().optional(),
  aliases: z.array(z.string().trim().max(CUSTOMER_SUPPORT_LIMITS.MAX_ALIAS_LENGTH)).max(CUSTOMER_SUPPORT_LIMITS.MAX_ALIASES).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  language: z.string().trim().max(10).optional(),
  relatedLink: z.string().trim().max(300).nullable().optional(),
});

export const updateFaqSchema = faqInputSchema.partial();

export const createManualKnowledgeSourceSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().trim().min(1).max(50_000),
  language: z.string().trim().max(10).optional(),
  excerpt: z.string().trim().max(500).optional(),
});

export const syncKnowledgePathSchema = z.object({
  path: z.string().trim().min(1).max(200),
});

export const approveKnowledgeSourceSchema = z.object({
  visibility: z.enum(["PUBLIC", "INTERNAL"]).optional(),
});

export const claimPublicSiteSchema = z.object({
  hostname: z.string().trim().min(1).max(253),
});

export const updateCustomerSupportConfigSchema = z.object({
  agentName: z.string().trim().min(1).max(100).optional(),
  welcomeMessage: z.string().trim().min(1).max(500).optional(),
  buttonText: z.string().trim().min(1).max(50).optional(),
  suggestedQuestions: z.array(z.string().trim().max(200)).max(CUSTOMER_SUPPORT_LIMITS.MAX_SUGGESTED_QUESTIONS).optional(),
  language: z.string().trim().max(10).optional(),
  tone: z.enum(["NEUTRAL", "FRIENDLY", "FORMAL", "CONCISE"]).optional(),
  position: z.enum(["LEFT", "RIGHT"]).optional(),
  includedPaths: z.array(z.string().trim().max(200)).max(CUSTOMER_SUPPORT_LIMITS.MAX_INCLUDED_PATHS).optional(),
  excludedPaths: z.array(z.string().trim().max(200)).max(CUSTOMER_SUPPORT_LIMITS.MAX_EXCLUDED_PATHS).optional(),
  allowedDomains: z.array(z.string().trim().max(200)).max(CUSTOMER_SUPPORT_LIMITS.MAX_ALLOWED_DOMAINS).optional(),
  offHoursMessage: z.string().trim().max(500).nullable().optional(),
  humanHandoffEnabled: z.boolean().optional(),
  maxMessagesPerConversation: z.number().int().min(CUSTOMER_SUPPORT_LIMITS.MIN_MESSAGES_PER_CONVERSATION).max(CUSTOMER_SUPPORT_LIMITS.MAX_MESSAGES_PER_CONVERSATION).optional(),
  retentionDays: z.number().int().min(CUSTOMER_SUPPORT_LIMITS.MIN_RETENTION_DAYS).max(CUSTOMER_SUPPORT_LIMITS.MAX_RETENTION_DAYS).optional(),
  privacyText: z.string().trim().min(1).max(1000).optional(),
  appearanceTheme: z.enum(["DEFAULT", "MINIMAL", "BOLD"]).optional(),
});

export const testAgentSchema = z.object({
  question: z.string().trim().min(1).max(CUSTOMER_SUPPORT_LIMITS.MAX_MESSAGE_LENGTH),
});

export const assignHandoffSchema = z.object({ assignedToId: z.string().trim().min(1) });
export const addHandoffNoteSchema = z.object({ note: z.string().trim().min(1).max(CUSTOMER_SUPPORT_LIMITS.HANDOFF_NOTE_MAX_LENGTH) });
export const updateHandoffStatusSchema = z.object({ status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]) });

export const conversationFilterSchema = z.object({
  status: z.enum(["ACTIVE", "RESOLVED", "ESCALATED", "CLOSED"]).optional(),
  category: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  escalated: z.boolean().optional(),
  originPage: z.string().max(300).optional(),
  resolvedByFaq: z.boolean().optional(),
  resolvedByAi: z.boolean().optional(),
  positiveFeedback: z.boolean().optional(),
  negativeFeedback: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const handoffFilterSchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedToId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const faqFilterSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  category: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  search: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

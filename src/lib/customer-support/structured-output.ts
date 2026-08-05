import { z } from "zod";

/**
 * The final structured chat response shape (spec section 16). The server
 * ALWAYS builds this itself from real, already-computed values (evidence
 * level, matched FAQ id, retrieved knowledge ids, deterministic category) -
 * never from fields the AI chose. The AI (when invoked at all) only ever
 * contributes the free-text `answer` string; everything else here is
 * assembled by src/server/services/customer-support-chat.ts after the AI
 * step (or instead of it, for FAQ/KNOWLEDGE/FALLBACK responses).
 */

export const CUSTOMER_SUPPORT_RESPONSE_TYPES = ["FAQ", "KNOWLEDGE", "AI_ASSISTED", "FALLBACK"] as const;
export const CUSTOMER_SUPPORT_EVIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW", "NONE"] as const;

export const customerSupportSourceSchema = z.object({
  type: z.enum(["FAQ", "KNOWLEDGE"]),
  id: z.string().min(1),
  title: z.string().min(1).max(300),
  link: z.string().max(300).nullable(),
});

export const customerSupportChatResponseSchema = z.object({
  answer: z.string().min(1).max(4000),
  evidence: z.enum(CUSTOMER_SUPPORT_EVIDENCE_LEVELS),
  sources: z.array(customerSupportSourceSchema).max(5),
  links: z.array(z.string().max(300)).max(5),
  category: z.string().max(100).nullable(),
  suggestions: z.array(z.string().max(200)).max(4),
  needsHuman: z.boolean(),
  humanReason: z.string().max(300).nullable(),
  responseType: z.enum(CUSTOMER_SUPPORT_RESPONSE_TYPES),
  conversationPublicId: z.string().min(1),
  messageId: z.string().min(1),
});

export type CustomerSupportChatResponse = z.infer<typeof customerSupportChatResponseSchema>;
export type CustomerSupportSource = z.infer<typeof customerSupportSourceSchema>;

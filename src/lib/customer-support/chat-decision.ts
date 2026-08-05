import type { FaqMatchResult } from "@/lib/customer-support/faq-match";
import type { KnowledgeSearchHit } from "@/lib/customer-support/knowledge-search";
import { isDeterministicallyAnswerable, requiresFallback, type EvidenceLevel } from "@/lib/customer-support/evidence";
import { fenceRetrievedKnowledge, CUSTOMER_SUPPORT_SYSTEM_INSTRUCTIONS } from "@/lib/customer-support/prompt-injection";
import { CUSTOMER_SUPPORT_LIMITS } from "@/lib/customer-support/limits";
import type { CustomerSupportSource } from "@/lib/customer-support/structured-output";

/**
 * The deterministic "brain" of the customer support agent (Fase 40 spec
 * sections 10, 14-16, 24) - decides FAQ vs KNOWLEDGE vs AI_ASSISTED vs
 * FALLBACK, and builds every field of the final response EXCEPT the raw
 * AI-generated answer text itself. Pure - no database access, so it's
 * directly unit-testable (see src/server/services/customer-support-chat.ts
 * for the thin DB-touching wrapper, buildChatTurnContext, that gathers the
 * real FAQ/knowledge candidates this module decides over). Used identically
 * by both entry points (in-dashboard test mode via the real orchestrator,
 * and the public widget endpoint) - there is exactly ONE implementation of
 * "how do we answer a support question."
 */

const FALLBACK_ANSWER = "No encontre informacion suficiente para responder esto con seguridad. Puedes solicitar atencion humana y un miembro del equipo te ayudara.";

export interface ChatTurnContext {
  faqMatch: FaqMatchResult | null;
  matchedFaq: { id: string; question: string; answer: string; category: string | null; relatedLink: string | null } | null;
  knowledgeHits: KnowledgeSearchHit[];
  knowledgeById: Map<string, { id: string; title: string; sourceRef: string }>;
  evidence: EvidenceLevel;
  suggestions: string[];
}

export interface DeterministicAnswer {
  kind: "DETERMINISTIC";
  /** "AI_ASSISTED" only ever appears here AFTER finalizeAiAnswer has already resolved a NeedsGenerationAnswer — decideChatResponse itself never produces it directly. */
  responseType: "FAQ" | "KNOWLEDGE" | "FALLBACK" | "AI_ASSISTED";
  answer: string;
  evidence: EvidenceLevel;
  sources: CustomerSupportSource[];
  links: string[];
  category: string | null;
  suggestions: string[];
  needsHuman: boolean;
  humanReason: string | null;
}

export interface NeedsGenerationAnswer {
  kind: "NEEDS_GENERATION";
  evidence: EvidenceLevel;
  systemPrompt: string;
  userPrompt: string;
  sources: CustomerSupportSource[];
  links: string[];
  category: string | null;
  suggestions: string[];
}

function sourcesFromKnowledgeHits(ctx: ChatTurnContext, hits: KnowledgeSearchHit[]): CustomerSupportSource[] {
  return hits
    .map((h) => ctx.knowledgeById.get(h.id))
    .filter((k): k is { id: string; title: string; sourceRef: string } => Boolean(k))
    .slice(0, CUSTOMER_SUPPORT_LIMITS.MAX_LINKS_PER_ANSWER)
    .map((k) => ({ type: "KNOWLEDGE" as const, id: k.id, title: k.title, link: k.sourceRef.startsWith("/") ? k.sourceRef : null }));
}

/** Decides the response - deterministic when possible, or a generation request the caller must fulfill via the local AI engine + finalizeAiAnswer below (spec section 24's order: FAQ -> strong knowledge -> local AI -> fallback). */
export function decideChatResponse(ctx: ChatTurnContext, question: string, clientSupportsLocalAI: boolean): DeterministicAnswer | NeedsGenerationAnswer {
  if (isDeterministicallyAnswerable(ctx.faqMatch) && ctx.matchedFaq) {
    const links = ctx.matchedFaq.relatedLink ? [ctx.matchedFaq.relatedLink] : [];
    return {
      kind: "DETERMINISTIC",
      responseType: "FAQ",
      answer: ctx.matchedFaq.answer,
      evidence: "HIGH",
      sources: [{ type: "FAQ", id: ctx.matchedFaq.id, title: ctx.matchedFaq.question, link: ctx.matchedFaq.relatedLink }],
      links,
      category: ctx.matchedFaq.category,
      suggestions: ctx.suggestions,
      needsHuman: false,
      humanReason: null,
    };
  }

  if (requiresFallback(ctx.evidence)) {
    return {
      kind: "DETERMINISTIC",
      responseType: "FALLBACK",
      answer: FALLBACK_ANSWER,
      evidence: "NONE",
      sources: [],
      links: [],
      category: null,
      suggestions: ctx.suggestions,
      needsHuman: true,
      humanReason: "No se encontro informacion aprobada suficiente para esta pregunta.",
    };
  }

  const topHits = ctx.knowledgeHits.slice(0, CUSTOMER_SUPPORT_LIMITS.MAX_KNOWLEDGE_FRAGMENTS);
  const sources = sourcesFromKnowledgeHits(ctx, topHits);
  const links = sources.map((s) => s.link).filter((l): l is string => Boolean(l));

  // Strong OR weak (LOW) knowledge evidence, or the client can't run local AI - answer deterministically
  // from the fragment(s) themselves, never invent phrasing (spec section 24: FAQ/search must keep working
  // without WebGPU). Only genuinely MEDIUM evidence is worth an AI-synthesized answer below.
  if (ctx.evidence === "HIGH" || ctx.evidence === "LOW" || !clientSupportsLocalAI) {
    const disclaimer = ctx.evidence === "LOW" ? "La informacion encontrada es limitada, puede no cubrir tu caso exacto.\n\n" : "";
    const body = topHits.map((h, i) => `${i + 1}. ${h.snippet}`).join("\n\n");
    return {
      kind: "DETERMINISTIC",
      responseType: "KNOWLEDGE",
      answer: disclaimer + (body || FALLBACK_ANSWER),
      evidence: ctx.evidence,
      sources,
      links,
      category: null,
      suggestions: ctx.suggestions,
      needsHuman: ctx.evidence === "LOW",
      humanReason: ctx.evidence === "LOW" ? "La informacion encontrada es limitada." : null,
    };
  }

  // MEDIUM evidence, client supports local AI - worth an AI-synthesized answer grounded in the retrieved fragments.
  const knowledgeBlock = fenceRetrievedKnowledge(topHits.map((h, i) => ({ title: sources[i]?.title ?? `Fuente ${i + 1}`, text: h.snippet })));
  const userPrompt = [knowledgeBlock, `Pregunta del visitante: ${question}`].filter(Boolean).join("\n\n");
  return {
    kind: "NEEDS_GENERATION",
    evidence: ctx.evidence,
    systemPrompt: CUSTOMER_SUPPORT_SYSTEM_INSTRUCTIONS,
    userPrompt,
    sources,
    links,
    category: null,
    suggestions: ctx.suggestions,
  };
}

export function finalizeAiAnswer(pending: NeedsGenerationAnswer, aiText: string): DeterministicAnswer {
  return {
    kind: "DETERMINISTIC",
    responseType: "AI_ASSISTED",
    answer: aiText.trim().slice(0, CUSTOMER_SUPPORT_LIMITS.MAX_ANSWER_LENGTH),
    evidence: pending.evidence,
    sources: pending.sources,
    links: pending.links,
    category: pending.category,
    suggestions: pending.suggestions,
    needsHuman: false,
    humanReason: null,
  };
}

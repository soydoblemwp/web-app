import type { FaqMatchResult } from "@/lib/customer-support/faq-match";
import type { KnowledgeSearchHit } from "@/lib/customer-support/knowledge-search";

/**
 * Deterministic evidence scoring (spec section 15) - HIGH/MEDIUM/LOW/NONE,
 * computed purely from real signals (FAQ match strength, number/score of
 * matching knowledge fragments). The AI is never given this decision to
 * make or override - it only ever sees the level this function already
 * computed (spec: "la IA no puede cambiar el nivel calculado").
 */

export type EvidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface EvidenceInput {
  faqMatch: FaqMatchResult | null;
  knowledgeHits: KnowledgeSearchHit[];
}

const STRONG_KNOWLEDGE_SCORE = 0.6;
const MODERATE_KNOWLEDGE_SCORE = 0.35;

export function computeEvidence(input: EvidenceInput): EvidenceLevel {
  if (input.faqMatch?.strength === "EXACT" || input.faqMatch?.strength === "ALIAS") return "HIGH";

  const topKnowledgeScore = input.knowledgeHits[0]?.score ?? 0;
  const multipleCorroboratingSources = input.knowledgeHits.filter((h) => h.score >= MODERATE_KNOWLEDGE_SCORE).length >= 2;

  if (input.faqMatch?.strength === "PARTIAL" && input.faqMatch.score >= 0.75) return "HIGH";

  if (topKnowledgeScore >= STRONG_KNOWLEDGE_SCORE || (input.faqMatch?.strength === "PARTIAL" && multipleCorroboratingSources)) return "HIGH";

  if (input.faqMatch?.strength === "PARTIAL" || topKnowledgeScore >= MODERATE_KNOWLEDGE_SCORE) return "MEDIUM";

  if (topKnowledgeScore > 0) return "LOW";

  return "NONE";
}

/** Whether evidence is strong enough to skip AI generation entirely and answer deterministically (spec section 10: "no invoques IA innecesariamente"). */
export function isDeterministicallyAnswerable(faqMatch: FaqMatchResult | null): boolean {
  return faqMatch?.strength === "EXACT" || faqMatch?.strength === "ALIAS";
}

/** Whether a NONE/LOW evidence level should route straight to the fallback + human-handoff offer, never inventing an answer (spec section 15). */
export function requiresFallback(level: EvidenceLevel): boolean {
  return level === "NONE";
}

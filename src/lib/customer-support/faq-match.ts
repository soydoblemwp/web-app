import { normalizeForMatch, tokenize } from "@/lib/customer-support/sanitize";
import { CUSTOMER_SUPPORT_LIMITS } from "@/lib/customer-support/limits";

/**
 * Deterministic FAQ matching (spec sections 10, 14) - exact text, normalized
 * text, aliases, category/priority/language as tie-breakers. Never a
 * semantic/embedding match (spec: "no declares busqueda semantica si no
 * existe realmente"). Pure - no I/O, no randomness, identical input always
 * yields an identical result.
 */

export interface FaqCandidate {
  id: string;
  question: string;
  aliases: string[];
  category: string | null;
  priority: number;
  language: string;
}

export type FaqMatchStrength = "EXACT" | "ALIAS" | "PARTIAL";

export interface FaqMatchResult {
  id: string;
  strength: FaqMatchStrength;
  score: number;
}

function overlapScore(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  const candidateSet = new Set(candidateTokens);
  const overlap = queryTokens.filter((t) => candidateSet.has(t)).length;
  // Symmetric-ish coverage: how much of the (shorter, meaningful) side is actually covered.
  return overlap / Math.max(queryTokens.length, candidateTokens.length);
}

const PARTIAL_MATCH_THRESHOLD = 0.5;

/**
 * Returns the single best PUBLISHED FAQ match for a query, or null when
 * nothing clears the deterministic threshold - never returns a "best effort"
 * weak guess (spec section 10: "cuando exista una coincidencia FUERTE").
 */
export function matchFaq(query: string, candidates: FaqCandidate[], language?: string): FaqMatchResult | null {
  const normalizedQuery = normalizeForMatch(query);
  if (!normalizedQuery) return null;
  const queryTokens = tokenize(query);

  let best: FaqMatchResult | null = null;

  for (const candidate of candidates.slice(0, CUSTOMER_SUPPORT_LIMITS.MAX_FAQ_CANDIDATES * 20)) {
    const normalizedQuestion = normalizeForMatch(candidate.question);
    const languageBonus = language && candidate.language === language ? 0.02 : 0;
    const priorityBonus = Math.min(candidate.priority, 10) * 0.001;

    if (normalizedQuestion === normalizedQuery) {
      const result: FaqMatchResult = { id: candidate.id, strength: "EXACT", score: 1 + priorityBonus };
      if (!best || result.score > best.score) best = result;
      continue;
    }

    const aliasExactHit = candidate.aliases.some((alias) => normalizeForMatch(alias) === normalizedQuery);
    if (aliasExactHit) {
      const result: FaqMatchResult = { id: candidate.id, strength: "ALIAS", score: 0.95 + priorityBonus };
      if (!best || result.score > best.score) best = result;
      continue;
    }

    const questionTokens = tokenize(candidate.question);
    const questionOverlap = overlapScore(queryTokens, questionTokens);
    const aliasOverlap = Math.max(0, ...candidate.aliases.map((alias) => overlapScore(queryTokens, tokenize(alias))), 0);
    const overlap = Math.max(questionOverlap, aliasOverlap);

    if (overlap >= PARTIAL_MATCH_THRESHOLD) {
      const result: FaqMatchResult = { id: candidate.id, strength: "PARTIAL", score: overlap + languageBonus + priorityBonus };
      if (!best || result.score > best.score) best = result;
    }
  }

  return best;
}

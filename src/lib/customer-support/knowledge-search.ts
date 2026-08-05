import { normalizeForMatch, tokenize } from "@/lib/customer-support/sanitize";
import { CUSTOMER_SUPPORT_LIMITS } from "@/lib/customer-support/limits";

/**
 * Deterministic knowledge-fragment retrieval (spec section 14) - textual
 * token overlap plus recency, never semantic/embeddings/a vector database
 * (spec: "no anadas un proveedor externo de embeddings; no conectes una base
 * vectorial externa"). Ranking is fully deterministic: identical input
 * always produces identical order.
 */

export interface KnowledgeCandidate {
  id: string;
  title: string;
  excerpt: string | null;
  normalizedContent: string;
  language: string;
  lastUpdatedAt: Date;
}

export interface KnowledgeSearchHit {
  id: string;
  score: number;
  snippet: string;
}

function recencyBonus(lastUpdatedAt: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - lastUpdatedAt.getTime()) / 86_400_000);
  if (ageDays <= 30) return 0.05;
  if (ageDays <= 180) return 0.02;
  return 0;
}

/** Builds a short, honest snippet around the first matched token - never an AI-generated summary. */
function buildSnippet(content: string, queryTokens: string[]): string {
  const normalized = normalizeForMatch(content);
  let bestIndex = -1;
  for (const token of queryTokens) {
    const idx = normalized.indexOf(token);
    if (idx >= 0 && (bestIndex === -1 || idx < bestIndex)) bestIndex = idx;
  }
  const start = bestIndex >= 0 ? Math.max(0, bestIndex - 80) : 0;
  const raw = content.slice(start, start + CUSTOMER_SUPPORT_LIMITS.MAX_FRAGMENT_CHARS);
  return (start > 0 ? "... " : "") + raw.trim() + (start + raw.length < content.length ? " ..." : "");
}

/** Ranks APPROVED+PUBLIC knowledge sources against a query. Returns at most `limit` hits, deterministically ordered (score desc, then id asc as a stable tiebreak). */
export function searchKnowledgeCandidates(query: string, candidates: KnowledgeCandidate[], now: Date = new Date(), limit: number = CUSTOMER_SUPPORT_LIMITS.MAX_KNOWLEDGE_FRAGMENTS): KnowledgeSearchHit[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  const queryTokenSet = new Set(queryTokens);

  const scored = candidates.map((candidate) => {
    const contentTokens = tokenize(candidate.normalizedContent);
    const titleTokens = tokenize(candidate.title);
    const contentSet = new Set(contentTokens);
    const titleSet = new Set(titleTokens);

    const contentOverlap = queryTokens.filter((t) => contentSet.has(t)).length / queryTokenSet.size;
    const titleOverlap = queryTokens.filter((t) => titleSet.has(t)).length / queryTokenSet.size;

    // Recency is only ever a tie-breaker among ALREADY-relevant fragments — it must never single-handedly
    // surface a fragment with zero real token overlap (a document isn't "relevant" just for being new).
    const hasRealOverlap = contentOverlap > 0 || titleOverlap > 0;
    const score = contentOverlap * 1 + titleOverlap * 0.5 + (hasRealOverlap ? recencyBonus(candidate.lastUpdatedAt, now) : 0);
    return { candidate, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.candidate.id.localeCompare(b.candidate.id)))
    .slice(0, limit)
    .map((s) => ({ id: s.candidate.id, score: s.score, snippet: buildSnippet(s.candidate.normalizedContent, queryTokens) }));
}

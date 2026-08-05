import type { KnowledgeSourceFormat } from "@/lib/knowledge/types";

/**
 * Search — real, professional TEXTUAL search only (spec section 14): exact
 * terms, title/heading boosts, and Postgres full-text ranking (ts_rank on
 * the generated tsvector column — see prisma/schema.prisma's
 * KnowledgeChunk.searchVector). This app's only AI engine is the local,
 * client-side WebLLM model (see src/lib/ai/local/engine.ts) — it has no
 * embeddings endpoint, so there is NO real semantic search available.
 * `isSemanticSearchAvailable()` exists precisely so nothing downstream ever
 * claims otherwise; when a real embeddings-capable provider exists, a
 * `semanticSearch()` sibling can be added here without touching the text
 * path (spec: "crea una interfaz preparada para embeddings futuros; no
 * simules búsqueda semántica").
 */
export function isSemanticSearchAvailable(): boolean {
  return false;
}

export interface KnowledgeSearchFilters {
  projectId: string;
  query: string;
  collectionIds?: string[];
  sourceIds?: string[];
  formats?: KnowledgeSourceFormat[];
  includeArchived?: boolean;
  limit?: number;
}

/** Deterministic hybrid-score combinator (spec section 14: relevancia + título/encabezados + fecha) applied AFTER the SQL ts_rank query returns candidates — see src/server/services/knowledge-search.ts for the query itself. */
export function computeHybridScore(input: { tsRank: number; titleBoost: boolean; headingBoost: boolean; ageDays: number | null }): number {
  let score = input.tsRank * 10;
  if (input.titleBoost) score += 2;
  if (input.headingBoost) score += 1;
  if (input.ageDays !== null) score += Math.max(0, 1 - input.ageDays / 365) * 0.5;
  return Math.round(score * 1000) / 1000;
}

/** websearch_to_tsquery already tolerates arbitrary user input safely when passed as a bind parameter — this just guards against an empty/whitespace-only query reaching the DB. */
export function isSearchableQuery(query: string): boolean {
  return query.trim().length > 0;
}

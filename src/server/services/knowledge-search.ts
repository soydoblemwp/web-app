import "server-only";
import { prisma } from "@/lib/db/prisma";
import { computeHybridScore, isSearchableQuery } from "@/lib/knowledge/search";
import type { KnowledgeSourceFormat } from "@/lib/knowledge/types";

export interface KnowledgeSearchHit {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  format: string;
  heading: string | null;
  page: number | null;
  locationLabel: string | null;
  snippet: string;
  score: number;
}

export interface KnowledgeSearchParams {
  projectId: string;
  query: string;
  collectionIds?: string[];
  sourceIds?: string[];
  formats?: KnowledgeSourceFormat[];
  includeArchived?: boolean;
  limit?: number;
}

interface RawSearchRow {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  format: string;
  heading: string | null;
  page: number | null;
  locationLabel: string | null;
  text: string;
  tsRank: number;
  createdAt: Date;
}

/**
 * Real Postgres full-text search — no extension required (the GIN index sits
 * on a generated tsvector column, see prisma/schema.prisma). Deliberately
 * project-scoped inside the SQL itself (never filtered only in application
 * code) so a bug elsewhere can never leak another project's chunks (spec
 * section 33). Combines ts_rank with title/heading boosts and recency — a
 * real hybrid textual ranking, never called "semantic" (spec section 14).
 */
export async function searchKnowledge(params: KnowledgeSearchParams): Promise<KnowledgeSearchHit[]> {
  if (!isSearchableQuery(params.query)) return [];
  const limit = Math.min(params.limit ?? 20, 50);

  const sourceIds = params.sourceIds?.length ? params.sourceIds : undefined;
  const collectionIds = params.collectionIds?.length ? params.collectionIds : undefined;

  const rows = await prisma.$queryRaw<RawSearchRow[]>`
    SELECT c.id AS "chunkId", c."sourceId", s.title AS "sourceTitle", s.format::text AS format,
           c.heading, c.page, c."locationLabel", c.text,
           ts_rank(c."searchVector", websearch_to_tsquery('spanish', ${params.query})) AS "tsRank",
           c."createdAt"
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeSource" s ON s.id = c."sourceId"
    WHERE s."projectId" = ${params.projectId}
      AND c.status = 'READY'
      AND (${params.includeArchived ?? false} OR s."isArchived" = false)
      AND c."searchVector" @@ websearch_to_tsquery('spanish', ${params.query})
      AND (${sourceIds ?? null}::text[] IS NULL OR c."sourceId" = ANY(${sourceIds ?? null}::text[]))
      AND (${collectionIds ?? null}::text[] IS NULL OR EXISTS (
        SELECT 1 FROM "KnowledgeCollectionSource" kcs WHERE kcs."sourceId" = c."sourceId" AND kcs."collectionId" = ANY(${collectionIds ?? null}::text[])
      ))
    ORDER BY "tsRank" DESC
    LIMIT ${limit * 3}
  `;

  const queryWords = params.query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const filtered = params.formats?.length ? rows.filter((r) => params.formats!.includes(r.format as KnowledgeSourceFormat)) : rows;

  const now = Date.now();
  const scored = filtered.map((row) => {
    const titleLower = row.sourceTitle.toLowerCase();
    const headingLower = (row.heading ?? "").toLowerCase();
    const titleBoost = queryWords.some((w) => titleLower.includes(w));
    const headingBoost = queryWords.some((w) => headingLower.includes(w));
    const ageDays = (now - row.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const score = computeHybridScore({ tsRank: row.tsRank, titleBoost, headingBoost, ageDays });
    const snippet = row.text.length > 400 ? `${row.text.slice(0, 400)}…` : row.text;
    return { chunkId: row.chunkId, sourceId: row.sourceId, sourceTitle: row.sourceTitle, format: row.format, heading: row.heading, page: row.page, locationLabel: row.locationLabel, snippet, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

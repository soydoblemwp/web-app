import "server-only";
import { prisma } from "@/lib/db/prisma";
import { searchKnowledge } from "@/server/services/knowledge-search";

export interface KnowledgeContextItem {
  origin: string;
  label: string;
  content: string;
  sourceId: string;
  chunkId: string;
  locationLabel: string | null;
}

/**
 * Shared knowledge-retrieval-for-context function — reused by AI Agent
 * Studio's context builder, the AI Workflows "knowledge" step, and Marketing
 * Brain's optional per-stage context layer (spec sections 23/27/29: never a
 * second retrieval implementation). Every collection/source id is
 * re-validated against `projectId` here; an agent/workflow/stage never gets
 * implicit access to every collection — only what was explicitly selected
 * (spec section 23: "debe recibir alcance explícito").
 */
export async function resolveKnowledgeContext(
  projectId: string,
  params: { collectionIds?: string[]; sourceIds?: string[]; query?: string; limit?: number }
): Promise<KnowledgeContextItem[]> {
  const collectionIds = params.collectionIds?.length ? params.collectionIds : undefined;
  const sourceIds = params.sourceIds?.length ? params.sourceIds : undefined;
  if (!collectionIds && !sourceIds) return [];

  const limit = params.limit ?? 8;

  if (params.query && params.query.trim()) {
    const hits = await searchKnowledge({ projectId, query: params.query, collectionIds, sourceIds, limit });
    return hits.map((h) => ({ origin: "Knowledge Base", label: `${h.sourceTitle}${h.locationLabel ? ` — ${h.locationLabel}` : ""}`, content: h.snippet, sourceId: h.sourceId, chunkId: h.chunkId, locationLabel: h.locationLabel }));
  }

  // No query: a plain "overview" pull — the first few READY chunks of each authorized source, in document order (never ranked, since there's nothing to rank against).
  const ownedSourceIds = new Set<string>();
  if (sourceIds) {
    const owned = await prisma.knowledgeSource.findMany({ where: { id: { in: sourceIds }, projectId }, select: { id: true } });
    owned.forEach((s) => ownedSourceIds.add(s.id));
  }
  if (collectionIds) {
    const owned = await prisma.knowledgeCollection.findMany({ where: { id: { in: collectionIds }, projectId }, include: { sources: { select: { sourceId: true } } } });
    owned.forEach((c) => c.sources.forEach((s) => ownedSourceIds.add(s.sourceId)));
  }
  if (ownedSourceIds.size === 0) return [];

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { sourceId: { in: [...ownedSourceIds] }, status: "READY" },
    orderBy: [{ sourceId: "asc" }, { order: "asc" }],
    include: { version: { include: { source: { select: { title: true } } } } },
    take: limit,
  });

  return chunks.map((c) => ({
    origin: "Knowledge Base",
    label: `${c.version.source.title}${c.locationLabel ? ` — ${c.locationLabel}` : ""}`,
    content: c.text,
    sourceId: c.sourceId,
    chunkId: c.id,
    locationLabel: c.locationLabel,
  }));
}

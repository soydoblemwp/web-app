import "server-only";
import { prisma } from "@/lib/db/prisma";

const SNAPSHOT_MAX_CHARS = 600;

/** Inserting a citation into a ContentItem from the AI Editor Pro Knowledge panel (spec section 25) — snapshots the quote/title/location directly onto the row so it stays meaningful even if the source is later deleted (spec section 34). Both ids are re-validated against this project, never trusted from the client. */
export async function insertContentCitation(projectId: string, userId: string, input: { contentItemId: string; chunkId: string; citationType: "DIRECT" | "CONTEXTUAL" }) {
  const [item, chunk] = await Promise.all([
    prisma.contentItem.findUnique({ where: { id: input.contentItemId } }),
    prisma.knowledgeChunk.findUnique({ where: { id: input.chunkId }, include: { version: { include: { source: true } } } }),
  ]);
  if (!item || item.projectId !== projectId) return null;
  if (!chunk || chunk.version.source.projectId !== projectId) return null;

  return prisma.contentKnowledgeCitation.create({
    data: {
      contentItemId: input.contentItemId,
      chunkId: chunk.id,
      sourceId: chunk.version.source.id,
      insertedById: userId,
      citationType: input.citationType,
      quoteSnapshot: chunk.text.slice(0, SNAPSHOT_MAX_CHARS),
      sourceTitleSnapshot: chunk.version.source.title,
      locationLabel: chunk.locationLabel,
    },
  });
}

export async function listContentCitations(projectId: string, contentItemId: string) {
  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item || item.projectId !== projectId) return [];
  return prisma.contentKnowledgeCitation.findMany({ where: { contentItemId }, orderBy: { createdAt: "desc" } });
}

export async function deleteContentCitation(projectId: string, citationId: string) {
  const citation = await prisma.contentKnowledgeCitation.findUnique({ where: { id: citationId }, include: { contentItem: true } });
  if (!citation || citation.contentItem.projectId !== projectId) return false;
  await prisma.contentKnowledgeCitation.delete({ where: { id: citationId } });
  return true;
}

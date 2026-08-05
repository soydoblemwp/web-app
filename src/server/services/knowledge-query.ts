import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { searchKnowledge } from "@/server/services/knowledge-search";
import { buildKnowledgeAnswerPrompt, parseKnowledgeAnswer, type KnowledgeAnswerChunk } from "@/lib/knowledge/answer-prompt";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import { KNOWLEDGE_ERROR_MESSAGES } from "@/lib/knowledge/types";
import type { z } from "zod";
import type { createKnowledgeQuerySchema } from "@/lib/validation/knowledge";

type CreateKnowledgeQuerySchemaInput = z.infer<typeof createKnowledgeQuerySchema>;

const RETRIEVAL_MULTIPLIER = 3;

async function resolveOwnedFilters(projectId: string, collectionIds: string[], sourceIds: string[]) {
  const [ownedCollections, ownedSources] = await Promise.all([
    collectionIds.length ? prisma.knowledgeCollection.findMany({ where: { id: { in: collectionIds }, projectId }, select: { id: true } }) : Promise.resolve([]),
    sourceIds.length ? prisma.knowledgeSource.findMany({ where: { id: { in: sourceIds }, projectId }, select: { id: true } }) : Promise.resolve([]),
  ]);
  return { collectionIds: ownedCollections.map((c) => c.id), sourceIds: ownedSources.map((s) => s.id) };
}

export interface PreparedKnowledgeQuery {
  queryId: string;
  insufficientEvidence: boolean;
  ai?: { systemPrompt: string; userPrompt: string; executionToken: string };
}

/** Steps 1-8 of the controlled RAG flow (spec section 17): validate → resolve filters → search → dedupe/limit → build prompt. Never sends more than `maxSources` distinct sources' worth of fragments to the AI. */
export async function prepareKnowledgeQuery(projectId: string, userId: string, input: CreateKnowledgeQuerySchemaInput): Promise<PreparedKnowledgeQuery> {
  const { collectionIds, sourceIds } = await resolveOwnedFilters(projectId, input.collectionIds, input.sourceIds);

  let brandContext = "";
  if (input.brandProfileId) {
    const profile = await prisma.brandProfile.findUnique({ where: { id: input.brandProfileId } });
    if (profile && profile.userId === userId) brandContext = buildBrandProfileContext(profile);
  }

  const hits = await searchKnowledge({
    projectId,
    query: input.question,
    collectionIds: collectionIds.length ? collectionIds : undefined,
    sourceIds: sourceIds.length ? sourceIds : undefined,
    limit: input.maxSources * RETRIEVAL_MULTIPLIER,
  });

  // Cap by distinct SOURCE count (spec section 16: "limitar fuentes"), not just chunk count — keeps context minimal and traceable.
  const seenSources = new Set<string>();
  const selected: typeof hits = [];
  for (const hit of hits) {
    if (selected.length >= input.maxSources * 2) break;
    if (!seenSources.has(hit.sourceId) && seenSources.size >= input.maxSources) continue;
    seenSources.add(hit.sourceId);
    selected.push(hit);
  }

  const query = await prisma.knowledgeQuery.create({
    data: {
      projectId,
      askedById: userId,
      question: input.question,
      mode: input.mode,
      collectionIds,
      sourceIds,
      brandProfileId: input.brandProfileId ?? null,
      language: input.language ?? null,
      maxSources: input.maxSources,
      status: selected.length === 0 && input.mode === "SOURCES_ONLY" ? "COMPLETED" : "RUNNING",
    },
  });

  if (selected.length > 0) {
    await prisma.knowledgeQueryResult.createMany({
      data: selected.map((hit, index) => ({ queryId: query.id, chunkId: hit.chunkId, sourceId: hit.sourceId, rank: index + 1, score: hit.score, snippet: hit.snippet })),
    });
  }

  if (selected.length === 0 && input.mode === "SOURCES_ONLY") {
    await prisma.knowledgeQuery.update({
      where: { id: query.id },
      data: {
        answer: KNOWLEDGE_ERROR_MESSAGES.INSUFFICIENT_EVIDENCE,
        missingInfo: [input.question],
        generalKnowledgeUsed: false,
      },
    });
    return { queryId: query.id, insufficientEvidence: true };
  }

  const chunks: KnowledgeAnswerChunk[] = selected.map((hit, index) => ({
    label: index + 1,
    sourceTitle: hit.sourceTitle,
    locationLabel: hit.locationLabel ?? undefined,
    text: hit.snippet,
  }));

  const { systemPrompt, userPrompt } = buildKnowledgeAnswerPrompt({ question: input.question, mode: input.mode, language: input.language, chunks, brandContext });
  const executionToken = randomUUID();
  await prisma.knowledgeQuery.update({ where: { id: query.id }, data: { executionToken } });

  return { queryId: query.id, insufficientEvidence: false, ai: { systemPrompt, userPrompt, executionToken } };
}

const CITATION_MARKER_RE = /\[(\d+)\]/g;

function extractReferencedLabels(text: string): Set<number> {
  const labels = new Set<number>();
  let match: RegExpExecArray | null;
  CITATION_MARKER_RE.lastIndex = 0;
  while ((match = CITATION_MARKER_RE.exec(text))) labels.add(Number(match[1]));
  return labels;
}

/** Steps 9-13 (spec section 17): validate the AI's structured output, link real citations (never a citation for a source that wasn't actually retrieved — spec section 18), and persist. */
export async function completeKnowledgeQuery(projectId: string, queryId: string, rawOutput: string, executionToken: string) {
  const query = await prisma.knowledgeQuery.findUnique({ where: { id: queryId }, include: { results: { include: { chunk: { include: { version: { include: { source: true } } } } } } } });
  if (!query || query.projectId !== projectId) return { error: KNOWLEDGE_ERROR_MESSAGES.KNOWLEDGE_SOURCE_NOT_FOUND };
  if (query.executionToken !== executionToken) return { error: "Esta generación ya no es la más reciente." };

  const outcome = parseKnowledgeAnswer(rawOutput);
  if (outcome.status === "failed" || !outcome.output) {
    await prisma.knowledgeQuery.update({ where: { id: queryId }, data: { status: "FAILED", errorMessage: outcome.errorMessage, errorCategory: "AI", executionToken: null } });
    return { error: outcome.errorMessage ?? "La IA no devolvió una respuesta utilizable." };
  }

  const answer = String(outcome.output.answer ?? "");
  const supportedFacts = (outcome.output.supportedFacts as string[]) ?? [];
  const inferences = (outcome.output.inferences as string[]) ?? [];
  const recommendations = (outcome.output.recommendations as string[]) ?? [];
  const missingInfo = (outcome.output.missingInfo as string[]) ?? [];
  const generalKnowledgeUsed = query.mode === "SOURCES_PLUS_GENERAL" && answer.includes("[conocimiento general]");

  const referencedInAnswer = extractReferencedLabels(answer);
  const referencedInFacts = extractReferencedLabels(supportedFacts.join(" "));

  const citationsData = query.results
    .filter((r) => referencedInAnswer.has(r.rank) || referencedInFacts.has(r.rank))
    .map((r) => ({
      queryId,
      chunkId: r.chunkId,
      sourceId: r.sourceId,
      order: r.rank,
      label: `[${r.rank}]`,
      citationType: (referencedInFacts.has(r.rank) ? "DIRECT" : "CONTEXTUAL") as "DIRECT" | "CONTEXTUAL",
      quoteSnapshot: r.snippet,
      sourceTitleSnapshot: r.chunk?.version.source.title ?? "Fuente",
      locationLabel: r.chunk?.locationLabel ?? null,
    }));

  await prisma.$transaction([
    prisma.knowledgeQuery.update({
      where: { id: queryId },
      data: { status: "COMPLETED", answer, supportedFacts, inferences, recommendations, missingInfo, generalKnowledgeUsed, executionToken: null, errorMessage: null, errorCategory: null },
    }),
    ...(citationsData.length > 0 ? [prisma.knowledgeCitation.createMany({ data: citationsData })] : []),
  ]);

  return { ok: true };
}

export async function failKnowledgeQuery(projectId: string, queryId: string, executionToken: string, message: string) {
  const query = await prisma.knowledgeQuery.findUnique({ where: { id: queryId } });
  if (!query || query.projectId !== projectId || query.executionToken !== executionToken) return;
  await prisma.knowledgeQuery.update({ where: { id: queryId }, data: { status: "FAILED", errorMessage: message, errorCategory: "AI", executionToken: null } });
}

export async function listQueries(projectId: string, includeArchived = false) {
  return prisma.knowledgeQuery.findMany({
    where: { projectId, ...(includeArchived ? {} : { isArchived: false }) },
    orderBy: { createdAt: "desc" },
    include: { askedBy: { select: { id: true, name: true, email: true } }, _count: { select: { citations: true, results: true } } },
    take: 100,
  });
}

export async function getQuery(projectId: string, queryId: string) {
  const query = await prisma.knowledgeQuery.findUnique({
    where: { id: queryId },
    include: {
      citations: { orderBy: { order: "asc" } },
      results: { include: { chunk: { select: { id: true, heading: true, page: true, locationLabel: true } } }, orderBy: { rank: "asc" } },
      askedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!query || query.projectId !== projectId) return null;
  return query;
}

export async function setQueryArchived(projectId: string, queryId: string, archived: boolean) {
  const query = await prisma.knowledgeQuery.findUnique({ where: { id: queryId } });
  if (!query || query.projectId !== projectId) return null;
  return prisma.knowledgeQuery.update({ where: { id: queryId }, data: { isArchived: archived } });
}

export async function deleteQuery(projectId: string, queryId: string) {
  const query = await prisma.knowledgeQuery.findUnique({ where: { id: queryId } });
  if (!query || query.projectId !== projectId) return false;
  await prisma.knowledgeQuery.delete({ where: { id: queryId } });
  return true;
}

export interface SaveQueryAsContentItemOptions {
  mode: "create" | "update-empty" | "new-version" | "copy";
  contentItemId?: string;
  title?: string;
}

/** Never silently overwrites manual edits (spec section 16/21): "update-empty" only fills empty fields, "new-version" snapshots the prior body into ContentVersion first, "copy" always creates a fresh item. */
export async function saveQueryAsContentItem(projectId: string, userId: string, queryId: string, options: SaveQueryAsContentItemOptions) {
  const query = await prisma.knowledgeQuery.findUnique({ where: { id: queryId } });
  if (!query || query.projectId !== projectId || !query.answer) return { error: "No hay una respuesta guardable en esta consulta." };

  const title = options.title || query.question.slice(0, 150);
  const body = [query.answer, query.supportedFacts.length ? `\n\nHechos respaldados:\n${query.supportedFacts.map((f) => `- ${f}`).join("\n")}` : ""].join("");

  if (options.contentItemId && options.mode !== "copy") {
    const existing = await prisma.contentItem.findUnique({ where: { id: options.contentItemId } });
    if (!existing || existing.projectId !== projectId) return { error: "El contenido indicado no existe en este proyecto." };

    if (options.mode === "update-empty") {
      await prisma.contentItem.update({ where: { id: existing.id }, data: { title: existing.title || title, body: existing.body || body } });
      return { id: existing.id };
    }
    if (options.mode === "new-version") {
      await prisma.$transaction([
        prisma.contentVersion.create({ data: { contentItemId: existing.id, authorId: userId, title: existing.title, body: existing.body, note: "Antes de aplicar la respuesta de Knowledge Base" } }),
        prisma.contentItem.update({ where: { id: existing.id }, data: { title, body } }),
      ]);
      return { id: existing.id };
    }
  }

  const created = await prisma.contentItem.create({
    data: { projectId, authorId: userId, type: "OTHER", title: title.slice(0, 300), body, sourceTool: "knowledge-base" },
  });
  return { id: created.id };
}

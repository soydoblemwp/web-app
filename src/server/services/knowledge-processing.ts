import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getStorageProvider } from "@/lib/storage";
import { extractByFormat } from "@/lib/knowledge/extractors";
import { normalizeBlocks } from "@/lib/knowledge/normalize";
import { chunkBlocks } from "@/lib/knowledge/chunking";
import { KNOWLEDGE_ERROR_MESSAGES } from "@/lib/knowledge/types";
import type { ExtractedBlock, KnowledgeErrorCategoryValue, KnowledgeProcessingStage, KnowledgeSourceStatusValue } from "@/lib/knowledge/types";
import { publishAutomationEvent } from "@/server/services/automation-events";

type SourceRow = NonNullable<Awaited<ReturnType<typeof prisma.knowledgeSource.findUnique>>>;
type VersionRow = NonNullable<Awaited<ReturnType<typeof prisma.knowledgeSourceVersion.findUnique>>>;

const STAGE_ORDER: KnowledgeProcessingStage[] = ["REGISTER", "EXTRACT", "NORMALIZE", "CHUNK", "INDEX", "FINALIZE"];
const TERMINAL_STATUSES: KnowledgeSourceStatusValue[] = ["READY", "PARTIALLY_READY", "FAILED", "NEEDS_OCR", "ARCHIVED"];

const STAGE_RUNNING_STATUS: Record<KnowledgeProcessingStage, KnowledgeSourceStatusValue> = {
  REGISTER: "QUEUED",
  EXTRACT: "EXTRACTING",
  NORMALIZE: "NORMALIZING",
  CHUNK: "CHUNKING",
  INDEX: "INDEXING",
  FINALIZE: "INDEXING",
};

export interface ProcessStageResult {
  status: KnowledgeSourceStatusValue;
  stage?: KnowledgeProcessingStage | null;
  done: boolean;
  conflict?: boolean;
  errorMessage?: string;
}

/** Atomically claims exactly one stage for exactly one version — the concurrency guard against double-processing the same version from two requests/tabs (spec section 6/30). */
async function claimStage(versionId: string, stage: KnowledgeProcessingStage): Promise<string | null> {
  const token = randomUUID();
  const result = await prisma.knowledgeSourceVersion.updateMany({
    where: { id: versionId, currentStage: stage, executionToken: null },
    data: { executionToken: token, status: STAGE_RUNNING_STATUS[stage] },
  });
  return result.count === 1 ? token : null;
}

async function logAttempt(
  sourceId: string,
  versionId: string,
  stage: KnowledgeProcessingStage,
  status: "RUNNING" | "COMPLETED" | "FAILED",
  token: string,
  error?: { message: string; category: KnowledgeErrorCategoryValue }
) {
  await prisma.knowledgeProcessingAttempt.create({
    data: {
      sourceId,
      versionId,
      stage,
      status,
      executionToken: token,
      errorMessage: error?.message,
      errorCategory: error?.category,
      startedAt: status === "RUNNING" ? new Date() : undefined,
      completedAt: status !== "RUNNING" ? new Date() : undefined,
    },
  });
}

async function succeedStage(sourceId: string, versionId: string, stage: KnowledgeProcessingStage, token: string, versionUpdates: Prisma.KnowledgeSourceVersionUpdateInput, sourceStatus?: KnowledgeSourceStatusValue) {
  await prisma.knowledgeSourceVersion.updateMany({
    where: { id: versionId, executionToken: token },
    data: { ...versionUpdates, executionToken: null, attemptCount: { increment: 1 } },
  });
  if (sourceStatus) {
    const updated = await prisma.knowledgeSource.update({ where: { id: sourceId }, data: { status: sourceStatus, ...(sourceStatus === "READY" || sourceStatus === "PARTIALLY_READY" ? { lastErrorMessage: null, lastErrorCategory: null } : {}) } });
    if (sourceStatus === "READY" || sourceStatus === "PARTIALLY_READY") {
      await publishAutomationEvent({
        projectId: updated.projectId,
        eventKey: "knowledge_source.ready",
        resourceId: sourceId,
        payload: { id: sourceId, title: updated.title, status: sourceStatus, format: updated.format },
        idempotencyKey: `knowledge_source.ready:${sourceId}:${versionId}`,
      });
    }
  }
  await logAttempt(sourceId, versionId, stage, "COMPLETED", token);
}

async function failStage(
  sourceId: string,
  versionId: string,
  stage: KnowledgeProcessingStage,
  token: string,
  message: string,
  category: KnowledgeErrorCategoryValue,
  terminalStatus: "FAILED" | "NEEDS_OCR" = "FAILED"
) {
  await prisma.knowledgeSourceVersion.updateMany({
    where: { id: versionId, executionToken: token },
    data: { status: terminalStatus, currentStage: null, lastErrorMessage: message, lastErrorCategory: category, executionToken: null, attemptCount: { increment: 1 } },
  });
  const updated = await prisma.knowledgeSource.update({ where: { id: sourceId }, data: { status: terminalStatus, lastErrorMessage: message, lastErrorCategory: category } });
  await publishAutomationEvent({
    projectId: updated.projectId,
    eventKey: "knowledge_source.failed",
    resourceId: sourceId,
    payload: { id: sourceId, title: updated.title, status: terminalStatus },
    idempotencyKey: `knowledge_source.failed:${sourceId}:${versionId}:${stage}`,
  });
  await logAttempt(sourceId, versionId, stage, "FAILED", token, { message, category });
}

async function runExtractStage(source: SourceRow, version: VersionRow, token: string) {
  let buffer: Buffer | undefined;
  if (source.originType === "FILE") {
    if (!source.fileAssetId) return failStage(source.id, version.id, "EXTRACT", token, KNOWLEDGE_ERROR_MESSAGES.EXTRACTION_FAILED, "EXTRACTION");
    const fileAsset = await prisma.fileAsset.findUnique({ where: { id: source.fileAssetId } });
    if (!fileAsset) return failStage(source.id, version.id, "EXTRACT", token, KNOWLEDGE_ERROR_MESSAGES.EXTRACTION_FAILED, "EXTRACTION");
    try {
      buffer = await getStorageProvider().download(fileAsset.storageKey);
    } catch {
      return failStage(source.id, version.id, "EXTRACT", token, KNOWLEDGE_ERROR_MESSAGES.EXTRACTION_FAILED, "EXTRACTION");
    }
  }

  const result = await extractByFormat(source.format, { text: version.rawText ?? undefined, buffer });

  if (!result.ok) {
    return failStage(source.id, version.id, "EXTRACT", token, KNOWLEDGE_ERROR_MESSAGES.EXTRACTION_FAILED, "EXTRACTION");
  }
  if (result.needsOcr) {
    return failStage(source.id, version.id, "EXTRACT", token, KNOWLEDGE_ERROR_MESSAGES.OCR_REQUIRED, "EXTRACTION", "NEEDS_OCR");
  }
  if (result.blocks.length === 0 || !result.text.trim()) {
    return failStage(source.id, version.id, "EXTRACT", token, KNOWLEDGE_ERROR_MESSAGES.NO_EXTRACTABLE_TEXT, "EXTRACTION");
  }

  const existingMetadata = (version.metadata as Record<string, unknown> | null) ?? {};
  await succeedStage(source.id, version.id, "EXTRACT", token, {
    rawText: result.text,
    title: result.title ?? version.title,
    author: result.author ?? version.author,
    pageCount: result.pageCount,
    sectionCount: result.sectionCount,
    extractionMethod: result.method,
    extractionQuality: result.quality,
    warnings: result.warnings,
    metadata: { ...existingMetadata, ...result.metadata, blocks: result.blocks } as unknown as Prisma.InputJsonValue,
    currentStage: "NORMALIZE",
  });

  if (result.title && !source.title) {
    await prisma.knowledgeSource.update({ where: { id: source.id }, data: { title: result.title } });
  }
}

async function runNormalizeStage(source: SourceRow, version: VersionRow, token: string) {
  const metadata = (version.metadata as Record<string, unknown> | null) ?? {};
  const blocks = (metadata.blocks as ExtractedBlock[] | undefined) ?? [];
  if (blocks.length === 0) {
    return failStage(source.id, version.id, "NORMALIZE", token, KNOWLEDGE_ERROR_MESSAGES.NORMALIZATION_FAILED, "NORMALIZATION");
  }

  const normalized = normalizeBlocks(blocks);
  if (normalized.blocks.length === 0) {
    return failStage(source.id, version.id, "NORMALIZE", token, KNOWLEDGE_ERROR_MESSAGES.NORMALIZATION_FAILED, "NORMALIZATION");
  }

  await succeedStage(source.id, version.id, "NORMALIZE", token, {
    normalizedText: normalized.normalizedText,
    checksumNormalized: normalized.checksumNormalized,
    detectedLanguage: normalized.detectedLanguage,
    charCount: normalized.normalizedText.length,
    metadata: { ...metadata, blocks: normalized.blocks } as unknown as Prisma.InputJsonValue,
    currentStage: "CHUNK",
  });

  if (normalized.sensitiveWarning) {
    await prisma.knowledgeSource.update({ where: { id: source.id }, data: { sensitiveWarning: true } });
  }
}

async function runChunkStage(source: SourceRow, version: VersionRow, token: string) {
  const metadata = (version.metadata as Record<string, unknown> | null) ?? {};
  const blocks = (metadata.blocks as ExtractedBlock[] | undefined) ?? [];
  if (blocks.length === 0) {
    return failStage(source.id, version.id, "CHUNK", token, KNOWLEDGE_ERROR_MESSAGES.CHUNKING_FAILED, "CHUNKING");
  }

  const drafts = chunkBlocks(blocks);
  if (drafts.length === 0) {
    return failStage(source.id, version.id, "CHUNK", token, KNOWLEDGE_ERROR_MESSAGES.CHUNKING_FAILED, "CHUNKING");
  }

  await prisma.knowledgeChunk.deleteMany({ where: { versionId: version.id } });
  await prisma.knowledgeChunk.createMany({
    data: drafts.map((d) => ({
      sourceId: source.id,
      versionId: version.id,
      order: d.order,
      text: d.text,
      title: d.title,
      heading: d.heading,
      page: d.page,
      section: d.section,
      rowIndex: d.rowIndex,
      jsonPath: d.jsonPath,
      locationLabel: d.locationLabel,
      charStart: d.charStart,
      charEnd: d.charEnd,
      checksum: d.checksum,
      sizeChars: d.sizeChars,
      tokenEstimate: d.tokenEstimate,
      status: "PENDING",
    })),
  });

  await succeedStage(source.id, version.id, "CHUNK", token, { currentStage: "INDEX" });
}

async function runIndexStage(source: SourceRow, version: VersionRow, token: string) {
  const result = await prisma.knowledgeChunk.updateMany({ where: { versionId: version.id, status: "PENDING" }, data: { status: "READY" } });
  if (result.count === 0) {
    return failStage(source.id, version.id, "INDEX", token, KNOWLEDGE_ERROR_MESSAGES.INDEXING_FAILED, "INDEXING");
  }
  // searchVector is a Postgres GENERATED ALWAYS AS ... STORED column — it updates itself the instant "text" is written; nothing more to do here (spec section 15).
  await succeedStage(source.id, version.id, "INDEX", token, { currentStage: "FINALIZE" });
}

async function runFinalizeStage(source: SourceRow, version: VersionRow, token: string) {
  const [readyCount, totalCount] = await Promise.all([
    prisma.knowledgeChunk.count({ where: { versionId: version.id, status: "READY" } }),
    prisma.knowledgeChunk.count({ where: { versionId: version.id } }),
  ]);
  if (readyCount === 0) {
    return failStage(source.id, version.id, "FINALIZE", token, KNOWLEDGE_ERROR_MESSAGES.INDEXING_FAILED, "INDEXING");
  }
  const finalStatus: KnowledgeSourceStatusValue = readyCount === totalCount ? "READY" : "PARTIALLY_READY";
  await succeedStage(source.id, version.id, "FINALIZE", token, { status: finalStatus, currentStage: null }, finalStatus);
  await prisma.knowledgeSource.update({ where: { id: source.id }, data: { activeVersionId: version.id } });
}

/** Advances a KnowledgeSource's active version by exactly ONE processing stage — never one long-lived request; the caller (client driving loop, same pattern as AI Agent Studio's run panel) calls this repeatedly until `done`. */
export async function processNextStage(projectId: string, sourceId: string): Promise<ProcessStageResult> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.projectId !== projectId) return { status: "FAILED", done: true, errorMessage: KNOWLEDGE_ERROR_MESSAGES.KNOWLEDGE_SOURCE_NOT_FOUND };
  if (!source.activeVersionId) return { status: source.status, done: true, errorMessage: "Esta fuente no tiene una versión activa." };

  const version = await prisma.knowledgeSourceVersion.findUnique({ where: { id: source.activeVersionId } });
  if (!version) return { status: source.status, done: true };
  if (TERMINAL_STATUSES.includes(version.status)) return { status: version.status, done: true };
  if (!version.currentStage) return { status: version.status, done: true };

  const stage = version.currentStage;
  const token = await claimStage(version.id, stage);
  if (!token) {
    return { status: version.status, stage, done: false, conflict: true, errorMessage: KNOWLEDGE_ERROR_MESSAGES.PROCESSING_CONFLICT };
  }
  await logAttempt(sourceId, version.id, stage, "RUNNING", token);

  try {
    if (stage === "REGISTER") {
      await succeedStage(sourceId, version.id, "REGISTER", token, { currentStage: "EXTRACT" });
    } else if (stage === "EXTRACT") {
      await runExtractStage(source, version, token);
    } else if (stage === "NORMALIZE") {
      await runNormalizeStage(source, version, token);
    } else if (stage === "CHUNK") {
      await runChunkStage(source, version, token);
    } else if (stage === "INDEX") {
      await runIndexStage(source, version, token);
    } else if (stage === "FINALIZE") {
      await runFinalizeStage(source, version, token);
    }
  } catch {
    await failStage(sourceId, version.id, stage, token, "Ocurrió un error inesperado al procesar esta etapa.", "INTERNAL_SAFE");
  }

  const refreshedVersion = await prisma.knowledgeSourceVersion.findUnique({ where: { id: version.id } });
  const refreshedSource = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  const status = refreshedSource?.status ?? version.status;
  return { status, stage: refreshedVersion?.currentStage, done: TERMINAL_STATUSES.includes(status), errorMessage: refreshedSource?.lastErrorMessage ?? undefined };
}

/** Resets a FAILED/NEEDS_OCR version back to a specific stage and re-queues it — never touches already-valid chunks from a prior successful run of an EARLIER stage (spec section 31: "un error de un fragmento no debe eliminar los demás"). */
export async function retrySourceStage(projectId: string, sourceId: string, fromStage?: KnowledgeProcessingStage): Promise<{ ok: boolean; errorMessage?: string }> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.projectId !== projectId || !source.activeVersionId) return { ok: false, errorMessage: KNOWLEDGE_ERROR_MESSAGES.KNOWLEDGE_SOURCE_NOT_FOUND };

  const version = await prisma.knowledgeSourceVersion.findUnique({ where: { id: source.activeVersionId } });
  if (!version) return { ok: false, errorMessage: KNOWLEDGE_ERROR_MESSAGES.KNOWLEDGE_SOURCE_NOT_FOUND };
  if (!["FAILED", "NEEDS_OCR"].includes(version.status)) return { ok: false, errorMessage: "Esta fuente no está en un estado que se pueda reintentar." };

  const stage = fromStage ?? "EXTRACT";
  await prisma.knowledgeSourceVersion.update({
    where: { id: version.id },
    data: { status: "QUEUED", currentStage: stage, executionToken: null, lastErrorMessage: null, lastErrorCategory: null },
  });
  await prisma.knowledgeSource.update({ where: { id: sourceId }, data: { status: "QUEUED", lastErrorMessage: null, lastErrorCategory: null } });
  return { ok: true };
}

/** Cancel: stops future stage processing without deleting any already-persisted chunks/text — the version is left FAILED/whatever it already was, current stage cleared so the driving loop stops. Real "cancel" for this pipeline (no in-flight AI calls to abort). */
export async function cancelSourceProcessing(projectId: string, sourceId: string): Promise<boolean> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.projectId !== projectId || !source.activeVersionId) return false;
  await prisma.knowledgeSourceVersion.updateMany({
    where: { id: source.activeVersionId, status: { notIn: TERMINAL_STATUSES } },
    data: { status: "FAILED", currentStage: null, executionToken: null, lastErrorMessage: "Procesamiento cancelado por el usuario.", lastErrorCategory: "VALIDATION" },
  });
  await prisma.knowledgeSource.update({ where: { id: sourceId }, data: { status: "FAILED", lastErrorMessage: "Procesamiento cancelado por el usuario." } });
  return true;
}

export { STAGE_ORDER };

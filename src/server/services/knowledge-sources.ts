import "server-only";
import { prisma } from "@/lib/db/prisma";
import { computeChecksum, computeBufferChecksum } from "@/lib/knowledge/checksum";
import { detectFormatFromFile } from "@/lib/knowledge/extractors";
import { formatForOrigin, resolveInternalResourceSnapshot } from "@/server/services/knowledge-sync";
import type { KnowledgeSourceFormat, KnowledgeErrorCode } from "@/lib/knowledge/types";
import type { CreatePastedSourceInput, CreateInternalSourceInput } from "@/lib/validation/knowledge";

export interface SourceListFilters {
  status?: string[];
  format?: KnowledgeSourceFormat[];
  collectionId?: string;
  campaignId?: string;
  search?: string;
  includeArchived?: boolean;
}

export async function listSources(projectId: string, filters: SourceListFilters = {}) {
  return prisma.knowledgeSource.findMany({
    where: {
      projectId,
      ...(filters.includeArchived ? {} : { isArchived: false }),
      ...(filters.status?.length ? { status: { in: filters.status as never[] } } : {}),
      ...(filters.format?.length ? { format: { in: filters.format } } : {}),
      ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}),
      ...(filters.collectionId ? { collections: { some: { collectionId: filters.collectionId } } } : {}),
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    },
    include: {
      activeVersion: { select: { charCount: true, status: true, extractionQuality: true, updatedAt: true } },
      collections: { select: { collectionId: true } },
      _count: { select: { versions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSource(projectId: string, sourceId: string) {
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: sourceId },
    include: {
      activeVersion: { include: { _count: { select: { chunks: true } } } },
      versions: { orderBy: { version: "desc" }, include: { _count: { select: { chunks: true } } } },
      collections: { include: { collection: true } },
      fileAsset: { select: { id: true, originalName: true, url: true, mimeType: true, sizeBytes: true } },
    },
  });
  if (!source || source.projectId !== projectId) return null;
  return source;
}

export async function listSourcesForSelect(projectId: string) {
  return prisma.knowledgeSource.findMany({
    where: { projectId, isArchived: false },
    select: { id: true, title: true, format: true, status: true },
    orderBy: { title: "asc" },
  });
}

/** Duplicate detection by content checksum (spec section 32) — scoped to the project, never cross-project (spec section 33). */
export async function findDuplicateByChecksum(projectId: string, checksumRaw: string) {
  const version = await prisma.knowledgeSourceVersion.findFirst({
    where: { checksumRaw, source: { projectId, isArchived: false } },
    include: { source: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
  });
  return version ? { sourceId: version.source.id, title: version.source.title } : null;
}

async function attachCollections(sourceId: string, userId: string, collectionIds: string[], projectId: string) {
  if (collectionIds.length === 0) return;
  const owned = await prisma.knowledgeCollection.findMany({ where: { id: { in: collectionIds }, projectId }, select: { id: true } });
  if (owned.length === 0) return;
  await prisma.knowledgeCollectionSource.createMany({
    data: owned.map((c) => ({ collectionId: c.id, sourceId, addedById: userId })),
    skipDuplicates: true,
  });
}

interface CreateResult {
  source?: Awaited<ReturnType<typeof prisma.knowledgeSource.create>>;
  duplicateOf?: { sourceId: string; title: string };
  errorCode?: KnowledgeErrorCode;
}

export async function createPastedSource(projectId: string, userId: string, input: CreatePastedSourceInput, forceCreate = false): Promise<CreateResult> {
  const checksumRaw = computeChecksum(input.text);
  if (!forceCreate) {
    const duplicate = await findDuplicateByChecksum(projectId, checksumRaw);
    if (duplicate) return { duplicateOf: duplicate };
  }

  const source = await prisma.$transaction(async (tx) => {
    const created = await tx.knowledgeSource.create({
      data: {
        projectId,
        createdById: userId,
        title: input.title,
        description: input.description || null,
        originType: "PASTED_TEXT",
        format: input.format,
        status: "QUEUED",
      },
    });
    const version = await tx.knowledgeSourceVersion.create({
      data: { sourceId: created.id, version: 1, status: "QUEUED", rawText: input.text, checksumRaw, currentStage: "REGISTER" },
    });
    return tx.knowledgeSource.update({ where: { id: created.id }, data: { activeVersionId: version.id } });
  });

  await attachCollections(source.id, userId, input.collectionIds, projectId);
  return { source };
}

export async function createFileSource(
  projectId: string,
  userId: string,
  input: { title: string; description?: string; collectionIds: string[] },
  file: { fileAssetId: string; buffer: Buffer; mimeType: string; filename: string },
  forceCreate = false
): Promise<CreateResult> {
  const format = detectFormatFromFile(file.mimeType, file.filename);
  if (!format) return { errorCode: "UNSUPPORTED_FILE_TYPE" };

  const checksumRaw = computeBufferChecksum(file.buffer);
  if (!forceCreate) {
    const duplicate = await findDuplicateByChecksum(projectId, checksumRaw);
    if (duplicate) return { duplicateOf: duplicate };
  }

  const source = await prisma.$transaction(async (tx) => {
    const created = await tx.knowledgeSource.create({
      data: {
        projectId,
        createdById: userId,
        title: input.title,
        description: input.description || null,
        originType: "FILE",
        format,
        fileAssetId: file.fileAssetId,
        status: "QUEUED",
      },
    });
    const version = await tx.knowledgeSourceVersion.create({
      data: {
        sourceId: created.id,
        version: 1,
        status: "QUEUED",
        checksumRaw,
        currentStage: "REGISTER",
        metadata: { mimeType: file.mimeType, sizeBytes: file.buffer.byteLength, filename: file.filename },
      },
    });
    return tx.knowledgeSource.update({ where: { id: created.id }, data: { activeVersionId: version.id } });
  });

  await attachCollections(source.id, userId, input.collectionIds, projectId);
  return { source };
}

export async function createInternalSource(projectId: string, userId: string, input: CreateInternalSourceInput, forceCreate = false): Promise<CreateResult> {
  const snapshot = await resolveInternalResourceSnapshot(projectId, userId, input);
  if (!snapshot) return { errorCode: "KNOWLEDGE_SOURCE_NOT_FOUND" };

  const checksumRaw = computeChecksum(snapshot.text);
  if (!forceCreate) {
    const duplicate = await findDuplicateByChecksum(projectId, checksumRaw);
    if (duplicate) return { duplicateOf: duplicate };
  }

  const format = formatForOrigin(input.originType);
  const source = await prisma.$transaction(async (tx) => {
    const created = await tx.knowledgeSource.create({
      data: {
        projectId,
        createdById: userId,
        title: input.title || snapshot.title,
        originType: input.originType,
        format,
        status: "QUEUED",
        syncMode: input.syncMode,
        ...snapshot.resourceIds,
      },
    });
    const version = await tx.knowledgeSourceVersion.create({
      data: { sourceId: created.id, version: 1, status: "QUEUED", rawText: snapshot.text, checksumRaw, currentStage: "REGISTER" },
    });
    return tx.knowledgeSource.update({ where: { id: created.id }, data: { activeVersionId: version.id } });
  });

  await attachCollections(source.id, userId, input.collectionIds, projectId);
  return { source };
}

/** Re-syncs an internal-resource-backed source from its live resource — creates a NEW version only when content actually changed (checksum-based), never re-processes an unchanged snapshot (spec section 21/22). */
export async function syncInternalSource(projectId: string, userId: string, sourceId: string): Promise<CreateResult> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.projectId !== projectId) return { errorCode: "KNOWLEDGE_SOURCE_NOT_FOUND" };
  if (source.originType === "PASTED_TEXT" || source.originType === "FILE" || source.originType === "NOTE") {
    return { errorCode: "KNOWLEDGE_SOURCE_NOT_FOUND" };
  }

  const snapshot = await resolveInternalResourceSnapshot(projectId, userId, {
    originType: source.originType,
    contentItemId: source.contentItemId ?? undefined,
    campaignId: source.campaignId ?? undefined,
    campaignStrategyId: source.campaignStrategyId ?? undefined,
    campaignContentPieceId: source.campaignContentPieceId ?? undefined,
    socialPostId: source.socialPostId ?? undefined,
    savedPromptId: source.savedPromptId ?? undefined,
  });
  if (!snapshot) return { errorCode: "KNOWLEDGE_SOURCE_NOT_FOUND" };

  const checksumRaw = computeChecksum(snapshot.text);
  const latest = await prisma.knowledgeSourceVersion.findFirst({ where: { sourceId }, orderBy: { version: "desc" } });
  if (latest && latest.checksumRaw === checksumRaw) {
    return { source: (await prisma.knowledgeSource.findUnique({ where: { id: sourceId } }))! };
  }

  const nextVersionNumber = (latest?.version ?? 0) + 1;
  const updated = await prisma.$transaction(async (tx) => {
    const version = await tx.knowledgeSourceVersion.create({
      data: { sourceId, version: nextVersionNumber, status: "QUEUED", rawText: snapshot.text, checksumRaw, currentStage: "REGISTER" },
    });
    return tx.knowledgeSource.update({ where: { id: sourceId }, data: { activeVersionId: version.id, status: "QUEUED" } });
  });
  return { source: updated };
}

/** Manual "add new version" for a PASTED_TEXT/NOTE source — also doubles as the duplicate-resolution path (spec section 32: "permite crear nueva versión") when a user pastes updated content over an existing source instead of creating a brand new one. */
export async function addPastedTextVersion(projectId: string, sourceId: string, text: string): Promise<CreateResult> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.projectId !== projectId) return { errorCode: "KNOWLEDGE_SOURCE_NOT_FOUND" };
  if (source.originType !== "PASTED_TEXT" && source.originType !== "NOTE") return { errorCode: "KNOWLEDGE_SOURCE_NOT_FOUND" };

  const checksumRaw = computeChecksum(text);
  const latest = await prisma.knowledgeSourceVersion.findFirst({ where: { sourceId }, orderBy: { version: "desc" } });
  if (latest && latest.checksumRaw === checksumRaw) return { errorCode: "DUPLICATE_SOURCE" };

  const nextVersionNumber = (latest?.version ?? 0) + 1;
  const updated = await prisma.$transaction(async (tx) => {
    const version = await tx.knowledgeSourceVersion.create({
      data: { sourceId, version: nextVersionNumber, status: "QUEUED", rawText: text, checksumRaw, currentStage: "REGISTER" },
    });
    return tx.knowledgeSource.update({ where: { id: sourceId }, data: { activeVersionId: version.id, status: "QUEUED" } });
  });
  return { source: updated };
}

export async function updateSource(projectId: string, sourceId: string, input: { title?: string; description?: string; syncMode?: "MANUAL" | "ON_SAVE" | "DISABLED" }) {
  const existing = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!existing || existing.projectId !== projectId) return null;
  return prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.syncMode !== undefined ? { syncMode: input.syncMode } : {}),
    },
  });
}

export async function setSourceArchived(projectId: string, sourceId: string, archived: boolean) {
  const existing = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!existing || existing.projectId !== projectId) return null;
  return prisma.knowledgeSource.update({ where: { id: sourceId }, data: { isArchived: archived, status: archived ? "ARCHIVED" : existing.status === "ARCHIVED" ? "READY" : existing.status } });
}

/** Deletes a source and its exclusive fragments/index — never the underlying FileAsset (spec section 34). Citations keep their own self-contained snapshot (title/quote/location), so they degrade to "fuente eliminada" gracefully via the nullable sourceId FK (SetNull). */
export async function deleteSource(projectId: string, sourceId: string) {
  const existing = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!existing || existing.projectId !== projectId) return false;
  // Break the KnowledgeSource -> activeVersion FK first so the version cascade below doesn't hit the unique/no-cascade edge.
  await prisma.knowledgeSource.update({ where: { id: sourceId }, data: { activeVersionId: null } });
  await prisma.knowledgeSource.delete({ where: { id: sourceId } });
  return true;
}

export async function setActiveVersion(projectId: string, sourceId: string, versionId: string) {
  const [source, version] = await Promise.all([
    prisma.knowledgeSource.findUnique({ where: { id: sourceId } }),
    prisma.knowledgeSourceVersion.findUnique({ where: { id: versionId } }),
  ]);
  if (!source || source.projectId !== projectId) return null;
  if (!version || version.sourceId !== sourceId) return null;
  return prisma.knowledgeSource.update({ where: { id: sourceId }, data: { activeVersionId: versionId, status: version.status } });
}

export async function compareVersions(projectId: string, sourceId: string, versionAId: string, versionBId: string) {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.projectId !== projectId) return null;
  const [a, b] = await Promise.all([
    prisma.knowledgeSourceVersion.findUnique({ where: { id: versionAId } }),
    prisma.knowledgeSourceVersion.findUnique({ where: { id: versionBId } }),
  ]);
  if (!a || a.sourceId !== sourceId || !b || b.sourceId !== sourceId) return null;
  return { a, b };
}

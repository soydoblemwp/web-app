import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { CreateCollectionInput } from "@/lib/validation/knowledge";

export async function listCollections(projectId: string, includeArchived = false) {
  return prisma.knowledgeCollection.findMany({
    where: { projectId, ...(includeArchived ? {} : { status: "ACTIVE" }) },
    include: { _count: { select: { sources: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getCollection(projectId: string, collectionId: string) {
  const collection = await prisma.knowledgeCollection.findUnique({
    where: { id: collectionId },
    include: {
      sources: {
        include: { source: { include: { activeVersion: { select: { charCount: true, status: true } } } } },
        orderBy: { addedAt: "desc" },
      },
      _count: { select: { sources: true } },
    },
  });
  if (!collection || collection.projectId !== projectId) return null;
  return collection;
}

export async function createCollection(projectId: string, userId: string, input: CreateCollectionInput) {
  return prisma.knowledgeCollection.create({
    data: { projectId, createdById: userId, name: input.name, description: input.description || null, icon: input.icon, color: input.color },
  });
}

export async function updateCollection(projectId: string, collectionId: string, input: Partial<CreateCollectionInput>) {
  const existing = await prisma.knowledgeCollection.findUnique({ where: { id: collectionId } });
  if (!existing || existing.projectId !== projectId) return null;
  return prisma.knowledgeCollection.update({
    where: { id: collectionId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
}

export async function duplicateCollection(projectId: string, userId: string, collectionId: string) {
  const existing = await prisma.knowledgeCollection.findUnique({ where: { id: collectionId }, include: { sources: true } });
  if (!existing || existing.projectId !== projectId) return null;

  return prisma.knowledgeCollection.create({
    data: {
      projectId,
      createdById: userId,
      name: `${existing.name} (copia)`,
      description: existing.description,
      icon: existing.icon,
      color: existing.color,
      sources: { create: existing.sources.map((s) => ({ sourceId: s.sourceId, addedById: userId })) },
    },
  });
}

export async function setCollectionStatus(projectId: string, collectionId: string, status: "ACTIVE" | "ARCHIVED") {
  const existing = await prisma.knowledgeCollection.findUnique({ where: { id: collectionId } });
  if (!existing || existing.projectId !== projectId) return null;
  return prisma.knowledgeCollection.update({ where: { id: collectionId }, data: { status } });
}

/** Deleting a collection never deletes its FileAsset/KnowledgeSource rows (spec section 5: "eliminar una colección no debe eliminar automáticamente FileAsset ni recursos originales") — only the join rows are removed via cascade. */
export async function deleteCollection(projectId: string, collectionId: string) {
  const existing = await prisma.knowledgeCollection.findUnique({ where: { id: collectionId } });
  if (!existing || existing.projectId !== projectId) return false;
  await prisma.knowledgeCollection.delete({ where: { id: collectionId } });
  return true;
}

export async function addSourceToCollection(projectId: string, userId: string, collectionId: string, sourceId: string) {
  const [collection, source] = await Promise.all([
    prisma.knowledgeCollection.findUnique({ where: { id: collectionId } }),
    prisma.knowledgeSource.findUnique({ where: { id: sourceId } }),
  ]);
  if (!collection || collection.projectId !== projectId) return null;
  if (!source || source.projectId !== projectId) return null;

  return prisma.knowledgeCollectionSource.upsert({
    where: { collectionId_sourceId: { collectionId, sourceId } },
    create: { collectionId, sourceId, addedById: userId },
    update: {},
  });
}

export async function removeSourceFromCollection(projectId: string, collectionId: string, sourceId: string) {
  const collection = await prisma.knowledgeCollection.findUnique({ where: { id: collectionId } });
  if (!collection || collection.projectId !== projectId) return false;
  await prisma.knowledgeCollectionSource.deleteMany({ where: { collectionId, sourceId } });
  return true;
}

export async function listCollectionsForSelect(projectId: string) {
  return prisma.knowledgeCollection.findMany({
    where: { projectId, status: "ACTIVE" },
    select: { id: true, name: true, icon: true, color: true },
    orderBy: { name: "asc" },
  });
}

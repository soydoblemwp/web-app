"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireProjectAccess } from "@/lib/permissions";
import { getStorageProvider } from "@/lib/storage";
import { validateMediaFile } from "@/lib/publishing/media-validation";

function revalidateHub(projectId: string) {
  revalidatePath(`/dashboard/${projectId}/publishing`);
}

async function getOwnedAsset(assetId: string, projectId: string) {
  const asset = await prisma.fileAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.projectId !== projectId) return null;
  return asset;
}

export async function uploadMediaAction(
  projectId: string,
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No se recibió ningún archivo." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateMediaFile({ filename: file.name, mimeType: file.type, sizeBytes: buffer.byteLength });
  if (!validation.valid) return { error: validation.errors.join(" ") };

  const provider = getStorageProvider();
  const stored = await provider.upload(projectId, { buffer, filename: file.name, mimeType: file.type });

  const created = await prisma.fileAsset.create({
    data: {
      projectId,
      ownerId: user.id,
      kind: validation.kind === "VIDEO" ? "VIDEO" : "IMAGE",
      originalName: file.name,
      displayName: file.name,
      storageKey: stored.storageKey,
      url: stored.url,
      mimeType: file.type,
      sizeBytes: buffer.byteLength,
      processingStatus: "READY",
    },
  });

  revalidateHub(projectId);
  return { id: created.id };
}

export interface UpdateMediaInput {
  displayName?: string;
  altText?: string;
  tags?: string[];
  rightsSource?: string;
}

export async function updateMediaAction(projectId: string, assetId: string, input: UpdateMediaInput): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const asset = await getOwnedAsset(assetId, projectId);
  if (!asset) return { error: "Medio no encontrado." };

  await prisma.fileAsset.update({
    where: { id: assetId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName || null } : {}),
      ...(input.altText !== undefined ? { altText: input.altText || null } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.rightsSource !== undefined ? { rightsSource: input.rightsSource || null } : {}),
    },
  });

  revalidateHub(projectId);
  return {};
}

export async function archiveMediaAction(projectId: string, assetId: string, archived: boolean): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const asset = await getOwnedAsset(assetId, projectId);
  if (!asset) return { error: "Medio no encontrado." };
  await prisma.fileAsset.update({ where: { id: assetId }, data: { isArchived: archived } });
  revalidateHub(projectId);
  return {};
}

/** Safe delete: refuses if the asset is still attached to a non-terminal publication — archive instead in that case. */
export async function deleteMediaAction(projectId: string, assetId: string): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const asset = await getOwnedAsset(assetId, projectId);
  if (!asset) return { error: "Medio no encontrado." };

  const activeUse = await prisma.publicationMedia.findFirst({
    where: {
      fileAssetId: assetId,
      socialPost: { status: { notIn: ["PUBLISHED", "CANCELLED", "ARCHIVED", "FAILED"] } },
    },
  });
  if (activeUse) {
    return { error: "Este medio está en uso en una publicación activa. Archívalo en vez de eliminarlo, o quítalo de esa publicación primero." };
  }

  // Knowledge Base (Fase 32): a FileAsset referenced by a KnowledgeSource is the ONLY thing that source's extracted text/chunks point back to — deleting it here would silently break that source. The DB also enforces this at the FK level (onDelete: Restrict), this just gives a clear, actionable message before hitting that constraint.
  const knowledgeSource = await prisma.knowledgeSource.findFirst({ where: { fileAssetId: assetId }, select: { id: true, title: true, isArchived: true } });
  if (knowledgeSource) {
    return {
      error: `Este archivo está vinculado a la fuente "${knowledgeSource.title}" de la Base de Conocimiento. ${knowledgeSource.isArchived ? "Elimina esa fuente primero desde Knowledge Base." : "Archiva o elimina esa fuente en Knowledge Base primero, o desvincúlalo desde allí."}`,
    };
  }

  const provider = getStorageProvider();
  await provider.delete(asset.storageKey).catch(() => {
    // Storage-level failure shouldn't block removing the DB record the user asked to delete.
  });
  await prisma.fileAsset.delete({ where: { id: assetId } });

  revalidateHub(projectId);
  return {};
}

export async function attachMediaToPublicationAction(
  projectId: string,
  postId: string,
  fileAssetId: string
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const [post, asset] = await Promise.all([
    prisma.socialPost.findUnique({ where: { id: postId } }),
    getOwnedAsset(fileAssetId, projectId),
  ]);
  if (!post || post.projectId !== projectId) return { error: "Publicación no encontrada." };
  if (!asset) return { error: "Medio no encontrado." };

  const count = await prisma.publicationMedia.count({ where: { socialPostId: postId } });
  await prisma.publicationMedia.upsert({
    where: { socialPostId_fileAssetId: { socialPostId: postId, fileAssetId } },
    create: { socialPostId: postId, fileAssetId, order: count },
    update: {},
  });

  revalidateHub(projectId);
  return {};
}

export async function detachMediaFromPublicationAction(
  projectId: string,
  postId: string,
  fileAssetId: string
): Promise<{ error?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const post = await prisma.socialPost.findUnique({ where: { id: postId } });
  if (!post || post.projectId !== projectId) return { error: "Publicación no encontrada." };

  await prisma.publicationMedia.deleteMany({ where: { socialPostId: postId, fileAssetId } });
  revalidateHub(projectId);
  return {};
}

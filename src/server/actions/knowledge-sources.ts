"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { validateMediaFile } from "@/lib/publishing/media-validation";
import { detectFormatFromFile } from "@/lib/knowledge/extractors";
import { computeChecksum } from "@/lib/knowledge/checksum";
import { knowledgeError } from "@/lib/knowledge/types";
import { createPastedSourceSchema, createInternalSourceSchema, updateSourceSchema } from "@/lib/validation/knowledge";
import * as sources from "@/server/services/knowledge-sources";
import type { SourceListFilters } from "@/server/services/knowledge-sources";

function revalidateHub(projectId: string) {
  revalidatePath(`/dashboard/${projectId}/knowledge`);
}
function revalidateSource(projectId: string, sourceId: string) {
  revalidatePath(`/dashboard/${projectId}/knowledge/sources/${sourceId}`);
  revalidateHub(projectId);
}

export async function listSourcesAction(projectId: string, filters: SourceListFilters = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return sources.listSources(projectId, filters);
}

export async function getSourceAction(projectId: string, sourceId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return sources.getSource(projectId, sourceId);
}

export async function createPastedSourceAction(projectId: string, input: unknown, forceCreate = false) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = createPastedSourceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const result = await sources.createPastedSource(projectId, user.id, parsed.data, forceCreate);
  if (result.errorCode) return knowledgeError(result.errorCode);
  if (result.duplicateOf) return { duplicateOf: result.duplicateOf };
  revalidateHub(projectId);
  return { id: result.source!.id };
}

export async function createInternalSourceAction(projectId: string, input: unknown, forceCreate = false) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = createInternalSourceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const result = await sources.createInternalSource(projectId, user.id, parsed.data, forceCreate);
  if (result.errorCode) return knowledgeError(result.errorCode);
  if (result.duplicateOf) return { duplicateOf: result.duplicateOf };
  revalidateHub(projectId);
  return { id: result.source!.id };
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Upload a new FILE-origin source. Extraction itself happens in the deferred EXTRACT stage (never here) — this only validates the file, stores it via the existing storage abstraction, and registers the source+first version (spec section 30: no long-lived request). */
export async function createFileSourceAction(projectId: string, formData: FormData, forceCreate = false) {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No se recibió ningún archivo." };
  if (file.size > MAX_FILE_BYTES) return { error: "El archivo supera el límite de 20 MB para esta fase." };

  const format = detectFormatFromFile(file.type, file.name);
  if (!format) return knowledgeError("UNSUPPORTED_FILE_TYPE");

  const buffer = Buffer.from(await file.arrayBuffer());
  const title = String(formData.get("title") ?? file.name).trim() || file.name;
  const description = String(formData.get("description") ?? "").trim();
  const collectionIds = String(formData.get("collectionIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Reuse the existing media-validation/storage pipeline for real image/video/document sanity checks where applicable; documents that aren't in that validator's kind map still get a plain sizeBytes/mimeType sanity pass here.
  const looksLikeMedia = file.type.startsWith("image/") || file.type.startsWith("video/");
  if (looksLikeMedia) {
    const validation = validateMediaFile({ filename: file.name, mimeType: file.type, sizeBytes: buffer.byteLength });
    if (!validation.valid) return { error: validation.errors.join(" ") };
  }

  const provider = getStorageProvider();
  const stored = await provider.upload(projectId, { buffer, filename: file.name, mimeType: file.type });

  const fileAsset = await prisma.fileAsset.create({
    data: {
      projectId,
      ownerId: user.id,
      kind: "DOCUMENT",
      originalName: file.name,
      displayName: file.name,
      storageKey: stored.storageKey,
      url: stored.url,
      mimeType: file.type,
      sizeBytes: buffer.byteLength,
      processingStatus: "READY",
    },
  });

  const result = await sources.createFileSource(projectId, user.id, { title, description, collectionIds }, { fileAssetId: fileAsset.id, buffer, mimeType: file.type, filename: file.name }, forceCreate);
  if (result.errorCode) {
    // Roll back the just-created FileAsset when the source itself couldn't be created (e.g. genuine duplicate blocked before force) — no dangling unreferenced media.
    if (!result.duplicateOf) await provider.delete(stored.storageKey).catch(() => {});
    if (!result.duplicateOf) await prisma.fileAsset.delete({ where: { id: fileAsset.id } }).catch(() => {});
    return knowledgeError(result.errorCode);
  }
  if (result.duplicateOf) {
    await provider.delete(stored.storageKey).catch(() => {});
    await prisma.fileAsset.delete({ where: { id: fileAsset.id } }).catch(() => {});
    return { duplicateOf: result.duplicateOf };
  }

  revalidateHub(projectId);
  return { id: result.source!.id };
}

export async function addPastedTextVersionAction(projectId: string, sourceId: string, text: string) {
  await requireProjectAccess(projectId, "EDITOR");
  if (!text.trim()) return { error: "El contenido no puede estar vacío." };
  const result = await sources.addPastedTextVersion(projectId, sourceId, text);
  if (result.errorCode) return knowledgeError(result.errorCode, result.errorCode === "DUPLICATE_SOURCE" ? "El contenido es idéntico a la versión activa actual." : undefined);
  revalidateSource(projectId, sourceId);
  return { id: result.source!.id };
}

export async function syncSourceAction(projectId: string, sourceId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await sources.syncInternalSource(projectId, user.id, sourceId);
  if (result.errorCode) return knowledgeError(result.errorCode);
  revalidateSource(projectId, sourceId);
  return { id: result.source!.id };
}

export async function updateSourceAction(projectId: string, sourceId: string, input: unknown) {
  await requireProjectAccess(projectId, "EDITOR");
  const parsed = updateSourceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const updated = await sources.updateSource(projectId, sourceId, parsed.data);
  if (!updated) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  revalidateSource(projectId, sourceId);
  return {};
}

export async function setSourceArchivedAction(projectId: string, sourceId: string, archived: boolean) {
  await requireProjectAccess(projectId, "EDITOR");
  const updated = await sources.setSourceArchived(projectId, sourceId, archived);
  if (!updated) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  revalidateSource(projectId, sourceId);
  return {};
}

/** Requires its own explicit confirmation in the UI (spec section 34: "requiere confirmación propia") — never bundled with archive. */
export async function deleteSourceAction(projectId: string, sourceId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const ok = await sources.deleteSource(projectId, sourceId);
  if (!ok) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  revalidateHub(projectId);
  return {};
}

export async function setActiveVersionAction(projectId: string, sourceId: string, versionId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const updated = await sources.setActiveVersion(projectId, sourceId, versionId);
  if (!updated) return knowledgeError("SOURCE_VERSION_CONFLICT");
  revalidateSource(projectId, sourceId);
  return {};
}

export async function compareVersionsAction(projectId: string, sourceId: string, versionAId: string, versionBId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const result = await sources.compareVersions(projectId, sourceId, versionAId, versionBId);
  if (!result) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  return result;
}

export async function checkDuplicateTextAction(projectId: string, text: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return sources.findDuplicateByChecksum(projectId, computeChecksum(text));
}

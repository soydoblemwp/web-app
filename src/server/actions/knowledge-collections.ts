"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { createCollectionSchema, updateCollectionSchema } from "@/lib/validation/knowledge";
import * as collections from "@/server/services/knowledge-collections";
import { knowledgeError } from "@/lib/knowledge/types";

function revalidateHub(projectId: string) {
  revalidatePath(`/dashboard/${projectId}/knowledge`);
}

export async function listCollectionsAction(projectId: string, includeArchived = false) {
  await requireProjectAccess(projectId, "VIEWER");
  return collections.listCollections(projectId, includeArchived);
}

export async function getCollectionAction(projectId: string, collectionId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return collections.getCollection(projectId, collectionId);
}

export async function createCollectionAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = createCollectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const created = await collections.createCollection(projectId, user.id, parsed.data);
  revalidateHub(projectId);
  return { id: created.id };
}

export async function updateCollectionAction(projectId: string, collectionId: string, input: unknown) {
  await requireProjectAccess(projectId, "EDITOR");
  const parsed = updateCollectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const updated = await collections.updateCollection(projectId, collectionId, parsed.data);
  if (!updated) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  revalidateHub(projectId);
  return {};
}

export async function duplicateCollectionAction(projectId: string, collectionId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const duplicated = await collections.duplicateCollection(projectId, user.id, collectionId);
  if (!duplicated) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  revalidateHub(projectId);
  return { id: duplicated.id };
}

export async function setCollectionStatusAction(projectId: string, collectionId: string, status: "ACTIVE" | "ARCHIVED") {
  await requireProjectAccess(projectId, "EDITOR");
  const updated = await collections.setCollectionStatus(projectId, collectionId, status);
  if (!updated) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  revalidateHub(projectId);
  return {};
}

export async function deleteCollectionAction(projectId: string, collectionId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const ok = await collections.deleteCollection(projectId, collectionId);
  if (!ok) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  revalidateHub(projectId);
  return {};
}

export async function addSourceToCollectionAction(projectId: string, collectionId: string, sourceId: string) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await collections.addSourceToCollection(projectId, user.id, collectionId, sourceId);
  if (!result) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  revalidateHub(projectId);
  return {};
}

export async function removeSourceFromCollectionAction(projectId: string, collectionId: string, sourceId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const ok = await collections.removeSourceFromCollection(projectId, collectionId, sourceId);
  if (!ok) return knowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND");
  revalidateHub(projectId);
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { createKnowledgeQuerySchema, saveQueryAsContentItemSchema } from "@/lib/validation/knowledge";
import {
  prepareKnowledgeQuery,
  completeKnowledgeQuery,
  failKnowledgeQuery,
  listQueries,
  getQuery,
  setQueryArchived,
  deleteQuery,
  saveQueryAsContentItem,
} from "@/server/services/knowledge-query";

function revalidateAsk(projectId: string) {
  revalidatePath(`/dashboard/${projectId}/knowledge/ask`);
}

export async function askKnowledgeBaseAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  const parsed = createKnowledgeQuerySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const result = await prepareKnowledgeQuery(projectId, user.id, parsed.data);
  revalidateAsk(projectId);
  return result;
}

export async function completeKnowledgeQueryAction(projectId: string, queryId: string, rawOutput: string, executionToken: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const result = await completeKnowledgeQuery(projectId, queryId, rawOutput, executionToken);
  revalidateAsk(projectId);
  return result;
}

export async function failKnowledgeQueryAction(projectId: string, queryId: string, executionToken: string, message: string) {
  await requireProjectAccess(projectId, "VIEWER");
  await failKnowledgeQuery(projectId, queryId, executionToken, message);
  revalidateAsk(projectId);
  return {};
}

export async function listKnowledgeQueriesAction(projectId: string, includeArchived = false) {
  await requireProjectAccess(projectId, "VIEWER");
  return listQueries(projectId, includeArchived);
}

export async function getKnowledgeQueryAction(projectId: string, queryId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getQuery(projectId, queryId);
}

export async function setKnowledgeQueryArchivedAction(projectId: string, queryId: string, archived: boolean) {
  await requireProjectAccess(projectId, "VIEWER");
  const updated = await setQueryArchived(projectId, queryId, archived);
  if (!updated) return { error: "Consulta no encontrada." };
  revalidateAsk(projectId);
  return {};
}

export async function deleteKnowledgeQueryAction(projectId: string, queryId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const ok = await deleteQuery(projectId, queryId);
  if (!ok) return { error: "Consulta no encontrada." };
  revalidateAsk(projectId);
  return {};
}

export async function saveQueryAsContentItemAction(projectId: string, queryId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = saveQueryAsContentItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  return saveQueryAsContentItem(projectId, user.id, queryId, parsed.data);
}

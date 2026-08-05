"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { insertContentCitationSchema } from "@/lib/validation/knowledge";
import { insertContentCitation, listContentCitations, deleteContentCitation } from "@/server/services/knowledge-citations";

export async function insertContentCitationAction(projectId: string, input: unknown) {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const parsed = insertContentCitationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const created = await insertContentCitation(projectId, user.id, parsed.data);
  if (!created) return { error: "No se pudo enlazar la cita — revisa que el contenido y el fragmento existan." };
  revalidatePath(`/dashboard/${projectId}/content/${parsed.data.contentItemId}`);
  return { id: created.id };
}

export async function listContentCitationsAction(projectId: string, contentItemId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listContentCitations(projectId, contentItemId);
}

export async function deleteContentCitationAction(projectId: string, citationId: string) {
  await requireProjectAccess(projectId, "EDITOR");
  const ok = await deleteContentCitation(projectId, citationId);
  if (!ok) return { error: "Cita no encontrada." };
  return {};
}

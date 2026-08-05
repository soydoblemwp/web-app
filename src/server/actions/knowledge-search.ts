"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { knowledgeSearchSchema } from "@/lib/validation/knowledge";
import { searchKnowledge } from "@/server/services/knowledge-search";

export async function searchKnowledgeAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "VIEWER");
  const parsed = knowledgeSearchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", hits: [] as Awaited<ReturnType<typeof searchKnowledge>> };
  const hits = await searchKnowledge({ projectId, ...parsed.data });
  return { hits };
}

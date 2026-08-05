"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { verifyContentSchema } from "@/lib/validation/knowledge";
import { prepareContentVerification, finalizeVerification } from "@/server/services/knowledge-verification";

/** Prepares the deterministic textual-evidence pass and (optionally) the AI enrichment prompt. The caller runs the AI prompt through useLocalAI in the browser if `hasAiWork`, then calls finalizeContentVerificationAction — same prepare/complete round-trip shape as every other AI feature here, except the deterministic classification still works even without an AI pass at all. */
export async function prepareContentVerificationAction(projectId: string, input: unknown) {
  await requireProjectAccess(projectId, "VIEWER");
  const parsed = verifyContentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const prepared = await prepareContentVerification(projectId, parsed.data.contentItemId, parsed.data.collectionIds, parsed.data.sourceIds);
  if (!prepared) return { error: "Contenido no encontrado." };

  if (!prepared.hasAiWork) {
    const results = finalizeVerification(prepared.claims, prepared.matchesByClaim);
    return { done: true, results };
  }

  return { done: false, systemPrompt: prepared.systemPrompt, userPrompt: prepared.userPrompt, claims: prepared.claims, matches: Object.fromEntries(prepared.matchesByClaim) };
}

export async function finalizeContentVerificationAction(
  projectId: string,
  claims: { index: number; text: string }[],
  matches: Record<string, { chunkId: string; sourceId: string; score: number; snippet: string; sourceTitle: string; locationLabel: string | null }[]>,
  aiRawOutput?: string
) {
  await requireProjectAccess(projectId, "VIEWER");
  const matchesMap = new Map(Object.entries(matches).map(([k, v]) => [Number(k), v]));
  const results = finalizeVerification(claims, matchesMap, aiRawOutput);
  return { results };
}

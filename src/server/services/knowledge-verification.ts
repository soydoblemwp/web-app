import "server-only";
import { prisma } from "@/lib/db/prisma";
import { searchKnowledge } from "@/server/services/knowledge-search";
import { buildBlockSystemPrompt, parseBlockText } from "@/lib/agents/structured-output";
import {
  splitIntoClaims,
  scoreClaimAgainstChunk,
  classifyClaim,
  isOpinionClaim,
  CLAIM_VERIFICATION_FIELDS,
  type AiClaimVerdict,
  type ClaimEvidenceMatch,
  type ClaimDraft,
} from "@/lib/knowledge/verification";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface RichEvidence extends ClaimEvidenceMatch {
  sourceTitle: string;
  locationLabel: string | null;
}

export interface PreparedVerification {
  claims: ClaimDraft[];
  matchesByClaim: Map<number, RichEvidence[]>;
  systemPrompt: string;
  userPrompt: string;
  hasAiWork: boolean;
}

/**
 * Content verification (spec section 26) — a stateless, on-demand analysis
 * (no dedicated persistence model exists for it; results are shown live and
 * re-computed each time, same as a search). Splits the ContentItem body
 * into claims, retrieves real textual evidence for each via the same search
 * service everything else uses, and optionally builds a structured AI pass
 * as a SECOND signal — the final classification (see finalizeVerification)
 * never depends on the AI pass alone.
 */
export async function prepareContentVerification(projectId: string, contentItemId: string, collectionIds: string[], sourceIds: string[]): Promise<PreparedVerification | null> {
  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item || item.projectId !== projectId) return null;

  const plainText = stripHtml(item.body);
  const claims = splitIntoClaims(plainText);

  const matchesByClaim = new Map<number, RichEvidence[]>();
  for (const claim of claims) {
    if (isOpinionClaim(claim.text) || claim.text.trim().endsWith("?")) continue;
    const hits = await searchKnowledge({
      projectId,
      query: claim.text,
      collectionIds: collectionIds.length ? collectionIds : undefined,
      sourceIds: sourceIds.length ? sourceIds : undefined,
      limit: 3,
    });
    const evidence: RichEvidence[] = hits.map((h) => ({
      chunkId: h.chunkId,
      sourceId: h.sourceId,
      score: scoreClaimAgainstChunk(claim.text, h.snippet),
      snippet: h.snippet,
      sourceTitle: h.sourceTitle,
      locationLabel: h.locationLabel,
    }));
    matchesByClaim.set(claim.index, evidence);
  }

  const claimsWithEvidence = claims.filter((c) => (matchesByClaim.get(c.index) ?? []).length > 0);
  const role =
    "Verificas afirmaciones de un texto contra fragmentos de evidencia recuperados de una base de conocimiento. Para cada afirmación numerada, decide un veredicto basado ÚNICAMENTE en la evidencia proporcionada — nunca uses conocimiento externo ni inventes fuentes.";
  const lines: string[] = [];
  for (const claim of claimsWithEvidence) {
    const evidence = matchesByClaim.get(claim.index) ?? [];
    lines.push(`Afirmación [${claim.index}]: ${claim.text}`);
    evidence.forEach((e, i) => lines.push(`  Evidencia ${i + 1} (${e.sourceTitle}): ${e.snippet}`));
  }
  const systemPrompt = buildBlockSystemPrompt(role, "AFIRMACION", CLAIM_VERIFICATION_FIELDS, "", [
    "Genera un bloque por cada afirmación numerada que se te dé, usando exactamente su número en INDICE.",
  ]);
  const userPrompt = claimsWithEvidence.length > 0 ? lines.join("\n") : "No hay afirmaciones con evidencia recuperada para analizar.";

  return { claims, matchesByClaim, systemPrompt, userPrompt, hasAiWork: claimsWithEvidence.length > 0 };
}

export interface ClaimVerificationResult {
  index: number;
  text: string;
  status: string;
  bestScore: number;
  evidence: { sourceTitle: string; locationLabel: string | null; snippet: string; score: number }[];
}

/** Combines the real textual score (primary) with the optional AI block output (secondary) — never AI-only (spec section 26). `aiRawOutput` may be omitted entirely (e.g. unsupported browser) and the result is still meaningful. */
export function finalizeVerification(claims: ClaimDraft[], matchesByClaim: Map<number, RichEvidence[]>, aiRawOutput?: string): ClaimVerificationResult[] {
  const aiVerdicts = new Map<number, AiClaimVerdict>();
  if (aiRawOutput) {
    const blocks = parseBlockText(aiRawOutput, "AFIRMACION", CLAIM_VERIFICATION_FIELDS);
    for (const block of blocks) {
      const index = block.index as number | null;
      const verdict = block.verdict as string;
      if (index !== null && verdict) aiVerdicts.set(index, verdict as AiClaimVerdict);
    }
  }

  return claims.map((claim) => {
    const evidence = matchesByClaim.get(claim.index) ?? [];
    const status = classifyClaim(claim.text, evidence, aiVerdicts.get(claim.index));
    const bestScore = evidence.length > 0 ? Math.max(...evidence.map((e) => e.score)) : 0;
    return {
      index: claim.index,
      text: claim.text,
      status,
      bestScore,
      evidence: evidence
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((e) => ({ sourceTitle: e.sourceTitle, locationLabel: e.locationLabel, snippet: e.snippet, score: e.score })),
    };
  });
}

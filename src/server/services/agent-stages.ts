import "server-only";
import { prisma } from "@/lib/db/prisma";
import { computeSeoScore } from "@/lib/editor/seo-score";
import type { StructuredRecord } from "@/lib/agents/structured-output";

export { isBlockOutputType, buildAgentPrompt, parseAndValidateAgentOutput, type AgentStageOutcome, type AgentPromptInputs } from "@/lib/agents/prompt-builder";

/**
 * SEO Agent-specific enrichment: the numeric score is NEVER an AI opinion —
 * it's computed by the existing deterministic scorer (src/lib/editor/seo-score.ts)
 * from the real ContentItem, then attached alongside the AI's qualitative
 * suggestions (spec section 4: "la puntuación SEO no debe depender de una
 * opinión libre de IA"). Safe no-op for any content item lacking plain text.
 * Isolated in this server-only file (needs prisma) — everything else about
 * agent prompt-building/output-validation is pure and lives in
 * src/lib/agents/prompt-builder.ts so it stays importable from shared/
 * test-safe modules like src/lib/ai-workflows/execution-resolver.ts.
 */
export async function attachDeterministicSeoScore(contentItemId: string, output: StructuredRecord): Promise<StructuredRecord> {
  const contentItem = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!contentItem) return output;

  const bodyText = contentItem.body.replace(/<[^>]+>/g, " ");
  const headingTexts = [...bodyText.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, ""));
  const score = computeSeoScore({
    seoTitle: (output.seoTitle as string | undefined) ?? contentItem.seoTitle ?? "",
    seoDescription: (output.seoDescription as string | undefined) ?? contentItem.seoDescription ?? "",
    seoKeyword: (output.targetKeyword as string | undefined) ?? contentItem.seoKeyword ?? "",
    bodyText,
    headingTexts,
    internalLinksCount: (output.internalLinkSuggestions as string[] | undefined)?.length ?? 0,
    externalLinksCount: (output.externalLinkSuggestions as string[] | undefined)?.length ?? 0,
  });

  return { ...output, deterministicScore: score.score, deterministicChecks: JSON.stringify(score.checks) };
}

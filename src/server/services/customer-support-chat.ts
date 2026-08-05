import "server-only";
import { matchFaq, type FaqCandidate } from "@/lib/customer-support/faq-match";
import { searchKnowledgeCandidates, type KnowledgeCandidate } from "@/lib/customer-support/knowledge-search";
import { computeEvidence, isDeterministicallyAnswerable } from "@/lib/customer-support/evidence";
import type { ChatTurnContext } from "@/lib/customer-support/chat-decision";
import { listPublishedFaqCandidates } from "@/server/services/customer-support-faq";
import { listApprovedPublicCandidates } from "@/server/services/customer-support-knowledge";

/**
 * Gathers the real, project-scoped FAQ/knowledge candidates the pure
 * decision engine (src/lib/customer-support/chat-decision.ts) decides over.
 * Kept separate from that pure module specifically so decideChatResponse/
 * finalizeAiAnswer stay directly unit-testable without a database.
 */
export async function buildChatTurnContext(projectId: string, question: string, language: string): Promise<ChatTurnContext> {
  const [faqs, knowledgeSources] = await Promise.all([listPublishedFaqCandidates(projectId, language), listApprovedPublicCandidates(projectId, language)]);

  const faqCandidates: FaqCandidate[] = faqs.map((f) => ({ id: f.id, question: f.question, aliases: f.aliases, category: f.category, priority: f.priority, language: f.language }));
  const faqMatch = matchFaq(question, faqCandidates, language);
  const matchedFaqRow = faqMatch ? (faqs.find((f) => f.id === faqMatch.id) ?? null) : null;
  const matchedFaq = matchedFaqRow
    ? { id: matchedFaqRow.id, question: matchedFaqRow.question, answer: matchedFaqRow.answer, category: matchedFaqRow.category, relatedLink: matchedFaqRow.relatedLink }
    : null;

  const knowledgeCandidates: KnowledgeCandidate[] = knowledgeSources.map((k) => ({ id: k.id, title: k.title, excerpt: k.excerpt, normalizedContent: k.normalizedContent, language: k.language, lastUpdatedAt: k.lastUpdatedAt }));
  const knowledgeHits = isDeterministicallyAnswerable(faqMatch) ? [] : searchKnowledgeCandidates(question, knowledgeCandidates);
  const knowledgeById = new Map(knowledgeSources.map((k) => [k.id, { id: k.id, title: k.title, sourceRef: k.sourceRef }]));

  const evidence = computeEvidence({ faqMatch, knowledgeHits });
  const suggestions = faqs
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .filter((f) => f.id !== matchedFaq?.id)
    .slice(0, 3)
    .map((f) => f.question);

  return { faqMatch, matchedFaq, knowledgeHits, knowledgeById, evidence, suggestions };
}

export { decideChatResponse, finalizeAiAnswer } from "@/lib/customer-support/chat-decision";
export type { ChatTurnContext, DeterministicAnswer, NeedsGenerationAnswer } from "@/lib/customer-support/chat-decision";

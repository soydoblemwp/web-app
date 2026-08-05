import { isSpanishStopword } from "./stopwords-es";

export type SummaryMethod = "local-ai" | "extractive";

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

function wordFrequency(sentences: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const sentence of sentences) {
    const words = sentence.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    for (const word of words) {
      if (word.length < 3 || isSpanishStopword(word)) continue;
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  return freq;
}

/**
 * Deterministic, honest fallback for when local AI is unavailable: scores
 * each sentence by the frequency of its non-stopword terms (classic TF
 * extractive summarization), then returns the top-scoring sentences in their
 * original order — never a fabricated/paraphrased sentence, only real
 * excerpts from the source text.
 */
export function extractiveSummary(text: string, maxSentences: number): { summary: string; usedSentences: number } {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return { summary: "", usedSentences: 0 };
  if (sentences.length <= maxSentences) return { summary: sentences.join(" "), usedSentences: sentences.length };

  const freq = wordFrequency(sentences);
  const scored = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const score = words.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0) / Math.max(words.length, 1);
    return { sentence, index, score };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index);

  return { summary: top.map((s) => s.sentence).join(" "), usedSentences: top.length };
}

export function extractKeyPoints(text: string, maxPoints: number): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  const freq = wordFrequency(sentences);
  const scored = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const score = words.reduce((sum, w) => sum + (freq.get(w) ?? 0), 0) / Math.max(words.length, 1);
    return { sentence, index, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPoints)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);
}

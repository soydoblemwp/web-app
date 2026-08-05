import { isSpanishStopword } from "./stopwords-es";

function toHashtag(word: string): string {
  return `#${word.replace(/[^\p{L}\p{N}]/gu, "")}`;
}

/** Deterministic, content-derived hashtag fallback — extracts the most frequent non-stopword terms from the source text itself, never from an external trends source. */
export function deriveHashtagsFromText(text: string, count: number): string[] {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 3 && !isSpanishStopword(w));
  const freq = new Map<string, number>();
  for (const word of words) freq.set(word, (freq.get(word) ?? 0) + 1);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => toHashtag(word));
}

/**
 * Keeps only AI-suggested hashtags whose root word actually appears in the
 * source content — enforces "los hashtags deben derivarse del contenido
 * proporcionado" (spec section 14) instead of trusting the model's claim.
 */
export function filterHashtagsToContent(hashtags: string[], sourceText: string): string[] {
  const sourceLower = sourceText.toLowerCase();
  return hashtags.filter((tag) => {
    const word = tag.replace(/^#/, "").toLowerCase();
    return word.length > 0 && sourceLower.includes(word.slice(0, Math.max(3, Math.ceil(word.length * 0.7))));
  });
}

export function parseHashtagLine(raw: string): string[] {
  const matches = raw.match(/#[\p{L}\p{N}_]+/gu);
  if (matches && matches.length > 0) return matches;
  return raw
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => (w.startsWith("#") ? w : `#${w}`));
}

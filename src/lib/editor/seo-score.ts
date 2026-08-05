/**
 * Deterministic SEO scoring — no AI involved anywhere in this file, per
 * spec ("La puntuación debe ser determinista. No uses IA para calcular la
 * puntuación."). AI is only ever used elsewhere (src/lib/editor/ai-actions.ts,
 * src/lib/editor/seo-ai-actions.ts) to SUGGEST values a user can accept —
 * never to compute the score itself.
 */
export interface SeoScoreInput {
  seoTitle: string;
  seoDescription: string;
  seoKeyword: string;
  /** Plain text extracted from the editor body (no HTML tags). */
  bodyText: string;
  headingTexts: string[];
  internalLinksCount: number;
  externalLinksCount: number;
}

export interface SeoCheck {
  id: string;
  label: string;
  weight: number;
  passed: boolean;
}

export interface SeoScoreResult {
  score: number;
  checks: SeoCheck[];
  keywordDensityPercent: number;
  titleLength: number;
  descriptionLength: number;
  readability: number;
  wordCount: number;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Simplified readability heuristic (0-100, higher = easier to read): shorter
 * sentences and shorter average word length score higher. Not a true Flesch
 * score — Flesch needs syllable counts, which have no reliable
 * dictionary-free algorithm for Spanish — but deterministic and directionally
 * correct, which is all the spec asks for.
 */
export function estimateReadability(text: string): number {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (sentences.length === 0 || words.length === 0) return 0;

  const avgWordsPerSentence = words.length / sentences.length;
  const avgCharsPerWord = words.reduce((sum, word) => sum + word.length, 0) / words.length;
  const score = 100 - avgWordsPerSentence * 1.5 - avgCharsPerWord * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeSeoScore(input: SeoScoreInput): SeoScoreResult {
  const keyword = input.seoKeyword.trim().toLowerCase();
  const seoTitle = input.seoTitle.trim();
  const seoDescription = input.seoDescription.trim();
  const bodyTextLower = input.bodyText.toLowerCase();
  const words = input.bodyText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const keywordOccurrences = keyword ? countOccurrences(bodyTextLower, keyword) : 0;
  const keywordDensityPercent = keyword && wordCount > 0 ? (keywordOccurrences / wordCount) * 100 : 0;

  const titleHasKeyword = Boolean(keyword) && seoTitle.toLowerCase().includes(keyword);
  const headingHasKeyword = Boolean(keyword) && input.headingTexts.some((h) => h.toLowerCase().includes(keyword));
  const introText = words.slice(0, 100).join(" ").toLowerCase();
  const introHasKeyword = Boolean(keyword) && introText.includes(keyword);
  const readability = estimateReadability(input.bodyText);

  const checks: SeoCheck[] = [
    { id: "keyword-set", label: "Palabra clave objetivo definida", weight: 5, passed: keyword.length > 0 },
    {
      id: "keyword-density",
      label: "Densidad de palabra clave entre 0.5% y 2.5%",
      weight: 15,
      passed: keyword.length > 0 && keywordDensityPercent >= 0.5 && keywordDensityPercent <= 2.5,
    },
    { id: "keyword-title", label: "Palabra clave en el título SEO", weight: 15, passed: titleHasKeyword },
    { id: "keyword-heading", label: "Palabra clave en algún encabezado", weight: 10, passed: headingHasKeyword },
    { id: "keyword-intro", label: "Palabra clave en la introducción", weight: 10, passed: introHasKeyword },
    {
      id: "title-length",
      label: "Título SEO entre 30 y 60 caracteres",
      weight: 10,
      passed: seoTitle.length >= 30 && seoTitle.length <= 60,
    },
    {
      id: "description-length",
      label: "Meta descripción entre 70 y 160 caracteres",
      weight: 10,
      passed: seoDescription.length >= 70 && seoDescription.length <= 160,
    },
    { id: "internal-links", label: "Al menos un enlace interno", weight: 5, passed: input.internalLinksCount > 0 },
    { id: "external-links", label: "Al menos un enlace externo", weight: 5, passed: input.externalLinksCount > 0 },
    { id: "readability", label: "Legibilidad aceptable", weight: 10, passed: readability >= 50 },
    { id: "word-count", label: "Al menos 300 palabras", weight: 5, passed: wordCount >= 300 },
  ];

  const score = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);

  return {
    score,
    checks,
    keywordDensityPercent,
    titleLength: seoTitle.length,
    descriptionLength: seoDescription.length,
    readability,
    wordCount,
  };
}

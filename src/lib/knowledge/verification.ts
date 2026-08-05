import type { OutputFieldSpec } from "@/lib/agents/types";

/**
 * Content verification (spec section 26) — splits a ContentItem's body into
 * checkable claims, scores each against retrieved evidence chunks with a
 * real textual-overlap signal, and only THEN folds in an optional AI
 * structured pass. The final classification is never AI-only (spec: "la
 * clasificación final no debe depender únicamente de IA").
 */

export const CLAIM_STATUSES = ["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED", "CONTRADICTED", "OPINION", "NOT_CHECKABLE"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const STOPWORDS = new Set([
  "de", "la", "que", "el", "en", "y", "a", "los", "del", "se", "las", "por", "un", "para", "con", "no", "una", "su", "al",
  "lo", "como", "más", "pero", "sus", "le", "ya", "o", "este", "sí", "porque", "esta", "entre", "cuando", "muy", "sin",
  "the", "and", "of", "to", "in", "is", "for", "that", "with", "on", "are", "as", "it", "be", "was", "at", "by", "an",
]);

const OPINION_MARKERS = [
  "creemos", "consideramos", "en nuestra opinión", "recomendamos", "sin duda", "el mejor", "la mejor", "increíble",
  "excelente", "fantástico", "maravilloso", "sorprendente", "nos encanta", "nos gusta", "pensamos que",
];

const COMBINING_DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS_RE, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

export interface ClaimDraft {
  index: number;
  text: string;
}

/** Splits plain text (HTML already stripped by the caller) into candidate claims — one per sentence, filtering fragments too short to verify meaningfully. Never uses AI; purely heuristic sentence segmentation. */
export function splitIntoClaims(plainText: string, maxClaims = 60): ClaimDraft[] {
  const sentences = plainText
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9¿¡])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);

  return sentences.slice(0, maxClaims).map((text, index) => ({ index, text }));
}

/** Jaccard-like word-overlap score between a claim and one evidence chunk — 0..1. Real textual signal, not an AI opinion. */
export function scoreClaimAgainstChunk(claim: string, chunkText: string): number {
  const claimWords = normalizeWords(claim);
  const chunkWords = normalizeWords(chunkText);
  if (claimWords.size === 0 || chunkWords.size === 0) return 0;
  let overlap = 0;
  for (const w of claimWords) if (chunkWords.has(w)) overlap++;
  return overlap / claimWords.size;
}

export function isOpinionClaim(claim: string): boolean {
  const lower = claim.toLowerCase();
  return OPINION_MARKERS.some((marker) => lower.includes(marker));
}

export interface ClaimEvidenceMatch {
  chunkId: string;
  sourceId: string;
  score: number;
  snippet: string;
}

export type AiClaimVerdict = "RESPALDADA" | "CONTRADICHA" | "OPINION" | "NO_VERIFICABLE" | "SIN_EVIDENCIA";

const HIGH_SCORE = 0.5;
const LOW_SCORE = 0.2;

/**
 * Combines the real textual-overlap score (primary signal) with an optional
 * AI structured verdict (secondary signal) into the final classification —
 * textual evidence always wins over a contradicting AI opinion when the
 * overlap score is strong, so the result is never AI-only.
 */
export function classifyClaim(claim: string, matches: ClaimEvidenceMatch[], aiVerdict?: AiClaimVerdict): ClaimStatus {
  if (isOpinionClaim(claim)) return "OPINION";
  if (claim.trim().endsWith("?")) return "NOT_CHECKABLE";

  const bestScore = matches.length > 0 ? Math.max(...matches.map((m) => m.score)) : 0;

  if (aiVerdict === "CONTRADICHA" && bestScore < HIGH_SCORE) return "CONTRADICTED";
  if (bestScore >= HIGH_SCORE) return "SUPPORTED";
  if (bestScore >= LOW_SCORE) return "PARTIALLY_SUPPORTED";
  if (aiVerdict === "OPINION") return "OPINION";
  if (aiVerdict === "NO_VERIFICABLE") return "NOT_CHECKABLE";
  if (matches.length === 0 && !aiVerdict) return "NOT_CHECKABLE";
  return "UNSUPPORTED";
}

/** Structured AI pass fields (spec section 26: "análisis estructurado de IA") — one block per claim, reusing the shared block-output engine, never a bespoke parser. */
export const CLAIM_VERIFICATION_FIELDS: OutputFieldSpec[] = [
  { marker: "INDICE", field: "index", kind: "number" },
  { marker: "VEREDICTO", field: "verdict", kind: "enum", enumValues: ["RESPALDADA", "CONTRADICHA", "OPINION", "NO_VERIFICABLE", "SIN_EVIDENCIA"] },
  { marker: "NOTA", field: "note", kind: "text", maxLength: 300 },
];

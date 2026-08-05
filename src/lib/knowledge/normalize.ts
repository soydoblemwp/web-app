import { computeChecksum } from "@/lib/knowledge/checksum";
import { scanForSensitivePatterns } from "@/lib/knowledge/secrets-scan";
import type { ExtractedBlock } from "@/lib/knowledge/types";

const CONTROL_CHARS_RE = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");
const NBSP_RE = new RegExp("\\u00A0", "g");

function cleanText(text: string): string {
  return text
    .replace(CONTROL_CHARS_RE, "")
    .replace(NBSP_RE, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const SPANISH_MARKERS = [" de ", " la ", " que ", " el ", " en ", " y ", " los ", " del ", " se ", " las ", " para ", " con ", " una ", " por "];
const ENGLISH_MARKERS = [" the ", " and ", " of ", " to ", " in ", " is ", " for ", " that ", " with ", " on ", " are ", " as ", " it "];

/**
 * A lightweight marker-word-frequency heuristic — NOT a real NLP language
 * detector. Good enough to label content for display, never trusted as
 * ground truth for anything downstream (spec section 7: "idioma detectado
 * opcional").
 */
export function detectLanguageHeuristic(text: string): string | undefined {
  const sample = ` ${text.slice(0, 5000).toLowerCase()} `;
  const esScore = SPANISH_MARKERS.reduce((sum, m) => sum + (sample.split(m).length - 1), 0);
  const enScore = ENGLISH_MARKERS.reduce((sum, m) => sum + (sample.split(m).length - 1), 0);
  if (esScore === 0 && enScore === 0) return undefined;
  return esScore >= enScore ? "es" : "en";
}

export interface NormalizedDocument {
  blocks: ExtractedBlock[];
  normalizedText: string;
  checksumNormalized: string;
  detectedLanguage?: string;
  sensitiveWarning: boolean;
}

/**
 * Deterministic normalization (spec section 12) — cleans whitespace/control
 * characters, drops exact-duplicate consecutive blocks (common with
 * repeated headers/footers in PDFs), and computes a checksum of the
 * resulting text for duplicate/new-version detection. Never summarizes,
 * never changes meaning, never reorders content.
 */
export function normalizeBlocks(blocks: ExtractedBlock[]): NormalizedDocument {
  const cleaned: ExtractedBlock[] = [];
  let lastText: string | null = null;

  for (const block of blocks) {
    const text = cleanText(block.text);
    if (!text) continue;
    if (text === lastText) continue;
    cleaned.push({ ...block, text });
    lastText = text;
  }

  const normalizedText = cleaned.map((b) => b.text).join("\n\n");
  return {
    blocks: cleaned,
    normalizedText,
    checksumNormalized: computeChecksum(normalizedText),
    detectedLanguage: detectLanguageHeuristic(normalizedText),
    sensitiveWarning: scanForSensitivePatterns(normalizedText),
  };
}

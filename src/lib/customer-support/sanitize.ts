import { CUSTOMER_SUPPORT_LIMITS } from "@/lib/customer-support/limits";

/**
 * Text sanitization for anything a visitor types or that gets persisted from
 * the chat (spec sections 17, 20: "contenido saneado" on every message).
 * Pure, no I/O - strips control characters and collapses whitespace, never
 * interprets the text as HTML/Markdown/instructions.
 *
 * Every character class below is built from a plain-ASCII \u-escape STRING
 * (never a literal invisible/control character pasted into this file), then
 * compiled with `new RegExp(...)` - deliberate, so this source file itself
 * never contains an unverifiable byte.
 */

// C0 control chars except TAB (u0009) and LF (u000A), plus DEL (u007F).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000B-\\u001F\\u007F]", "g");
// Zero-width spaces/joiners, bidi embedding/override marks, and the BOM - a known technique for hiding or reordering text (relevant to prompt-injection defenses too).
const ZERO_WIDTH_AND_BIDI = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF]", "g");
// Unicode combining diacritical marks (the result of NFD-decomposing accented letters).
const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036F]", "g");

export function stripControlCharacters(text: string): string {
  return text.replace(CONTROL_CHARS, "").replace(ZERO_WIDTH_AND_BIDI, "");
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The single entry point for saving visitor-typed text anywhere (message content, handoff subject/message) - bounded length, control chars stripped, plain text only (never rendered as HTML). */
export function sanitizeVisitorText(raw: string, maxLength: number = CUSTOMER_SUPPORT_LIMITS.MAX_MESSAGE_LENGTH): string {
  return normalizeWhitespace(stripControlCharacters(raw)).slice(0, maxLength);
}

export function isBlankMessage(text: string): boolean {
  return normalizeWhitespace(stripControlCharacters(text)).length === 0;
}

/** Deterministic text normalization for matching (spec section 10/14) - lowercase, strip accents/punctuation, collapse whitespace. Never used for display, only for comparison/scoring. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalizeForMatch(text);
  return normalized.length ? normalized.split(" ") : [];
}

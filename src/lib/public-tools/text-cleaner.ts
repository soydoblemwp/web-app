export interface TextCleanerOptions {
  collapseSpaces: boolean;
  collapseLineBreaks: boolean;
  removeInvisibleChars: boolean;
  normalizeQuotes: boolean;
  removeDuplicateLines: boolean;
  caseMode: "none" | "upper" | "lower" | "sentence";
}

export const DEFAULT_TEXT_CLEANER_OPTIONS: TextCleanerOptions = {
  collapseSpaces: true,
  collapseLineBreaks: true,
  removeInvisibleChars: true,
  normalizeQuotes: true,
  removeDuplicateLines: false,
  caseMode: "none",
};

/**
 * Zero-width and other invisible-but-not-whitespace characters that
 * sometimes survive a copy-paste from a PDF or web page. Built from explicit
 * char codes (rather than a regex literal containing the invisible
 * characters themselves) so the source stays legible and diff-safe:
 * U+00AD soft hyphen, U+200B-U+200D zero-width space/non-joiner/joiner,
 * U+FEFF byte-order mark.
 */
const INVISIBLE_CHAR_CODES = [0x00ad, 0x200b, 0x200c, 0x200d, 0xfeff];
const INVISIBLE_CHARS_PATTERN = new RegExp(`[${INVISIBLE_CHAR_CODES.map((code) => `\\u${code.toString(16).padStart(4, "0")}`).join("")}]`, "g");

function normalizeQuotesAndDashes(text: string): string {
  return text
    .replace(/[‘’‚‹]/g, "'")
    .replace(/[“”„›]/g, '"')
    .replace(/[–—]/g, "-");
}

function applyCaseMode(text: string, mode: TextCleanerOptions["caseMode"]): string {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  if (mode === "sentence") {
    return text
      .toLowerCase()
      .replace(/(^\s*[a-záéíóúñ]|[.!?]\s+[a-záéíóúñ])/g, (match) => match.toUpperCase());
  }
  return text;
}

export function cleanText(rawText: string, options: TextCleanerOptions): string {
  let text = rawText;

  if (options.removeInvisibleChars) {
    text = text.replace(INVISIBLE_CHARS_PATTERN, "");
  }
  if (options.normalizeQuotes) {
    text = normalizeQuotesAndDashes(text);
  }
  if (options.collapseSpaces) {
    text = text.replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n");
  }
  if (options.collapseLineBreaks) {
    text = text.replace(/\n{3,}/g, "\n\n");
  }
  if (options.removeDuplicateLines) {
    const seen = new Set<string>();
    text = text
      .split("\n")
      .filter((line) => {
        const key = line.trim();
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join("\n");
  }

  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return applyCaseMode(text, options.caseMode);
}

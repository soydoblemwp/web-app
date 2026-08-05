import { COMPARISON_LIMITS } from "./limits";

export interface DiffToken {
  type: "equal" | "added" | "removed";
  text: string;
}

export interface DiffOptions {
  ignoreCase?: boolean;
  ignoreWhitespace?: boolean;
  ignoreEmptyLines?: boolean;
  normalizeLineEndings?: boolean;
}

function preprocessLines(text: string, options: DiffOptions): string[] {
  const normalized = options.normalizeLineEndings !== false ? text.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : text;
  let lines = normalized.split("\n");
  if (options.ignoreEmptyLines) lines = lines.filter((l) => l.trim().length > 0);
  return lines.map((l) => {
    let out = l;
    if (options.ignoreWhitespace) out = out.trim().replace(/\s+/g, " ");
    if (options.ignoreCase) out = out.toLowerCase();
    return out;
  });
}

/** Generic LCS diff over an already-tokenized array — shared by line and character modes so the algorithm is written once (spec: reuse, don't duplicate the diff algorithm per mode). */
function lcsDiff(a: string[], b: string[]): { type: "equal" | "added" | "removed"; value: string }[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const result: { type: "equal" | "added" | "removed"; value: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "equal", value: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: "removed", value: a[i] });
      i++;
    } else {
      result.push({ type: "added", value: b[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "removed", value: a[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: "added", value: b[j] });
    j++;
  }
  return result;
}

export interface LineDiffResult {
  ok: boolean;
  error?: string;
  lines?: { type: "equal" | "added" | "removed"; text: string; originalLine?: string }[];
  linesAdded?: number;
  linesRemoved?: number;
  similarityPercent?: number;
}

export function diffLines(before: string, after: string, options: DiffOptions = {}): LineDiffResult {
  if (before.length > COMPARISON_LIMITS.maxCharsPerText || after.length > COMPARISON_LIMITS.maxCharsPerText) {
    return { ok: false, error: `Cada texto está limitado a ${COMPARISON_LIMITS.maxCharsPerText.toLocaleString("es-ES")} caracteres.` };
  }
  const beforeLines = preprocessLines(before, options);
  const afterLines = preprocessLines(after, options);
  if (beforeLines.length > COMPARISON_LIMITS.maxLinesPerText || afterLines.length > COMPARISON_LIMITS.maxLinesPerText) {
    return { ok: false, error: `Cada texto está limitado a ${COMPARISON_LIMITS.maxLinesPerText.toLocaleString("es-ES")} líneas.` };
  }

  const diffed = lcsDiff(beforeLines, afterLines);
  const lines = diffed.map((d) => ({ type: d.type, text: d.value }));
  const linesAdded = lines.filter((l) => l.type === "added").length;
  const linesRemoved = lines.filter((l) => l.type === "removed").length;
  const equalCount = lines.filter((l) => l.type === "equal").length;
  const totalUnits = Math.max(1, equalCount + linesAdded + linesRemoved);
  const similarityPercent = Math.round((equalCount / totalUnits) * 1000) / 10;

  return { ok: true, lines, linesAdded, linesRemoved, similarityPercent };
}

export interface CharDiffResult {
  ok: boolean;
  error?: string;
  chars?: DiffToken[];
  charsAdded?: number;
  charsRemoved?: number;
}

const MAX_CHARS_FOR_CHAR_MODE = 20_000; // O(n·m) — kept much tighter than the line-mode limit

export function diffChars(before: string, after: string): CharDiffResult {
  if (before.length > MAX_CHARS_FOR_CHAR_MODE || after.length > MAX_CHARS_FOR_CHAR_MODE) {
    return { ok: false, error: `La comparación por caracteres está limitada a ${MAX_CHARS_FOR_CHAR_MODE.toLocaleString("es-ES")} caracteres por texto (usa el modo por líneas o por palabras para textos más grandes).` };
  }
  const diffed = lcsDiff([...before], [...after]);
  const chars: DiffToken[] = diffed.map((d) => ({ type: d.type, text: d.value }));
  const charsAdded = chars.filter((c) => c.type === "added").length;
  const charsRemoved = chars.filter((c) => c.type === "removed").length;
  return { ok: true, chars, charsAdded, charsRemoved };
}

/** Comparison mode for JSON: parses both sides and re-serializes with stable 2-space formatting before line-diffing, so differences in whitespace/key order that don't change meaning are normalized away first. Never uses `eval`. */
export function diffJson(before: string, after: string): LineDiffResult {
  let beforeParsed: unknown;
  let afterParsed: unknown;
  try {
    beforeParsed = JSON.parse(before);
  } catch {
    return { ok: false, error: "El texto A no es JSON válido." };
  }
  try {
    afterParsed = JSON.parse(after);
  } catch {
    return { ok: false, error: "El texto B no es JSON válido." };
  }
  return diffLines(JSON.stringify(beforeParsed, null, 2), JSON.stringify(afterParsed, null, 2));
}

/**
 * Shared parse/validation error shape for every Fase 49 data-format core
 * (YAML/XML/TOML) — mirrors the existing JSON tool's convention
 * (`utilities/json-tool.ts`'s `JsonParseError`) so every format reports
 * line, column, and a short, safe snippet the same way instead of each
 * tool inventing its own error shape (spec section 13/29).
 */
export interface FormatParseError {
  message: string;
  line: number | null;
  column: number | null;
  snippet: string | null;
}

/** Converts a 0-based character offset into a 1-based line/column, matching `utilities/json-tool.ts`'s convention. */
export function offsetToLineColumn(raw: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const end = Math.min(offset, raw.length);
  for (let i = 0; i < end; i++) {
    if (raw[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

export function safeSnippet(raw: string, offset: number, radius = 30): string {
  const start = Math.max(0, offset - radius);
  const end = Math.min(raw.length, offset + radius);
  return raw.slice(start, end);
}

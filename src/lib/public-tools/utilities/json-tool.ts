import { UTILITY_LIMITS } from "./limits";

export interface JsonParseError {
  message: string;
  line: number | null;
  column: number | null;
  snippet: string | null;
}

export interface JsonValidationResult {
  ok: boolean;
  value?: unknown;
  error?: JsonParseError;
}

/**
 * A minimal hand-written JSON tokenizer/recursive-descent walker used
 * ONLY to locate where parsing fails. Native `JSON.parse` error messages
 * are not standardized across engines/versions — different Node/V8
 * releases were found (during testing) to sometimes include a
 * "position N" and sometimes not, which made regex-scraping the message
 * unreliable. Walking the JSON grammar ourselves gives a consistent,
 * engine-independent character index for every error case. The actual
 * parsed value returned to callers still comes from the native
 * `JSON.parse` (faster, and battle-tested for correctness) — this walker
 * is only ever invoked on the already-known-invalid path.
 */
function findErrorIndex(raw: string): { index: number; reason: string } {
  let i = 0;
  const len = raw.length;

  function skipWhitespace() {
    while (i < len && /[\s]/.test(raw[i])) i++;
  }

  function parseValue(): void {
    skipWhitespace();
    if (i >= len) throw { index: i, reason: "Se esperaba un valor y el texto termina aquí." };
    const c = raw[i];
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === '"') return parseString();
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
    if (raw.startsWith("true", i)) {
      i += 4;
      return;
    }
    if (raw.startsWith("false", i)) {
      i += 5;
      return;
    }
    if (raw.startsWith("null", i)) {
      i += 4;
      return;
    }
    throw { index: i, reason: `Valor inesperado ("${c}").` };
  }

  function parseObject(): void {
    i++; // consume '{'
    skipWhitespace();
    if (raw[i] === "}") {
      i++;
      return;
    }
    for (;;) {
      skipWhitespace();
      if (raw[i] !== '"') throw { index: i, reason: "Se esperaba una clave entre comillas dobles." };
      parseString();
      skipWhitespace();
      if (raw[i] !== ":") throw { index: i, reason: "Se esperaba ':' después de la clave." };
      i++;
      parseValue();
      skipWhitespace();
      if (raw[i] === ",") {
        i++;
        continue;
      }
      if (raw[i] === "}") {
        i++;
        return;
      }
      throw { index: i, reason: "Se esperaba ',' o '}'." };
    }
  }

  function parseArray(): void {
    i++; // consume '['
    skipWhitespace();
    if (raw[i] === "]") {
      i++;
      return;
    }
    for (;;) {
      parseValue();
      skipWhitespace();
      if (raw[i] === ",") {
        i++;
        continue;
      }
      if (raw[i] === "]") {
        i++;
        return;
      }
      throw { index: i, reason: "Se esperaba ',' o ']'." };
    }
  }

  function parseString(): void {
    i++; // consume opening quote
    while (i < len && raw[i] !== '"') {
      if (raw[i] === "\\") i++;
      i++;
    }
    if (i >= len) throw { index: i, reason: "Cadena de texto sin cerrar (falta una comilla)." };
    i++; // consume closing quote
  }

  function parseNumber(): void {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(raw.slice(i));
    if (!match || match[0].length === 0) throw { index: i, reason: "Número con formato inválido." };
    i += match[0].length;
  }

  try {
    parseValue();
    skipWhitespace();
    if (i < len) throw { index: i, reason: "Contenido adicional después del valor JSON." };
    // Grammar walk succeeded even though JSON.parse failed — extremely unlikely, but report generically rather than claiming a false position.
    return { index: i, reason: "JSON inválido." };
  } catch (err) {
    const e = err as { index: number; reason: string };
    return { index: Math.min(e.index, len), reason: e.reason };
  }
}

/** Converts a character index into a 1-based line/column plus a short, safe surrounding snippet (never re-injected as HTML). */
function locateError(raw: string, message: string): JsonParseError {
  const { index, reason } = findErrorIndex(raw);

  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < raw.length; i++) {
    if (raw[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  const snippetStart = Math.max(0, index - 30);
  const snippetEnd = Math.min(raw.length, index + 30);
  const snippet = raw.slice(snippetStart, snippetEnd);

  return { message: reason || message, line, column, snippet };
}

export function validateJson(raw: string): JsonValidationResult {
  if (raw.length > UTILITY_LIMITS.json.maxTextLength) {
    return { ok: false, error: { message: `El texto supera el límite de ${UTILITY_LIMITS.json.maxTextLength.toLocaleString("es-ES")} caracteres.`, line: null, column: null, snippet: null } };
  }
  try {
    // JSON.parse never executes code — it only builds plain data (objects/arrays/strings/numbers/booleans/null).
    const value = JSON.parse(raw);
    return { ok: true, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : "JSON inválido.";
    return { ok: false, error: locateError(raw, message) };
  }
}

export interface JsonStats {
  objects: number;
  arrays: number;
  keys: number;
  values: number;
  maxDepth: number;
  approxBytes: number;
}

/** Iterative traversal (explicit stack, never recursive) so extremely nested JSON can't overflow the call stack — depth beyond the configured limit is reported, not silently truncated. */
export function computeJsonStats(value: unknown): JsonStats & { depthExceeded: boolean } {
  const stats: JsonStats = { objects: 0, arrays: 0, keys: 0, values: 0, maxDepth: 0, approxBytes: 0 };
  let depthExceeded = false;
  const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 1 }];

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > stats.maxDepth) stats.maxDepth = depth;
    if (depth > UTILITY_LIMITS.json.maxDepth) {
      depthExceeded = true;
      continue;
    }

    if (Array.isArray(node)) {
      stats.arrays++;
      for (const item of node) stack.push({ node: item, depth: depth + 1 });
    } else if (node !== null && typeof node === "object") {
      stats.objects++;
      for (const [, v] of Object.entries(node)) {
        stats.keys++;
        stack.push({ node: v, depth: depth + 1 });
      }
    } else {
      stats.values++;
    }
  }

  stats.approxBytes = new TextEncoder().encode(JSON.stringify(value)).length;
  return { ...stats, depthExceeded };
}

export type JsonIndent = "2" | "4" | "tab";

function indentString(indent: JsonIndent): string {
  if (indent === "tab") return "\t";
  return " ".repeat(Number(indent));
}

export function formatJson(value: unknown, indent: JsonIndent): string {
  return JSON.stringify(value, null, indentString(indent));
}

export function minifyJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Recursively sorts object keys alphabetically for presentation only — never
 * mutates values. Builds new objects via `Object.fromEntries`, which defines
 * properties directly (CreateDataPropertyOrThrow) rather than using bracket
 * assignment, so a key literally named "__proto__" is stored as an own
 * property instead of reassigning the object's prototype (spec section 14:
 * "protege contra prototype pollution... claves como __proto__").
 */
export function sortJsonKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, sortJsonKeysDeep(v)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

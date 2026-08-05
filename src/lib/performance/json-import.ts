/**
 * Safe JSON import validation (spec section 13) — depth/size/record-count
 * bounded, and explicitly rejects prototype-pollution-prone keys. Never uses
 * `eval`, `new Function`, or any dynamic code execution to resolve a path;
 * path resolution below is a plain, bounded string-split walk.
 */

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface JsonValidationResult {
  valid: boolean;
  error?: string;
}

/** Recursively rejects prototype-pollution-prone keys and depth beyond the limit — the ONE gate every parsed JSON import payload must pass before anything else touches it. */
export function validateJsonStructure(value: unknown, maxDepth: number, maxStringLength: number, depth = 0): JsonValidationResult {
  if (depth > maxDepth) return { valid: false, error: `La estructura JSON supera la profundidad máxima permitida (${maxDepth}).` };

  if (typeof value === "string") {
    if (value.length > maxStringLength) return { valid: false, error: `Un valor de texto supera la longitud máxima permitida (${maxStringLength} caracteres).` };
    return { valid: true };
  }
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "undefined") {
    return { valid: true };
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = validateJsonStructure(item, maxDepth, maxStringLength, depth + 1);
      if (!result.valid) return result;
    }
    return { valid: true };
  }
  if (typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) return { valid: false, error: `La propiedad "${key}" no está permitida.` };
      const result = validateJsonStructure((value as Record<string, unknown>)[key], maxDepth, maxStringLength, depth + 1);
      if (!result.valid) return result;
    }
    return { valid: true };
  }
  return { valid: false, error: "Tipo de valor no soportado en el JSON." };
}

/** Resolves a dotted path (e.g. "data.items" or "metrics.likes") within a plain object — a bounded string-split walk, never `eval`/dynamic property access beyond a plain index lookup. Rejects dangerous segments defensively even though validateJsonStructure should already have rejected them upstream. */
export function getValueAtPath(root: unknown, path: string): unknown {
  if (!path) return root;
  const segments = path.split(".").filter(Boolean);
  let current: unknown = root;
  for (const segment of segments) {
    if (DANGEROUS_KEYS.has(segment)) return undefined;
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Finds the array of records to import — either the root itself (if it's already an array) or a named container property (e.g. {"data": [...]}). Returns null when neither shape matches. */
export function resolveImportRecordsArray(parsed: unknown, containerPath?: string): unknown[] | null {
  const root = containerPath ? getValueAtPath(parsed, containerPath) : parsed;
  if (Array.isArray(root)) return root;
  return null;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

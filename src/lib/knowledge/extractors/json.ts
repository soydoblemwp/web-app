import type { ExtractedBlock, ExtractionResult } from "@/lib/knowledge/types";

const MAX_LEAVES = 4000;
const MAX_VALUE_CHARS = 500;
const MAX_DEPTH = 12;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function formatPrimitive(value: string | number | boolean | null): string {
  if (value === null) return "null";
  const text = String(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

/**
 * JSON — validates structure then flattens it into one block per leaf value,
 * each carrying its exact JSON path (spec section 10: "conserva la ruta JSON
 * para las citas"). Never executes anything in the file, never serializes
 * unbounded objects (hard leaf cap + per-value truncation with warnings).
 */
export function extractJson(text: string): ExtractionResult {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, text: "", blocks: [], warnings: [], quality: "NONE", method: "json", metadata: {}, errorCode: "EXTRACTION_FAILED" };
  }

  const blocks: ExtractedBlock[] = [];
  const warnings: string[] = [];
  let truncated = false;

  function walk(value: JsonValue, path: string, depth: number) {
    if (blocks.length >= MAX_LEAVES) {
      truncated = true;
      return;
    }
    if (depth > MAX_DEPTH) {
      truncated = true;
      return;
    }
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      blocks.push({ kind: "other", text: `${path || "(raíz)"}: ${formatPrimitive(value)}`, jsonPath: path || "$" });
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        blocks.push({ kind: "other", text: `${path}: []`, jsonPath: path });
        return;
      }
      for (let i = 0; i < value.length; i++) {
        walk(value[i], `${path}[${i}]`, depth + 1);
        if (blocks.length >= MAX_LEAVES) {
          truncated = true;
          break;
        }
      }
      return;
    }
    const keys = Object.keys(value);
    if (keys.length === 0) {
      blocks.push({ kind: "other", text: `${path}: {}`, jsonPath: path });
      return;
    }
    for (const key of keys) {
      walk(value[key], path ? `${path}.${key}` : key, depth + 1);
      if (blocks.length >= MAX_LEAVES) {
        truncated = true;
        break;
      }
    }
  }

  walk(parsed, "", 0);
  if (truncated) warnings.push(`Se truncó el contenido a los primeros ${MAX_LEAVES} valores para mantener el documento manejable.`);

  return {
    ok: true,
    text: blocks.map((b) => b.text).join("\n"),
    blocks,
    warnings,
    quality: blocks.length > 0 ? "HIGH" : "NONE",
    method: "json",
    metadata: { leafCount: blocks.length, truncated },
  };
}

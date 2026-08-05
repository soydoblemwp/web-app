/**
 * YAML core (spec section 14). Uses the `yaml` package's default "core"
 * schema, which only ever resolves YAML into plain data (maps, sequences,
 * scalars) — it never instantiates classes, never registers executable
 * custom tags (`customTags` is never passed here), and has no "unsafe
 * load" mode to opt into by mistake, unlike older YAML libraries. Anchors
 * and aliases resolve to duplicated plain values (never live object
 * references), and `maxAliasCount` bounds alias expansion against
 * "billion laughs"-style bombs (spec: "limita aliases para evitar
 * expansión excesiva").
 */
import * as YAML from "yaml";
import { DOCUMENT_LIMITS } from "../documents/limits";
import type { FormatParseError } from "./errors";
import { safeSnippet } from "./errors";
import { safeObjectFromEntries, countNodesAndDepth } from "./safe-values";

const LIMITS = DOCUMENT_LIMITS.dataFormats;

export interface YamlToJsonOptions {
  allowMultipleDocuments?: boolean; // explicit opt-in only (spec: "documentos múltiples, únicamente como opción explícita")
  largeIntegerStrategy: "string" | "reject"; // never silently loses precision
}

export interface LargeIntegerNote {
  path: string;
  raw: string;
}

export interface YamlToJsonResult {
  ok: boolean;
  error?: FormatParseError;
  value?: unknown;
  documents?: unknown[];
  warnings: string[];
  skippedKeys: string[];
  largeIntegers: LargeIntegerNote[];
  lostFeatures: string[]; // comments/anchors/aliases/tags that JSON cannot represent
}

/** Walks a `.toJS()`-produced tree, replacing BigInt (from `intAsBigInt: true`) per `largeIntegerStrategy`, and rebuilding objects via `safeObjectFromEntries` so a key named `__proto__` can never reassign a prototype. */
function sanitizeValue(node: unknown, path: string, strategy: YamlToJsonOptions["largeIntegerStrategy"], largeIntegers: LargeIntegerNote[], skippedKeys: string[]): unknown {
  if (typeof node === "bigint") {
    const raw = node.toString();
    if (node >= BigInt(Number.MIN_SAFE_INTEGER) && node <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(node);
    }
    largeIntegers.push({ path, raw });
    return strategy === "string" ? raw : null;
  }
  if (Array.isArray(node)) {
    return node.map((item, i) => sanitizeValue(item, `${path}[${i}]`, strategy, largeIntegers, skippedKeys));
  }
  if (node instanceof Map) {
    const entries = Array.from(node.entries()).map(([k, v]) => [String(k), v] as const);
    const { value, skippedKeys: skipped } = safeObjectFromEntries(entries.map(([k, v]) => [k, sanitizeValue(v, `${path}.${k}`, strategy, largeIntegers, skippedKeys)] as const));
    skippedKeys.push(...skipped.map((k) => `${path}.${k}`));
    return value;
  }
  if (node !== null && typeof node === "object" && !(node instanceof Date)) {
    const entries = Object.entries(node as Record<string, unknown>);
    const { value, skippedKeys: skipped } = safeObjectFromEntries(entries.map(([k, v]) => [k, sanitizeValue(v, `${path}.${k}`, strategy, largeIntegers, skippedKeys)] as const));
    skippedKeys.push(...skipped.map((k) => `${path}.${k}`));
    return value;
  }
  return node;
}

function docToResult(doc: YAML.Document.Parsed, options: YamlToJsonOptions): { ok: boolean; error?: FormatParseError; value?: unknown; warnings: string[]; skippedKeys: string[]; largeIntegers: LargeIntegerNote[] } {
  const warnings = doc.warnings.map((w) => w.message);
  if (doc.errors.length > 0) {
    const err = doc.errors[0];
    const pos = err.linePos?.[0];
    return {
      ok: false,
      error: { message: err.message, line: pos?.line ?? null, column: pos?.col ?? null, snippet: null },
      warnings,
      skippedKeys: [],
      largeIntegers: [],
    };
  }

  let raw: unknown;
  try {
    raw = doc.toJS({ maxAliasCount: LIMITS.yamlMaxAliasExpansion, mapAsMap: false });
  } catch (err) {
    return {
      ok: false,
      error: { message: err instanceof Error ? err.message : "El documento supera el límite de expansión de alias (posible bomba de alias).", line: null, column: null, snippet: null },
      warnings,
      skippedKeys: [],
      largeIntegers: [],
    };
  }

  const largeIntegers: LargeIntegerNote[] = [];
  const skippedKeys: string[] = [];
  const value = sanitizeValue(raw, "$", options.largeIntegerStrategy, largeIntegers, skippedKeys);

  const { nodes, depthExceeded } = countNodesAndDepth(value, LIMITS.maxDepth);
  if (nodes > LIMITS.maxNodes) {
    return { ok: false, error: { message: `El documento supera el límite de ${LIMITS.maxNodes.toLocaleString("es-ES")} nodos.`, line: null, column: null, snippet: null }, warnings, skippedKeys, largeIntegers };
  }
  if (depthExceeded) {
    return { ok: false, error: { message: `El documento supera la profundidad máxima permitida (${LIMITS.maxDepth}).`, line: null, column: null, snippet: null }, warnings, skippedKeys, largeIntegers };
  }
  if (options.largeIntegerStrategy === "reject" && largeIntegers.length > 0) {
    return {
      ok: false,
      error: { message: `El documento contiene ${largeIntegers.length} entero(s) fuera del rango seguro de JSON (ej. ${largeIntegers[0].raw} en ${largeIntegers[0].path}).`, line: null, column: null, snippet: null },
      warnings,
      skippedKeys,
      largeIntegers,
    };
  }

  return { ok: true, value, warnings, skippedKeys, largeIntegers };
}

export function yamlToJson(text: string, options: YamlToJsonOptions): YamlToJsonResult {
  if (text.length > LIMITS.maxTextLength) {
    return { ok: false, error: { message: `El texto supera el límite de ${LIMITS.maxTextLength.toLocaleString("es-ES")} caracteres.`, line: null, column: null, snippet: null }, warnings: [], skippedKeys: [], largeIntegers: [], lostFeatures: [] };
  }
  if (text.split("\n").length > LIMITS.maxLines) {
    return { ok: false, error: { message: `El texto supera el límite de ${LIMITS.maxLines.toLocaleString("es-ES")} líneas.`, line: null, column: null, snippet: null }, warnings: [], skippedKeys: [], largeIntegers: [], lostFeatures: [] };
  }

  let docs: YAML.Document.Parsed[];
  try {
    docs = YAML.parseAllDocuments(text, { intAsBigInt: true, uniqueKeys: true, strict: true });
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : "YAML inválido.", line: null, column: null, snippet: null }, warnings: [], skippedKeys: [], largeIntegers: [], lostFeatures: [] };
  }

  if (docs.length === 0) {
    return { ok: true, value: null, warnings: [], skippedKeys: [], largeIntegers: [], lostFeatures: [] };
  }

  const lostFeatures: string[] = [];
  if (/(^|\n)\s*#/.test(text)) lostFeatures.push("comentarios");
  if (/&\w+/.test(text)) lostFeatures.push("anchors");
  if (/\*\w+/.test(text)) lostFeatures.push("aliases (se expanden a valores duplicados)");
  if (/!!\w+|!\w+/.test(text)) lostFeatures.push("tags personalizados");

  if (docs.length > 1) {
    if (!options.allowMultipleDocuments) {
      return {
        ok: false,
        error: { message: `El texto contiene ${docs.length} documentos YAML separados por "---". Activa el modo de documentos múltiples para procesarlos todos.`, line: null, column: null, snippet: safeSnippet(text, 0) },
        warnings: [],
        skippedKeys: [],
        largeIntegers: [],
        lostFeatures,
      };
    }
    if (docs.length > LIMITS.yamlMaxDocuments) {
      return { ok: false, error: { message: `El texto supera el límite de ${LIMITS.yamlMaxDocuments} documentos YAML.`, line: null, column: null, snippet: null }, warnings: [], skippedKeys: [], largeIntegers: [], lostFeatures };
    }
    const results = docs.map((d) => docToResult(d, options));
    const firstError = results.find((r) => !r.ok);
    if (firstError) return { ok: false, error: firstError.error, warnings: results.flatMap((r) => r.warnings), skippedKeys: [], largeIntegers: [], lostFeatures };
    return {
      ok: true,
      documents: results.map((r) => r.value),
      warnings: results.flatMap((r) => r.warnings),
      skippedKeys: results.flatMap((r) => r.skippedKeys),
      largeIntegers: results.flatMap((r) => r.largeIntegers),
      lostFeatures,
    };
  }

  const result = docToResult(docs[0], options);
  return { ...result, lostFeatures };
}

export type JsonToYamlOptions = {
  indent: number;
};

export interface JsonToYamlResult {
  ok: boolean;
  error?: string;
  yaml?: string;
}

/** JSON -> YAML is always lossless in this direction (JSON's data model is a strict subset of YAML's) — never adds anchors/aliases/comments/tags of its own. */
export function jsonToYaml(value: unknown, options: JsonToYamlOptions): JsonToYamlResult {
  try {
    const yaml = YAML.stringify(value, { indent: options.indent, aliasDuplicateObjects: false });
    return { ok: true, yaml };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo convertir el JSON a YAML." };
  }
}

export function formatYaml(text: string, indent: number): { ok: boolean; error?: FormatParseError; formatted?: string } {
  const result = yamlToJson(text, { allowMultipleDocuments: false, largeIntegerStrategy: "string" });
  if (!result.ok) return { ok: false, error: result.error };
  const stringified = YAML.stringify(result.value, { indent });
  return { ok: true, formatted: stringified };
}

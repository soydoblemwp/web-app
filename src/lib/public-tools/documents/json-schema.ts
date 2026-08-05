import { DOCUMENT_LIMITS } from "./limits";

/**
 * Versioned JSON import/export envelope shared by every Fase 47 tool that
 * offers "save your work as a file" (spec section 29). Guards against
 * prototype pollution, runaway depth/size, and a mismatched tool/version —
 * never a raw `JSON.parse` handed straight to `setState`.
 */
export interface DocumentEnvelope<T> {
  schema: "public-tool-document";
  version: 1;
  tool: string;
  data: T;
}

export function buildDocumentEnvelope<T>(tool: string, data: T): DocumentEnvelope<T> {
  return { schema: "public-tool-document", version: 1, tool, data };
}

export interface ParseEnvelopeResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertSafeDepth(value: unknown, depth: number): boolean {
  if (depth > DOCUMENT_LIMITS.json.maxDepth) return false;
  if (value === null || typeof value !== "object") return true;
  if (Array.isArray(value)) return value.every((item) => assertSafeDepth(item, depth + 1));
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return false;
    if (!assertSafeDepth((value as Record<string, unknown>)[key], depth + 1)) return false;
  }
  return true;
}

/** Parses and validates a JSON envelope for `tool`, rejecting the wrong tool, wrong version, oversized payloads, unsafe keys, or excessive nesting. */
export function parseDocumentEnvelope<T>(raw: string, tool: string): ParseEnvelopeResult<T> {
  if (raw.length > DOCUMENT_LIMITS.json.maxBytes) {
    return { ok: false, error: `El archivo supera el límite de ${Math.round(DOCUMENT_LIMITS.json.maxBytes / 1024 / 1024)} MB.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "El archivo no es JSON válido." };
  }
  if (!assertSafeDepth(parsed, 0)) {
    return { ok: false, error: "El archivo contiene una estructura no permitida o demasiado profunda." };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "El archivo no tiene el formato esperado." };
  }
  const envelope = parsed as Partial<DocumentEnvelope<T>>;
  if (envelope.schema !== "public-tool-document") {
    return { ok: false, error: "El archivo no es una plantilla reconocida de esta suite de herramientas." };
  }
  if (envelope.version !== 1) {
    return { ok: false, error: "La versión de la plantilla no es compatible con esta herramienta." };
  }
  if (envelope.tool !== tool) {
    return { ok: false, error: `Este archivo pertenece a otra herramienta ("${envelope.tool}"), no a esta.` };
  }
  if (envelope.data === undefined) {
    return { ok: false, error: "El archivo no contiene datos." };
  }
  return { ok: true, data: envelope.data };
}

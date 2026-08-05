/**
 * XML core (spec section 15). `fast-xml-parser` is a pure string parser
 * with no `fs`/network access anywhere in its implementation — it cannot
 * fetch an external DTD, external entity, or remote schema even in
 * principle. On top of that, this module rejects any `<!DOCTYPE` outright
 * before the text ever reaches the parser (spec: "rechaza... cuando el
 * parser no pueda garantizar aislamiento completo") — the simplest,
 * fully-auditable way to guarantee no DTD/external-entity path is ever
 * exercised, rather than trying to allow a "safe subset" of DOCTYPE. The
 * library also throws its own `[SECURITY]` error for tag/attribute names
 * matching `__proto__`/`constructor`/`prototype`, caught and reworded here
 * rather than ever shown as a raw dependency stack trace.
 */
import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { DOCUMENT_LIMITS } from "../documents/limits";
import type { FormatParseError } from "./errors";

const LIMITS = DOCUMENT_LIMITS.dataFormats;

const DOCTYPE_PATTERN = /<!DOCTYPE/i;
const XINCLUDE_PATTERN = /<(?:\w+:)?include\b[^>]*xmlns[:=][^>]*xinclude/i;

function rejectDangerousMarkup(text: string): FormatParseError | null {
  if (DOCTYPE_PATTERN.test(text)) {
    return { message: "El XML contiene una declaración <!DOCTYPE>. Por seguridad (DTD y entidades externas nunca se procesan), esta herramienta la rechaza por completo.", line: null, column: null, snippet: null };
  }
  if (XINCLUDE_PATTERN.test(text)) {
    return { message: "El XML contiene XInclude, que nunca se resuelve por seguridad (implicaría cargar contenido externo).", line: null, column: null, snippet: null };
  }
  return null;
}

const PRESERVE_ORDER_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  commentPropName: "#comment",
  cdataPropName: "#cdata",
  processEntities: true,
  htmlEntities: false,
} as const;

export interface XmlStats {
  elements: number;
  attributes: number;
  maxDepth: number;
  hasComments: boolean;
  hasCdata: boolean;
  namespacePrefixes: string[];
}

function computeStats(ordered: unknown[]): XmlStats {
  let elements = 0;
  let attributes = 0;
  let maxDepth = 0;
  let hasComments = false;
  let hasCdata = false;
  const namespacePrefixes = new Set<string>();

  function visit(nodes: unknown[], depth: number) {
    for (const node of nodes) {
      if (typeof node !== "object" || node === null) continue;
      const entry = node as Record<string, unknown>;
      const attrs = entry[":@"] as Record<string, unknown> | undefined;
      if (attrs) {
        for (const key of Object.keys(attrs)) {
          attributes++;
          const name = key.replace(/^@_/, "");
          if (name.startsWith("xmlns:")) namespacePrefixes.add(name.slice(6));
        }
      }
      for (const key of Object.keys(entry)) {
        if (key === ":@") continue;
        if (key === "#comment") {
          hasComments = true;
          continue;
        }
        if (key === "#cdata") {
          hasCdata = true;
          continue;
        }
        if (key === "#text") continue;
        elements++;
        if (depth > maxDepth) maxDepth = depth;
        if (key.includes(":")) namespacePrefixes.add(key.split(":")[0]);
        const children = entry[key];
        if (Array.isArray(children)) visit(children, depth + 1);
      }
    }
  }
  visit(ordered, 1);
  return { elements, attributes, maxDepth, hasComments, hasCdata, namespacePrefixes: Array.from(namespacePrefixes) };
}

export interface XmlValidationResult {
  ok: boolean;
  error?: FormatParseError;
  stats?: XmlStats;
}

export function validateXml(text: string): XmlValidationResult {
  if (text.length > LIMITS.maxTextLength) {
    return { ok: false, error: { message: `El texto supera el límite de ${LIMITS.maxTextLength.toLocaleString("es-ES")} caracteres.`, line: null, column: null, snippet: null } };
  }
  const dangerous = rejectDangerousMarkup(text);
  if (dangerous) return { ok: false, error: dangerous };

  const validation = XMLValidator.validate(text, { allowBooleanAttributes: true });
  if (validation !== true) {
    return { ok: false, error: { message: validation.err.msg, line: validation.err.line ?? null, column: validation.err.col ?? null, snippet: null } };
  }

  try {
    const parser = new XMLParser(PRESERVE_ORDER_OPTIONS);
    const ordered = parser.parse(text) as unknown[];
    const stats = computeStats(ordered);
    if (stats.elements > LIMITS.xmlMaxElements) {
      return { ok: false, error: { message: `El XML supera el límite de ${LIMITS.xmlMaxElements.toLocaleString("es-ES")} elementos.`, line: null, column: null, snippet: null } };
    }
    if (stats.maxDepth > LIMITS.xmlMaxDepth) {
      return { ok: false, error: { message: `El XML supera la profundidad máxima permitida (${LIMITS.xmlMaxDepth}).`, line: null, column: null, snippet: null } };
    }
    if (stats.attributes > LIMITS.xmlMaxAttributesPerElement * Math.max(1, stats.elements)) {
      return { ok: false, error: { message: "El XML tiene demasiados atributos.", line: null, column: null, snippet: null } };
    }
    return { ok: true, stats };
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : "El XML no se pudo procesar de forma segura.", line: null, column: null, snippet: null } };
  }
}

export interface XmlFormatResult {
  ok: boolean;
  error?: FormatParseError;
  formatted?: string;
}

export function formatXml(text: string, indentBy: string): XmlFormatResult {
  const validation = validateXml(text);
  if (!validation.ok) return { ok: false, error: validation.error };
  try {
    const parser = new XMLParser(PRESERVE_ORDER_OPTIONS);
    const ordered = parser.parse(text);
    const builder = new XMLBuilder({ ...PRESERVE_ORDER_OPTIONS, format: true, indentBy, suppressEmptyNode: false });
    return { ok: true, formatted: builder.build(ordered) };
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : "No se pudo formatear el XML.", line: null, column: null, snippet: null } };
  }
}

export function minifyXml(text: string): XmlFormatResult {
  const validation = validateXml(text);
  if (!validation.ok) return { ok: false, error: validation.error };
  try {
    const parser = new XMLParser(PRESERVE_ORDER_OPTIONS);
    const ordered = parser.parse(text);
    const builder = new XMLBuilder({ ...PRESERVE_ORDER_OPTIONS, format: false, suppressEmptyNode: false });
    return { ok: true, formatted: builder.build(ordered) };
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : "No se pudo minificar el XML.", line: null, column: null, snippet: null } };
  }
}

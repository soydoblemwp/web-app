/**
 * XML <-> JSON conversion (spec section 15), using a distinct, documented
 * representation from `xml.ts`'s format/minify path (which preserves exact
 * document order/comments/CDATA for faithful round-tripping). This module
 * instead produces a JSON-friendly shape:
 *
 * - Attributes become object keys prefixed with `@` (e.g. `<a id="1">` -> `{ "@id": "1" }`).
 * - Text content becomes the `#text` key when the element also has attributes
 *   or children; a text-only, attribute-less element collapses to a plain string.
 * - Repeated sibling tags become a JSON array.
 * - CDATA content is folded into `#text` — the fact that it was CDATA (vs.
 *   plain text) is NOT preserved, by design (JSON has no CDATA concept).
 * - Comments are folded into `#comment` entries.
 * - Document order between element children and interleaved comments/text is
 *   NOT preserved for mixed content — spec section 15 explicitly forbids
 *   claiming perfect reversibility here, so this module never does.
 *
 * Same DOCTYPE/entity rejection as `xml.ts` — this module calls `validateXml`
 * first and never parses text that path already rejected.
 */
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { DOCUMENT_LIMITS } from "../documents/limits";
import type { FormatParseError } from "./errors";
import { validateXml } from "./xml";
import { safeObjectFromEntries, countNodesAndDepth } from "./safe-values";

const LIMITS = DOCUMENT_LIMITS.dataFormats;

const FRIENDLY_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  cdataPropName: "#text", // CDATA folds into plain text — documented above, never claimed lossless
  commentPropName: "#comment",
  parseAttributeValue: false,
  trimValues: true,
} as const;

export interface XmlToJsonResult {
  ok: boolean;
  error?: FormatParseError;
  value?: unknown;
  lostFeatures: string[];
}

const ALWAYS_LOST = ["orden exacto de nodos de texto mixtos con elementos", "distinción entre CDATA y texto normal", "declaración XML y su codificación"];

export function xmlToJson(text: string): XmlToJsonResult {
  const validation = validateXml(text);
  if (!validation.ok) return { ok: false, error: validation.error, lostFeatures: [] };

  try {
    const parser = new XMLParser(FRIENDLY_OPTIONS);
    const raw = parser.parse(text) as Record<string, unknown>;
    // Rebuild via safeObjectFromEntries at every level so a literal `__proto__`/`constructor`/`prototype`
    // tag or attribute name (fast-xml-parser already throws on the tag-name case; this also covers the
    // unlikely attribute-name case) can never reach the output as a live prototype reassignment.
    const value = sanitize(raw);
    const { nodes, depthExceeded } = countNodesAndDepth(value, LIMITS.maxDepth);
    if (nodes > LIMITS.maxNodes) return { ok: false, error: { message: `El XML supera el límite de ${LIMITS.maxNodes.toLocaleString("es-ES")} nodos.`, line: null, column: null, snippet: null }, lostFeatures: [] };
    if (depthExceeded) return { ok: false, error: { message: `El XML supera la profundidad máxima permitida (${LIMITS.maxDepth}).`, line: null, column: null, snippet: null }, lostFeatures: [] };

    const lostFeatures = [...ALWAYS_LOST];
    if (validation.stats?.hasComments) lostFeatures.push("comentarios (se incluyen bajo \"#comment\" pero fuera de su posición original)");
    if (validation.stats?.hasCdata) lostFeatures.push("secciones CDATA (el contenido se conserva como texto, sin la marca CDATA)");

    return { ok: true, value, lostFeatures };
  } catch (err) {
    return { ok: false, error: { message: err instanceof Error ? err.message : "No se pudo convertir el XML a JSON.", line: null, column: null, snippet: null }, lostFeatures: [] };
  }
}

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node !== null && typeof node === "object") {
    const entries = Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)] as const);
    return safeObjectFromEntries(entries).value;
  }
  return node;
}

export interface JsonToXmlResult {
  ok: boolean;
  error?: string;
  xml?: string;
}

/** The inverse convention of `xmlToJson`: `@attr` keys become attributes, `#text` becomes text content, arrays become repeated sibling tags. Requires a single root key. */
export function jsonToXml(value: unknown, rootName: string | undefined, indentBy: string): JsonToXmlResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "El JSON debe ser un objeto con una única clave raíz para convertirlo a XML." };
  }
  const keys = Object.keys(value as Record<string, unknown>);
  let payload: unknown = value;
  if (keys.length !== 1) {
    if (!rootName) return { ok: false, error: "El JSON tiene varias claves de nivel superior; indica un nombre de elemento raíz." };
    payload = { [rootName]: value };
  }
  try {
    const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text", cdataPropName: "#text", commentPropName: "#comment", format: true, indentBy });
    const xml = builder.build(payload) as string;
    return { ok: true, xml };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo convertir el JSON a XML." };
  }
}

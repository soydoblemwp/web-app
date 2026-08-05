/**
 * URL analyzer/builder core (spec section 25). Uses the platform's own
 * `URL`/`URLSearchParams` for all parsing/reconstruction/percent-encoding
 * — never a hand-written URL grammar, and never a manual punycode
 * implementation (the `URL` constructor already converts an
 * internationalized hostname to its ASCII/punycode form; this module just
 * also keeps the original, visitor-typed Unicode substring for display).
 * Never navigates, never fetches, never resolves DNS, never renders a
 * clickable link for a dangerous scheme.
 */
import { DOCUMENT_LIMITS } from "../documents/limits";

const LIMITS = DOCUMENT_LIMITS.network;

export interface UrlComponents {
  href: string;
  scheme: string; // without trailing ":"
  username: string;
  password: string;
  hostnameAscii: string; // URL API's own (punycode-converted) form
  hostnameUnicode: string; // the visitor's original substring, kept as-typed
  port: string;
  pathname: string;
  search: string; // including leading "?" when non-empty
  hash: string; // including leading "#" when non-empty
  origin: string;
  host: string; // hostname[:port]
}

export interface UrlQueryParam {
  key: string;
  value: string;
}

export interface UrlWarning {
  severity: "danger" | "warning";
  message: string;
}

const DANGEROUS_SCHEMES = new Set(["javascript", "vbscript"]);
const SENSITIVE_PARAM_NAME_PATTERN = /token|secret|password|passwd|apikey|api_key|session|auth|access_token|refresh_token/i;
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

function extractRawHostname(text: string, parsedHostnameAscii: string): string {
  // Best-effort: find the "//host" region in the original text and pull out whatever the visitor
  // actually typed there, so a Unicode hostname isn't lost even though `url.hostname` is punycode.
  const match = /^[a-z][a-z0-9+\-.]*:\/\/(?:[^/?#@]*@)?([^/?#:]*)/i.exec(text);
  return match ? match[1] : parsedHostnameAscii;
}

function toComponents(url: URL, originalText: string): UrlComponents {
  return {
    href: url.href,
    scheme: url.protocol.replace(/:$/, ""),
    username: url.username,
    password: url.password,
    hostnameAscii: url.hostname,
    hostnameUnicode: extractRawHostname(originalText, url.hostname),
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    origin: (() => {
      try {
        return url.origin;
      } catch {
        return "";
      }
    })(),
    host: url.host,
  };
}

export interface ParseUrlResult {
  ok: boolean;
  error?: string;
  components?: UrlComponents;
  queryParams?: UrlQueryParam[];
  duplicateParamKeys?: string[];
  warnings?: UrlWarning[];
}

function analyzeWarnings(url: URL, components: UrlComponents, queryParams: UrlQueryParam[], duplicateParamKeys: string[]): UrlWarning[] {
  const warnings: UrlWarning[] = [];
  const scheme = components.scheme.toLowerCase();

  if (DANGEROUS_SCHEMES.has(scheme)) {
    warnings.push({ severity: "danger", message: `El esquema "${scheme}:" puede ejecutar código en el contexto de la página si se usa como enlace. Esta herramienta lo analiza como texto, pero nunca genera un enlace pulsable para él.` });
  } else if (scheme === "data") {
    warnings.push({ severity: "warning", message: 'El esquema "data:" incrusta contenido directamente en la URL; en un contexto de navegación puede usarse para servir HTML/scripts sin pasar por la red.' });
  } else if (!["http", "https", "ftp", "mailto", "tel", "file", "ws", "wss"].includes(scheme)) {
    warnings.push({ severity: "warning", message: `"${scheme}:" no es un esquema común; revisa que sea el que esperabas.` });
  }

  if (components.username || components.password) {
    warnings.push({ severity: "warning", message: "La URL contiene credenciales (usuario/contraseña) incrustadas en la propia URL — un formato obsoleto y desaconsejado que puede quedar expuesto en logs/historial." });
  }
  if (CONTROL_CHAR_PATTERN.test(components.href)) {
    warnings.push({ severity: "danger", message: "La URL contiene caracteres de control no imprimibles." });
  }
  if (components.hostnameAscii === "" && !["mailto", "tel", "data", "javascript"].includes(scheme)) {
    warnings.push({ severity: "warning", message: "El hostname está vacío." });
  }
  if (components.port !== "" && (Number(components.port) < 0 || Number(components.port) > 65535)) {
    warnings.push({ severity: "danger", message: "El puerto está fuera del rango válido (0-65535)." });
  }
  if (components.hostnameUnicode !== components.hostnameAscii && components.hostnameAscii.startsWith("xn--")) {
    warnings.push({ severity: "warning", message: `El hostname contiene caracteres internacionalizados; su forma ASCII/punycode es "${components.hostnameAscii}". Verifica que coincide con el dominio que esperas — algunos caracteres Unicode se parecen visualmente entre sí ("confusables").` });
  }
  if (components.hash.length > 2000) {
    warnings.push({ severity: "warning", message: "El fragmento (#...) es inusualmente largo." });
  }
  if (duplicateParamKeys.length > 0) {
    warnings.push({ severity: "warning", message: `Parámetros duplicados: ${duplicateParamKeys.join(", ")}. Cuál "gana" depende del servidor que la reciba; esta URL no lo decide.` });
  }
  const sensitiveKeys = queryParams.filter((p) => SENSITIVE_PARAM_NAME_PATTERN.test(p.key)).map((p) => p.key);
  if (sensitiveKeys.length > 0) {
    warnings.push({ severity: "warning", message: `Parámetros con nombre sensible en texto plano: ${Array.from(new Set(sensitiveKeys)).join(", ")}. Si son credenciales reales, ten en cuenta que suelen quedar registradas en logs de servidor/proxy.` });
  }

  return warnings;
}

function extractQueryParams(search: string): { params: UrlQueryParam[]; duplicateKeys: string[] } {
  const usp = new URLSearchParams(search);
  const params: UrlQueryParam[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const [key, value] of usp.entries()) {
    params.push({ key, value });
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return { params, duplicateKeys: Array.from(duplicates) };
}

function parseCommon(url: URL, originalText: string): ParseUrlResult {
  const components = toComponents(url, originalText);
  const { params, duplicateKeys } = extractQueryParams(url.search);
  if (params.length > LIMITS.maxUrlParams) {
    return { ok: false, error: `La URL supera el límite de ${LIMITS.maxUrlParams} parámetros.` };
  }
  const warnings = analyzeWarnings(url, components, params, duplicateKeys);
  return { ok: true, components, queryParams: params, duplicateParamKeys: duplicateKeys, warnings };
}

export function parseAbsoluteUrl(text: string): ParseUrlResult {
  if (text.length > LIMITS.maxUrlLength) return { ok: false, error: `La URL supera el límite de ${LIMITS.maxUrlLength.toLocaleString("es-ES")} caracteres.` };
  try {
    const url = new URL(text);
    return parseCommon(url, text);
  } catch {
    return { ok: false, error: "No es una URL absoluta válida (falta el esquema, por ejemplo \"https://\", o el formato es inválido)." };
  }
}

export function parseRelativeUrl(text: string, base: string): ParseUrlResult {
  if (text.length > LIMITS.maxUrlLength) return { ok: false, error: `La URL supera el límite de ${LIMITS.maxUrlLength.toLocaleString("es-ES")} caracteres.` };
  try {
    const baseUrl = new URL(base);
    const url = new URL(text, baseUrl);
    return parseCommon(url, text);
  } catch {
    return { ok: false, error: "No se pudo resolver la URL relativa contra la URL base indicada." };
  }
}

export interface BuildUrlInput {
  scheme: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
}

export interface BuildUrlResult {
  ok: boolean;
  error?: string;
  href?: string;
}

export function buildUrlFromComponents(input: BuildUrlInput): BuildUrlResult {
  try {
    const url = new URL(`${input.scheme}://placeholder-host-for-build/`);
    if (input.hostname) url.hostname = input.hostname;
    else return { ok: false, error: "El hostname no puede estar vacío para reconstruir la URL." };
    if (input.username) url.username = input.username;
    if (input.password) url.password = input.password;
    if (input.port) url.port = input.port;
    url.pathname = input.pathname || "/";
    url.search = input.search;
    url.hash = input.hash;
    return { ok: true, href: url.href };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo reconstruir la URL con estos componentes." };
  }
}

export type QueryParamOperation = { kind: "add"; key: string; value: string } | { kind: "remove"; index: number } | { kind: "rename"; index: number; newKey: string } | { kind: "update"; index: number; value: string };

export function applyQueryParamOperation(params: UrlQueryParam[], op: QueryParamOperation): UrlQueryParam[] {
  const next = [...params];
  if (op.kind === "add") return [...next, { key: op.key, value: op.value }];
  if (op.kind === "remove") return next.filter((_, i) => i !== op.index);
  if (op.kind === "rename") return next.map((p, i) => (i === op.index ? { ...p, key: op.newKey } : p));
  return next.map((p, i) => (i === op.index ? { ...p, value: op.value } : p));
}

export function paramsToSearchString(params: UrlQueryParam[], sortKeys: boolean): string {
  const ordered = sortKeys ? [...params].sort((a, b) => a.key.localeCompare(b.key)) : params;
  const usp = new URLSearchParams();
  for (const p of ordered) usp.append(p.key, p.value);
  const str = usp.toString();
  return str.length > 0 ? `?${str}` : "";
}

export interface NormalizationOptions {
  lowercaseHost: boolean;
  removeDefaultPort: boolean;
  removeTrailingSlash: boolean;
  removeFragment: boolean;
  sortQueryParams: boolean;
}

const DEFAULT_PORTS: Record<string, string> = { "http:": "80", "https:": "443", "ftp:": "21", "ws:": "80", "wss:": "443" };

/** Every normalization is explicitly opted into per-flag — never applied automatically (spec: "la normalización debe ser opcional"). Two URLs that normalize identically are NOT claimed to be semantically equivalent (query param order/case can matter server-side). */
export function normalizeUrl(href: string, options: NormalizationOptions): { ok: boolean; error?: string; href?: string } {
  try {
    const url = new URL(href);
    if (options.lowercaseHost) url.hostname = url.hostname.toLowerCase();
    if (options.removeDefaultPort && DEFAULT_PORTS[url.protocol] === url.port) url.port = "";
    if (options.removeFragment) url.hash = "";
    if (options.sortQueryParams) {
      const { params } = extractQueryParams(url.search);
      url.search = paramsToSearchString(params, true);
    }
    let href2 = url.href;
    if (options.removeTrailingSlash && url.pathname !== "/" && href2.endsWith("/") && url.search === "" && url.hash === "") {
      href2 = href2.slice(0, -1);
    }
    return { ok: true, href: href2 };
  } catch {
    return { ok: false, error: "No se pudo normalizar: la URL no es válida." };
  }
}

/**
 * HTTP security-header analyzer (spec section 23). Operates only on
 * headers the visitor pastes or loads from a local .txt file — this
 * module never makes an HTTP request itself. Header names are matched
 * case-insensitively (per RFC 7230) and duplicates are preserved (never
 * silently collapsed) so the analyzer can flag genuinely conflicting
 * repeated headers.
 */
import { DOCUMENT_LIMITS } from "../documents/limits";

const LIMITS = DOCUMENT_LIMITS.securityHeaders;

export interface ParsedHeaderLine {
  name: string;
  value: string;
  raw: string;
}

export interface ParseHeadersResult {
  ok: boolean;
  error?: string;
  headers?: ParsedHeaderLine[];
  byNameLower?: Map<string, ParsedHeaderLine[]>;
}

export function parseRawHeaders(text: string): ParseHeadersResult {
  if (text.length > LIMITS.maxHeaderLines * LIMITS.maxHeaderValueLength) {
    return { ok: false, error: "El texto de cabeceras es demasiado grande." };
  }
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length > LIMITS.maxHeaderLines) {
    return { ok: false, error: `El texto supera el límite de ${LIMITS.maxHeaderLines} líneas.` };
  }

  const headers: ParsedHeaderLine[] = [];
  const byNameLower = new Map<string, ParsedHeaderLine[]>();
  for (const rawLine of lines) {
    if (rawLine.startsWith(":")) continue; // HTTP/2 pseudo-header status lines like ":status: 200"
    const colonIndex = rawLine.indexOf(":");
    if (colonIndex <= 0) continue; // not a "Name: value" line (e.g. a raw "HTTP/1.1 200 OK" status line) — skipped, not an error
    const name = rawLine.slice(0, colonIndex).trim();
    const value = rawLine.slice(colonIndex + 1).trim();
    if (value.length > LIMITS.maxHeaderValueLength) {
      return { ok: false, error: `El valor de la cabecera "${name}" supera el límite de ${LIMITS.maxHeaderValueLength.toLocaleString("es-ES")} caracteres.` };
    }
    const entry: ParsedHeaderLine = { name, value, raw: rawLine };
    headers.push(entry);
    const nameLower = name.toLowerCase();
    if (!byNameLower.has(nameLower)) byNameLower.set(nameLower, []);
    byNameLower.get(nameLower)!.push(entry);
  }

  return { ok: true, headers, byNameLower };
}

export type HeaderPresence = "present" | "absent";
export type HeaderImpact = "info" | "recommended" | "important";

export interface HeaderAnalysisRow {
  name: string;
  presence: HeaderPresence;
  values: string[];
  duplicated: boolean;
  purpose: string;
  advice: string | null;
  impact: HeaderImpact;
}

const SECURITY_HEADER_INFO: { name: string; purpose: string; impact: HeaderImpact }[] = [
  { name: "content-security-policy", purpose: "Restringe de qué orígenes puede cargar recursos/scripts la página.", impact: "important" },
  { name: "content-security-policy-report-only", purpose: "Igual que CSP pero solo reporta, nunca bloquea; útil para probar una política antes de aplicarla.", impact: "info" },
  { name: "strict-transport-security", purpose: "Indica al navegador que use siempre HTTPS con este dominio durante un tiempo determinado.", impact: "important" },
  { name: "x-content-type-options", purpose: "Con el valor \"nosniff\", evita que el navegador reinterprete el tipo de contenido declarado.", impact: "recommended" },
  { name: "referrer-policy", purpose: "Controla cuánta información de la URL de origen se envía en la cabecera Referer.", impact: "recommended" },
  { name: "permissions-policy", purpose: "Restringe qué APIs del navegador (cámara, geolocalización, etc.) puede usar la página.", impact: "recommended" },
  { name: "cross-origin-opener-policy", purpose: "Aísla el contexto de navegación de origen cruzado (protege contra ciertos ataques de canal lateral).", impact: "recommended" },
  { name: "cross-origin-embedder-policy", purpose: "Exige que los recursos incrustados declaren explícitamente que permiten ser embebidos de origen cruzado.", impact: "recommended" },
  { name: "cross-origin-resource-policy", purpose: "Controla qué orígenes pueden incrustar este recurso.", impact: "recommended" },
  { name: "x-frame-options", purpose: "Controla si la página puede incrustarse en un <iframe> (predecesor de frame-ancestors en CSP).", impact: "recommended" },
  { name: "clear-site-data", purpose: "Indica al navegador que borre cookies/almacenamiento/caché para este origen (típicamente en logout).", impact: "info" },
  { name: "x-permitted-cross-domain-policies", purpose: "Controla políticas de Flash/PDF heredadas de origen cruzado (mayormente legado).", impact: "info" },
  { name: "cache-control", purpose: "En páginas con datos sensibles, evita que se guarden en cachés compartidas (ej. \"no-store\").", impact: "info" },
];

export function analyzeHeaders(parsed: ParseHeadersResult): HeaderAnalysisRow[] {
  if (!parsed.ok || !parsed.byNameLower) return [];
  const rows: HeaderAnalysisRow[] = [];

  for (const info of SECURITY_HEADER_INFO) {
    const found = parsed.byNameLower.get(info.name);
    if (!found) {
      rows.push({ name: info.name, presence: "absent", values: [], duplicated: false, purpose: info.purpose, advice: info.impact !== "info" ? "Ausente. Puede añadirse según el perfil de tu sitio (ver el modo de generación)." : null, impact: info.impact });
      continue;
    }
    const values = found.map((f) => f.value);
    let advice: string | null = null;
    if (found.length > 1) advice = "Aparece repetida. Los navegadores suelen combinar u priorizar de forma inconsistente entre implementaciones; evita duplicarla.";
    if (info.name === "x-content-type-options" && !values.some((v) => v.toLowerCase() === "nosniff")) advice = "Presente pero sin el valor \"nosniff\", que es el único valor efectivo de esta cabecera.";
    if (info.name === "strict-transport-security" && !values.some((v) => /max-age=\d+/i.test(v))) advice = "Presente pero sin \"max-age\", por lo que no tiene efecto.";
    rows.push({ name: info.name, presence: "present", values, duplicated: found.length > 1, purpose: info.purpose, advice, impact: info.impact });
  }

  // Conflicting values between CSP frame-ancestors and X-Frame-Options — both control framing, but CSP wins in modern browsers.
  const csp = parsed.byNameLower.get("content-security-policy")?.[0]?.value ?? "";
  const xfo = parsed.byNameLower.get("x-frame-options")?.[0]?.value;
  if (xfo && /frame-ancestors/i.test(csp)) {
    rows.push({ name: "conflicto: frame-ancestors vs X-Frame-Options", presence: "present", values: [xfo], duplicated: false, purpose: "Ambas controlan si la página puede incrustarse en un iframe.", advice: "Cuando ambas están presentes, los navegadores modernos priorizan \"frame-ancestors\" de CSP e ignoran X-Frame-Options; mantenla solo por compatibilidad con navegadores muy antiguos.", impact: "info" });
  }

  return rows;
}

/**
 * Hostname normalization + validation for the public-site binding (Fase 40's
 * third correction, spec sections 1-2). Pure, no I/O. The ONLY value ever
 * used for resolution/lookup is the output of `normalizeAndValidateHostname`
 * - never the raw, as-entered string, and never anything derived from a
 * visitor-controlled header without going through this same function.
 *
 * Deliberately rejects protocol/path/query/fragment - a "hostname" field
 * must be exactly that, nothing else, so there is no ambiguity about what a
 * stored `normalizedHostname` actually matches against.
 */

export interface HostnameValidationResult {
  ok: boolean;
  error?: string;
  normalizedHostname?: string;
}

const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

function isIpShaped(value: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(":");
}

/**
 * `allowLocalhost` must ONLY ever be true in a real local-development
 * context (spec section 2: "adapta localhost unicamente para desarrollo
 * mediante una regla explicita y segura") - callers gate this on
 * `process.env.NODE_ENV !== "production"`, never on user input.
 */
export function normalizeAndValidateHostname(rawHostname: string, options: { allowLocalhost?: boolean } = {}): HostnameValidationResult {
  const trimmed = rawHostname.trim();
  if (!trimmed) return { ok: false, error: "El dominio no puede estar vacio." };
  if (trimmed.length > 253) return { ok: false, error: "El dominio es demasiado largo." };
  if (/\s/.test(trimmed)) return { ok: false, error: "El dominio no puede contener espacios." };
  if (/[/?#@]/.test(trimmed)) return { ok: false, error: "Escribe solo el dominio, sin protocolo, ruta ni parametros (ejemplo: example.com)." };

  // Strip a trailing port (":3000") FIRST — only a real numeric 1-5 digit port,
  // never treated as IPv6 (which this function doesn't support as a "custom
  // domain" hostname at all). Must run before the protocol check below: a
  // scheme like "https:" is indistinguishable from "hostname:" under a
  // character-class regex, but a genuine scheme never ends in bare digits
  // ("https://example.com" has no digit-only suffix after its last colon),
  // so stripping the port first and only then checking for a leftover
  // scheme-shaped colon correctly separates "example.com:8443" (valid, port
  // stripped) from "https://example.com" (invalid, still has "://" left).
  let withoutPort = trimmed;
  const portMatch = /^(.+):(\d{1,5})$/.exec(trimmed);
  if (portMatch) withoutPort = portMatch[1];

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(withoutPort) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(withoutPort)) {
    return { ok: false, error: "No incluyas el protocolo (http:// o https://)." };
  }

  const lower = withoutPort.toLowerCase();
  const withoutTrailingDot = lower.endsWith(".") ? lower.slice(0, -1) : lower;

  if (withoutTrailingDot === "localhost" || withoutTrailingDot.endsWith(".localhost")) {
    if (!options.allowLocalhost) return { ok: false, error: "localhost solo se permite en entornos de desarrollo." };
    return { ok: true, normalizedHostname: withoutTrailingDot };
  }

  if (isIpShaped(withoutTrailingDot)) {
    return { ok: false, error: "No se permite una direccion IP como dominio." };
  }
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(withoutTrailingDot))) {
    return { ok: false, error: "No se permite una direccion IP privada como dominio." };
  }
  if (!HOSTNAME_PATTERN.test(withoutTrailingDot)) {
    return { ok: false, error: "Formato de dominio no valido (ejemplo: example.com o soporte.example.com)." };
  }

  return { ok: true, normalizedHostname: withoutTrailingDot };
}

/**
 * Picks the real request hostname from trusted, server-side headers only
 * (Fase 40's third correction, spec section 5) - never a query parameter,
 * never a body field. `x-forwarded-host` is preferred when present because
 * this app's deployment target (Vercel-style edge/proxy in front of the
 * Next.js server) sets it accurately on every proxied request; the plain
 * `host` header is the correct fallback for a direct connection (e.g. local
 * `next dev`, or a deployment with no proxy in front). Both already strip
 * any port via `normalizeAndValidateHostname` below - callers should NOT
 * pre-parse this value.
 */
export function pickTrustedHostHeader(forwardedHost: string | null, host: string | null): string | null {
  // A chain of proxies may append entries ("outer, inner") - the first is the one the visitor's browser actually addressed.
  const chosen = (forwardedHost || host || "").split(",")[0]?.trim();
  return chosen || null;
}

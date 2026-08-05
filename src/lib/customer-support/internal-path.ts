/**
 * Validates a "sync this internal page" request (spec section 12, relaxed
 * in the Fase 40 correction's section 6 to let a MANAGER register any real
 * public path of this app, not just a fixed 5-item list) BEFORE any network
 * call is ever made. This is deliberately NOT the general-purpose
 * external-URL SSRF guard (src/lib/security/ssrf-guard.ts) - that guard
 * exists to validate a HOST an attacker could control (resolves DNS, checks
 * for private/loopback IPs, ...). Here the input can NEVER contain a host at
 * all: it must be a bare, same-origin relative path. That is a stronger
 * guarantee than any DNS-based check - there is no host to spoof, no
 * protocol to smuggle, because the syntax simply doesn't allow one. The
 * resolved base origin is always this server's own trusted, pre-configured
 * address - never derived from the request. Redirect-chain safety (max hops,
 * same-origin destination) and "does this actually require auth" are
 * verified separately, at fetch time, in customer-support-knowledge.ts
 * (this module only ever does syntax - no I/O).
 */

/** A short list of well-known public pages, offered as one-click suggestions in the UI - NOT an allowlist anymore (see validateSyncablePath below, which now accepts any syntactically-safe, non-reserved relative path so a MANAGER can register real pages this list doesn't anticipate). */
export const CUSTOMER_SUPPORT_SUGGESTED_PATHS: readonly string[] = [
  "/",
  "/legal/privacy",
  "/legal/terms",
  "/legal/cookies",
  "/legal/ai-disclaimer",
  "/herramientas",
];

/** @deprecated kept as an alias for CUSTOMER_SUPPORT_SUGGESTED_PATHS - the name "syncable" no longer fits now that sync accepts any safe path, not just this list. */
export const CUSTOMER_SUPPORT_SYNCABLE_PATHS = CUSTOMER_SUPPORT_SUGGESTED_PATHS;

/** Reserved app-internal prefixes - never syncable regardless of configuration (spec: "impedir Admin; impedir dashboard; impedir callbacks"). */
export const CUSTOMER_SUPPORT_BLOCKED_PATH_PREFIXES = ["/admin", "/dashboard", "/api", "/login", "/register", "/guest", "/verify-email"];

export interface PathValidationResult {
  ok: boolean;
  error?: string;
  normalizedPath?: string;
}

function isSensitivePath(path: string): boolean {
  return /\/(callbacks?|oauth|webhooks?|errors?)(\/|$)/i.test(path);
}

/**
 * Syntactic validation only, no I/O - a relative path starting with exactly
 * one "/", no scheme, no host, no "..", no whitespace, safe charset, and not
 * matching a reserved/sensitive prefix. Never checks against a fixed
 * allowlist anymore - any other real, safe-looking path is syntactically
 * accepted here; syncInternalPath still verifies at fetch time that the page
 * genuinely exists, is public, and resolves same-origin.
 */
export function validateSyncablePath(rawPath: string): PathValidationResult {
  const trimmed = rawPath.trim();
  if (!trimmed) return { ok: false, error: "La ruta no puede estar vacia." };
  if (trimmed.length > 200) return { ok: false, error: "La ruta es demasiado larga." };
  if (!trimmed.startsWith("/")) return { ok: false, error: "Solo se permiten rutas internas que comiencen con \"/\"." };
  if (trimmed.startsWith("//")) return { ok: false, error: "Ruta no valida (protocolo-relativa no permitida)." };
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return { ok: false, error: "Ruta no valida (no se permite especificar protocolo)." };
  if (trimmed.includes("..")) return { ok: false, error: "Ruta no valida." };
  if (/\s/.test(trimmed)) return { ok: false, error: "Ruta no valida (no se permiten espacios)." };
  if (!/^[/a-zA-Z0-9\-._~/]*$/.test(trimmed)) return { ok: false, error: "Ruta no valida (caracteres no permitidos)." };

  const normalizedPath = trimmed.length > 1 && trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;

  if (CUSTOMER_SUPPORT_BLOCKED_PATH_PREFIXES.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`))) {
    return { ok: false, error: "Esta ruta esta reservada y no puede sincronizarse." };
  }
  if (isSensitivePath(normalizedPath)) {
    return { ok: false, error: "Esta ruta parece un callback/webhook/error interno y no puede sincronizarse." };
  }

  return { ok: true, normalizedPath };
}

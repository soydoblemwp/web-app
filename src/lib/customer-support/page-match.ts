/**
 * Deterministic "should the widget show on this page / is this origin
 * allowed" checks (Fase 40 spec sections 5-6). Pure, no I/O.
 */

const ALWAYS_EXCLUDED_PREFIXES = ["/admin", "/api", "/login", "/register", "/verify-email"];

/** OAuth callback / webhook-shaped paths are excluded regardless of configuration - never a place to render a floating widget. */
function isSensitivePath(path: string): boolean {
  return /\/(callback|oauth|webhook|error)(\/|$)/i.test(path);
}

export function isPathAllowedForWidget(path: string, includedPaths: string[], excludedPaths: string[]): boolean {
  const normalized = path.split("?")[0] || "/";
  if (ALWAYS_EXCLUDED_PREFIXES.some((p) => normalized === p || normalized.startsWith(`${p}/`))) return false;
  if (isSensitivePath(normalized)) return false;
  if (excludedPaths.some((p) => normalized === p || normalized.startsWith(p))) return false;
  if (includedPaths.length === 0) return true;
  return includedPaths.some((p) => normalized === p || normalized.startsWith(p));
}

/** `allowedDomains` empty = same-origin only (no cross-origin embed configured). Compares hostnames, never a substring match. */
export function isOriginAllowed(originHeader: string | null, allowedDomains: string[], appHost: string): boolean {
  if (!originHeader) return true; // same-origin requests (the normal in-app widget case) often omit Origin.
  let hostname: string;
  try {
    hostname = new URL(originHeader).hostname;
  } catch {
    return false;
  }
  if (hostname === appHost) return true;
  if (allowedDomains.length === 0) return false;
  return allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

/**
 * The ONLY accepted shape for a visitor-reported "page" (Fase 40's third
 * correction, spec section 8) — a bare relative path, never a full URL,
 * never containing a scheme/host. Returns `null` (reject the whole request)
 * for anything else, so a full URL can never be used to dodge the
 * included/excluded-path check below by simply not looking like a path.
 */
export function normalizeVisitorPage(rawPage: string): string | null {
  const trimmed = rawPage.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  if (trimmed.includes("..")) return null;
  if (/\s/.test(trimmed)) return null;
  const withoutQuery = trimmed.split("?")[0].split("#")[0];
  return withoutQuery || "/";
}

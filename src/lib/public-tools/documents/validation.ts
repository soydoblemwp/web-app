/** Shared, minimal validators reused across every Fase 47 document tool — never re-implemented per component. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Only http/https are ever accepted — matches the same allow-list the Markdown renderer's `sanitizeUrl` already applies elsewhere in this codebase. */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** A URL-ish field is often typed without a protocol ("example.com") — treat that as valid too, since callers normalize before rendering. */
export function isValidUrlOrBareDomain(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isValidHttpUrl(trimmed)) return true;
  return isValidHttpUrl(`https://${trimmed}`);
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/** Detects unfilled template placeholders like "[Nombre de la empresa]" left in exported text (spec section 17). */
const PLACEHOLDER_PATTERN = /\[[^\]\n]{2,80}\]/g;

export function findPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[0]);
}

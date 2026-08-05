/**
 * Best-effort secret/PII redaction for visitor chat messages (spec section
 * 18) - a detected pattern is replaced BEFORE the text ever reaches the
 * local AI engine, storage, or AuditLog. Extends (never duplicates from
 * scratch) the pattern list already proven in
 * src/lib/knowledge/secrets-scan.ts, plus chat-specific patterns (declared
 * passwords, credit card numbers, cookie headers) that a document scanner
 * has no reason to check for.
 */

export type SecretCategory = "API_KEY" | "TOKEN" | "PASSWORD" | "CARD" | "COOKIE" | "PRIVATE_KEY" | "CONNECTION_STRING";

interface SecretPattern {
  category: SecretCategory;
  pattern: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { category: "API_KEY", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { category: "API_KEY", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { category: "TOKEN", pattern: /\bghp_[A-Za-z0-9]{30,}\b/g },
  { category: "TOKEN", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { category: "PRIVATE_KEY", pattern: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH |)PRIVATE KEY-----/g },
  { category: "CONNECTION_STRING", pattern: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi },
  { category: "API_KEY", pattern: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9\-_./+]{8,}['"]?/gi },
  { category: "TOKEN", pattern: /\bBearer\s+[A-Za-z0-9\-_.]{20,}\b/g },
  // Declared passwords - "mi contrasena es X" / "password: X" / "pwd=X".
  { category: "PASSWORD", pattern: /\b(contrase[nñ]a|password|pwd|clave)\s*(es|is)?\s*[:=]?\s*['"]?[^\s'",;]{4,}['"]?/gi },
  // Credit-card-shaped digit sequences (13-19 digits, optionally grouped) - intentionally broad (no Luhn check) since over-redaction of a chat message is a safe failure mode.
  { category: "CARD", pattern: /\b(?:\d[ -]?){13,19}\b/g },
  { category: "COOKIE", pattern: /\b(cookie|set-cookie)\s*[:=]\s*[^\s;]{6,}/gi },
];

const REDACTED_MARKER = "[REDACTADO]";

export interface RedactionResult {
  sanitized: string;
  redacted: boolean;
  categories: SecretCategory[];
}

/** Detects and replaces every match with a fixed marker - never partially masks (e.g. last 4 digits), since this text may still reach a human reviewer's screen but must never reach the AI engine or logs unredacted. */
export function redactSecrets(text: string): RedactionResult {
  let sanitized = text;
  const categories = new Set<SecretCategory>();

  for (const { category, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(sanitized)) {
      categories.add(category);
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, REDACTED_MARKER);
    }
  }

  return { sanitized, redacted: categories.size > 0, categories: Array.from(categories) };
}

export function containsPossibleSecret(text: string): boolean {
  return SECRET_PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

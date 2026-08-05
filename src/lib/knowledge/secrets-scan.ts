/**
 * Detects sensitive-looking patterns in extracted text (spec section 33) —
 * API keys, tokens, passwords, private keys, connection strings. This is a
 * best-effort heuristic scan, never a guarantee: it only sets
 * KnowledgeSource.sensitiveWarning so the UI can show a warning and let the
 * user exclude the source — it NEVER auto-redacts or auto-deletes content.
 */

const SENSITIVE_PATTERNS: RegExp[] = [
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bsk-[A-Za-z0-9]{20,}\b/, // generic "sk-" prefixed secret key pattern used by several AI providers
  /\bghp_[A-Za-z0-9]{30,}\b/, // GitHub personal access token
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, // Slack token
  /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/, // private key block
  /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+:[^\s"']+@[^\s"']+/i, // DB connection string with credentials
  /\b(api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['"]?[A-Za-z0-9\-_./+]{8,}['"]?/i,
  /\bBearer\s+[A-Za-z0-9\-_.]{20,}\b/,
];

export function scanForSensitivePatterns(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

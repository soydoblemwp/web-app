import { randomBytes, createHash } from "node:crypto";

/**
 * Pure, framework-free email-verification token logic — generation,
 * hashing, expiry, and resend-cooldown timing. No database access, no
 * Next.js/Auth.js imports, so this is trivially unit-testable and safe to
 * import from anywhere (deliberately has no "server-only" guard, mirroring
 * src/lib/permissions/roles.ts's own reasoning). The DB-touching operations
 * that use these (create/verify/resend) live in
 * src/server/services/email-verification.ts.
 */

/** 256 bits of entropy — encoded as base64url, so it's directly URL-safe with no extra escaping needed in the verification link. */
const TOKEN_BYTES = 32;

export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 60s

/** A fresh, cryptographically random raw token — the only time the raw value exists is here and in the one email that gets sent; never persisted. */
export function generateVerificationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256 of the raw token — the only representation ever written to the database (EmailVerificationToken.tokenHash). Deterministic, so a lookup is a direct unique-index match, never a loop over stored values. */
export function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function verificationTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS);
}

export function isVerificationTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** True once EMAIL_VERIFICATION_RESEND_COOLDOWN_MS has passed since the last token was issued (or no token was ever issued). */
export function canResendVerificationEmail(lastIssuedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastIssuedAt) return true;
  return now.getTime() - lastIssuedAt.getTime() >= EMAIL_VERIFICATION_RESEND_COOLDOWN_MS;
}

/** Whole seconds remaining before a resend is allowed again — 0 once the cooldown has passed. Used only for UI copy ("espera N segundos"), never to decide whether to actually resend (canResendVerificationEmail is the source of truth for that). */
export function secondsUntilResendAllowed(lastIssuedAt: Date, now: Date = new Date()): number {
  const remainingMs = EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - (now.getTime() - lastIssuedAt.getTime());
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

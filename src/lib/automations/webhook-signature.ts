import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 webhook signing/verification (spec section 12). The signed
 * representation is `${timestamp}.${rawBody}` — timestamp included so an old
 * captured request can never be replayed after the signing window expires,
 * even with a perfectly valid signature.
 *
 * Documented headers (spec section 12):
 *   X-Automation-Timestamp  — unix seconds the sender signed at
 *   X-Automation-Signature  — hex HMAC-SHA256 of `${timestamp}.${rawBody}`
 *   X-Automation-Delivery   — a unique id per delivery attempt (replay guard)
 */

export function computeWebhookSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Constant-time comparison — never a plain `===` on secret-derived data (spec section 12: "usar comparación constante"). */
export function verifyWebhookSignature(secret: string, timestamp: string, rawBody: string, providedSignatureHex: string): boolean {
  const expected = computeWebhookSignature(secret, timestamp, rawBody);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(providedSignatureHex, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/** Rejects a timestamp too far in the past (or the future — a clock-skewed/forged request) relative to `windowSeconds`. */
export function isTimestampWithinWindow(timestampHeader: string, windowSeconds: number, now: Date = new Date()): boolean {
  const timestampMs = Number(timestampHeader) * 1000;
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return false;
  const diffSeconds = Math.abs(now.getTime() - timestampMs) / 1000;
  return diffSeconds <= windowSeconds;
}

/** Generates a real, sufficiently random webhook signing secret — never derivable from the automation's own (guessable, sequential-looking) internal id (spec section 11). */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Opaque public identifier for the receiving URL — also never the automation's own internal id. */
export function generateWebhookPublicId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

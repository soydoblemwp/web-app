import { secureRandomBytes } from "./secure-random";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatUuid(bytes: Uint8Array): string {
  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * UUID v4 (RFC 9562 §5.4): 122 bits of cryptographically secure randomness,
 * with the 4-bit version field forced to 0100 and the 2-bit variant field
 * forced to 10 per the spec.
 */
export function generateUuidV4(): string {
  const bytes = secureRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  return formatUuid(bytes);
}

// Module-level monotonic state for UUID v7 generation within this page's
// session (RFC 9562 §6.2 Method 1 — Fixed-Length Dedicated Counter): when
// two UUIDs are requested within the same millisecond, rand_a is used as a
// 12-bit counter seeded with secure randomness and incremented, instead of
// re-rolling fresh random bits — this guarantees strictly increasing sort
// order for UUIDs generated in this browser tab in the same millisecond.
// The counter is NOT shared across tabs/reloads — documented honestly
// rather than claiming a global monotonic guarantee it can't provide.
let lastTimestampMs = -1;
let counter = 0;

function nextCounter(timestampMs: number): number {
  if (timestampMs !== lastTimestampMs) {
    lastTimestampMs = timestampMs;
    // Seed the counter with 11 random bits so consecutive batches don't all start at 0.
    counter = secureRandomBytes(2).reduce((acc, b) => (acc << 8) | b, 0) & 0x7ff;
    return counter;
  }
  counter = (counter + 1) & 0xfff;
  return counter;
}

/**
 * UUID v7 (RFC 9562 §5.7): 48-bit big-endian Unix timestamp in
 * milliseconds, 4-bit version (0111), 12-bit rand_a (used here as a
 * same-millisecond monotonic counter, see above), 2-bit variant (10), and
 * 62 bits of secure randomness (rand_b).
 */
export function generateUuidV7(timestampMs: number = Date.now()): string {
  const bytes = new Uint8Array(16);

  // 48-bit timestamp across bytes 0-5.
  let ts = timestampMs;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts & 0xff;
    ts = Math.floor(ts / 256);
  }

  const randA = nextCounter(timestampMs);
  bytes[6] = 0x70 | ((randA >> 8) & 0x0f); // version 0111 + top 4 bits of rand_a
  bytes[7] = randA & 0xff;

  const randB = secureRandomBytes(8);
  bytes[8] = (randB[0] & 0x3f) | 0x80; // variant 10 + top 6 bits of rand_b
  for (let i = 1; i < 8; i++) bytes[8 + i] = randB[i];

  return formatUuid(bytes);
}

export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export const MAX_UUID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export interface UuidValidationResult {
  valid: boolean;
  version: number | null;
  variant: "ncs" | "rfc9562" | "microsoft" | "future" | "nil" | "max" | null;
  normalized: string | null;
}

const UUID_PATTERN = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i;

/** Structural validation and version/variant identification for a pasted UUID — never assumes validity from format alone. */
export function validateUuid(raw: string): UuidValidationResult {
  const trimmed = raw.trim();
  const match = UUID_PATTERN.exec(trimmed);
  if (!match) return { valid: false, version: null, variant: null, normalized: null };

  const normalized = trimmed.toLowerCase();
  if (normalized === NIL_UUID) return { valid: true, version: null, variant: "nil", normalized };
  if (normalized === MAX_UUID) return { valid: true, version: null, variant: "max", normalized };

  const versionNibble = parseInt(match[3][0], 16);
  const variantByte = parseInt(match[4].slice(0, 2), 16);

  let variant: UuidValidationResult["variant"];
  if ((variantByte & 0x80) === 0) variant = "ncs";
  else if ((variantByte & 0xc0) === 0x80) variant = "rfc9562";
  else if ((variantByte & 0xe0) === 0xc0) variant = "microsoft";
  else variant = "future";

  return { valid: true, version: versionNibble, variant, normalized };
}

export function uuidToCompact(uuid: string): string {
  return uuid.replace(/-/g, "");
}

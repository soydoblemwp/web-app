/**
 * HMAC generator/verifier core (spec section 21), exclusively via
 * `crypto.subtle` (`sign/HMAC` to generate, `verify/HMAC` to check) — never
 * a hand-rolled HMAC construction, and never a plain hash (SHA-256 alone)
 * presented as if it were HMAC. Verification reuses the exact
 * constant-time-ish comparator already used by `utilities/crypto-digest.ts`
 * (`hashesMatch`) rather than a fresh `===` comparison.
 */
import { DOCUMENT_LIMITS } from "../documents/limits";
import { hashesMatch } from "../utilities/crypto-digest";
import { decodeHmacSecret, type HmacSecretEncoding } from "./key-import";

const LIMITS = DOCUMENT_LIMITS.hmac;

export type HmacAlgorithm = "SHA-256" | "SHA-384" | "SHA-512";
export const HMAC_ALGORITHMS: HmacAlgorithm[] = ["SHA-256", "SHA-384", "SHA-512"];

export type HmacOutputEncoding = "hex" | "base64" | "base64url";

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Std(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  return bytesToBase64Std(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeOutput(bytes: ArrayBuffer, encoding: HmacOutputEncoding): string {
  if (encoding === "hex") return bytesToHex(bytes);
  if (encoding === "base64") return bytesToBase64Std(bytes);
  return bytesToBase64Url(bytes);
}

export interface HmacComputeResult {
  ok: boolean;
  error?: string;
  hex?: string;
  base64?: string;
  base64url?: string;
}

async function importHmacSigningKey(secretBytes: Uint8Array, algorithm: HmacAlgorithm): Promise<{ ok: boolean; key?: CryptoKey; error?: string }> {
  if (typeof crypto === "undefined" || !crypto.subtle) return { ok: false, error: "Este navegador no soporta crypto.subtle, necesario para calcular HMAC." };
  try {
    const key = await crypto.subtle.importKey("raw", secretBytes as BufferSource, { name: "HMAC", hash: algorithm }, false, ["sign", "verify"]);
    return { ok: true, key };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo importar el secreto." };
  }
}

export async function computeHmac(message: Uint8Array, secret: string, secretEncoding: HmacSecretEncoding, algorithm: HmacAlgorithm): Promise<HmacComputeResult> {
  if (message.length > LIMITS.maxMessageLength) return { ok: false, error: `El mensaje supera el límite de ${LIMITS.maxMessageLength.toLocaleString("es-ES")} bytes.` };
  if (secret.length > LIMITS.maxSecretLength) return { ok: false, error: `El secreto supera el límite de ${LIMITS.maxSecretLength.toLocaleString("es-ES")} caracteres.` };

  const secretDecoded = decodeHmacSecret(secret, secretEncoding);
  if (!secretDecoded.ok || !secretDecoded.bytes) return { ok: false, error: secretDecoded.error };

  const imported = await importHmacSigningKey(secretDecoded.bytes, algorithm);
  if (!imported.ok || !imported.key) return { ok: false, error: imported.error };

  const signature = await crypto.subtle.sign("HMAC", imported.key, message as BufferSource);
  return { ok: true, hex: encodeOutput(signature, "hex"), base64: encodeOutput(signature, "base64"), base64url: encodeOutput(signature, "base64url") };
}

export interface HmacVerifyResult {
  ok: boolean;
  error?: string;
  matches?: boolean;
  computedHex?: string;
}

export async function verifyHmac(message: Uint8Array, secret: string, secretEncoding: HmacSecretEncoding, algorithm: HmacAlgorithm, expected: string, expectedEncoding: HmacOutputEncoding): Promise<HmacVerifyResult> {
  const computed = await computeHmac(message, secret, secretEncoding, algorithm);
  if (!computed.ok) return { ok: false, error: computed.error };

  const expectedNormalized = expectedEncoding === "hex" ? expected.trim().toLowerCase() : normalizeToHex(expected, expectedEncoding);
  if (expectedNormalized === null) return { ok: false, error: "El valor esperado no está en el encoding indicado." };

  const matches = hashesMatch(computed.hex!, expectedNormalized);
  return { ok: true, matches, computedHex: computed.hex };
}

function normalizeToHex(value: string, encoding: HmacOutputEncoding): string | null {
  if (encoding === "hex") return value.trim().toLowerCase();
  try {
    const normalized = encoding === "base64" ? value.trim() : value.trim().replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    let hex = "";
    for (let i = 0; i < binary.length; i++) hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
    return hex;
  } catch {
    return null;
  }
}

/**
 * Thin, JWT-flavored names over the existing Base64/Base64URL core
 * (`utilities/encoding.ts`) — never a second Base64 implementation (spec
 * section 10: "reutiliza Base64/Base64URL existente"). `base64ToBytes`
 * already normalizes `-`/`_` back to `+`/`/` and re-pads before decoding,
 * so it already accepts Base64URL input as-is.
 */
import { bytesToBase64, base64ToBytes, type Base64DecodeResult } from "../utilities/encoding";

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes, true);
}

export function base64UrlEncodeText(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text), true);
}

export function base64UrlDecodeToBytes(input: string): Base64DecodeResult {
  return base64ToBytes(input);
}

export interface Base64UrlDecodeTextResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export function base64UrlDecodeToText(input: string): Base64UrlDecodeTextResult {
  const decoded = base64ToBytes(input);
  if (!decoded.ok || !decoded.bytes) return { ok: false, error: decoded.error };
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: false }).decode(decoded.bytes) };
  } catch {
    return { ok: false, error: "El contenido decodificado no es texto válido." };
  }
}

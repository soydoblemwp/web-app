/**
 * UTF-8-safe Base64 helpers. Plain `btoa()`/`atob()` operate on UTF-16 code
 * units and throw (or silently corrupt) on non-Latin1 characters — every
 * caller here goes through TextEncoder/TextDecoder first (spec section 15:
 * "no utilices directamente btoa() sobre Unicode sin codificación
 * adecuada").
 */

function bytesToBinaryString(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return binary;
}

export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  const base64 = btoa(bytesToBinaryString(bytes));
  return urlSafe ? base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : base64;
}

export interface Base64DecodeResult {
  ok: boolean;
  bytes?: Uint8Array;
  error?: string;
}

export function base64ToBytes(input: string): Base64DecodeResult {
  let normalized = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  if (padding === 2) normalized += "==";
  else if (padding === 3) normalized += "=";
  else if (padding === 1) return { ok: false, error: "La longitud de la cadena Base64 no es válida." };

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    return { ok: false, error: "Contiene caracteres que no pertenecen al alfabeto Base64." };
  }

  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { ok: true, bytes };
  } catch {
    return { ok: false, error: "La cadena Base64 no se pudo decodificar." };
  }
}

export function textToBase64(text: string, urlSafe = false): string {
  return bytesToBase64(new TextEncoder().encode(text), urlSafe);
}

export interface Base64ToTextResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export function base64ToText(input: string): Base64ToTextResult {
  const decoded = base64ToBytes(input);
  if (!decoded.ok || !decoded.bytes) return { ok: false, error: decoded.error };
  try {
    // fatal: true rejects byte sequences that aren't valid UTF-8 instead of silently inserting replacement characters.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded.bytes);
    return { ok: true, text };
  } catch {
    return { ok: false, error: "El contenido decodificado no es texto UTF-8 válido (puede ser binario)." };
  }
}

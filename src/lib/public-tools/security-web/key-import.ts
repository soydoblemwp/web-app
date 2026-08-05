/**
 * Public-key import for JWT verification (spec section 20), exclusively
 * via `crypto.subtle.importKey` — never a hand-written PEM/ASN.1 parser
 * beyond stripping PEM's textual header/footer/whitespace to reach the
 * DER bytes Web Crypto itself parses. Only ever imports a PUBLIC key
 * (`usages: ["verify"]`) — this module has no code path that accepts or
 * needs a private key, matching "no solicites una clave privada para
 * verificar."
 */
import type { JwtAlgorithm, JwtKeyFamily } from "./jwt";
import { ALGORITHM_KEY_FAMILY } from "./jwt";
import { base64UrlDecodeToBytes } from "./base64url";

const HASH_FOR_ALGORITHM: Record<JwtAlgorithm, string> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
  RS256: "SHA-256",
  RS384: "SHA-384",
  RS512: "SHA-512",
  ES256: "SHA-256",
  ES384: "SHA-384",
};

const CURVE_FOR_ALGORITHM: Partial<Record<JwtAlgorithm, string>> = {
  ES256: "P-256",
  ES384: "P-384",
};

function subtleAlgorithmParams(algorithm: JwtAlgorithm): EcKeyImportParams | RsaHashedImportParams | HmacImportParams {
  const family = ALGORITHM_KEY_FAMILY[algorithm];
  if (family === "EC") return { name: "ECDSA", namedCurve: CURVE_FOR_ALGORITHM[algorithm]! };
  if (family === "RSA") return { name: "RSASSA-PKCS1-v1_5", hash: HASH_FOR_ALGORITHM[algorithm] };
  return { name: "HMAC", hash: HASH_FOR_ALGORITHM[algorithm] };
}

export interface ImportKeyResult {
  ok: boolean;
  error?: string;
  key?: CryptoKey;
  detectedFamily?: JwtKeyFamily;
}

function pemToDer(pem: string): { ok: boolean; bytes?: Uint8Array; error?: string } {
  const match = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/.exec(pem.trim());
  if (!match) return { ok: false, error: "El texto no tiene el formato PEM esperado (-----BEGIN ... -----)." };
  if (/PRIVATE KEY/i.test(match[1])) return { ok: false, error: "Este es un bloque de clave PRIVADA. Solo se admite una clave pública para verificar." };
  const base64Body = match[2].replace(/\s+/g, "");
  const decoded = base64UrlDecodeToBytes(base64Body.replace(/\+/g, "-").replace(/\//g, "_"));
  if (!decoded.ok || !decoded.bytes) return { ok: false, error: "El contenido Base64 del PEM no se pudo decodificar." };
  return { ok: true, bytes: decoded.bytes };
}

/** Detects the CryptoKey family a raw JWK's `kty` implies — used to catch an algorithm/key mismatch before ever calling `importKey`. */
function jwkFamily(jwk: Record<string, unknown>): JwtKeyFamily | null {
  if (jwk.kty === "RSA") return "RSA";
  if (jwk.kty === "EC") return "EC";
  if (jwk.kty === "oct") return "HMAC";
  return null;
}

export type PublicKeyInputFormat = "pem" | "jwk";

/** Imports a visitor-supplied public key for `algorithm`. Never fetches anything — the key is only ever the exact text pasted or loaded from a local file. */
export async function importPublicKeyForAlgorithm(keyInput: string, format: PublicKeyInputFormat, algorithm: JwtAlgorithm): Promise<ImportKeyResult> {
  const expectedFamily = ALGORITHM_KEY_FAMILY[algorithm];
  if (typeof crypto === "undefined" || !crypto.subtle) return { ok: false, error: "Este navegador no soporta crypto.subtle, necesario para verificar." };

  if (format === "jwk") {
    let jwk: Record<string, unknown>;
    try {
      jwk = JSON.parse(keyInput);
    } catch {
      return { ok: false, error: "La clave JWK no es JSON válido." };
    }
    const detectedFamily = jwkFamily(jwk);
    if (detectedFamily === null) return { ok: false, error: `El campo "kty" de la JWK no es RSA, EC ni oct.` };
    if (detectedFamily !== expectedFamily) {
      return { ok: false, error: `El algoritmo "${algorithm}" requiere una clave ${expectedFamily}, pero la JWK proporcionada es de tipo ${detectedFamily}. No se mezclan familias de algoritmos.` };
    }
    if (jwk.d !== undefined) return { ok: false, error: "Esta JWK contiene el componente privado \"d\". Solo se admite una clave pública para verificar." };
    try {
      const key = await crypto.subtle.importKey("jwk", jwk as JsonWebKey, subtleAlgorithmParams(algorithm), false, ["verify"]);
      return { ok: true, key, detectedFamily };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? `No se pudo importar la clave JWK: ${err.message}` : "No se pudo importar la clave JWK." };
    }
  }

  if (expectedFamily === "HMAC") return { ok: false, error: "HMAC no usa claves PEM/JWK públicas; introduce el secreto compartido." };

  const der = pemToDer(keyInput);
  if (!der.ok || !der.bytes) return { ok: false, error: der.error };
  try {
    const key = await crypto.subtle.importKey("spki", der.bytes as BufferSource, subtleAlgorithmParams(algorithm), false, ["verify"]);
    return { ok: true, key, detectedFamily: expectedFamily };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `No se pudo importar la clave PEM (¿coincide el algoritmo con el tipo de clave?): ${err.message}` : "No se pudo importar la clave PEM." };
  }
}

export type HmacSecretEncoding = "text" | "hex" | "base64" | "base64url";

export function decodeHmacSecret(secret: string, encoding: HmacSecretEncoding): { ok: boolean; bytes?: Uint8Array; error?: string } {
  if (encoding === "text") return { ok: true, bytes: new TextEncoder().encode(secret) };
  if (encoding === "hex") {
    const clean = secret.trim().replace(/\s+/g, "");
    if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) return { ok: false, error: "El secreto hexadecimal no es válido (longitud impar o caracteres fuera de 0-9a-f)." };
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return { ok: true, bytes };
  }
  const decoded = base64UrlDecodeToBytes(encoding === "base64" ? secret.replace(/\+/g, "-").replace(/\//g, "_") : secret);
  if (!decoded.ok || !decoded.bytes) return { ok: false, error: decoded.error ?? "El secreto no se pudo decodificar." };
  return { ok: true, bytes: decoded.bytes };
}

export async function importHmacKey(secretBytes: Uint8Array, algorithm: JwtAlgorithm): Promise<ImportKeyResult> {
  if (typeof crypto === "undefined" || !crypto.subtle) return { ok: false, error: "Este navegador no soporta crypto.subtle, necesario para verificar." };
  try {
    const key = await crypto.subtle.importKey("raw", secretBytes as BufferSource, { name: "HMAC", hash: HASH_FOR_ALGORITHM[algorithm] }, false, ["verify"]);
    return { ok: true, key, detectedFamily: "HMAC" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo importar el secreto HMAC." };
  }
}

export function subtleVerifyAlgorithmFor(algorithm: JwtAlgorithm): AlgorithmIdentifier | EcdsaParams {
  const family = ALGORITHM_KEY_FAMILY[algorithm];
  if (family === "EC") return { name: "ECDSA", hash: HASH_FOR_ALGORITHM[algorithm] };
  if (family === "RSA") return "RSASSA-PKCS1-v1_5";
  return "HMAC";
}

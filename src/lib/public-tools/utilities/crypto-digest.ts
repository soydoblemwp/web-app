export type DigestAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export const DIGEST_ALGORITHMS: DigestAlgorithm[] = ["SHA-256", "SHA-384", "SHA-512", "SHA-1"];

function getSubtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Este navegador no soporta crypto.subtle, necesario para calcular hashes.");
  }
  return crypto.subtle;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const array = new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface DigestResult {
  algorithm: DigestAlgorithm;
  hex: string;
  base64: string;
}

/** Digests a UTF-8 string via Web Crypto — never a hand-rolled hash implementation. */
export async function digestText(text: string, algorithm: DigestAlgorithm): Promise<DigestResult> {
  const data = new TextEncoder().encode(text);
  const buffer = await getSubtle().digest(algorithm, data);
  return { algorithm, hex: bytesToHex(buffer), base64: bytesToBase64(buffer) };
}

/** Digests a File's full contents via Web Crypto. Web Crypto's digest() requires the complete buffer, so the file is read into memory once — never streamed to a server. */
export async function digestFile(file: File, algorithm: DigestAlgorithm): Promise<DigestResult> {
  const buffer = await file.arrayBuffer();
  const digestBuffer = await getSubtle().digest(algorithm, buffer);
  return { algorithm, hex: bytesToHex(digestBuffer), base64: bytesToBase64(digestBuffer) };
}

/** Constant-time-ish comparison (length-independent early bail avoided) for two hash strings, case-insensitive. */
export function hashesMatch(a: string, b: string): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (normA.length !== normB.length) return false;
  let diff = 0;
  for (let i = 0; i < normA.length; i++) {
    diff |= normA.charCodeAt(i) ^ normB.charCodeAt(i);
  }
  return diff === 0;
}

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * AES-256-GCM encryption for credentials at rest (WordPress app passwords,
 * GitHub tokens, social platform tokens, and — from Fase 39 — Google OAuth
 * refresh/access tokens and PKCE code_verifiers). Never log the plaintext or
 * the key.
 *
 * Two on-disk formats coexist, both decrypted by the SAME `decryptSecret`:
 *   - legacy (3 parts):    base64(iv) . base64(authTag) . base64(ciphertext)
 *   - versioned (4 parts): "v" + version . base64(iv) . base64(authTag) . base64(ciphertext)
 * `encryptSecret` always writes the versioned format going forward — the
 * legacy format is only ever READ, for rows written before Fase 39, never
 * written again. This is the real "soporte de rotación futura mediante
 * versión" Fase 39 spec section 8 asks for, without a second encryption
 * utility or a second env var: Google's tokens use this exact same function
 * and the exact same `ENCRYPTION_KEY`, deliberately never a separate
 * `INTEGRATION_ENCRYPTION_KEY` (see .env.example's Fase 39 section for the
 * reasoning — this project already has one real, working authenticated
 * encryption utility for credentials at rest; fragmenting that into two
 * differently-keyed utilities would weaken, not strengthen, key management).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const CURRENT_FORMAT_VERSION = 1;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Configure it in your environment (see .env.example)."
    );
  }
  // Derive a 32-byte key deterministically from the configured secret so the
  // operator can use any passphrase length while still getting a valid AES-256 key.
  return scryptSync(secret, "ai-content-hub-static-salt", 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    `v${CURRENT_FORMAT_VERSION}`,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const parts = payload.split(".");
  // Legacy (pre-Fase-39) 3-part format has no version prefix — still readable, never re-written.
  const [ivB64, authTagB64, dataB64] = parts.length === 4 ? parts.slice(1) : parts;
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload format.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

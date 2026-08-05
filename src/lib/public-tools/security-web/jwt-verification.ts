/**
 * Orchestrates JWT decode + claims check + (optional) signature
 * verification into one of the explicit status values the UI must show
 * (spec section 20) — decoding and verifying are never conflated: a token
 * without a supplied key always stops at `NO_VERIFICADO`, never implying
 * authenticity.
 */
import { decodeJwt, ALGORITHM_KEY_FAMILY, type JwtAlgorithm, type DecodedJwt } from "./jwt";
import { extractStandardClaims, checkClaims, type StandardClaims, type ClaimsCheckResult } from "./jwt-claims";
import { importPublicKeyForAlgorithm, importHmacKey, decodeHmacSecret, subtleVerifyAlgorithmFor, type PublicKeyInputFormat, type HmacSecretEncoding } from "./key-import";

export type JwtStatus = "TOKEN_MALFORMADO" | "ALGORITMO_NO_PERMITIDO" | "NO_VERIFICADO" | "VERIFICADO" | "FIRMA_INVALIDA" | "TOKEN_EXPIRADO" | "TOKEN_AUN_NO_VALIDO";

export interface KeyInput {
  provided: boolean;
  kind: "hmac" | "public";
  hmacSecret?: string;
  hmacEncoding?: HmacSecretEncoding;
  publicKeyText?: string;
  publicKeyFormat?: PublicKeyInputFormat;
}

export interface VerifyJwtOptions {
  nowEpochSeconds: number;
  clockToleranceSeconds: number;
  expectedAudience?: string;
  expectedIssuer?: string;
  maxTokenLength: number;
  key?: KeyInput;
}

export interface VerifyJwtResult {
  ok: boolean;
  error?: string;
  status?: JwtStatus;
  decoded?: DecodedJwt;
  standardClaims?: StandardClaims;
  claimsCheck?: ClaimsCheckResult;
  keyError?: string;
}

export async function verifyJwt(token: string, options: VerifyJwtOptions): Promise<VerifyJwtResult> {
  const decodeResult = decodeJwt(token, options.maxTokenLength);
  if (!decodeResult.ok || !decodeResult.decoded) {
    return { ok: true, status: "TOKEN_MALFORMADO", error: decodeResult.error };
  }
  const decoded = decodeResult.decoded;
  const standardClaims = extractStandardClaims(decoded.payload);
  const claimsCheck = checkClaims(decoded.payload, {
    nowEpochSeconds: options.nowEpochSeconds,
    clockToleranceSeconds: options.clockToleranceSeconds,
    expectedAudience: options.expectedAudience,
    expectedIssuer: options.expectedIssuer,
  });

  if (decoded.algClaim === "none") {
    return { ok: true, status: "ALGORITMO_NO_PERMITIDO", decoded, standardClaims, claimsCheck, error: 'El algoritmo "none" nunca se acepta: permitirlo equivaldría a aceptar cualquier token sin firma.' };
  }
  if (!decoded.algAllowed || decoded.algClaim === null) {
    return { ok: true, status: "ALGORITMO_NO_PERMITIDO", decoded, standardClaims, claimsCheck, error: `El algoritmo "${decoded.algClaim ?? "(ausente)"}" no está entre los implementados y probados por esta herramienta.` };
  }
  const algorithm = decoded.algClaim as JwtAlgorithm;

  if (!options.key || !options.key.provided) {
    return { ok: true, status: claimsCheck.expired ? "TOKEN_EXPIRADO" : claimsCheck.notYetValid ? "TOKEN_AUN_NO_VALIDO" : "NO_VERIFICADO", decoded, standardClaims, claimsCheck };
  }

  const expectedFamily = ALGORITHM_KEY_FAMILY[algorithm];
  const keyInput = options.key;
  if ((keyInput.kind === "hmac") !== (expectedFamily === "HMAC")) {
    return { ok: true, status: "NO_VERIFICADO", decoded, standardClaims, claimsCheck, keyError: `El algoritmo "${algorithm}" requiere una clave ${expectedFamily === "HMAC" ? "HMAC (secreto compartido)" : "pública (PEM o JWK)"}, pero se proporcionó otro tipo de clave.` };
  }

  let cryptoKey: CryptoKey;
  if (keyInput.kind === "hmac") {
    const secretDecoded = decodeHmacSecret(keyInput.hmacSecret ?? "", keyInput.hmacEncoding ?? "text");
    if (!secretDecoded.ok || !secretDecoded.bytes) {
      return { ok: true, status: "NO_VERIFICADO", decoded, standardClaims, claimsCheck, keyError: secretDecoded.error };
    }
    const imported = await importHmacKey(secretDecoded.bytes, algorithm);
    if (!imported.ok || !imported.key) return { ok: true, status: "NO_VERIFICADO", decoded, standardClaims, claimsCheck, keyError: imported.error };
    cryptoKey = imported.key;
  } else {
    const imported = await importPublicKeyForAlgorithm(keyInput.publicKeyText ?? "", keyInput.publicKeyFormat ?? "pem", algorithm);
    if (!imported.ok || !imported.key) return { ok: true, status: "NO_VERIFICADO", decoded, standardClaims, claimsCheck, keyError: imported.error };
    cryptoKey = imported.key;
  }

  let signatureValid: boolean;
  try {
    const data = new TextEncoder().encode(decoded.signingInput);
    signatureValid = await crypto.subtle.verify(subtleVerifyAlgorithmFor(algorithm), cryptoKey, decoded.signatureBytes as BufferSource, data as BufferSource);
  } catch (err) {
    return { ok: true, status: "NO_VERIFICADO", decoded, standardClaims, claimsCheck, keyError: err instanceof Error ? err.message : "No se pudo comprobar la firma." };
  }

  if (!signatureValid) {
    return { ok: true, status: "FIRMA_INVALIDA", decoded, standardClaims, claimsCheck };
  }
  if (claimsCheck.expired) return { ok: true, status: "TOKEN_EXPIRADO", decoded, standardClaims, claimsCheck };
  if (claimsCheck.notYetValid) return { ok: true, status: "TOKEN_AUN_NO_VALIDO", decoded, standardClaims, claimsCheck };
  return { ok: true, status: "VERIFICADO", decoded, standardClaims, claimsCheck };
}

/**
 * JWT decode core (spec section 20). Splitting a token into header/payload/
 * signature and Base64URL-decoding them is NEVER the same thing as
 * verifying it — this module only ever produces a `DECODIFICADO` result;
 * verification lives in `jwt-verification.ts` and requires a key the
 * visitor explicitly supplies. `alg: "none"` is rejected by default at the
 * decode stage already flagged, and only the algorithms this module
 * actually implements verification for are ever treated as "allowed" —
 * everything else is `ALGORITMO_NO_PERMITIDO` rather than silently ignored.
 */
import { base64UrlDecodeToText, base64UrlDecodeToBytes } from "./base64url";

export type JwtAlgorithm = "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512" | "ES256" | "ES384";
export const JWT_ALLOWED_ALGORITHMS: JwtAlgorithm[] = ["HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "ES256", "ES384"];

export type JwtKeyFamily = "HMAC" | "RSA" | "EC";
export const ALGORITHM_KEY_FAMILY: Record<JwtAlgorithm, JwtKeyFamily> = {
  HS256: "HMAC",
  HS384: "HMAC",
  HS512: "HMAC",
  RS256: "RSA",
  RS384: "RSA",
  RS512: "RSA",
  ES256: "EC",
  ES384: "EC",
};

export interface DecodedJwt {
  headerRaw: string;
  payloadRaw: string;
  signatureRaw: string;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string; // "header.payload" — exactly what gets signed/verified
  signatureBytes: Uint8Array;
  algClaim: string | null;
  algAllowed: boolean;
}

export interface DecodeJwtResult {
  ok: boolean;
  error?: string;
  decoded?: DecodedJwt;
}

/** Parses (never verifies) a compact JWS/JWT. Rejects anything that isn't exactly 3 dot-separated Base64URL segments, and any header/payload segment that isn't valid Base64URL-encoded JSON. */
export function decodeJwt(token: string, maxLength: number): DecodeJwtResult {
  const trimmed = token.trim();
  if (trimmed.length === 0) return { ok: false, error: "Introduce un token." };
  if (trimmed.length > maxLength) return { ok: false, error: `El token supera el límite de ${maxLength.toLocaleString("es-ES")} caracteres.` };

  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: `Un JWT tiene exactamente 3 segmentos separados por ".". Este token tiene ${parts.length}.` };
  }
  const [headerRaw, payloadRaw, signatureRaw] = parts;
  if (!headerRaw || !payloadRaw) {
    return { ok: false, error: "El encabezado o la carga útil (payload) están vacíos." };
  }

  const headerText = base64UrlDecodeToText(headerRaw);
  if (!headerText.ok || headerText.text === undefined) return { ok: false, error: `El encabezado no es Base64URL válido: ${headerText.error ?? ""}` };
  const payloadText = base64UrlDecodeToText(payloadRaw);
  if (!payloadText.ok || payloadText.text === undefined) return { ok: false, error: `La carga útil no es Base64URL válida: ${payloadText.error ?? ""}` };

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(headerText.text);
  } catch {
    return { ok: false, error: "El encabezado decodificado no es JSON válido." };
  }
  try {
    payload = JSON.parse(payloadText.text);
  } catch {
    return { ok: false, error: "La carga útil decodificada no es JSON válido." };
  }
  if (header === null || typeof header !== "object" || Array.isArray(header)) return { ok: false, error: "El encabezado debe ser un objeto JSON." };
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, error: "La carga útil debe ser un objeto JSON." };

  const signatureDecoded = signatureRaw.length > 0 ? base64UrlDecodeToBytesOrEmpty(signatureRaw) : { ok: true as const, bytes: new Uint8Array(0) };
  if (!signatureDecoded.ok) return { ok: false, error: "La firma no es Base64URL válida." };

  const algClaim = typeof (header as Record<string, unknown>).alg === "string" ? ((header as Record<string, unknown>).alg as string) : null;
  const algAllowed = algClaim !== null && algClaim !== "none" && (JWT_ALLOWED_ALGORITHMS as string[]).includes(algClaim);

  return {
    ok: true,
    decoded: {
      headerRaw,
      payloadRaw,
      signatureRaw,
      header: header as Record<string, unknown>,
      payload: payload as Record<string, unknown>,
      signingInput: `${headerRaw}.${payloadRaw}`,
      signatureBytes: signatureDecoded.bytes,
      algClaim,
      algAllowed,
    },
  };
}

function base64UrlDecodeToBytesOrEmpty(input: string): { ok: boolean; bytes: Uint8Array } {
  const decoded = base64UrlDecodeToBytes(input);
  return decoded.ok && decoded.bytes ? { ok: true, bytes: decoded.bytes } : { ok: false, bytes: new Uint8Array(0) };
}

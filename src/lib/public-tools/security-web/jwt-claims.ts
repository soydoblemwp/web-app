/**
 * Standard JWT claim interpretation (spec section 20). Never trusts a claim
 * automatically — `exp`/`nbf` are only ever compared against a `now` the
 * caller supplies explicitly (never `Date.now()` read implicitly deep
 * inside this module), and `aud`/`iss` matching only happens when the
 * visitor explicitly provides an expected value.
 */
export interface StandardClaims {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  jti?: unknown;
}

export function extractStandardClaims(payload: Record<string, unknown>): StandardClaims {
  const { iss, sub, aud, exp, nbf, iat, jti } = payload;
  return { iss, sub, aud, exp, nbf, iat, jti };
}

export interface ClaimsCheckOptions {
  nowEpochSeconds: number;
  clockToleranceSeconds: number;
  expectedAudience?: string;
  expectedIssuer?: string;
}

export interface ClaimsCheckResult {
  expired: boolean;
  notYetValid: boolean;
  audienceMismatch: boolean;
  issuerMismatch: boolean;
  expEpochSeconds: number | null;
  nbfEpochSeconds: number | null;
}

function toEpochSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function checkClaims(payload: Record<string, unknown>, options: ClaimsCheckOptions): ClaimsCheckResult {
  const expEpochSeconds = toEpochSeconds(payload.exp);
  const nbfEpochSeconds = toEpochSeconds(payload.nbf);
  const tolerance = Math.max(0, options.clockToleranceSeconds);

  const expired = expEpochSeconds !== null && options.nowEpochSeconds > expEpochSeconds + tolerance;
  const notYetValid = nbfEpochSeconds !== null && options.nowEpochSeconds < nbfEpochSeconds - tolerance;

  let audienceMismatch = false;
  if (options.expectedAudience !== undefined && options.expectedAudience !== "") {
    const aud = payload.aud;
    if (Array.isArray(aud)) audienceMismatch = !aud.includes(options.expectedAudience);
    else audienceMismatch = aud !== options.expectedAudience;
  }

  let issuerMismatch = false;
  if (options.expectedIssuer !== undefined && options.expectedIssuer !== "") {
    issuerMismatch = payload.iss !== options.expectedIssuer;
  }

  return { expired, notYetValid, audienceMismatch, issuerMismatch, expEpochSeconds, nbfEpochSeconds };
}

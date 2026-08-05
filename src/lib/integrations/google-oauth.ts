import { randomBytes, createHash } from "node:crypto";
import { GOOGLE_OAUTH_SCOPES } from "@/lib/integrations/google-limits";

/**
 * Pure OAuth 2.0 authorization-code + PKCE helpers for the Google
 * Integrations Hub (Fase 39 spec section 5) — no I/O, no database access.
 * The real state/PKCE PERSISTENCE (hashing before storage, expiry,
 * single-use consumption) lives in
 * src/server/services/google-oauth-state.ts, which calls these pure
 * functions rather than re-implementing crypto inline.
 */

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI);
}

export interface GoogleOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Throws with a clear, non-sensitive message when configuration is incomplete — callers must show a real "configuración pendiente" screen, never a fake connection (spec section 2). */
export function requireGoogleOAuthEnv(): GoogleOAuthEnv {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("La integración con Google no está configurada en este entorno.");
  }
  return { clientId, clientSecret, redirectUri };
}

/** A cryptographically random, URL-safe state value — never guessable, never derived from user/project IDs (spec section 5). */
export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/** The state value itself is never persisted — only its hash (spec section 9's `stateHash`), so a leaked DB row can never be replayed as a valid state. */
export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/** RFC 7636 PKCE — S256 challenge method (never "plain"). */
export function generatePkcePair(): PkcePair {
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export interface BuildAuthorizationUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  loginHint?: string;
}

/** Builds the real Google consent-screen URL — offline access (real refresh token), minimal read-only scopes, PKCE S256, `prompt=consent` so a refresh token is issued even on a repeat authorization. */
export function buildGoogleAuthorizationUrl(params: BuildAuthorizationUrlParams): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

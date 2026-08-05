import "server-only";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";
import { hashOAuthState } from "@/lib/integrations/google-oauth";
import { GOOGLE_INTEGRATION_LIMITS } from "@/lib/integrations/google-limits";

/**
 * Persistence for the OAuth CSRF `state` + PKCE `code_verifier` (Fase 39
 * spec sections 5-6, 9, 33) — short-lived, single-use, and NEVER trusted as
 * the source of truth for `projectId`: the callback always resolves
 * project/user from this row, never from the callback URL alone.
 */

export async function createOAuthState(projectId: string, userId: string, rawState: string, codeVerifier: string) {
  const expiresAt = new Date(Date.now() + GOOGLE_INTEGRATION_LIMITS.OAUTH_STATE_TTL_MINUTES * 60_000);
  await prisma.googleOAuthState.create({
    data: {
      projectId,
      userId,
      stateHash: hashOAuthState(rawState),
      encryptedCodeVerifier: encryptSecret(codeVerifier),
      expiresAt,
    },
  });
}

export interface ConsumedOAuthState {
  projectId: string;
  userId: string;
  codeVerifier: string;
}

/**
 * Validates and atomically consumes a state exactly once (spec section 33:
 * inexistente / modificado / expirado / reutilizado all rejected here).
 * Uses a conditioned `updateMany` (never a plain findUnique + update) so a
 * concurrent double-callback can never consume the same row twice.
 */
export async function consumeOAuthState(rawState: string): Promise<ConsumedOAuthState | { error: string }> {
  const stateHash = hashOAuthState(rawState);
  const row = await prisma.googleOAuthState.findUnique({ where: { stateHash } });
  if (!row) return { error: "Estado de autorización no reconocido." };
  if (row.consumedAt) return { error: "Este estado de autorización ya fue utilizado." };
  if (row.expiresAt.getTime() < Date.now()) return { error: "El estado de autorización expiró — inicia la conexión de nuevo." };

  const claim = await prisma.googleOAuthState.updateMany({ where: { stateHash, consumedAt: null }, data: { consumedAt: new Date() } });
  if (claim.count === 0) return { error: "Este estado de autorización ya fue utilizado." };

  return { projectId: row.projectId, userId: row.userId, codeVerifier: row.encryptedCodeVerifier ? decryptSecret(row.encryptedCodeVerifier) : "" };
}

/** Removes expired, never-consumed rows — safe to call opportunistically or from the cron sweep; never touches a row that could still be a valid in-flight callback. */
export async function purgeExpiredOAuthStates(): Promise<number> {
  const result = await prisma.googleOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() }, consumedAt: null } });
  return result.count;
}

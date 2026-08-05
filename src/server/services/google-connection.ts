import "server-only";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";
import {
  isGoogleOAuthConfigured,
  requireGoogleOAuthEnv,
  generateOAuthState,
  generatePkcePair,
  buildGoogleAuthorizationUrl,
} from "@/lib/integrations/google-oauth";
import { exchangeGoogleAuthorizationCode, fetchGoogleUserEmail, refreshGoogleAccessToken, revokeGoogleToken, GoogleApiError } from "@/lib/integrations/google-api-client";
import { createOAuthState, consumeOAuthState } from "@/server/services/google-oauth-state";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { logIntegrationAction } from "@/server/services/google-audit";
import { notifyGoogleConnected, notifyGoogleReauthRequired } from "@/server/services/google-notifications";

/**
 * The real Google OAuth connection lifecycle (Fase 39 spec sections 5-6, 21)
 * — server-side authorization-code + PKCE flow, offline access, encrypted
 * token storage. `GoogleIntegrationConnection` is the detailed status;
 * the generic `Integration` row (shared with WordPress/GitHub) is kept in
 * sync for any code that already reads the generic table.
 */

export async function getConnection(projectId: string) {
  return prisma.googleIntegrationConnection.findUnique({ where: { projectId } });
}

/** Scoped lookup by id for the /integrations/google/connections/[connectionId] detail route — rejects a connection belonging to a different project (spec section 32: multi-tenant isolation). */
export async function getConnectionById(projectId: string, connectionId: string) {
  const row = await prisma.googleIntegrationConnection.findUnique({ where: { id: connectionId }, include: { resources: true } });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export async function startGoogleConnect(projectId: string, userId: string): Promise<{ url: string } | { error: string }> {
  if (!isGoogleOAuthConfigured()) return { error: "La integración con Google no está configurada en este entorno." };
  const env = requireGoogleOAuthEnv();

  const state = generateOAuthState();
  const pkce = generatePkcePair();
  await createOAuthState(projectId, userId, state, pkce.codeVerifier);

  await prisma.googleIntegrationConnection.upsert({
    where: { projectId },
    create: { projectId, connectedById: userId, status: "CONNECTING" },
    update: { status: "CONNECTING" },
  });

  const url = buildGoogleAuthorizationUrl({ clientId: env.clientId, redirectUri: env.redirectUri, state, codeChallenge: pkce.codeChallenge });
  return { url };
}

export interface CompleteConnectResult {
  projectId: string;
  error?: string;
}

/**
 * The OAuth callback's real work (spec section 6) — validates/consumes the
 * state, exchanges the code, encrypts and stores the tokens, never trusts
 * `projectId` from the callback URL (always from the consumed state row).
 * `sessionUserId` (the CURRENT session's user, resolved by the route
 * handler) must match the user who originally started the flow — a real
 * session-fixation guard, not just a comment (spec section 33: "usuario
 * diferente" must be rejected).
 */
export async function completeGoogleConnect(rawState: string, code: string | null, providerError: string | null, sessionUserId: string): Promise<CompleteConnectResult> {
  const consumed = await consumeOAuthState(rawState);
  if ("error" in consumed) return { projectId: "", error: consumed.error };
  const { projectId, userId, codeVerifier } = consumed;

  if (userId !== sessionUserId) {
    await logIntegrationAction(projectId, sessionUserId, "integration.google_connection_failed", "GoogleIntegrationConnection", projectId, { reason: "session_user_mismatch" });
    return { projectId, error: "La sesión actual no coincide con la que inició la conexión con Google." };
  }

  if (providerError) {
    await prisma.googleIntegrationConnection.updateMany({ where: { projectId }, data: { status: "ERROR", lastError: `Google denegó la autorización: ${providerError}` } });
    await logIntegrationAction(projectId, userId, "integration.google_connection_failed", "GoogleIntegrationConnection", projectId, { reason: providerError });
    await publishAutomationEvent({
      projectId,
      eventKey: "integration.connection_failed",
      actorId: userId,
      payload: { provider: "google", reason: "denied" },
      idempotencyKey: `integration.connection_failed:${projectId}:${Date.now()}`,
    });
    return { projectId, error: "Google denegó la autorización." };
  }
  if (!code) return { projectId, error: "Google no devolvió un código de autorización." };

  const env = requireGoogleOAuthEnv();
  let tokens;
  try {
    tokens = await exchangeGoogleAuthorizationCode({ code, clientId: env.clientId, clientSecret: env.clientSecret, redirectUri: env.redirectUri, codeVerifier });
  } catch (err) {
    const message = err instanceof GoogleApiError ? err.message : "No se pudo completar la autorización con Google.";
    await prisma.googleIntegrationConnection.updateMany({ where: { projectId }, data: { status: "ERROR", lastError: message } });
    await logIntegrationAction(projectId, userId, "integration.google_connection_failed", "GoogleIntegrationConnection", projectId, { reason: "token_exchange_failed" });
    return { projectId, error: message };
  }

  const email = await fetchGoogleUserEmail(tokens.access_token);
  const scopes = tokens.scope.split(" ").filter(Boolean);
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.$transaction([
    prisma.googleIntegrationConnection.upsert({
      where: { projectId },
      create: {
        projectId,
        connectedById: userId,
        googleEmail: email,
        status: "CONNECTED",
        scopes,
        encryptedAccessToken: encryptSecret(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined,
        tokenExpiresAt,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastError: null,
      },
      update: {
        connectedById: userId,
        googleEmail: email,
        status: "CONNECTED",
        scopes,
        encryptedAccessToken: encryptSecret(tokens.access_token),
        // A refresh token is only re-issued sometimes (e.g. first consent) — never overwrite a real stored one with nothing.
        ...(tokens.refresh_token ? { encryptedRefreshToken: encryptSecret(tokens.refresh_token) } : {}),
        tokenExpiresAt,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastError: null,
      },
    }),
    prisma.integration.upsert({
      where: { projectId_type: { projectId, type: "GOOGLE" } },
      create: { projectId, type: "GOOGLE", status: "CONNECTED", lastCheckedAt: new Date() },
      update: { status: "CONNECTED", lastCheckedAt: new Date(), lastError: null },
    }),
  ]);

  await logIntegrationAction(projectId, userId, "integration.google_connected", "GoogleIntegrationConnection", projectId, { email });
  await publishAutomationEvent({
    projectId,
    eventKey: "integration.connected",
    actorId: userId,
    payload: { provider: "google", email: email ?? undefined },
    idempotencyKey: `integration.connected:${projectId}:google`,
  });
  await notifyGoogleConnected(projectId, userId, email);

  return { projectId };
}

/**
 * Ensures the connection has a valid, non-expired access token — refreshes
 * when needed via a conditioned `updateMany` keyed on the PREVIOUS
 * `tokenExpiresAt` value, so two concurrent refreshers can never both win
 * (spec sections 21, 35: "evita que dos sincronizaciones refresquen
 * simultáneamente el mismo token").
 */
export async function getValidAccessToken(projectId: string): Promise<{ accessToken: string } | { error: string; reauthRequired?: boolean }> {
  const connection = await prisma.googleIntegrationConnection.findUnique({ where: { projectId } });
  if (!connection || !connection.encryptedRefreshToken) return { error: "No hay una conexión de Google activa para este proyecto." };
  if (connection.status === "DISCONNECTED") return { error: "La conexión de Google está desconectada." };
  if (connection.status === "PAUSED") return { error: "La sincronización de Google está en pausa." };

  const bufferMs = 60_000;
  const stillValid = connection.encryptedAccessToken && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + bufferMs;
  if (stillValid) {
    await prisma.googleIntegrationConnection.update({ where: { projectId }, data: { lastUsedAt: new Date() } });
    return { accessToken: decryptSecret(connection.encryptedAccessToken!) };
  }

  const env = requireGoogleOAuthEnv();
  try {
    const refreshed = await refreshGoogleAccessToken({ refreshToken: decryptSecret(connection.encryptedRefreshToken), clientId: env.clientId, clientSecret: env.clientSecret });
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    const claim = await prisma.googleIntegrationConnection.updateMany({
      where: { projectId, tokenExpiresAt: connection.tokenExpiresAt },
      data: {
        encryptedAccessToken: encryptSecret(refreshed.access_token),
        ...(refreshed.refresh_token ? { encryptedRefreshToken: encryptSecret(refreshed.refresh_token) } : {}),
        tokenExpiresAt: newExpiresAt,
        status: connection.status === "REAUTH_REQUIRED" ? "CONNECTED" : connection.status,
        lastError: null,
        lastUsedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      // Another concurrent call already refreshed it — re-read the now-current row.
      const fresh = await prisma.googleIntegrationConnection.findUnique({ where: { projectId } });
      if (fresh?.encryptedAccessToken) return { accessToken: decryptSecret(fresh.encryptedAccessToken) };
    }
    return { accessToken: refreshed.access_token };
  } catch (err) {
    const isInvalidGrant = err instanceof GoogleApiError && err.category === "AUTH";
    await prisma.googleIntegrationConnection.update({
      where: { projectId },
      data: { status: isInvalidGrant ? "REAUTH_REQUIRED" : "ERROR", lastError: err instanceof Error ? err.message : "No se pudo refrescar el token de Google." },
    });
    if (isInvalidGrant) {
      await publishAutomationEvent({
        projectId,
        eventKey: "integration.reauth_required",
        payload: { provider: "google" },
        idempotencyKey: `integration.reauth_required:${projectId}:${new Date().toISOString().slice(0, 10)}`,
      });
      await notifyGoogleReauthRequired(projectId);
      return { error: "La autorización de Google venció — reconecta la cuenta.", reauthRequired: true };
    }
    return { error: "No se pudo refrescar el token de acceso de Google." };
  }
}

export async function testGoogleConnection(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const tokenResult = await getValidAccessToken(projectId);
  if ("error" in tokenResult) return { ok: false, error: tokenResult.error };
  const email = await fetchGoogleUserEmail(tokenResult.accessToken);
  if (!email) return { ok: false, error: "No se pudo verificar la conexión con Google." };
  return { ok: true };
}

export async function setGooglePaused(projectId: string, userId: string, paused: boolean) {
  const connection = await prisma.googleIntegrationConnection.findUnique({ where: { projectId } });
  if (!connection || connection.status === "DISCONNECTED") return { error: "No hay una conexión de Google activa." };
  await prisma.googleIntegrationConnection.update({ where: { projectId }, data: { status: paused ? "PAUSED" : "CONNECTED", pausedAt: paused ? new Date() : null } });
  await logIntegrationAction(projectId, userId, paused ? "integration.google_paused" : "integration.google_resumed", "GoogleIntegrationConnection", projectId);
  return {};
}

/**
 * Disconnects — best-effort revoke at Google, deletes the stored secret
 * material, keeps every sync-run/audit row (spec section 6: "no borres el
 * historial de métricas ya importadas"), and marks the connection so no
 * future sync can start.
 */
export async function disconnectGoogle(projectId: string, userId: string) {
  const connection = await prisma.googleIntegrationConnection.findUnique({ where: { projectId } });
  if (!connection) return { error: "No hay una conexión de Google para este proyecto." };

  if (connection.encryptedRefreshToken) {
    await revokeGoogleToken(decryptSecret(connection.encryptedRefreshToken)).catch(() => false);
  } else if (connection.encryptedAccessToken) {
    await revokeGoogleToken(decryptSecret(connection.encryptedAccessToken)).catch(() => false);
  }

  await prisma.$transaction([
    prisma.googleIntegrationConnection.update({
      where: { projectId },
      data: {
        status: "DISCONNECTED",
        disconnectedAt: new Date(),
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
      },
    }),
    prisma.integration.upsert({
      where: { projectId_type: { projectId, type: "GOOGLE" } },
      create: { projectId, type: "GOOGLE", status: "DISCONNECTED" },
      update: { status: "DISCONNECTED" },
    }),
  ]);

  await logIntegrationAction(projectId, userId, "integration.google_disconnected", "GoogleIntegrationConnection", projectId);
  await publishAutomationEvent({
    projectId,
    eventKey: "integration.disconnected",
    actorId: userId,
    payload: { provider: "google" },
    idempotencyKey: `integration.disconnected:${projectId}:${Date.now()}`,
  });
  return {};
}

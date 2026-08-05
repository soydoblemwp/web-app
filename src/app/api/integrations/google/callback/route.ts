import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/permissions";
import { completeGoogleConnect } from "@/server/services/google-connection";

/**
 * The real OAuth callback (Fase 39 spec sections 6, 33) — `projectId` is
 * NEVER read from this URL; it's resolved exclusively from the consumed,
 * single-use `state` row (see completeGoogleConnect ->
 * consumeOAuthState). A session mismatch (different user than the one who
 * started the flow) is rejected before any token exchange happens.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const providerError = request.nextUrl.searchParams.get("error");

  if (!state) {
    return NextResponse.redirect(new URL("/dashboard?error=" + encodeURIComponent("Falta el parámetro de estado de la autorización."), request.url));
  }

  let sessionUserId: string;
  try {
    sessionUserId = (await requireUser()).id;
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const result = await completeGoogleConnect(state, code, providerError, sessionUserId);
  if (result.error || !result.projectId) {
    const fallback = result.projectId ? `/dashboard/${result.projectId}/integrations/google` : "/dashboard";
    return NextResponse.redirect(new URL(`${fallback}?error=${encodeURIComponent(result.error ?? "No se pudo completar la conexión con Google.")}`, request.url));
  }

  return NextResponse.redirect(new URL(`/dashboard/${result.projectId}/integrations/google?connected=1`, request.url));
}

import { NextResponse, type NextRequest } from "next/server";
import { requireProjectAccess, ForbiddenError, UnauthorizedError } from "@/lib/permissions";
import { startGoogleConnect } from "@/server/services/google-connection";

/**
 * Starts the real Google OAuth authorization-code flow (Fase 39 spec
 * section 6). A GET-navigable route (not a server action) because it must
 * end in a 302 redirect to Google's consent screen — the browser navigates
 * here directly from a link/button, it's never fetch()'d.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Falta projectId." }, { status: 400 });

  let user;
  try {
    // Connecting/reconnecting Google is a MANAGER-level action (spec section 31).
    user = await requireProjectAccess(projectId, "MANAGER");
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.redirect(new URL("/login", request.url));
    if (err instanceof ForbiddenError) return NextResponse.redirect(new URL(`/dashboard/${projectId}/integrations?error=forbidden`, request.url));
    throw err;
  }

  const result = await startGoogleConnect(projectId, user.id);
  if ("error" in result) {
    return NextResponse.redirect(new URL(`/dashboard/${projectId}/integrations/google?error=${encodeURIComponent(result.error)}`, request.url));
  }
  return NextResponse.redirect(result.url);
}

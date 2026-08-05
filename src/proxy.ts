import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authEdgeConfig } from "@/lib/auth/edge-config";

// Uses the edge-safe config only — the full `@/auth` (Prisma adapter +
// Credentials provider) isn't needed here, and keeping this path lean avoids
// dragging DB/auth-provider code into every request. See lib/auth/edge-config.ts.
const { auth } = NextAuth(authEdgeConfig);

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

// Three-way route protection: authenticated users pass the checks below;
// admins additionally need an admin role on /admin/:path*; guests (no
// session) are redirected away from /dashboard and /admin but are never
// touched here on /guest/:path* — that tree is intentionally outside the
// matcher below so it stays public without needing a bypass rule.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = Boolean(req.auth?.user);
  const isAdminRoute = pathname.startsWith("/admin");
  const isDashboardRoute = pathname.startsWith("/dashboard");

  if (!isLoggedIn && (isDashboardRoute || isAdminRoute)) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Central, server-side enforcement for email verification — covers every
  // /dashboard/* and /admin/* request regardless of which page/layout it
  // hits, so no individual page has to repeat this check. authorize()
  // already refuses to sign in an unverified account, so this only ever
  // matters for a session/JWT that was minted before this feature existed;
  // going forward it's pure defense-in-depth. Never applies to /verify-email
  // itself (outside this matcher entirely — see config.matcher below), so
  // there's no redirect loop.
  if (isLoggedIn && (isDashboardRoute || isAdminRoute) && !req.auth?.user?.emailVerified) {
    return NextResponse.redirect(new URL("/verify-email", req.nextUrl.origin));
  }

  if (isAdminRoute && isLoggedIn && !ADMIN_ROLES.has(req.auth?.user?.role ?? "")) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};

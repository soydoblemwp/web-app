import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authEdgeConfig } from "@/lib/auth/edge-config";

// Uses the edge-safe config only — the full `@/auth` (Prisma adapter +
// Credentials provider) isn't needed here, and keeping this path lean avoids
// dragging DB/auth-provider code into every request. See lib/auth/edge-config.ts.
const { auth } = NextAuth(authEdgeConfig);

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

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

  if (isAdminRoute && isLoggedIn && !ADMIN_ROLES.has(req.auth?.user?.role ?? "")) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};

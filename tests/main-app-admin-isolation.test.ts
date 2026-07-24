import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSafeRedirectTarget } from "@/lib/auth/safe-redirect";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const PERMISSIONS = read("src/lib/permissions/index.ts");
const PROJECT_SERVICE = read("src/server/services/project.ts");
const PROJECT_LAYOUT = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
const PROXY = read("src/proxy.ts");
const LOGIN_ACTION = read("src/server/actions/login.ts");
const ADMIN_LAYOUT = read("src/app/admin/layout.tsx");

describe("the normal app never grants ADMIN/SUPER_ADMIN a bypass to other users' project data", () => {
  it("requireProjectAccess no longer short-circuits for ADMIN_ROLES", () => {
    const fnSource = PERMISSIONS.match(/export async function requireProjectAccess[\s\S]*?\n}/)![0];
    expect(fnSource).not.toMatch(/ADMIN_ROLES\.includes/);
    expect(fnSource).toMatch(/getProjectRole\(user\.id, projectId\)/);
  });

  it("getProjectForUser takes no platform-admin bypass parameter", () => {
    const fnSource = PROJECT_SERVICE.match(/export async function getProjectForUser[\s\S]*?\n}/)![0];
    expect(fnSource).toMatch(/getProjectForUser\(userId: string, projectId: string\)/);
    expect(fnSource).not.toMatch(/isPlatformAdmin/);
    expect(fnSource).toMatch(/getProjectRole\(userId, projectId\)/);
  });

  it("the project layout no longer computes or passes an admin bypass flag", () => {
    expect(PROJECT_LAYOUT).not.toMatch(/isPlatformAdmin/);
    expect(PROJECT_LAYOUT).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });
});

describe("global cross-user data visibility stays exclusive to /admin", () => {
  it("the admin panel's own pages never route through requireProjectAccess or getProjectForUser", () => {
    const adminProjectDetail = read("src/app/admin/projects/[projectId]/page.tsx");
    expect(adminProjectDetail).not.toMatch(/requireProjectAccess|getProjectForUser/);
    expect(adminProjectDetail).toMatch(/prisma\.project\.findUnique/);
  });
});

describe("proxy.ts never forces ADMIN/SUPER_ADMIN into /admin", () => {
  it("only redirects unauthenticated visitors to /login and non-admins away from /admin", () => {
    expect(PROXY).toMatch(/redirect\(loginUrl\)|NextResponse\.redirect\(loginUrl\)/);
    expect(PROXY).toMatch(/isAdminRoute && isLoggedIn && !ADMIN_ROLES\.has/);
    // No branch anywhere sends a request *to* /admin.
    expect(PROXY).not.toMatch(/redirect\(new URL\("\/admin"/);
  });

  it("guards /dashboard and /admin for logged-out visitors, but never touches /guest", () => {
    expect(PROXY).toMatch(/matcher: \["\/dashboard\/:path\*", "\/admin\/:path\*"\]/);
  });
});

describe("login always defaults to /dashboard for every role, and only honors a safe callbackUrl", () => {
  it('hardcodes "/dashboard" as the fallback redirect target', () => {
    expect(LOGIN_ACTION).toMatch(/"\/dashboard"/);
    expect(LOGIN_ACTION).not.toMatch(/"\/admin"/);
  });

  it("never branches the post-login destination on role", () => {
    expect(LOGIN_ACTION).not.toMatch(/role/i);
  });

  it.each([
    ["/dashboard", true],
    ["/admin", true],
    ["/admin/users/abc123", true],
    ["/dashboard/proj1/content", true],
    ["//evil.com", false],
    ["https://evil.com", false],
    ["http://evil.com/x", false],
    ["javascript:alert(1)", false],
    ["evil.com", false],
    ["", false],
  ])("isSafeRedirectTarget(%s) === %s", (target, expected) => {
    expect(isSafeRedirectTarget(target)).toBe(expected);
  });
});

describe("admin/layout.tsx: 'Volver a la aplicación' and role gating", () => {
  it('the "Volver a la aplicación" link points at /dashboard, not /', () => {
    expect(ADMIN_LAYOUT).toMatch(/<Link href="\/dashboard" className="shrink-0 text-sm underline-offset-4 hover:underline">\s*Volver a la aplicación/);
  });

  it("still requires ADMIN or SUPER_ADMIN to view /admin at all", () => {
    expect(ADMIN_LAYOUT).toMatch(/if \(!user\) redirect\("\/login"\);/);
    expect(ADMIN_LAYOUT).toMatch(/if \(user\.role !== "ADMIN" && user\.role !== "SUPER_ADMIN"\) redirect\("\/dashboard"\);/);
  });
});

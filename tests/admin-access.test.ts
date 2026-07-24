import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAdminRole } from "@/lib/permissions/roles";

const ROOT = path.resolve(__dirname, "..");
const USER_MENU = readFileSync(path.join(ROOT, "src/components/layout/user-menu.tsx"), "utf8");
const ADMIN_PAGE = readFileSync(path.join(ROOT, "src/app/admin/page.tsx"), "utf8");
const ADMIN_LAYOUT = readFileSync(path.join(ROOT, "src/app/admin/layout.tsx"), "utf8");

describe("UserMenu: no dropdown, direct and stable access", () => {
  it("does not import or render a DropdownMenu component", () => {
    expect(USER_MENU).not.toMatch(/from "@\/components\/ui\/dropdown-menu"/);
    expect(USER_MENU).not.toMatch(/<DropdownMenu\b/);
  });

  it("the user identity block (avatar + name) is not a link, button, or clickable element", () => {
    const identityBlock = USER_MENU.match(
      /<div className="flex items-center gap-2 px-1">[\s\S]*?<\/div>/
    );
    expect(identityBlock).not.toBeNull();
    const block = identityBlock![0];
    expect(block).not.toMatch(/<Link\b/);
    expect(block).not.toMatch(/<button\b/i);
    expect(block).not.toMatch(/<Button\b/);
    expect(block).not.toMatch(/onClick/);
    expect(block).not.toMatch(/href=/);
  });

  it('renders the "Administración" link pointing exactly to /admin', () => {
    expect(USER_MENU).toMatch(/<Link href="\/admin">/);
  });

  it("Administración is only rendered when isAdmin is true, and never inside a menu/hover-only wrapper", () => {
    expect(USER_MENU).toMatch(/isAdmin \? \(/);
    expect(USER_MENU).not.toMatch(/DropdownMenuItem|hover:|group-hover/);
  });

  it("keeps logoutAction as a real form submission (no client-side-only handler)", () => {
    expect(USER_MENU).toMatch(/import \{ logoutAction \} from "@\/server\/actions\/logout";/);
    expect(USER_MENU).toMatch(/<form action=\{logoutAction\}>/);
  });
});

describe("isAdminRole: who sees the Administración link", () => {
  it("SUPER_ADMIN sees the link", () => {
    expect(isAdminRole("SUPER_ADMIN")).toBe(true);
  });

  it("ADMIN sees the link", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
  });

  it("USER does not see the link", () => {
    expect(isAdminRole("USER")).toBe(false);
  });

  it("EDITOR does not see the link", () => {
    expect(isAdminRole("EDITOR")).toBe(false);
  });
});

describe("Admin panel: no leftover Anthropic-era AI/token stats", () => {
  it("never queries prisma.aIUsage", () => {
    expect(ADMIN_PAGE).not.toMatch(/aIUsage/);
  });

  it("never shows token counts or AI-generation stats", () => {
    expect(ADMIN_PAGE).not.toMatch(/token/i);
    expect(ADMIN_PAGE).not.toMatch(/Generaciones de IA/);
    expect(ADMIN_PAGE).not.toMatch(/inputTokens|outputTokens/);
  });

  it("shows the three replacement cards: total users, active users, total projects", () => {
    expect(ADMIN_PAGE).toMatch(/Usuarios totales/);
    expect(ADMIN_PAGE).toMatch(/Usuarios activos/);
    expect(ADMIN_PAGE).toMatch(/Proyectos totales/);
    expect(ADMIN_PAGE).toMatch(/isSuspended:\s*false/);
  });

  it("still supports search, role changes, suspend/reactivate and links to the audit log", () => {
    expect(ADMIN_PAGE).toMatch(/UserRoleSelect/);
    expect(ADMIN_PAGE).toMatch(/suspendUserAction/);
    expect(ADMIN_PAGE).toMatch(/name="q"/);
    expect(ADMIN_LAYOUT).toMatch(/\/admin\/audit-log/);
  });
});

describe("Admin panel works without any project ever being created", () => {
  it("the /admin route has no [projectId] segment and doesn't gate on project access", () => {
    expect(ADMIN_PAGE).not.toMatch(/requireProjectAccess/);
    expect(ADMIN_PAGE).not.toMatch(/projectId/);
  });

  it("admin access is gated purely on platform role (ADMIN/SUPER_ADMIN), independent of any project", () => {
    expect(ADMIN_LAYOUT).toMatch(/role !== "ADMIN" && user\.role !== "SUPER_ADMIN"/);
  });
});

describe("Admin access rules (src/app/admin/layout.tsx)", () => {
  it("redirects unauthenticated visitors to /login", () => {
    expect(ADMIN_LAYOUT).toMatch(/if \(!user\) redirect\("\/login"\);/);
  });

  it("redirects USER-role sessions to /dashboard", () => {
    expect(ADMIN_LAYOUT).toMatch(/redirect\("\/dashboard"\);/);
  });
});

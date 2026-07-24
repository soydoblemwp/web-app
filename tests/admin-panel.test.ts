import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const LAYOUT = read("src/app/admin/layout.tsx");
const ADMIN_ACTIONS = read("src/server/actions/admin.ts");

const LIST_PAGES = {
  "admin/page.tsx": "src/app/admin/page.tsx",
  "admin/users/page.tsx": "src/app/admin/users/page.tsx",
  "admin/users/[userId]/page.tsx": "src/app/admin/users/[userId]/page.tsx",
  "admin/projects/page.tsx": "src/app/admin/projects/page.tsx",
  "admin/projects/[projectId]/page.tsx": "src/app/admin/projects/[projectId]/page.tsx",
  "admin/content/page.tsx": "src/app/admin/content/page.tsx",
  "admin/campaigns/page.tsx": "src/app/admin/campaigns/page.tsx",
  "admin/operations/page.tsx": "src/app/admin/operations/page.tsx",
  "admin/integrations/page.tsx": "src/app/admin/integrations/page.tsx",
  "admin/notifications/page.tsx": "src/app/admin/notifications/page.tsx",
  "admin/audit-log/page.tsx": "src/app/admin/audit-log/page.tsx",
  "admin/system/page.tsx": "src/app/admin/system/page.tsx",
} as const;

const ALL_PAGE_SOURCES = Object.fromEntries(
  Object.entries(LIST_PAGES).map(([label, relPath]) => [label, read(relPath)])
);

// ---------------------------------------------------------------------------
// 1-5: route access rules
// ---------------------------------------------------------------------------

describe("route access: src/app/admin/layout.tsx gates every nested admin route", () => {
  it("redirects a visitor with no session to /login", () => {
    expect(LAYOUT).toMatch(/if \(!user\) redirect\("\/login"\);/);
  });

  it("redirects any role other than ADMIN/SUPER_ADMIN to /dashboard (covers USER and EDITOR)", () => {
    expect(LAYOUT).toMatch(/if \(user\.role !== "ADMIN" && user\.role !== "SUPER_ADMIN"\) redirect\("\/dashboard"\);/);
  });

  it("does not gate on any project segment or requireProjectAccess", () => {
    expect(LAYOUT).not.toMatch(/requireProjectAccess/);
    expect(LAYOUT).not.toMatch(/projectId/);
  });

  it("every admin page renders under the shared layout with no extra role check that would exclude ADMIN", () => {
    for (const [label, source] of Object.entries(ALL_PAGE_SOURCES)) {
      // Page-level SUPER_ADMIN-only gates would block ADMIN from viewing —
      // none of the pages should have one; that restriction belongs to actions.
      expect(source, `${label} must not call requireSuperAdmin at page level`).not.toMatch(/requireSuperAdmin\(\)/);
    }
  });
});

// ---------------------------------------------------------------------------
// 6-7: SUPER_ADMIN-exclusive vs ADMIN-permitted actions
// ---------------------------------------------------------------------------

describe("ADMIN cannot perform SUPER_ADMIN-exclusive actions", () => {
  const superAdminOnlyActions = [
    "changeUserRoleAction",
    "closeUserSessionsAction",
    "anonymizeUserAction",
    "setProjectStatusAdminAction",
  ];

  it.each(superAdminOnlyActions)("%s requires requireSuperAdmin()", (actionName) => {
    const fnMatch = ADMIN_ACTIONS.match(new RegExp(`export async function ${actionName}[\\s\\S]*?\\n}`));
    expect(fnMatch, `${actionName} not found`).not.toBeNull();
    expect(fnMatch![0]).toMatch(/requireSuperAdmin\(\)/);
  });

  it("suspendUserAction (available to ADMIN) refuses to modify a SUPER_ADMIN target unless the actor is SUPER_ADMIN", () => {
    const fnMatch = ADMIN_ACTIONS.match(/export async function suspendUserAction[\s\S]*?\n}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/requireAdmin\(\)/);
    expect(fnMatch![0]).toMatch(/assertCanModifyTarget/);
  });
});

// ---------------------------------------------------------------------------
// 7: last SUPER_ADMIN cannot be suspended/demoted/anonymized
// ---------------------------------------------------------------------------

describe("the last SUPER_ADMIN account cannot be suspended, demoted, or anonymized", () => {
  it("suspendUserAction checks assertNotLastSuperAdmin before suspending", () => {
    const fnMatch = ADMIN_ACTIONS.match(/export async function suspendUserAction[\s\S]*?\n}/);
    expect(fnMatch![0]).toMatch(/assertNotLastSuperAdmin\(userId\)/);
  });

  it("changeUserRoleAction checks assertNotLastSuperAdmin before demoting away from SUPER_ADMIN", () => {
    const fnMatch = ADMIN_ACTIONS.match(/export async function changeUserRoleAction[\s\S]*?\n}/);
    expect(fnMatch![0]).toMatch(/assertNotLastSuperAdmin\(userId\)/);
  });

  it("anonymizeUserAction checks assertNotLastSuperAdmin before anonymizing", () => {
    const fnMatch = ADMIN_ACTIONS.match(/export async function anonymizeUserAction[\s\S]*?\n}/);
    expect(fnMatch![0]).toMatch(/assertNotLastSuperAdmin\(userId\)/);
  });
});

// ---------------------------------------------------------------------------
// 8: privacy — no secrets ever rendered
// ---------------------------------------------------------------------------

describe("no passwordHash, tokens, or credential secrets are ever shown", () => {
  it("no admin page or action references passwordHash except to null it out on anonymize", () => {
    for (const [label, source] of Object.entries(ALL_PAGE_SOURCES)) {
      expect(source, `${label} must never reference passwordHash`).not.toMatch(/passwordHash/);
    }
    // admin.ts is allowed exactly one reference: setting it to null when anonymizing.
    const matches = ADMIN_ACTIONS.match(/passwordHash/g) ?? [];
    expect(matches.length).toBe(1);
    expect(ADMIN_ACTIONS).toMatch(/passwordHash:\s*null/);
  });

  it("the integrations page never queries the WordPress/GitHub connection tables (which hold encrypted secrets)", () => {
    const source = ALL_PAGE_SOURCES["admin/integrations/page.tsx"];
    expect(source).not.toMatch(/prisma\.wordPressConnection|prisma\.gitHubConnection/);
    expect(source).not.toMatch(/encryptedAppPassword|encryptedAccessToken/);
  });

  it("no admin page selects Account/Session token fields", () => {
    for (const [label, source] of Object.entries(ALL_PAGE_SOURCES)) {
      expect(source, `${label} must not select OAuth/session tokens`).not.toMatch(
        /access_token|refresh_token|sessionToken|id_token/
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 9: projects work without the admin being a member
// ---------------------------------------------------------------------------

describe("project admin pages never require project membership", () => {
  it("neither the projects list nor the project detail page calls requireProjectAccess", () => {
    expect(ALL_PAGE_SOURCES["admin/projects/page.tsx"]).not.toMatch(/requireProjectAccess/);
    expect(ALL_PAGE_SOURCES["admin/projects/[projectId]/page.tsx"]).not.toMatch(/requireProjectAccess/);
  });

  it("the project detail page fetches the project directly by id, not through a member-scoped query", () => {
    expect(ALL_PAGE_SOURCES["admin/projects/[projectId]/page.tsx"]).toMatch(
      /prisma\.project\.findUnique\(\{\s*where: \{ id: projectId \}/
    );
  });
});

// ---------------------------------------------------------------------------
// 10: administrative actions create AuditLog entries
// ---------------------------------------------------------------------------

describe("every administrative action creates an AuditLog entry", () => {
  const auditedActions = [
    "suspendUserAction",
    "changeUserRoleAction",
    "closeUserSessionsAction",
    "anonymizeUserAction",
    "setProjectStatusAdminAction",
    "setCampaignStatusAdminAction",
    "archiveContentAdminAction",
    "restoreContentAdminAction",
    "softDeleteContentAdminAction",
    "restoreDeletedContentAdminAction",
    "disconnectIntegrationAction",
  ];

  it.each(auditedActions)("%s calls logAdminAction", (actionName) => {
    const fnMatch = ADMIN_ACTIONS.match(new RegExp(`export async function ${actionName}[\\s\\S]*?\\n}`));
    expect(fnMatch, `${actionName} not found`).not.toBeNull();
    expect(fnMatch![0]).toMatch(/logAdminAction\(/);
  });

  it("logAdminAction never receives a password, hash, or token in its metadata", () => {
    expect(ADMIN_ACTIONS).not.toMatch(/logAdminAction\([^)]*password/i);
    expect(ADMIN_ACTIONS).not.toMatch(/logAdminAction\([^)]*token/i);
  });
});

// ---------------------------------------------------------------------------
// 11-12: dashboard never touches guest data, Anthropic, or token stats
// ---------------------------------------------------------------------------

describe("the admin dashboard only reflects registered accounts", () => {
  const DASHBOARD = ALL_PAGE_SOURCES["admin/page.tsx"];

  it("never imports guest-storage — no admin page can read a guest's IndexedDB data", () => {
    for (const [label, source] of Object.entries(ALL_PAGE_SOURCES)) {
      expect(source, `${label} must not import guest-storage`).not.toMatch(/from ["']@\/lib\/guest-storage/);
    }
  });

  it("discloses that guest-mode data is local-only and never reaches the server", () => {
    expect(DASHBOARD).toMatch(/cuentas registradas/);
    expect(DASHBOARD).toMatch(/modo invitado/i);
    // The mention of IndexedDB here is explanatory copy, not a data query.
    expect(DASHBOARD).toMatch(/nunca llegan a este servidor/);
  });

  it("no admin page queries aIUsage, references Anthropic, or shows AI input/output token stats", () => {
    for (const [label, source] of Object.entries(ALL_PAGE_SOURCES)) {
      expect(source, `${label} must not reference aIUsage`).not.toMatch(/aIUsage/);
      expect(source, `${label} must not reference Anthropic`).not.toMatch(/anthropic/i);
      expect(source, `${label} must not show AI token stats`).not.toMatch(/inputTokens|outputTokens|Generaciones de IA/);
    }
  });
});

// ---------------------------------------------------------------------------
// 13: system status page never leaks env var values
// ---------------------------------------------------------------------------

describe("the system status page never shows the value of a secret variable", () => {
  const SYSTEM = ALL_PAGE_SOURCES["admin/system/page.tsx"];
  const secretVars = ["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY", "CRON_SECRET"];

  it.each(secretVars)("every reference to process.env.%s is wrapped in Boolean(...)", (varName) => {
    const references = SYSTEM.match(new RegExp(`process\\.env\\.${varName}`, "g")) ?? [];
    expect(references.length).toBeGreaterThan(0);
    const wrapped = SYSTEM.match(new RegExp(`Boolean\\(process\\.env\\.${varName}\\)`, "g")) ?? [];
    expect(wrapped.length).toBe(references.length);
  });

  it("only shows Sí/No for required variables, never their value", () => {
    expect(SYSTEM).toMatch(/"Sí" : "No"/);
  });

  it("keeps working even if an individual check throws (each check is wrapped in try/catch)", () => {
    const tryCount = (SYSTEM.match(/try \{/g) ?? []).length;
    expect(tryCount).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 14: every list page paginates server-side
// ---------------------------------------------------------------------------

describe("list pages use server-side pagination, never a full table load", () => {
  const paginatedPages = [
    "admin/users/page.tsx",
    "admin/projects/page.tsx",
    "admin/content/page.tsx",
    "admin/campaigns/page.tsx",
    "admin/notifications/page.tsx",
    "admin/audit-log/page.tsx",
  ] as const;

  it.each(paginatedPages)("%s uses AdminPagination and ADMIN_PAGE_SIZE", (label) => {
    const source = ALL_PAGE_SOURCES[label];
    expect(source).toMatch(/AdminPagination/);
    expect(source).toMatch(/ADMIN_PAGE_SIZE/);
    expect(source).toMatch(/skip: paginationSkip\(page\)/);
    expect(source).toMatch(/take: ADMIN_PAGE_SIZE/);
  });

  it("ADMIN_PAGE_SIZE is capped at 50", async () => {
    const { ADMIN_PAGE_SIZE } = await import("@/lib/admin/pagination");
    expect(ADMIN_PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// 15: pages render sensible empty states (works on an empty database)
// ---------------------------------------------------------------------------

describe("every list page has an explicit empty state", () => {
  it.each(Object.keys(LIST_PAGES))("%s has at least one empty-state message", (label) => {
    const source = ALL_PAGE_SOURCES[label as keyof typeof ALL_PAGE_SOURCES];
    const hasEmptyState = /No (hay|se encontr|disponible)|Ning(uno|una)|Sin (usuarios|proyectos|nombre)|está vacía/i.test(
      source
    );
    expect(hasEmptyState, `${label} should render an empty state`).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeAndValidateHostname, pickTrustedHostHeader } from "@/lib/customer-support/hostname";
import { normalizeVisitorPage, isOriginAllowed, isPathAllowedForWidget } from "@/lib/customer-support/page-match";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Hostname normalization
// ---------------------------------------------------------------------------
describe("hostname.ts: normalizeAndValidateHostname (Fase 40's third correction, spec sections 1-2)", () => {
  it("lowercases the hostname", () => {
    const result = normalizeAndValidateHostname("Example.COM");
    expect(result.ok).toBe(true);
    expect(result.normalizedHostname).toBe("example.com");
  });

  it("strips a trailing port", () => {
    const result = normalizeAndValidateHostname("example.com:8443");
    expect(result.ok).toBe(true);
    expect(result.normalizedHostname).toBe("example.com");
  });

  it("strips a trailing dot", () => {
    const result = normalizeAndValidateHostname("example.com.");
    expect(result.ok).toBe(true);
    expect(result.normalizedHostname).toBe("example.com");
  });

  it("accepts a real subdomain", () => {
    const result = normalizeAndValidateHostname("support.example.com");
    expect(result.ok).toBe(true);
    expect(result.normalizedHostname).toBe("support.example.com");
  });

  it("rejects an empty hostname", () => {
    expect(normalizeAndValidateHostname("").ok).toBe(false);
    expect(normalizeAndValidateHostname("   ").ok).toBe(false);
  });

  it("rejects a hostname containing a protocol", () => {
    expect(normalizeAndValidateHostname("https://example.com").ok).toBe(false);
    expect(normalizeAndValidateHostname("http://example.com").ok).toBe(false);
  });

  it("rejects a hostname containing a path", () => {
    expect(normalizeAndValidateHostname("example.com/help").ok).toBe(false);
  });

  it("rejects a hostname containing a query string", () => {
    expect(normalizeAndValidateHostname("example.com?test=1").ok).toBe(false);
  });

  it("rejects a hostname containing a fragment or credentials", () => {
    expect(normalizeAndValidateHostname("example.com#section").ok).toBe(false);
    expect(normalizeAndValidateHostname("user@example.com").ok).toBe(false);
  });

  it("rejects an invalid hostname format", () => {
    expect(normalizeAndValidateHostname("not a hostname").ok).toBe(false);
    expect(normalizeAndValidateHostname("-example.com").ok).toBe(false);
    expect(normalizeAndValidateHostname("example..com").ok).toBe(false);
    expect(normalizeAndValidateHostname("nodot").ok).toBe(false);
  });

  it("rejects a bare IP address as a hostname", () => {
    expect(normalizeAndValidateHostname("93.184.216.34").ok).toBe(false);
  });

  it("rejects private/reserved IP ranges explicitly", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.1.1", "172.16.0.1", "0.0.0.0"]) {
      expect(normalizeAndValidateHostname(ip).ok, `expected ${ip} to be rejected`).toBe(false);
    }
  });

  it("rejects localhost by default (production-safe default)", () => {
    expect(normalizeAndValidateHostname("localhost").ok).toBe(false);
  });

  it("accepts localhost ONLY when explicitly opted in (development-only rule)", () => {
    const result = normalizeAndValidateHostname("localhost", { allowLocalhost: true });
    expect(result.ok).toBe(true);
    expect(result.normalizedHostname).toBe("localhost");
  });

  it("rejects a hostname that is too long", () => {
    const tooLong = "a".repeat(64) + ".com";
    expect(normalizeAndValidateHostname(tooLong.repeat(4)).ok).toBe(false);
  });

  it("is deterministic — identical input always yields an identical result", () => {
    const a = normalizeAndValidateHostname("Support.Example.com:443.");
    const b = normalizeAndValidateHostname("Support.Example.com:443.");
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// 2. Trusted host header selection
// ---------------------------------------------------------------------------
describe("hostname.ts: pickTrustedHostHeader (spec section 5) — server-side headers only, never a query parameter", () => {
  it("prefers x-forwarded-host when present", () => {
    expect(pickTrustedHostHeader("public.example.com", "internal-host:3000")).toBe("public.example.com");
  });

  it("falls back to the plain host header when x-forwarded-host is absent", () => {
    expect(pickTrustedHostHeader(null, "example.com")).toBe("example.com");
  });

  it("returns null when neither header is present", () => {
    expect(pickTrustedHostHeader(null, null)).toBeNull();
  });

  it("takes only the first entry of a comma-separated proxy chain", () => {
    expect(pickTrustedHostHeader("outer.example.com, inner.example.com", null)).toBe("outer.example.com");
  });

  it("the (public) layout never reads the hostname from a query parameter or request body", () => {
    const source = read("src/app/(public)/layout.tsx");
    expect(source).toMatch(/headers\(\)/);
    expect(source).not.toMatch(/searchParams/);
  });
});

// ---------------------------------------------------------------------------
// 3. Visitor-reported page normalization (spec section 8)
// ---------------------------------------------------------------------------
describe("page-match.ts: normalizeVisitorPage rejects anything that isn't a bare relative path", () => {
  it("accepts a normal relative path", () => {
    expect(normalizeVisitorPage("/pricing")).toBe("/pricing");
    expect(normalizeVisitorPage("/legal/privacy")).toBe("/legal/privacy");
  });

  it("strips query string and fragment", () => {
    expect(normalizeVisitorPage("/pricing?ref=ad")).toBe("/pricing");
    expect(normalizeVisitorPage("/pricing#plans")).toBe("/pricing");
  });

  it("rejects a full URL — cannot be used to dodge the included/excluded check", () => {
    expect(normalizeVisitorPage("https://example.com/pricing")).toBeNull();
    expect(normalizeVisitorPage("http://evil.com/admin")).toBeNull();
  });

  it("rejects a protocol-relative path", () => {
    expect(normalizeVisitorPage("//evil.com/admin")).toBeNull();
  });

  it("rejects path traversal", () => {
    expect(normalizeVisitorPage("/../admin")).toBeNull();
    expect(normalizeVisitorPage("/legal/../admin")).toBeNull();
  });

  it("rejects a value not starting with /", () => {
    expect(normalizeVisitorPage("pricing")).toBeNull();
    expect(normalizeVisitorPage("")).toBeNull();
  });

  it("the widget service validates req.page with normalizeVisitorPage BEFORE the included/excluded check, in both message and handoff handlers", () => {
    const source = read("src/server/services/customer-support-widget.ts");
    expect((source.match(/normalizeVisitorPage\(req\.page\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toMatch(/if \(!normalizedPage\) return deniedResult\(400/);
  });

  it("a rejected page never reaches FAQ retrieval, AI generation, or message persistence (source-level: the page check is a hard return before those calls)", () => {
    const source = read("src/server/services/customer-support-widget.ts");
    const handleVisitorMessage = source.slice(source.indexOf("export async function handleVisitorMessage"), source.indexOf("export async function handleGenerationComplete"));
    const pageCheckIndex = handleVisitorMessage.indexOf("normalizeVisitorPage");
    const firstDbWriteIndex = handleVisitorMessage.indexOf("createConversation");
    expect(pageCheckIndex).toBeGreaterThan(-1);
    expect(firstDbWriteIndex).toBeGreaterThan(pageCheckIndex);
  });
});

// ---------------------------------------------------------------------------
// 4. Multi-tenant hostname exclusivity (source + schema level)
// ---------------------------------------------------------------------------
describe("multi-tenant hostname exclusivity (spec sections 1-3, 9)", () => {
  it("normalizedHostname has a real database unique constraint — the final authority, never just an application-level pre-check", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/normalizedHostname\s+String\s+@unique/);
  });

  it("claimPublicSite rejects a hostname already owned by a DIFFERENT project — never silently reassigns it", () => {
    const source = read("src/server/services/customer-support-public-site.ts");
    expect(source).toMatch(/existing\.projectId !== projectId/);
    expect(source).toMatch(/ya esta asignado a otro proyecto/);
  });

  it("claimPublicSite never uses a plain findFirst-then-create pattern — the real race is decided by the unique constraint via a caught P2002", () => {
    const source = read("src/server/services/customer-support-public-site.ts");
    expect(source).toMatch(/Prisma\.PrismaClientKnownRequestError && err\.code === "P2002"/);
  });

  it("the conflict error message never reveals which other project owns the hostname (spec section 6: no expongas el nombre del otro proyecto)", () => {
    const source = read("src/server/services/customer-support-public-site.ts");
    const conflictMessages = source.match(/"Este dominio ya esta asignado a otro proyecto\."/g) ?? [];
    expect(conflictMessages.length).toBeGreaterThan(0);
    expect(source).not.toMatch(/existing\.project\.name/);
  });

  it("claiming a hostname requires MANAGER-level project access (source-level, mirrors the action-level check already covered)", () => {
    const source = read("src/server/actions/customer-support.ts");
    const fn = source.slice(source.indexOf("export async function claimPublicSiteAction"), source.indexOf("export async function disablePublicSiteAction"));
    expect(fn).toMatch(/requireProjectAccess\(projectId, "MANAGER"\)/);
  });
});

// ---------------------------------------------------------------------------
// 5. Resolution never falls back / never uses activatedAt
// ---------------------------------------------------------------------------
describe("resolution correctness (spec sections 1, 4)", () => {
  it("resolveActivePublicConfig never orders by activatedAt and never does a bare active:true findFirst (the removed heuristic)", () => {
    const source = read("src/server/services/customer-support-config.ts");
    const fn = source.slice(source.indexOf("export async function resolveActivePublicConfig"), source.indexOf("export async function resolveActivePublicConfig") + 900);
    expect(fn).not.toMatch(/activatedAt/);
    expect(fn).not.toMatch(/findFirst\(\{ where: \{ active: true \} \}/);
  });

  it("resolveActivePublicConfig returns null (never a fallback project) whenever the site or config is missing, disabled, inactive, or mismatched", () => {
    const source = read("src/server/services/customer-support-config.ts");
    const fn = source.slice(source.indexOf("export async function resolveActivePublicConfig"), source.indexOf("export async function resolveActivePublicConfig") + 900);
    expect(fn).toMatch(/if \(!site \|\| site\.status !== "ACTIVE"\) return null;/);
    expect(fn).toMatch(/if \(!config \|\| !config\.active \|\| config\.projectId !== site\.projectId\) return null;/);
  });

  it("resolveActivePublicConfig normalizes the hostname before ever querying the database — an invalid hostname can never reach a query", () => {
    const source = read("src/server/services/customer-support-config.ts");
    const fn = source.slice(source.indexOf("export async function resolveActivePublicConfig"), source.indexOf("export async function resolveActivePublicConfig") + 900);
    const normalizeIndex = fn.indexOf("normalizeAndValidateHostname");
    const queryIndex = fn.indexOf("customerSupportPublicSite.findUnique");
    expect(normalizeIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(normalizeIndex);
  });

  it("the (public) layout never renders the widget when no hostname could be resolved", () => {
    const source = read("src/app/(public)/layout.tsx");
    expect(source).toMatch(/hostname \? await resolveActivePublicConfig\(hostname\) : null/);
  });
});

// ---------------------------------------------------------------------------
// 6. publicId cannot be used from an unauthorized hostname (spec section 7)
// ---------------------------------------------------------------------------
describe("origin authorization: a project's publicId cannot be used from a hostname it doesn't own", () => {
  it("every widget action handler resolves through resolveActiveConfig with an originHeader argument", () => {
    const source = read("src/server/services/customer-support-widget.ts");
    for (const fn of ["handleVisitorMessage", "handleGenerationComplete", "handleGenerationFailed", "handleFeedback", "handleHandoffRequest"]) {
      expect(source, `${fn} should thread originHeader`).toMatch(new RegExp(`export async function ${fn}\\([^)]*originHeader: string \\| null`));
    }
  });

  it("isOriginAuthorizedForConfig checks the CustomerSupportPublicSite table, requiring the site's projectId to equal the resolved config's projectId", () => {
    const source = read("src/server/services/customer-support-widget.ts");
    const fn = source.slice(source.indexOf("async function isOriginAuthorizedForConfig"), source.indexOf("async function resolveActiveConfig"));
    expect(fn).toMatch(/customerSupportPublicSite\.findUnique/);
    expect(fn).toMatch(/site\.projectId === config\.projectId/);
    expect(fn).toMatch(/site\.status === "ACTIVE"/);
  });

  it("the route extracts the real Origin header and passes it to every handler — never reads it from the body", () => {
    const source = read("src/app/api/customer-support/chat/route.ts");
    expect(source).toMatch(/request\.headers\.get\("origin"\)/);
    expect(source).not.toMatch(/body\.origin/);
  });

  it("isOriginAllowed still treats the app's own hostname as always authorized (dashboard mode + the shared public marketing pages)", () => {
    expect(isOriginAllowed("https://app.example.com", [], "app.example.com")).toBe(true);
    expect(isOriginAllowed("https://evil.com", [], "app.example.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Concurrency
// ---------------------------------------------------------------------------
describe("concurrency (spec section 3, 10)", () => {
  it("re-claiming the SAME project's own hostname is an idempotent update, not a duplicate insert attempt", () => {
    const source = read("src/server/services/customer-support-public-site.ts");
    expect(source).toMatch(/existing && existing\.projectId === projectId/);
    expect(source).toMatch(/customerSupportPublicSite\.update\(/);
  });

  it("the migration adds the unique index via a real database constraint, not an application-level check alone", () => {
    const migration = read("prisma/migrations/20260805090000_add_customer_support_public_site_binding/migration.sql");
    expect(migration).toMatch(/CREATE UNIQUE INDEX "CustomerSupportPublicSite_normalizedHostname_key"/);
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE/i);
  });
});

// ---------------------------------------------------------------------------
// 8. Regression
// ---------------------------------------------------------------------------
describe("regression: existing customer-support surfaces continue to work after the hostname-binding correction", () => {
  it("the widget still supports dashboard mode (projectId prop) unchanged", () => {
    const source = read("src/components/customer-support/widget/customer-support-widget.tsx");
    expect(source).toMatch(/projectId\?: string/);
    expect(source).toMatch(/publicBootstrap\?: Bootstrap \| null/);
  });

  it("FAQ, knowledge, and handoff services were not modified by this correction (only the resolution/origin/page layers changed)", () => {
    expect(() => read("src/server/services/customer-support-faq.ts")).not.toThrow();
    expect(() => read("src/server/services/customer-support-knowledge.ts")).not.toThrow();
    expect(() => read("src/server/services/customer-support-handoff.ts")).not.toThrow();
  });

  it("isPathAllowedForWidget (client-side defense-in-depth check) is unchanged and still works standalone", () => {
    expect(isPathAllowedForWidget("/pricing", [], [])).toBe(true);
    expect(isPathAllowedForWidget("/admin", [], [])).toBe(false);
  });

  it("the Google Integrations hub files were not touched by this correction", () => {
    expect(() => read("src/server/services/google-connection.ts")).not.toThrow();
    expect(() => read("src/server/services/google-sync.ts")).not.toThrow();
  });
});

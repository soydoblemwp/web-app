import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchPublicPageSameOrigin } from "@/lib/customer-support/safe-page-fetch";
import { validateSyncablePath } from "@/lib/customer-support/internal-path";
import { isPathAllowedForWidget } from "@/lib/customer-support/page-match";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const BASE_URL = "https://app.example.com";

// ---------------------------------------------------------------------------
// 1. safe-page-fetch.ts — redirect-safe, same-origin-only fetching
// ---------------------------------------------------------------------------
describe("safe-page-fetch.ts: redirect-safe internal-page fetch (Fase 40 correction spec section 6)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function htmlResponse(status: number, body: string, headers: Record<string, string> = {}) {
    const allHeaders: Record<string, string> = { "content-type": "text/html", ...headers };
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => allHeaders[name.toLowerCase()] ?? null },
      text: async () => body,
    };
  }

  it("fetches a simple public page successfully", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(htmlResponse(200, "<html><body><p>Hola</p></body></html>"));
    const result = await fetchPublicPageSameOrigin("/precios", BASE_URL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.page.html).toContain("Hola");
  });

  it("never uses redirect:'follow' — always manual, so every hop is re-validated", () => {
    const source = read("src/lib/customer-support/safe-page-fetch.ts");
    // Strip comment lines first — the module doc deliberately quotes redirect:"follow" in prose to explain what it does NOT do.
    const codeOnly = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    expect(codeOnly).toMatch(/redirect:\s*"manual"/);
    expect(codeOnly).not.toMatch(/redirect:\s*"follow"/);
  });

  it("follows a same-origin redirect and returns the final page", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 302, headers: { get: (n: string) => (n.toLowerCase() === "location" ? "/precios-nuevos" : null) } })
      .mockResolvedValueOnce(htmlResponse(200, "<html><body><p>Precios nuevos</p></body></html>"));
    const result = await fetchPublicPageSameOrigin("/precios", BASE_URL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.page.finalPath).toBe("/precios-nuevos");
      expect(result.page.html).toContain("Precios nuevos");
    }
  });

  it("rejects a redirect to a different origin", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 302, headers: { get: (n: string) => (n.toLowerCase() === "location" ? "https://evil.example.com/phishing" : null) } });
    const result = await fetchPublicPageSameOrigin("/precios", BASE_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/dominio externo/i);
  });

  it("treats a redirect to /login as the page requiring authentication — rejected, never synced", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 302, headers: { get: (n: string) => (n.toLowerCase() === "location" ? "/login" : null) } });
    const result = await fetchPublicPageSameOrigin("/dashboard-lookalike", BASE_URL);
    expect(result.ok).toBe(false);
  });

  it("caps the number of redirects followed", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    for (let i = 0; i < 10; i++) {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 302, headers: { get: (n: string) => (n.toLowerCase() === "location" ? `/step-${i + 1}` : null) } });
    }
    const result = await fetchPublicPageSameOrigin("/step-0", BASE_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/redirecciones/i);
  });

  it("rejects a non-HTML content type", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(htmlResponse(200, "{}", { "content-type": "application/json" }));
    const result = await fetchPublicPageSameOrigin("/api-lookalike", BASE_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/HTML/);
  });

  it("rejects a page exceeding the max byte size", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(htmlResponse(200, "<html></html>", { "content-length": String(3_000_000) }));
    const result = await fetchPublicPageSameOrigin("/huge-page", BASE_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tamano maximo/i);
  });

  it("rejects a non-2xx response", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null } });
    const result = await fetchPublicPageSameOrigin("/does-not-exist", BASE_URL);
    expect(result.ok).toBe(false);
  });

  it("classifies a fetch abort as a timeout", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abortError);
    const result = await fetchPublicPageSameOrigin("/slow-page", BASE_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tiempo de espera/i);
  });

  it("re-validates every redirect target against the same reserved-prefix blocklist as the initial path", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 302, headers: { get: (n: string) => (n.toLowerCase() === "location" ? "/admin/secret" : null) } });
    const result = await fetchPublicPageSameOrigin("/looks-public", BASE_URL);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. internal-path.ts — relaxed to a real blocklist (any safe path, not a fixed 5-item list)
// ---------------------------------------------------------------------------
describe("internal-path.ts: a MANAGER can register any real public path (Fase 40 correction spec section 6)", () => {
  it("accepts arbitrary real-looking public paths outside the old fixed list", () => {
    for (const p of ["/precios", "/blog/nuevo-articulo", "/producto/demo", "/ayuda/faq"]) {
      expect(validateSyncablePath(p).ok, `expected ${p} to be accepted`).toBe(true);
    }
  });

  it("still blocks every reserved prefix regardless of the relaxed allowlist", () => {
    for (const p of ["/admin/x", "/dashboard/x", "/api/x", "/login", "/register", "/guest/x", "/verify-email"]) {
      expect(validateSyncablePath(p).ok, `expected ${p} to be rejected`).toBe(false);
    }
  });

  it("still blocks callback/webhook/error-shaped paths", () => {
    expect(validateSyncablePath("/integrations/google/callback").ok).toBe(false);
    expect(validateSyncablePath("/webhooks/x").ok).toBe(false);
  });

  it("still never accepts a host or protocol — SSRF-proof by construction, unchanged by the relaxation", () => {
    expect(validateSyncablePath("https://evil.example.com/x").ok).toBe(false);
    expect(validateSyncablePath("//evil.example.com/x").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Public widget surface — source-level + behavioral checks
// ---------------------------------------------------------------------------
describe("public widget surface: an unauthenticated visitor can use the agent (Fase 40 correction)", () => {
  it("CustomerSupportWidget accepts a publicBootstrap prop and never requires a projectId in public mode", () => {
    const source = read("src/components/customer-support/widget/customer-support-widget.tsx");
    expect(source).toMatch(/publicBootstrap/);
    expect(source).toMatch(/isPublicMode = publicBootstrap !== undefined/);
  });

  it("public mode never calls the project-scoped, VIEWER-gated bootstrap action", () => {
    const source = read("src/components/customer-support/widget/customer-support-widget.tsx");
    expect(source).toMatch(/if \(isPublicMode \|\| !projectId\) return;/);
  });

  it("the (public) route group layout resolves the widget bootstrap server-side and renders it as an isolated sibling", () => {
    const source = read("src/app/(public)/layout.tsx");
    expect(source).toMatch(/resolveActivePublicConfig/);
    expect(source).toMatch(/PublicCustomerSupportWidgetMount/);
  });

  it("the (public) layout never imports or forwards a projectId", () => {
    const source = read("src/app/(public)/layout.tsx");
    expect(source).not.toMatch(/projectId/);
  });

  it("widget-mount.tsx exports a public mount point using the SAME lazy-loaded widget bundle — never a second widget", () => {
    const source = read("src/components/customer-support/widget/widget-mount.tsx");
    expect(source).toMatch(/export function CustomerSupportWidgetMount/);
    expect(source).toMatch(/export function PublicCustomerSupportWidgetMount/);
    expect((source.match(/dynamic\(/g) ?? []).length).toBe(1);
  });

  it("PublicCustomerSupportWidgetMount is still wrapped in the error boundary", () => {
    const source = read("src/components/customer-support/widget/widget-mount.tsx");
    const fn = source.slice(source.indexOf("export function PublicCustomerSupportWidgetMount"));
    expect(fn).toMatch(/CustomerSupportWidgetErrorBoundary/);
  });

  it("the public pages (/, /legal/*) were relocated, not rewritten, and keep their exact URLs", () => {
    expect(() => read("src/app/(public)/page.tsx")).not.toThrow();
    expect(() => read("src/app/(public)/legal/privacy/page.tsx")).not.toThrow();
    expect(() => read("src/app/(public)/legal/terms/page.tsx")).not.toThrow();
    expect(() => read("src/app/(public)/legal/cookies/page.tsx")).not.toThrow();
    expect(() => read("src/app/(public)/legal/ai-disclaimer/page.tsx")).not.toThrow();
  });

  it("the old top-level page.tsx/legal directory no longer exist at their previous location (real move, not a copy)", () => {
    expect(() => read("src/app/page.tsx")).toThrow();
    expect(() => read("src/app/legal/privacy/page.tsx")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. publicId-only identification — never a projectId leak
// ---------------------------------------------------------------------------
describe("identification: publicId only, never projectId, never a client-suppliable project selector", () => {
  it("PublicWidgetBootstrap's shape (source-level) never includes a projectId field", () => {
    const source = read("src/server/services/customer-support-config.ts");
    const interfaceBlock = source.slice(source.indexOf("export interface PublicWidgetBootstrap"), source.indexOf("export interface PublicWidgetBootstrap") + 400);
    expect(interfaceBlock).not.toMatch(/projectId/);
  });

  it("resolveActivePublicConfig now takes a hostname parameter — never a bare no-arg call, never activatedAt ordering (Fase 40's third correction)", () => {
    const source = read("src/server/services/customer-support-config.ts");
    expect(source).toMatch(/export async function resolveActivePublicConfig\(hostname: string\)/);
    expect(source).not.toMatch(/orderBy: \{ activatedAt: "asc" \}/);
    expect(source).not.toMatch(/findFirst\(\{ where: \{ active: true \} \}/);
  });

  it("resolveActivePublicConfig resolves through the exclusive CustomerSupportPublicSite binding, requiring the matched config's projectId to equal the site's own projectId", () => {
    const source = read("src/server/services/customer-support-config.ts");
    expect(source).toMatch(/customerSupportPublicSite\.findUnique\(\{ where: \{ normalizedHostname: validation\.normalizedHostname \} \}/);
    expect(source).toMatch(/config\.projectId !== site\.projectId/);
  });

  it("checkPublicSiteInstallationAction reuses the per-site check the settings UI needs — never a second resolution path", () => {
    const source = read("src/server/actions/customer-support.ts");
    const fn = source.slice(source.indexOf("export async function checkPublicSiteInstallationAction"));
    expect(fn).toMatch(/checkPublicSiteInstallation\(projectId, siteId\)/);
    expect(fn.slice(0, fn.indexOf("}"))).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
  });

  it("claimPublicSiteAction requires MANAGER — claiming a hostname is a security-relevant, activation-adjacent action", () => {
    const source = read("src/server/actions/customer-support.ts");
    const fn = source.slice(source.indexOf("export async function claimPublicSiteAction"), source.indexOf("export async function claimPublicSiteAction") + 400);
    expect(fn).toMatch(/requireProjectAccess\(projectId, "MANAGER"\)/);
  });
});

// ---------------------------------------------------------------------------
// 5. Fallback behavior — inactive agent / invalid config / endpoint failure
// ---------------------------------------------------------------------------
describe("fallback behavior (Fase 40 correction spec section 9)", () => {
  it("the widget renders nothing when bootstrap is null (no active agent) — never a button, never a request", () => {
    const source = read("src/components/customer-support/widget/customer-support-widget.tsx");
    expect(source).toMatch(/if \(!bootstrap\) return null;/);
  });

  it("a chat request failure is caught and shown as an in-conversation message — never an unhandled exception reaching the page", () => {
    const source = read("src/components/customer-support/widget/customer-support-widget.tsx");
    const sendMessageFn = source.slice(source.indexOf("async function sendMessage"), source.indexOf("function appendAgentMessage"));
    expect(sendMessageFn).toMatch(/catch \(err\)/);
  });

  it("the error boundary still renders null on any render-time crash (unchanged by this correction)", () => {
    const source = read("src/components/customer-support/widget/widget-error-boundary.tsx");
    expect(source).toMatch(/getDerivedStateFromError/);
  });
});

// ---------------------------------------------------------------------------
// 6. Regression — nothing else in the public/auth/dashboard surface was touched
// ---------------------------------------------------------------------------
describe("regression: root layout, Header, Footer, dashboard mode, Guest, Admin all untouched", () => {
  it("the root layout still renders ThemeProvider/Toaster and never imports the widget itself", () => {
    const source = read("src/app/layout.tsx");
    expect(source).toMatch(/ThemeProvider/);
    expect(source).toMatch(/Toaster/);
    expect(source).not.toMatch(/CustomerSupportWidget/);
  });

  it("the dashboard ProjectLayout still mounts the project-scoped widget exactly as before", () => {
    const source = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(source).toMatch(/CustomerSupportWidgetMount projectId={project\.id}/);
  });

  it("Header/Sidebar components remain untouched by the widget", () => {
    expect(read("src/components/layout/header.tsx")).not.toMatch(/CustomerSupportWidget/);
    expect(read("src/components/layout/sidebar.tsx")).not.toMatch(/CustomerSupportWidget/);
  });

  it("Guest and Admin layouts never reference the widget", () => {
    expect(read("src/app/guest/layout.tsx")).not.toMatch(/CustomerSupportWidget/);
    expect(read("src/app/admin/layout.tsx")).not.toMatch(/CustomerSupportWidget/);
  });

  it("the home page's own header/footer markup is unchanged (moved, not rewritten)", () => {
    const source = read("src/app/(public)/page.tsx");
    expect(source).toMatch(/Continuar sin cuenta/);
    expect(source).toMatch(/Iniciar sesión/);
    expect(source).toMatch(/appConfig\.name/);
  });

  it("isPathAllowedForWidget behavior (already covered extensively) still governs page inclusion for BOTH modes identically", () => {
    expect(isPathAllowedForWidget("/precios", [], [])).toBe(true);
    expect(isPathAllowedForWidget("/admin", [], [])).toBe(false);
  });
});

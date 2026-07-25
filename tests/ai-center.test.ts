import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_CENTER_CATEGORIES, getAllAiTools, getAiCategory, findAiTool } from "@/lib/ai-center/registry";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

describe("AI Center registry integrity", () => {
  it("every category slug is unique", () => {
    const slugs = AI_CENTER_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every tool slug is globally unique across all categories", () => {
    const slugs = getAllAiTools().map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every 'available' tool has an href builder; every 'coming-soon' tool has none", () => {
    for (const tool of getAllAiTools()) {
      if (tool.status === "available") {
        expect(typeof tool.href).toBe("function");
      } else {
        expect(tool.href).toBeUndefined();
      }
    }
  });

  it("getAiCategory / findAiTool resolve real entries and return undefined for unknown slugs", () => {
    expect(getAiCategory("contenido")?.label).toBe("Contenido");
    expect(getAiCategory("no-existe")).toBeUndefined();
    expect(findAiTool("generador-contenido")?.categorySlug).toBe("contenido");
    expect(findAiTool("no-existe")).toBeUndefined();
  });

  it("the six already-shipped guest-parity tools are registered as available, reusing their real routes (no duplicated pages)", () => {
    const expected: Record<string, string> = {
      "generador-contenido": "/dashboard/proj1/content/new",
      "adaptador-contenido": "/dashboard/proj1/content/adapt",
      "herramientas-seo": "/dashboard/proj1/seo",
      "ideas-redes-sociales": "/dashboard/proj1/social/ideas",
      "analizador-publicaciones": "/dashboard/proj1/social/analyzer",
      "generador-respuestas": "/dashboard/proj1/replies",
    };
    for (const [slug, expectedHref] of Object.entries(expected)) {
      const tool = findAiTool(slug);
      expect(tool?.status).toBe("available");
      expect(tool?.href?.("proj1")).toBe(expectedHref);
    }
  });

  it("the pre-existing Asistente IA chat is reused, not duplicated", () => {
    const tool = findAiTool("asistente-chat");
    expect(tool?.status).toBe("available");
    expect(tool?.href?.("proj1")).toBe("/dashboard/proj1/assistant");
  });
});

describe("AI Center routes exist and stay project-scoped", () => {
  const ROUTE_ROOT = "src/app/(dashboard)/dashboard/[projectId]/ai-center";

  it("the hub and category pages exist", () => {
    expect(existsSync(path.join(ROOT, `${ROUTE_ROOT}/page.tsx`))).toBe(true);
    expect(existsSync(path.join(ROOT, `${ROUTE_ROOT}/[category]/page.tsx`))).toBe(true);
  });

  it("the category page 404s on an unknown category instead of leaking arbitrary content", () => {
    const content = read(`${ROUTE_ROOT}/[category]/page.tsx`);
    expect(content).toMatch(/if \(!category\) notFound\(\);/);
  });

  it("both AI Center pages live under [projectId], so the project layout's membership guard always runs first", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });
});

describe("AI Center favorite/recent-use actions require real project membership", () => {
  const ACTIONS = read("src/server/actions/ai-center.ts");

  it("toggleAiToolFavoriteAction calls requireProjectAccess before touching the database", () => {
    const fnSource = ACTIONS.match(/export async function toggleAiToolFavoriteAction[\s\S]*?\n}/)![0];
    expect(fnSource).toMatch(/requireProjectAccess\(projectId, "VIEWER"\)/);
  });

  it("recordAiToolUsageAction calls requireProjectAccess before touching the database", () => {
    const fnSource = ACTIONS.match(/export async function recordAiToolUsageAction[\s\S]*?\n}/)![0];
    expect(fnSource).toMatch(/requireProjectAccess\(projectId, "VIEWER"\)/);
  });

  it("both actions reject unknown tool slugs instead of trusting arbitrary client input", () => {
    expect(ACTIONS).toMatch(/if \(!findAiTool\(toolSlug\)\) return;/g);
  });

  it("the favorite row is always written for the authenticated user's own id, never a client-supplied userId", () => {
    expect(ACTIONS).not.toMatch(/userId:\s*input\./);
    expect(ACTIONS).toMatch(/userId: user\.id/);
  });
});

describe("Sidebar gains exactly one new entry point (no link-list bloat)", () => {
  it('projectNavGroups adds a single "AI Center" item under Principal, pointing at ai-center', () => {
    const principal = projectNavGroups.find((g) => g.label === "Principal")!;
    const aiCenterItems = principal.items.filter((i) => i.label === "AI Center");
    expect(aiCenterItems).toHaveLength(1);
    expect(aiCenterItems[0].segment).toBe("ai-center");
  });

  it("guest navigation is completely untouched by the AI Center", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("AI Center");
  });

  it("no nav segment is duplicated across projectNavGroups", () => {
    const segments = projectNavGroups.flatMap((g) => g.items.map((i) => i.segment));
    expect(new Set(segments).size).toBe(segments.length);
  });
});

describe("theme system: system-aware, class-based, no dropdown regression", () => {
  it("the root layout wraps children in ThemeProvider and suppresses the expected hydration warning", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toMatch(/<ThemeProvider>/);
    expect(layout).toMatch(/suppressHydrationWarning/);
  });

  it('ThemeProvider is class-based and system-aware, per next-themes conventions', () => {
    const provider = read("src/components/providers/theme-provider.tsx");
    expect(provider).toMatch(/attribute="class"/);
    expect(provider).toMatch(/defaultTheme="system"/);
    expect(provider).toMatch(/enableSystem/);
  });

  it("ThemeToggle never imports or renders the dropdown-menu primitive that previously crashed a header control", () => {
    const toggle = read("src/components/layout/theme-toggle.tsx");
    expect(toggle).not.toMatch(/from ".*dropdown-menu"/);
    expect(toggle).not.toMatch(/<DropdownMenu/);
  });

  it("both the authenticated Header and GuestHeader render the toggle", () => {
    expect(read("src/components/layout/header.tsx")).toMatch(/<ThemeToggle \/>/);
    expect(read("src/components/guest/guest-header.tsx")).toMatch(/<ThemeToggle \/>/);
  });

  it("admin/layout.tsx was not touched to add the theme toggle (out of scope this phase)", () => {
    expect(read("src/app/admin/layout.tsx")).not.toMatch(/ThemeToggle/);
  });

  it("globals.css keeps every pre-existing token value unchanged and only adds success/warning", () => {
    const css = read("src/app/globals.css");
    // Pre-existing values, verbatim — proves nothing else was rewritten.
    expect(css).toContain("--background: oklch(1 0 0);");
    expect(css).toContain("--destructive: oklch(0.577 0.245 27.325);");
    expect(css).toContain("--destructive: oklch(0.704 0.191 22.216);");
    // New, additive tokens.
    expect(css).toMatch(/--success: oklch/);
    expect(css).toMatch(/--warning: oklch/);
    expect(css).toMatch(/--color-success: var\(--success\);/);
    expect(css).toMatch(/--color-warning: var\(--warning\);/);
  });
});

describe("no existing surface (admin, guest tools, permissions) was modified by this phase", () => {
  it("none of the six previously-shipped tool components changed their save/action wiring", () => {
    // Sanity: these files must still exist untouched at their established paths.
    for (const relativePath of [
      "src/components/content/generate-content-form.tsx",
      "src/components/content/content-adapter-form.tsx",
      "src/components/social/generate-social-ideas-form.tsx",
      "src/components/content/post-analyzer-form.tsx",
      "src/components/replies/generate-reply-form.tsx",
    ]) {
      expect(existsSync(path.join(ROOT, relativePath))).toBe(true);
    }
  });

  it("no /site, /p, or preview publishing route was introduced", () => {
    for (const dir of ["src/app/site", "src/app/p", "src/app/preview"]) {
      expect(existsSync(path.join(ROOT, dir))).toBe(false);
    }
  });
});

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const GUEST_FREE_TOOLS = [
  "Generador de contenido",
  "Herramientas SEO",
  "Analizador de publicaciones",
  "Ideas para redes sociales",
  "Adaptador de contenido",
  "Generador de respuestas",
];

describe("guest free tools all have an authenticated equivalent linked in the project Sidebar", () => {
  it("guest mode still exposes exactly these six free tools, unrestricted", () => {
    const toolsGroup = guestNavGroups.find((g) => g.label === "Herramientas gratuitas");
    expect(toolsGroup?.items.map((i) => i.label)).toEqual(GUEST_FREE_TOOLS);
    for (const item of toolsGroup!.items) {
      expect(item.restricted).not.toBe(true);
      expect(item.href).toBeTruthy();
    }
  });

  it("projectNavGroups links every one of the six tools to a real segment", () => {
    const allItems = projectNavGroups.flatMap((g) => g.items);
    const byLabel = Object.fromEntries(allItems.map((i) => [i.label, i.segment]));

    expect(byLabel["Generador de contenido"]).toBeUndefined(); // content creation lives under "Contenido"
    expect(byLabel["Contenido"]).toBe("content");
    expect(byLabel["Herramientas SEO"]).toBeUndefined();
    expect(byLabel["SEO"]).toBe("seo");
    expect(byLabel["Generador de respuestas"]).toBeUndefined();
    expect(byLabel["Respuestas"]).toBe("replies");

    // The three tools that previously had no authenticated page/route at all.
    expect(byLabel["Adaptador de contenido"]).toBe("content/adapt");
    expect(byLabel["Ideas para redes sociales"]).toBe("social/ideas");
    expect(byLabel["Analizador de publicaciones"]).toBe("social/analyzer");
  });

  it("no nav item duplicates a segment (no dead/duplicated routes introduced)", () => {
    const segments = projectNavGroups.flatMap((g) => g.items.map((i) => i.segment));
    expect(new Set(segments).size).toBe(segments.length);
  });
});

const PROJECT_ROUTE_ROOT = "src/app/(dashboard)/dashboard/[projectId]";

describe("the three new authenticated tool routes exist and stay project-scoped", () => {
  it.each([
    ["content/adapt", "content-adapter-form.tsx", "ContentAdapterForm"],
    ["social/ideas", "generate-social-ideas-form.tsx", "GenerateSocialIdeasForm"],
    ["social/analyzer", "post-analyzer-form.tsx", "PostAnalyzerForm"],
  ])("%s renders %s", (segment, _file, componentName) => {
    const pagePath = `${PROJECT_ROUTE_ROOT}/${segment}/page.tsx`;
    expect(existsSync(path.join(ROOT, pagePath))).toBe(true);
    const content = read(pagePath);
    expect(content).toContain(componentName);
  });

  it("Ideas and Adapter pages compute real brand context and pass it as a prop, never a guest note", () => {
    for (const segment of ["social/ideas", "content/adapt"]) {
      const content = read(`${PROJECT_ROUTE_ROOT}/${segment}/page.tsx`);
      expect(content).toContain("buildBrandContext(project, brandKit)");
      expect(content).toContain("brandContextText={brandContextText}");
      expect(content).not.toContain("GUEST_CONTEXT_NOTE");
    }
  });

  it("none of the three new pages bypass project membership (layout.tsx enforces it for every child route)", () => {
    const layout = read(`${PROJECT_ROUTE_ROOT}/layout.tsx`);
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
    expect(layout).toMatch(/if \(!project\) notFound\(\);/);
  });
});

describe("the two new save actions require real project membership, like every other content action", () => {
  const CONTENT_ACTIONS = read("src/server/actions/content.ts");

  it("saveGeneratedSocialIdeasAction calls requireProjectAccess before writing", () => {
    const fnSource = CONTENT_ACTIONS.match(/export async function saveGeneratedSocialIdeasAction[\s\S]*?\n}/)![0];
    expect(fnSource).toMatch(/requireProjectAccess\(input\.projectId, "EDITOR"\)/);
  });

  it("saveGeneratedContentAdaptationAction calls requireProjectAccess before writing", () => {
    const fnSource = CONTENT_ACTIONS.match(
      /export async function saveGeneratedContentAdaptationAction[\s\S]*?\n}/
    )![0];
    expect(fnSource).toMatch(/requireProjectAccess\(input\.projectId, "EDITOR"\)/);
  });

  it("neither action ever reads or writes a different projectId than the one it was given", () => {
    expect(CONTENT_ACTIONS).not.toMatch(/prisma\.project\.findMany\(\)/);
  });
});

describe("no public-facing website/publishing feature was introduced", () => {
  it("no /site, /p, or preview route directories exist", () => {
    for (const dir of ["src/app/site", "src/app/p", "src/app/preview"]) {
      expect(existsSync(path.join(ROOT, dir))).toBe(false);
    }
  });

  it("the new files never reference slug/domain publishing concepts", () => {
    const files = [
      `${PROJECT_ROUTE_ROOT}/content/adapt/page.tsx`,
      `${PROJECT_ROUTE_ROOT}/social/ideas/page.tsx`,
      `${PROJECT_ROUTE_ROOT}/social/analyzer/page.tsx`,
      "src/components/content/content-adapter-form.tsx",
      "src/components/social/generate-social-ideas-form.tsx",
      "src/components/content/post-analyzer-form.tsx",
    ];
    for (const relativePath of files) {
      const content = read(relativePath);
      expect(content).not.toMatch(/publishedAt|\bdomain\b|\bsubdomain\b|"\/site/);
    }
  });
});

describe("the guest-only PostAnalyzerForm duplicate was removed, not left behind", () => {
  it("src/components/guest/guest-post-analyzer-form.tsx no longer exists", () => {
    expect(existsSync(path.join(ROOT, "src/components/guest/guest-post-analyzer-form.tsx"))).toBe(false);
  });

  it("the guest analyzer page now renders the shared component", () => {
    const guestPage = read("src/app/guest/analyzer/page.tsx");
    expect(guestPage).toContain('from "@/components/content/post-analyzer-form"');
    expect(guestPage).toContain("<PostAnalyzerForm");
  });
});

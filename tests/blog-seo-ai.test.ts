import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_SEO_TOOLS, getBlogSeoTool } from "@/lib/ai-center/tools/blog-seo";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { INSTAGRAM_TOOLS } from "@/lib/ai-center/tools/instagram";
import { SOCIAL_MEDIA_TOOLS } from "@/lib/ai-center/tools/social-media";
import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { listRoutableTools } from "@/lib/chat/intent-router";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "seo-title",
  "seo-meta-description",
  "seo-keyword-research",
  "seo-blog-outline",
  "seo-blog-writer",
  "seo-faq",
  "seo-internal-links",
  "seo-snippet-optimizer",
  "seo-article-rewriter",
  "seo-content-optimizer",
];

// ---------------------------------------------------------------------------
// Registro correcto / 10 herramientas
// ---------------------------------------------------------------------------
describe("Blog & SEO AI tool definitions", () => {
  it("registers exactly the 10 required tools", () => {
    expect(BLOG_SEO_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
    expect(BLOG_SEO_TOOLS).toHaveLength(10);
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = BLOG_SEO_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of BLOG_SEO_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getBlogSeoTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getBlogSeoTool("title")?.slug).toBe("seo-title");
    expect(getBlogSeoTool("blog-writer")?.slug).toBe("seo-blog-writer");
    expect(getBlogSeoTool("no-existe")).toBeUndefined();
  });

  it("findToolDefinition (shared, cross-platform) resolves every Blog & SEO slug too", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
  });

  it("slugs never collide with YouTube, Instagram, Social Media, or the pre-existing SEO category's own slugs", () => {
    const existingSlugs = new Set([
      ...YOUTUBE_TOOLS.map((t) => t.slug),
      ...INSTAGRAM_TOOLS.map((t) => t.slug),
      ...SOCIAL_MEDIA_TOOLS.map((t) => t.slug),
      "herramientas-seo",
      "palabra-clave",
      "keywords-secundarias",
      "cluster-contenido",
      "meta-descripcion",
      "faq-seo",
      "schema-seo",
      "snippet-seo",
      "enlaces-internos",
      "enlaces-externos",
    ]);
    for (const slug of EXPECTED_SLUGS) {
      expect(existingSlugs.has(slug)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompts válidos, especializados en SEO moderno (no copiados)
// ---------------------------------------------------------------------------
describe("Blog & SEO prompts are valid, SEO-specialized, and never copied from other categories", () => {
  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of BLOG_SEO_TOOLS) {
      const values = Object.fromEntries(tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")]));
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("list-output tools ask the model for one item/line per entry", () => {
    for (const tool of BLOG_SEO_TOOLS.filter((t) => t.outputMode === "list")) {
      expect(tool.buildSystemPrompt("contexto")).toMatch(/l[íi]nea|numerada/);
    }
  });

  it("no Blog & SEO prompt reuses a YouTube, Instagram or Social Media system prompt's exact text", () => {
    const seoPrompts = BLOG_SEO_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const otherPrompts = [...YOUTUBE_TOOLS, ...INSTAGRAM_TOOLS, ...SOCIAL_MEDIA_TOOLS].map((t) => t.buildSystemPrompt("ctx"));
    for (const prompt of seoPrompts) {
      expect(otherPrompts).not.toContain(prompt);
    }
  });

  it("tools that could plausibly be asked for real ranking/volume/traffic data explicitly refuse to invent it", () => {
    const keywordResearch = BLOG_SEO_TOOLS.find((t) => t.slug === "seo-keyword-research")!;
    const contentOptimizer = BLOG_SEO_TOOLS.find((t) => t.slug === "seo-content-optimizer")!;
    for (const tool of [keywordResearch, contentOptimizer]) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).toMatch(/Search Console/);
      expect(prompt).toMatch(/volumen de búsqueda/);
      expect(prompt).toMatch(/dificultad de palabra clave/);
      expect(prompt).toMatch(/posición en Google/);
      expect(prompt).toMatch(/tráfico orgánico/);
      expect(prompt).toMatch(/nunca inventes/i);
    }
  });

  it("the SEO title and meta description tools enforce real-world character limits", () => {
    const title = BLOG_SEO_TOOLS.find((t) => t.slug === "seo-title")!;
    const meta = BLOG_SEO_TOOLS.find((t) => t.slug === "seo-meta-description")!;
    expect(title.buildSystemPrompt("ctx")).toMatch(/60 caracteres/);
    expect(meta.buildSystemPrompt("ctx")).toMatch(/140/);
    expect(meta.buildSystemPrompt("ctx")).toMatch(/160/);
  });

  it("the article rewriter and internal linking tools treat user-supplied content as data, never as instructions", () => {
    const rewriter = BLOG_SEO_TOOLS.find((t) => t.slug === "seo-article-rewriter")!;
    const links = BLOG_SEO_TOOLS.find((t) => t.slug === "seo-internal-links")!;
    expect(rewriter.buildSystemPrompt("ctx")).toMatch(/nunca como instrucciones/);
    expect(links.buildSystemPrompt("ctx")).toMatch(/nunca como enlaces ya verificados/);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center — misma arquitectura, sin arquitectura paralela
// ---------------------------------------------------------------------------
describe("AI Center integration: same architecture as every other tool category", () => {
  it("a new 'Blog & SEO AI' category exposes all 10 tools as 'available' with a real href matching each routeSegment", () => {
    const category = AI_CENTER_CATEGORIES.find((c) => c.slug === "blog-seo-ai")!;
    expect(category).toBeDefined();
    expect(category.label).toBe("Blog & SEO AI");
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = category.tools.find((t) => t.slug === slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.status).toBe("available");
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/blog-seo/${definition.routeSegment}`);
    }
  });

  it("the pre-existing 'SEO' category (Herramientas SEO + coming-soon placeholders) is completely untouched", () => {
    const existing = AI_CENTER_CATEGORIES.find((c) => c.slug === "seo")!;
    expect(existing.label).toBe("SEO");
    const availableSlugs = existing.tools.filter((t) => t.status === "available").map((t) => t.slug);
    expect(availableSlugs).toEqual(["herramientas-seo"]);
    const comingSoonSlugs = existing.tools.filter((t) => t.status === "coming-soon").map((t) => t.slug).sort();
    expect(comingSoonSlugs).toEqual(
      [
        "palabra-clave",
        "keywords-secundarias",
        "cluster-contenido",
        "meta-descripcion",
        "faq-seo",
        "schema-seo",
        "snippet-seo",
        "enlaces-internos",
        "enlaces-externos",
      ].sort()
    );
  });

  it("findAiTool resolves category/label for every Blog & SEO slug", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tool = findAiTool(slug);
      expect(tool?.categorySlug).toBe("blog-seo-ai");
      expect(tool?.categoryLabel).toBe("Blog & SEO AI");
    }
  });

  it("one dynamic route serves all 10 tools — no per-tool page files were created", () => {
    const dynamicPage = "src/app/(dashboard)/dashboard/[projectId]/ai-center/blog-seo/[tool]/page.tsx";
    expect(existsSync(path.join(ROOT, dynamicPage))).toBe(true);
    for (const tool of BLOG_SEO_TOOLS) {
      const perToolPage = `src/app/(dashboard)/dashboard/[projectId]/ai-center/blog-seo/${tool.routeSegment}/page.tsx`;
      expect(existsSync(path.join(ROOT, perToolPage))).toBe(false);
    }
  });

  it("the dynamic page reuses AiGenerationForm — the exact same generic engine every other category uses, no second form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/blog-seo/[tool]/page.tsx");
    expect(page).toMatch(/import \{ AiGenerationForm \} from "@\/components\/ai-center\/generation\/ai-generation-form"/);
    expect(page).toMatch(/<AiGenerationForm tool=\{tool\} projectId=\{projectId\} brandContextText=\{brandContextText\} \/>/);
    expect(page).toMatch(/if \(!tool\) notFound\(\);/);
  });

  it("YouTube, Instagram and Social Media AI categories/tool counts are unchanged by this phase", () => {
    expect(AI_CENTER_CATEGORIES.find((c) => c.slug === "youtube")!.tools.filter((t) => t.status === "available")).toHaveLength(8);
    expect(AI_CENTER_CATEGORIES.find((c) => c.slug === "instagram")!.tools.filter((t) => t.status === "available")).toHaveLength(10);
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "social-media-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
  });

  it("no Sidebar entry was added — reached only through the AI Center hub, exactly like every other AI category", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("Blog & SEO AI");
    expect(allLabels.filter((l) => l === "AI Center")).toHaveLength(1);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Complete Blog Writer");
  });
});

// ---------------------------------------------------------------------------
// Integración con Workspace — misma acción, mismo historial
// ---------------------------------------------------------------------------
describe("Workspace integration: same save action, no second history", () => {
  it("saveAiToolResultAction (reused, unmodified) still creates a ContentItem tagged with the tool's own slug", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    const fnSource = action.match(/export async function saveAiToolResultAction[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/prisma\.contentItem\.create/);
    expect(fnSource).toMatch(/sourceTool: tool\.slug/);
    expect(fnSource).toMatch(/requireProjectAccess\(input\.projectId, "EDITOR"\)/);
  });

  it("no second save action or history table was created for Blog & SEO AI", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/blog-seo.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-center-blog-seo.ts"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Funcionamiento automático desde Chat IA
// ---------------------------------------------------------------------------
describe("Chat IA automatically detects the new tools via the AI Center registry — no code changes to Chat IA", () => {
  it("listRoutableTools (used by the intent classifier) already includes all 10 Blog & SEO AI tools", () => {
    const routable = listRoutableTools().map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(routable).toContain(slug);
    }
  });

  it("listToolDefinitions includes every platform's tools together, from one shared registry, with no duplicates", () => {
    const all = listToolDefinitions().map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of [...YOUTUBE_TOOLS, ...INSTAGRAM_TOOLS, ...SOCIAL_MEDIA_TOOLS, ...BLOG_SEO_TOOLS]) {
      expect(all).toContain(tool.slug);
    }
  });

  it("Chat IA's panel and the intent router were NOT modified by this phase — no SEO-specific code inside them", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    expect(panel).not.toMatch(/\bseo\b|blog-seo/i);
    expect(router).not.toMatch(/\bseo\b|blog-seo/i);
  });

  it("the classifier prompt still only references what's already in the registry (proving automatic pickup, not hardcoding)", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    for (const tool of BLOG_SEO_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Aislamiento por proyecto y seguridad
// ---------------------------------------------------------------------------
describe("Project isolation and security — same guards as every other AI Center tool", () => {
  it("the project layout's membership guard still runs for every ai-center/blog-seo/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("saveAiToolResultAction rejects an unrecognized toolSlug before writing anything (validated server-side, never trusting the client)", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/if \(!tool\) return \{ error:/);
  });

  it("Blog & SEO AI results never leak contentType/resultKind from client input — always resolved server-side from the tool definition", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/type: tool\.contentType/);
    expect(action).toMatch(/kind: tool\.resultKind/);
    expect(action).not.toMatch(/type: input\./);
  });
});

// ---------------------------------------------------------------------------
// Ausencia de duplicación
// ---------------------------------------------------------------------------
describe("No duplication introduced by this phase", () => {
  it("AiGenerationForm is defined in exactly one place, reused by every AI category route", () => {
    const pages = [
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/instagram/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/social-media/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/blog-seo/[tool]/page.tsx",
    ];
    for (const page of pages) {
      expect(read(page)).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    }
    expect(existsSync(path.join(ROOT, "src/components/ai-center/generation/blog-seo-generation-form.tsx"))).toBe(false);
  });

  it("findToolDefinition/listToolDefinitions/saveAiToolResultAction are each defined in exactly one file", () => {
    const candidateFiles = [
      "src/lib/ai-center/tools/registry.ts",
      "src/lib/ai-center/tools/instagram.ts",
      "src/lib/ai-center/tools/youtube.ts",
      "src/lib/ai-center/tools/social-media.ts",
      "src/lib/ai-center/tools/blog-seo.ts",
      "src/server/actions/ai-center-tools.ts",
    ];
    const findDefiners = candidateFiles.filter((f) => /export function findToolDefinition/.test(read(f)));
    const saveDefiners = candidateFiles.filter((f) => /export async function saveAiToolResultAction/.test(read(f)));
    expect(findDefiners).toEqual(["src/lib/ai-center/tools/registry.ts"]);
    expect(saveDefiners).toEqual(["src/server/actions/ai-center-tools.ts"]);
  });

  it("no new AI engine was introduced — engine.ts is unchanged and still the only generation entry point", () => {
    const engine = read("src/lib/ai/local/engine.ts");
    expect(engine).toMatch(/export async function generateLocalText/);
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/seo-engine.ts"))).toBe(false);
  });

  it("YouTube AI, Instagram AI and Social Media AI are untouched: same tool counts, same routes", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    expect(INSTAGRAM_TOOLS).toHaveLength(10);
    expect(SOCIAL_MEDIA_TOOLS).toHaveLength(10);
    for (const routeDir of ["youtube", "instagram", "social-media"]) {
      expect(
        existsSync(path.join(ROOT, `src/app/(dashboard)/dashboard/[projectId]/ai-center/${routeDir}/[tool]/page.tsx`))
      ).toBe(true);
    }
  });
});

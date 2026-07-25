import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TIKTOK_AI_TOOLS, getTikTokTool } from "@/lib/ai-center/tools/tiktok";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { INSTAGRAM_TOOLS } from "@/lib/ai-center/tools/instagram";
import { SOCIAL_MEDIA_TOOLS } from "@/lib/ai-center/tools/social-media";
import { BLOG_SEO_TOOLS } from "@/lib/ai-center/tools/blog-seo";
import { EMAIL_MARKETING_TOOLS } from "@/lib/ai-center/tools/email-marketing";
import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { listRoutableTools } from "@/lib/chat/intent-router";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "tiktok-viral-video-ideas",
  "tiktok-hook-generator",
  "tiktok-script-generator",
  "tiktok-caption-generator",
  "tiktok-hashtag-generator",
  "tiktok-video-series-planner",
  "tiktok-trend-adaptation",
  "tiktok-cta-generator",
  "tiktok-profile-bio",
  "tiktok-posting-strategy",
];

// ---------------------------------------------------------------------------
// Registro correcto / 10 herramientas
// ---------------------------------------------------------------------------
describe("TikTok AI tool definitions", () => {
  it("registers exactly the 10 required tools", () => {
    expect(TIKTOK_AI_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
    expect(TIKTOK_AI_TOOLS).toHaveLength(10);
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = TIKTOK_AI_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of TIKTOK_AI_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getTikTokTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getTikTokTool("viral-ideas")?.slug).toBe("tiktok-viral-video-ideas");
    expect(getTikTokTool("posting-strategy")?.slug).toBe("tiktok-posting-strategy");
    expect(getTikTokTool("no-existe")).toBeUndefined();
  });

  it("findToolDefinition (shared, cross-platform) resolves every TikTok AI slug too", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
  });

  it("slugs never collide with any other category's tool slugs, including the pre-existing 'tiktok' category", () => {
    const existingSlugs = new Set([
      ...YOUTUBE_TOOLS.map((t) => t.slug),
      ...INSTAGRAM_TOOLS.map((t) => t.slug),
      ...SOCIAL_MEDIA_TOOLS.map((t) => t.slug),
      ...BLOG_SEO_TOOLS.map((t) => t.slug),
      ...EMAIL_MARKETING_TOOLS.map((t) => t.slug),
      "tiktok-ideas",
      "tiktok-guiones",
      "tiktok-hooks",
      "tiktok-descripciones",
      "tiktok-hashtags",
    ]);
    for (const slug of EXPECTED_SLUGS) {
      expect(existingSlugs.has(slug)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompts válidos, especializados en TikTok (no copiados, sin tendencias inventadas)
// ---------------------------------------------------------------------------
describe("TikTok prompts are valid, specialized, and never copied from other categories", () => {
  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of TIKTOK_AI_TOOLS) {
      const values = Object.fromEntries(tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")]));
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("list-output tools ask the model for one item/line per entry", () => {
    for (const tool of TIKTOK_AI_TOOLS.filter((t) => t.outputMode === "list")) {
      expect(tool.buildSystemPrompt("contexto")).toMatch(/l[íi]nea|numerada/);
    }
  });

  it("no TikTok prompt reuses another category's system prompt exact text", () => {
    const tiktokPrompts = TIKTOK_AI_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const otherPrompts = [
      ...YOUTUBE_TOOLS,
      ...INSTAGRAM_TOOLS,
      ...SOCIAL_MEDIA_TOOLS,
      ...BLOG_SEO_TOOLS,
      ...EMAIL_MARKETING_TOOLS,
    ].map((t) => t.buildSystemPrompt("ctx"));
    for (const prompt of tiktokPrompts) {
      expect(otherPrompts).not.toContain(prompt);
    }
  });

  it("tools that could plausibly be asked about trends explicitly refuse to claim a trend is current unless the user provides it", () => {
    const viralIdeas = TIKTOK_AI_TOOLS.find((t) => t.slug === "tiktok-viral-video-ideas")!;
    const hashtags = TIKTOK_AI_TOOLS.find((t) => t.slug === "tiktok-hashtag-generator")!;
    const trendAdaptation = TIKTOK_AI_TOOLS.find((t) => t.slug === "tiktok-trend-adaptation")!;
    const postingStrategy = TIKTOK_AI_TOOLS.find((t) => t.slug === "tiktok-posting-strategy")!;
    for (const tool of [viralIdeas, hashtags, trendAdaptation, postingStrategy]) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).toMatch(/tendencia/i);
      expect(prompt).toMatch(/nunca afirmes|nunca asumas|no tienes acceso a datos reales/i);
    }
  });

  it("the trend adaptation tool only ever works with a trend the user describes, never assumes one is real/current", () => {
    const trendAdaptation = TIKTOK_AI_TOOLS.find((t) => t.slug === "tiktok-trend-adaptation")!;
    const prompt = trendAdaptation.buildUserPrompt({ tendencia: "Reto de baile X", nicho: "fitness", idioma: "es" });
    expect(prompt).toMatch(/trátala como datos a adaptar, nunca como un hecho vigente verificado/);
  });

  it("no prompt anywhere fabricates TikTok statistics as if real", () => {
    for (const tool of TIKTOK_AI_TOOLS) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).not.toMatch(/\d+% de (visualizaciones|engagement|alcance)/);
    }
  });

  it("the bio tool enforces TikTok's 80-character bio limit", () => {
    const bio = TIKTOK_AI_TOOLS.find((t) => t.slug === "tiktok-profile-bio")!;
    expect(bio.buildSystemPrompt("ctx")).toMatch(/80 caracteres/);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center — misma arquitectura, sin arquitectura paralela
// ---------------------------------------------------------------------------
describe("AI Center integration: same architecture as every other tool category", () => {
  it("a new 'TikTok AI' category exposes all 10 tools as 'available' with a real href matching each routeSegment", () => {
    const category = AI_CENTER_CATEGORIES.find((c) => c.slug === "tiktok-ai")!;
    expect(category).toBeDefined();
    expect(category.label).toBe("TikTok AI");
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = category.tools.find((t) => t.slug === slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.status).toBe("available");
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/tiktok-ai/${definition.routeSegment}`);
    }
  });

  it("the pre-existing 'TikTok' category (all coming-soon placeholders) is completely untouched", () => {
    const existing = AI_CENTER_CATEGORIES.find((c) => c.slug === "tiktok")!;
    expect(existing.label).toBe("TikTok");
    const slugs = existing.tools.map((t) => t.slug).sort();
    expect(slugs).toEqual(
      ["tiktok-ideas", "tiktok-guiones", "tiktok-hooks", "tiktok-descripciones", "tiktok-hashtags"].sort()
    );
    expect(existing.tools.every((t) => t.status === "coming-soon")).toBe(true);
  });

  it("findAiTool resolves category/label for every TikTok AI slug", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tool = findAiTool(slug);
      expect(tool?.categorySlug).toBe("tiktok-ai");
      expect(tool?.categoryLabel).toBe("TikTok AI");
    }
  });

  it("one dynamic route serves all 10 tools — no per-tool page files were created", () => {
    const dynamicPage = "src/app/(dashboard)/dashboard/[projectId]/ai-center/tiktok-ai/[tool]/page.tsx";
    expect(existsSync(path.join(ROOT, dynamicPage))).toBe(true);
    for (const tool of TIKTOK_AI_TOOLS) {
      const perToolPage = `src/app/(dashboard)/dashboard/[projectId]/ai-center/tiktok-ai/${tool.routeSegment}/page.tsx`;
      expect(existsSync(path.join(ROOT, perToolPage))).toBe(false);
    }
  });

  it("the dynamic page reuses AiGenerationForm — the exact same generic engine every other category uses, no second form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/tiktok-ai/[tool]/page.tsx");
    expect(page).toMatch(/import \{ AiGenerationForm \} from "@\/components\/ai-center\/generation\/ai-generation-form"/);
    expect(page).toMatch(/<AiGenerationForm tool=\{tool\} projectId=\{projectId\} brandContextText=\{brandContextText\} \/>/);
    expect(page).toMatch(/if \(!tool\) notFound\(\);/);
  });

  it("every previous category/tool count is unchanged by this phase", () => {
    expect(AI_CENTER_CATEGORIES.find((c) => c.slug === "youtube")!.tools.filter((t) => t.status === "available")).toHaveLength(8);
    expect(AI_CENTER_CATEGORIES.find((c) => c.slug === "instagram")!.tools.filter((t) => t.status === "available")).toHaveLength(10);
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "social-media-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "blog-seo-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "email-marketing-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
  });

  it("no Sidebar entry was added — reached only through the AI Center hub, exactly like every other AI category", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("TikTok AI");
    expect(allLabels.filter((l) => l === "AI Center")).toHaveLength(1);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("TikTok Script Generator");
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

  it("no second save action or history table was created for TikTok AI", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/tiktok.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-center-tiktok.ts"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Funcionamiento automático desde Chat IA
// ---------------------------------------------------------------------------
describe("Chat IA automatically detects the new tools via the AI Center registry — no code changes to Chat IA", () => {
  it("listRoutableTools (used by the intent classifier) already includes all 10 TikTok AI tools", () => {
    const routable = listRoutableTools().map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(routable).toContain(slug);
    }
  });

  it("listToolDefinitions includes every category's tools together, from one shared registry, with no duplicates", () => {
    const all = listToolDefinitions().map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of [
      ...YOUTUBE_TOOLS,
      ...INSTAGRAM_TOOLS,
      ...SOCIAL_MEDIA_TOOLS,
      ...BLOG_SEO_TOOLS,
      ...EMAIL_MARKETING_TOOLS,
      ...TIKTOK_AI_TOOLS,
    ]) {
      expect(all).toContain(tool.slug);
    }
  });

  it("Chat IA's panel and the intent router were NOT modified by this phase — no TikTok-specific code inside them", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    expect(panel).not.toMatch(/tiktok/i);
    expect(router).not.toMatch(/tiktok/i);
  });

  it("the classifier prompt still only references what's already in the registry (proving automatic pickup, not hardcoding)", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    for (const tool of TIKTOK_AI_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Aislamiento por proyecto y seguridad
// ---------------------------------------------------------------------------
describe("Project isolation and security — same guards as every other AI Center tool", () => {
  it("the project layout's membership guard still runs for every ai-center/tiktok-ai/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("saveAiToolResultAction rejects an unrecognized toolSlug before writing anything (validated server-side, never trusting the client)", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/if \(!tool\) return \{ error:/);
  });

  it("TikTok AI results never leak contentType/resultKind from client input — always resolved server-side from the tool definition", () => {
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
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/email-marketing/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/tiktok-ai/[tool]/page.tsx",
    ];
    for (const page of pages) {
      expect(read(page)).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    }
    expect(existsSync(path.join(ROOT, "src/components/ai-center/generation/tiktok-generation-form.tsx"))).toBe(false);
  });

  it("findToolDefinition/listToolDefinitions/saveAiToolResultAction are each defined in exactly one file", () => {
    const candidateFiles = [
      "src/lib/ai-center/tools/registry.ts",
      "src/lib/ai-center/tools/instagram.ts",
      "src/lib/ai-center/tools/youtube.ts",
      "src/lib/ai-center/tools/social-media.ts",
      "src/lib/ai-center/tools/blog-seo.ts",
      "src/lib/ai-center/tools/email-marketing.ts",
      "src/lib/ai-center/tools/tiktok.ts",
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
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/tiktok-engine.ts"))).toBe(false);
  });

  it("every previous category is untouched: same tool counts, same routes", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    expect(INSTAGRAM_TOOLS).toHaveLength(10);
    expect(SOCIAL_MEDIA_TOOLS).toHaveLength(10);
    expect(BLOG_SEO_TOOLS).toHaveLength(10);
    expect(EMAIL_MARKETING_TOOLS).toHaveLength(10);
    for (const routeDir of ["youtube", "instagram", "social-media", "blog-seo", "email-marketing"]) {
      expect(
        existsSync(path.join(ROOT, `src/app/(dashboard)/dashboard/[projectId]/ai-center/${routeDir}/[tool]/page.tsx`))
      ).toBe(true);
    }
  });
});

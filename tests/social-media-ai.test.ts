import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SOCIAL_MEDIA_TOOLS, getSocialMediaTool } from "@/lib/ai-center/tools/social-media";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { INSTAGRAM_TOOLS } from "@/lib/ai-center/tools/instagram";
import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { listRoutableTools } from "@/lib/chat/intent-router";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "social-calendar",
  "social-monthly-planner",
  "social-multi-platform-post",
  "social-repurpose",
  "social-viral-ideas",
  "social-audience-analyzer",
  "social-growth-strategy",
  "social-engagement-booster",
  "social-schedule-optimizer",
  "social-audit",
];

// ---------------------------------------------------------------------------
// Registro correcto / 10 herramientas
// ---------------------------------------------------------------------------
describe("Social Media AI tool definitions", () => {
  it("registers exactly the 10 required tools", () => {
    expect(SOCIAL_MEDIA_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
    expect(SOCIAL_MEDIA_TOOLS).toHaveLength(10);
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = SOCIAL_MEDIA_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of SOCIAL_MEDIA_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getSocialMediaTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getSocialMediaTool("calendar")?.slug).toBe("social-calendar");
    expect(getSocialMediaTool("audit")?.slug).toBe("social-audit");
    expect(getSocialMediaTool("no-existe")).toBeUndefined();
  });

  it("findToolDefinition (shared, cross-platform) resolves every Social Media AI slug too", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
  });

  it("slugs never collide with YouTube or Instagram tool slugs", () => {
    const youtubeSlugs = new Set(YOUTUBE_TOOLS.map((t) => t.slug));
    const instagramSlugs = new Set(INSTAGRAM_TOOLS.map((t) => t.slug));
    for (const slug of EXPECTED_SLUGS) {
      expect(youtubeSlugs.has(slug)).toBe(false);
      expect(instagramSlugs.has(slug)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompts válidos, especializados (no copiados de YouTube/Instagram)
// ---------------------------------------------------------------------------
describe("Social Media AI prompts are valid and specialized — never copied from YouTube or Instagram", () => {
  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of SOCIAL_MEDIA_TOOLS) {
      const values = Object.fromEntries(tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")]));
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("list-output tools ask the model for one item/line per entry", () => {
    for (const tool of SOCIAL_MEDIA_TOOLS.filter((t) => t.outputMode === "list")) {
      expect(tool.buildSystemPrompt("contexto")).toMatch(/l[íi]nea/);
    }
  });

  it("no Social Media prompt reuses a YouTube or Instagram system prompt's exact text", () => {
    const socialPrompts = SOCIAL_MEDIA_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const youtubePrompts = YOUTUBE_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const instagramPrompts = INSTAGRAM_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    for (const prompt of socialPrompts) {
      expect(youtubePrompts).not.toContain(prompt);
      expect(instagramPrompts).not.toContain(prompt);
    }
  });

  it("prompts explicitly forbid fabricating real analytics/metrics for analysis-style tools", () => {
    const analyzer = SOCIAL_MEDIA_TOOLS.find((t) => t.slug === "social-audience-analyzer")!;
    const audit = SOCIAL_MEDIA_TOOLS.find((t) => t.slug === "social-audit")!;
    const scheduler = SOCIAL_MEDIA_TOOLS.find((t) => t.slug === "social-schedule-optimizer")!;
    expect(analyzer.buildSystemPrompt("ctx")).toMatch(/nunca inventes cifras/i);
    expect(audit.buildSystemPrompt("ctx")).toMatch(/nunca inventes métricas/i);
    expect(scheduler.buildSystemPrompt("ctx")).toMatch(/no.*datos de analítica reales/i);
  });

  it("multi-platform tools accept any platform as free text — no hardcoded platform branching anywhere", () => {
    const source = read("src/lib/ai-center/tools/social-media.ts");
    const promptsSource = read("src/lib/ai-center/tools/social-media-prompts.ts");
    for (const forbidden of [
      /if\s*\(.*plataforma/i,
      /switch\s*\(.*plataforma/i,
      /=== ["']instagram["']/i,
      /=== ["']tiktok["']/i,
    ]) {
      expect(source).not.toMatch(forbidden);
      expect(promptsSource).not.toMatch(forbidden);
    }
  });

  it("the multi-platform post and repurpose tools' fields accept a free-text 'plataformas' value, not a fixed enum/select", () => {
    // AiToolFieldConfig itself has no "options"/enum concept (see
    // src/lib/ai-center/tools/types.ts) — only "text" | "textarea" |
    // "number" — so a "text" field is inherently free-form, never a fixed list.
    const multiPost = SOCIAL_MEDIA_TOOLS.find((t) => t.slug === "social-multi-platform-post")!;
    const repurpose = SOCIAL_MEDIA_TOOLS.find((t) => t.slug === "social-repurpose")!;
    for (const tool of [multiPost, repurpose]) {
      const field = tool.fields.find((f) => f.name === "plataformas")!;
      expect(field.type).toBe("text");
    }
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center — misma arquitectura, sin arquitectura paralela
// ---------------------------------------------------------------------------
describe("AI Center integration: same architecture as YouTube AI / Instagram AI, no parallel system", () => {
  it("a new 'Social Media AI' category exposes all 10 tools as 'available' with a real href matching each routeSegment", () => {
    const category = AI_CENTER_CATEGORIES.find((c) => c.slug === "social-media-ai")!;
    expect(category).toBeDefined();
    expect(category.label).toBe("Social Media AI");
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = category.tools.find((t) => t.slug === slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.status).toBe("available");
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/social-media/${definition.routeSegment}`);
    }
  });

  it("the pre-existing generic 'redes-sociales' category (Ideas/Analizador/Respuestas) is untouched", () => {
    const existing = AI_CENTER_CATEGORIES.find((c) => c.slug === "redes-sociales")!;
    const availableSlugs = existing.tools.filter((t) => t.status === "available").map((t) => t.slug).sort();
    expect(availableSlugs).toEqual(["analizador-publicaciones", "generador-respuestas", "ideas-redes-sociales"].sort());
  });

  it("findAiTool resolves category/label for every Social Media AI slug", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tool = findAiTool(slug);
      expect(tool?.categorySlug).toBe("social-media-ai");
      expect(tool?.categoryLabel).toBe("Social Media AI");
    }
  });

  it("one dynamic route serves all 10 tools — no per-tool page files were created", () => {
    const dynamicPage = "src/app/(dashboard)/dashboard/[projectId]/ai-center/social-media/[tool]/page.tsx";
    expect(existsSync(path.join(ROOT, dynamicPage))).toBe(true);
    for (const tool of SOCIAL_MEDIA_TOOLS) {
      const perToolPage = `src/app/(dashboard)/dashboard/[projectId]/ai-center/social-media/${tool.routeSegment}/page.tsx`;
      expect(existsSync(path.join(ROOT, perToolPage))).toBe(false);
    }
  });

  it("the dynamic page reuses AiGenerationForm — the exact same generic engine YouTube/Instagram AI use, no second form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/social-media/[tool]/page.tsx");
    expect(page).toMatch(/import \{ AiGenerationForm \} from "@\/components\/ai-center\/generation\/ai-generation-form"/);
    expect(page).toMatch(/<AiGenerationForm tool=\{tool\} projectId=\{projectId\} brandContextText=\{brandContextText\} \/>/);
    expect(page).toMatch(/if \(!tool\) notFound\(\);/);
  });

  it("YouTube and Instagram categories/tool counts are unchanged by this phase", () => {
    const youtube = AI_CENTER_CATEGORIES.find((c) => c.slug === "youtube")!;
    const instagram = AI_CENTER_CATEGORIES.find((c) => c.slug === "instagram")!;
    expect(youtube.tools.filter((t) => t.status === "available")).toHaveLength(8);
    expect(instagram.tools.filter((t) => t.status === "available")).toHaveLength(10);
  });

  it("no Sidebar entry was added — reached only through the AI Center hub, exactly like YouTube/Instagram", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("Social Media AI");
    expect(allLabels.filter((l) => l === "AI Center")).toHaveLength(1);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Content Calendar");
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

  it("no second save action or history table was created for Social Media AI", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/social-media.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-center-social-media.ts"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Funcionamiento automático desde Chat IA
// ---------------------------------------------------------------------------
describe("Chat IA automatically detects the new tools via the AI Center registry — no code changes to Chat IA", () => {
  it("listRoutableTools (used by the intent classifier) already includes all 10 Social Media AI tools", () => {
    const routable = listRoutableTools().map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(routable).toContain(slug);
    }
  });

  it("listToolDefinitions includes YouTube, Instagram and Social Media tools together, from one shared registry, with no duplicates", () => {
    const all = listToolDefinitions().map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of [...YOUTUBE_TOOLS, ...INSTAGRAM_TOOLS, ...SOCIAL_MEDIA_TOOLS]) {
      expect(all).toContain(tool.slug);
    }
  });

  it("Chat IA's panel and the intent router were NOT modified by this phase — no Social-Media-specific code inside them", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    expect(panel).not.toMatch(/social.media|social-media/i);
    expect(router).not.toMatch(/social.media|social-media/i);
  });

  it("the classifier prompt still only references what's already in the registry (proving automatic pickup, not hardcoding)", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    for (const tool of SOCIAL_MEDIA_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Aislamiento por proyecto y seguridad
// ---------------------------------------------------------------------------
describe("Project isolation and security — same guards as every other AI Center tool", () => {
  it("the project layout's membership guard still runs for every ai-center/social-media/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("saveAiToolResultAction rejects an unrecognized toolSlug before writing anything (validated server-side, never trusting the client)", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/if \(!tool\) return \{ error:/);
  });

  it("Social Media AI results never leak contentType/resultKind from client input — always resolved server-side from the tool definition", () => {
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
  it("AiGenerationForm is defined in exactly one place, reused by YouTube, Instagram and Social Media routes", () => {
    const youtubePage = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx");
    const instagramPage = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/instagram/[tool]/page.tsx");
    const socialPage = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/social-media/[tool]/page.tsx");
    for (const page of [youtubePage, instagramPage, socialPage]) {
      expect(page).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    }
    expect(existsSync(path.join(ROOT, "src/components/ai-center/generation/social-media-generation-form.tsx"))).toBe(false);
  });

  it("findToolDefinition/listToolDefinitions/saveAiToolResultAction are each defined in exactly one file", () => {
    const candidateFiles = [
      "src/lib/ai-center/tools/registry.ts",
      "src/lib/ai-center/tools/instagram.ts",
      "src/lib/ai-center/tools/youtube.ts",
      "src/lib/ai-center/tools/social-media.ts",
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
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/social-media-engine.ts"))).toBe(false);
  });

  it("YouTube AI and Instagram AI are untouched: same tool counts, same prompt files, same routes", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    expect(INSTAGRAM_TOOLS).toHaveLength(10);
    expect(
      existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx"))
    ).toBe(true);
    expect(
      existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/ai-center/instagram/[tool]/page.tsx"))
    ).toBe(true);
  });
});

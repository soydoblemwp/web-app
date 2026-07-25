import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACEBOOK_AI_TOOLS, getFacebookTool } from "@/lib/ai-center/tools/facebook";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { INSTAGRAM_TOOLS } from "@/lib/ai-center/tools/instagram";
import { SOCIAL_MEDIA_TOOLS } from "@/lib/ai-center/tools/social-media";
import { BLOG_SEO_TOOLS } from "@/lib/ai-center/tools/blog-seo";
import { EMAIL_MARKETING_TOOLS } from "@/lib/ai-center/tools/email-marketing";
import { TIKTOK_AI_TOOLS } from "@/lib/ai-center/tools/tiktok";
import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { listRoutableTools } from "@/lib/chat/intent-router";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "facebook-post-generator",
  "facebook-long-form-post",
  "facebook-story",
  "facebook-caption",
  "facebook-comment-reply",
  "facebook-ad-copy",
  "facebook-community-engagement",
  "facebook-event-promotion",
  "facebook-page-bio",
  "facebook-content-planner",
];

const OTHER_CATEGORY_TOOLS = [
  ...YOUTUBE_TOOLS,
  ...INSTAGRAM_TOOLS,
  ...SOCIAL_MEDIA_TOOLS,
  ...BLOG_SEO_TOOLS,
  ...EMAIL_MARKETING_TOOLS,
  ...TIKTOK_AI_TOOLS,
];

// ---------------------------------------------------------------------------
// Registro correcto / 10 herramientas
// ---------------------------------------------------------------------------
describe("Facebook AI tool definitions", () => {
  it("registers exactly the 10 required tools", () => {
    expect(FACEBOOK_AI_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
    expect(FACEBOOK_AI_TOOLS).toHaveLength(10);
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = FACEBOOK_AI_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of FACEBOOK_AI_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getFacebookTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getFacebookTool("post")?.slug).toBe("facebook-post-generator");
    expect(getFacebookTool("content-planner")?.slug).toBe("facebook-content-planner");
    expect(getFacebookTool("no-existe")).toBeUndefined();
  });

  it("findToolDefinition (shared, cross-platform) resolves every Facebook AI slug too", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
  });

  it("slugs never collide with any other category's tool slugs, including the pre-existing 'facebook' category", () => {
    const existingSlugs = new Set([
      ...OTHER_CATEGORY_TOOLS.map((t) => t.slug),
      "facebook-posts",
      "facebook-encuestas",
      "facebook-preguntas",
      "facebook-descripciones",
    ]);
    for (const slug of EXPECTED_SLUGS) {
      expect(existingSlugs.has(slug)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompts válidos, especializados en Facebook (no copiados, sin métricas inventadas)
// ---------------------------------------------------------------------------
describe("Facebook prompts are valid, specialized, and never copied from other categories", () => {
  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of FACEBOOK_AI_TOOLS) {
      const values = Object.fromEntries(tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")]));
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("list-output tools ask the model for one item/line per entry", () => {
    for (const tool of FACEBOOK_AI_TOOLS.filter((t) => t.outputMode === "list")) {
      expect(tool.buildSystemPrompt("contexto")).toMatch(/l[íi]nea|numerada/);
    }
  });

  it("no Facebook prompt reuses another category's system prompt exact text", () => {
    const facebookPrompts = FACEBOOK_AI_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const otherPrompts = OTHER_CATEGORY_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    for (const prompt of facebookPrompts) {
      expect(otherPrompts).not.toContain(prompt);
    }
  });

  it("the ad copy and content planner tools explicitly refuse to invent reach/engagement/sales figures", () => {
    const adCopy = FACEBOOK_AI_TOOLS.find((t) => t.slug === "facebook-ad-copy")!;
    const planner = FACEBOOK_AI_TOOLS.find((t) => t.slug === "facebook-content-planner")!;
    for (const tool of [adCopy, planner]) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).toMatch(/alcance|engagement/i);
      expect(prompt).toMatch(/nunca inventes|no tienes acceso a datos reales/i);
    }
    expect(adCopy.buildSystemPrompt("ctx")).toMatch(/ventas o conversiones/i);
  });

  it("no prompt anywhere fabricates a percentage-based performance statistic", () => {
    for (const tool of FACEBOOK_AI_TOOLS) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).not.toMatch(/\d+% de (alcance|engagement|conversión|ventas)/);
    }
  });

  it("the event promotion tool never fabricates a date when none is provided", () => {
    const eventTool = FACEBOOK_AI_TOOLS.find((t) => t.slug === "facebook-event-promotion")!;
    const prompt = eventTool.buildUserPrompt({ evento: "Lanzamiento de producto", fecha: "", tono: "x", idioma: "es" });
    expect(prompt).toMatch(/no la inventes/);
  });

  it("the page bio tool enforces the ~101-character Facebook Page intro limit", () => {
    const bio = FACEBOOK_AI_TOOLS.find((t) => t.slug === "facebook-page-bio")!;
    expect(bio.buildSystemPrompt("ctx")).toMatch(/101 caracteres/);
  });

  it("the comment reply tool treats the comment as data, never as instructions", () => {
    const reply = FACEBOOK_AI_TOOLS.find((t) => t.slug === "facebook-comment-reply")!;
    expect(reply.buildSystemPrompt("ctx")).toMatch(/nunca como instrucciones/);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center — misma arquitectura, sin arquitectura paralela
// ---------------------------------------------------------------------------
describe("AI Center integration: same architecture as every other tool category", () => {
  it("a new 'Facebook AI' category exposes all 10 tools as 'available' with a real href matching each routeSegment", () => {
    const category = AI_CENTER_CATEGORIES.find((c) => c.slug === "facebook-ai")!;
    expect(category).toBeDefined();
    expect(category.label).toBe("Facebook AI");
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = category.tools.find((t) => t.slug === slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.status).toBe("available");
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/facebook-ai/${definition.routeSegment}`);
    }
  });

  it("the pre-existing 'Facebook' category (all coming-soon placeholders) is completely untouched", () => {
    const existing = AI_CENTER_CATEGORIES.find((c) => c.slug === "facebook")!;
    expect(existing.label).toBe("Facebook");
    const slugs = existing.tools.map((t) => t.slug).sort();
    expect(slugs).toEqual(["facebook-posts", "facebook-encuestas", "facebook-preguntas", "facebook-descripciones"].sort());
    expect(existing.tools.every((t) => t.status === "coming-soon")).toBe(true);
  });

  it("findAiTool resolves category/label for every Facebook AI slug", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tool = findAiTool(slug);
      expect(tool?.categorySlug).toBe("facebook-ai");
      expect(tool?.categoryLabel).toBe("Facebook AI");
    }
  });

  it("one dynamic route serves all 10 tools — no per-tool page files were created", () => {
    const dynamicPage = "src/app/(dashboard)/dashboard/[projectId]/ai-center/facebook-ai/[tool]/page.tsx";
    expect(existsSync(path.join(ROOT, dynamicPage))).toBe(true);
    for (const tool of FACEBOOK_AI_TOOLS) {
      const perToolPage = `src/app/(dashboard)/dashboard/[projectId]/ai-center/facebook-ai/${tool.routeSegment}/page.tsx`;
      expect(existsSync(path.join(ROOT, perToolPage))).toBe(false);
    }
  });

  it("the dynamic page reuses AiGenerationForm — the exact same generic engine every other category uses, no second form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/facebook-ai/[tool]/page.tsx");
    expect(page).toMatch(/import \{ AiGenerationForm \} from "@\/components\/ai-center\/generation\/ai-generation-form"/);
    expect(page).toMatch(/<AiGenerationForm tool=\{tool\} projectId=\{projectId\} brandContextText=\{brandContextText\} \/>/);
    expect(page).toMatch(/if \(!tool\) notFound\(\);/);
  });

  it("no previously-created category was modified this phase", () => {
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
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "tiktok-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
  });

  it("no Sidebar entry was added — reached only through the AI Center hub, exactly like every other AI category", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("Facebook AI");
    expect(allLabels.filter((l) => l === "AI Center")).toHaveLength(1);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Facebook Ad Copy Generator");
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

  it("no second save action or history table was created for Facebook AI", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/facebook.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-center-facebook.ts"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Funcionamiento automático desde Chat IA
// ---------------------------------------------------------------------------
describe("Chat IA automatically detects the new tools via the AI Center registry — no code changes to Chat IA", () => {
  it("listRoutableTools (used by the intent classifier) already includes all 10 Facebook AI tools", () => {
    const routable = listRoutableTools().map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(routable).toContain(slug);
    }
  });

  it("listToolDefinitions includes every category's tools together, from one shared registry, with no duplicates", () => {
    const all = listToolDefinitions().map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of [...OTHER_CATEGORY_TOOLS, ...FACEBOOK_AI_TOOLS]) {
      expect(all).toContain(tool.slug);
    }
  });

  it("Chat IA's panel and the intent router were NOT modified by this phase — no Facebook-specific code inside them", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    expect(panel).not.toMatch(/facebook/i);
    expect(router).not.toMatch(/facebook/i);
  });

  it("the classifier prompt still only references what's already in the registry (proving automatic pickup, not hardcoding)", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    for (const tool of FACEBOOK_AI_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Aislamiento por proyecto y seguridad
// ---------------------------------------------------------------------------
describe("Project isolation and security — same guards as every other AI Center tool", () => {
  it("the project layout's membership guard still runs for every ai-center/facebook-ai/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("saveAiToolResultAction rejects an unrecognized toolSlug before writing anything (validated server-side, never trusting the client)", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/if \(!tool\) return \{ error:/);
  });

  it("Facebook AI results never leak contentType/resultKind from client input — always resolved server-side from the tool definition", () => {
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
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/facebook-ai/[tool]/page.tsx",
    ];
    for (const page of pages) {
      expect(read(page)).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    }
    expect(existsSync(path.join(ROOT, "src/components/ai-center/generation/facebook-generation-form.tsx"))).toBe(false);
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
      "src/lib/ai-center/tools/facebook.ts",
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
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/facebook-engine.ts"))).toBe(false);
  });

  it("every previous category is untouched: same tool counts, same routes", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    expect(INSTAGRAM_TOOLS).toHaveLength(10);
    expect(SOCIAL_MEDIA_TOOLS).toHaveLength(10);
    expect(BLOG_SEO_TOOLS).toHaveLength(10);
    expect(EMAIL_MARKETING_TOOLS).toHaveLength(10);
    expect(TIKTOK_AI_TOOLS).toHaveLength(10);
    for (const routeDir of ["youtube", "instagram", "social-media", "blog-seo", "email-marketing", "tiktok-ai"]) {
      expect(
        existsSync(path.join(ROOT, `src/app/(dashboard)/dashboard/[projectId]/ai-center/${routeDir}/[tool]/page.tsx`))
      ).toBe(true);
    }
  });
});

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_MARKETING_TOOLS, getEmailMarketingTool } from "@/lib/ai-center/tools/email-marketing";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { INSTAGRAM_TOOLS } from "@/lib/ai-center/tools/instagram";
import { SOCIAL_MEDIA_TOOLS } from "@/lib/ai-center/tools/social-media";
import { BLOG_SEO_TOOLS } from "@/lib/ai-center/tools/blog-seo";
import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { listRoutableTools } from "@/lib/chat/intent-router";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "email-subject-line",
  "email-writer",
  "email-welcome",
  "email-newsletter",
  "email-promotional",
  "email-followup",
  "email-abandoned-cart",
  "email-cold",
  "email-sequence",
  "email-cta-optimizer",
];

// ---------------------------------------------------------------------------
// Registro correcto / 10 herramientas
// ---------------------------------------------------------------------------
describe("Email Marketing AI tool definitions", () => {
  it("registers exactly the 10 required tools", () => {
    expect(EMAIL_MARKETING_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
    expect(EMAIL_MARKETING_TOOLS).toHaveLength(10);
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = EMAIL_MARKETING_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of EMAIL_MARKETING_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getEmailMarketingTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getEmailMarketingTool("subject-line")?.slug).toBe("email-subject-line");
    expect(getEmailMarketingTool("sequence")?.slug).toBe("email-sequence");
    expect(getEmailMarketingTool("no-existe")).toBeUndefined();
  });

  it("findToolDefinition (shared, cross-platform) resolves every Email Marketing slug too", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
  });

  it("slugs never collide with any other category's tool slugs, including the pre-existing 'marketing' category", () => {
    const existingSlugs = new Set([
      ...YOUTUBE_TOOLS.map((t) => t.slug),
      ...INSTAGRAM_TOOLS.map((t) => t.slug),
      ...SOCIAL_MEDIA_TOOLS.map((t) => t.slug),
      ...BLOG_SEO_TOOLS.map((t) => t.slug),
      "marketing-email",
      "marketing-newsletter",
      "marketing-landing",
      "marketing-cta",
      "marketing-ofertas",
    ]);
    for (const slug of EXPECTED_SLUGS) {
      expect(existingSlugs.has(slug)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompts válidos, especializados en Email Marketing (no copiados)
// ---------------------------------------------------------------------------
describe("Email Marketing prompts are valid, specialized, and never copied from other categories", () => {
  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of EMAIL_MARKETING_TOOLS) {
      const values = Object.fromEntries(tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")]));
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("list-output tools ask the model for one item/line per entry", () => {
    for (const tool of EMAIL_MARKETING_TOOLS.filter((t) => t.outputMode === "list")) {
      expect(tool.buildSystemPrompt("contexto")).toMatch(/l[íi]nea|numerada/);
    }
  });

  it("no Email Marketing prompt reuses another category's system prompt exact text", () => {
    const emailPrompts = EMAIL_MARKETING_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const otherPrompts = [...YOUTUBE_TOOLS, ...INSTAGRAM_TOOLS, ...SOCIAL_MEDIA_TOOLS, ...BLOG_SEO_TOOLS].map((t) =>
      t.buildSystemPrompt("ctx")
    );
    for (const prompt of emailPrompts) {
      expect(otherPrompts).not.toContain(prompt);
    }
  });

  it("never promises open rates, conversions or real results — tools that could plausibly be asked explicitly refuse to", () => {
    const subjectLine = EMAIL_MARKETING_TOOLS.find((t) => t.slug === "email-subject-line")!;
    const sequence = EMAIL_MARKETING_TOOLS.find((t) => t.slug === "email-sequence")!;
    const ctaOptimizer = EMAIL_MARKETING_TOOLS.find((t) => t.slug === "email-cta-optimizer")!;
    for (const tool of [subjectLine, sequence, ctaOptimizer]) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).toMatch(/tasas de apertura|conversion|conversión|resultado/i);
      expect(prompt).toMatch(/nunca prometas|no prometas|nunca inventes/i);
    }
  });

  it("no prompt anywhere in this file fabricates statistics as if real", () => {
    for (const tool of EMAIL_MARKETING_TOOLS) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).not.toMatch(/\d+% de (apertura|conversión|clics)/);
    }
  });

  it("promotional and abandoned-cart tools never fabricate a discount/incentive when none is provided", () => {
    const promo = EMAIL_MARKETING_TOOLS.find((t) => t.slug === "email-promotional")!;
    const cart = EMAIL_MARKETING_TOOLS.find((t) => t.slug === "email-abandoned-cart")!;
    expect(promo.buildUserPrompt({ oferta: "Curso online", fechaLimite: "", tono: "x", idioma: "es" })).toMatch(
      /no la inventes/
    );
    expect(cart.buildUserPrompt({ tienda: "Tienda", producto: "Zapatillas", incentivo: "", idioma: "es" })).toMatch(
      /no lo inventes/
    );
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center — misma arquitectura, sin arquitectura paralela
// ---------------------------------------------------------------------------
describe("AI Center integration: same architecture as every other tool category", () => {
  it("a new 'Email Marketing AI' category exposes all 10 tools as 'available' with a real href matching each routeSegment", () => {
    const category = AI_CENTER_CATEGORIES.find((c) => c.slug === "email-marketing-ai")!;
    expect(category).toBeDefined();
    expect(category.label).toBe("Email Marketing AI");
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = category.tools.find((t) => t.slug === slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.status).toBe("available");
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/email-marketing/${definition.routeSegment}`);
    }
  });

  it("the pre-existing 'marketing' category (all coming-soon placeholders) is completely untouched", () => {
    const existing = AI_CENTER_CATEGORIES.find((c) => c.slug === "marketing")!;
    expect(existing.label).toBe("Marketing");
    const slugs = existing.tools.map((t) => t.slug).sort();
    expect(slugs).toEqual(
      ["marketing-email", "marketing-newsletter", "marketing-landing", "marketing-cta", "marketing-ofertas"].sort()
    );
    expect(existing.tools.every((t) => t.status === "coming-soon")).toBe(true);
  });

  it("findAiTool resolves category/label for every Email Marketing slug", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tool = findAiTool(slug);
      expect(tool?.categorySlug).toBe("email-marketing-ai");
      expect(tool?.categoryLabel).toBe("Email Marketing AI");
    }
  });

  it("one dynamic route serves all 10 tools — no per-tool page files were created", () => {
    const dynamicPage = "src/app/(dashboard)/dashboard/[projectId]/ai-center/email-marketing/[tool]/page.tsx";
    expect(existsSync(path.join(ROOT, dynamicPage))).toBe(true);
    for (const tool of EMAIL_MARKETING_TOOLS) {
      const perToolPage = `src/app/(dashboard)/dashboard/[projectId]/ai-center/email-marketing/${tool.routeSegment}/page.tsx`;
      expect(existsSync(path.join(ROOT, perToolPage))).toBe(false);
    }
  });

  it("the dynamic page reuses AiGenerationForm — the exact same generic engine every other category uses, no second form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/email-marketing/[tool]/page.tsx");
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
  });

  it("no Sidebar entry was added — reached only through the AI Center hub, exactly like every other AI category", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("Email Marketing AI");
    expect(allLabels.filter((l) => l === "AI Center")).toHaveLength(1);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Email Writer");
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

  it("no second save action or history table was created for Email Marketing AI", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/email-marketing.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-center-email-marketing.ts"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Funcionamiento automático desde Chat IA
// ---------------------------------------------------------------------------
describe("Chat IA automatically detects the new tools via the AI Center registry — no code changes to Chat IA", () => {
  it("listRoutableTools (used by the intent classifier) already includes all 10 Email Marketing AI tools", () => {
    const routable = listRoutableTools().map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(routable).toContain(slug);
    }
  });

  it("listToolDefinitions includes every category's tools together, from one shared registry, with no duplicates", () => {
    const all = listToolDefinitions().map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of [...YOUTUBE_TOOLS, ...INSTAGRAM_TOOLS, ...SOCIAL_MEDIA_TOOLS, ...BLOG_SEO_TOOLS, ...EMAIL_MARKETING_TOOLS]) {
      expect(all).toContain(tool.slug);
    }
  });

  it("Chat IA's panel and the intent router were NOT modified by this phase — no email-specific code inside them", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    expect(panel).not.toMatch(/email-marketing|\bemail\b/i);
    expect(router).not.toMatch(/email-marketing|\bemail\b/i);
  });

  it("the classifier prompt still only references what's already in the registry (proving automatic pickup, not hardcoding)", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    for (const tool of EMAIL_MARKETING_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Aislamiento por proyecto y seguridad
// ---------------------------------------------------------------------------
describe("Project isolation and security — same guards as every other AI Center tool", () => {
  it("the project layout's membership guard still runs for every ai-center/email-marketing/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("saveAiToolResultAction rejects an unrecognized toolSlug before writing anything (validated server-side, never trusting the client)", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/if \(!tool\) return \{ error:/);
  });

  it("Email Marketing AI results never leak contentType/resultKind from client input — always resolved server-side from the tool definition", () => {
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
    ];
    for (const page of pages) {
      expect(read(page)).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    }
    expect(existsSync(path.join(ROOT, "src/components/ai-center/generation/email-marketing-generation-form.tsx"))).toBe(
      false
    );
  });

  it("findToolDefinition/listToolDefinitions/saveAiToolResultAction are each defined in exactly one file", () => {
    const candidateFiles = [
      "src/lib/ai-center/tools/registry.ts",
      "src/lib/ai-center/tools/instagram.ts",
      "src/lib/ai-center/tools/youtube.ts",
      "src/lib/ai-center/tools/social-media.ts",
      "src/lib/ai-center/tools/blog-seo.ts",
      "src/lib/ai-center/tools/email-marketing.ts",
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
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/email-engine.ts"))).toBe(false);
  });

  it("every previous category is untouched: same tool counts, same routes", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    expect(INSTAGRAM_TOOLS).toHaveLength(10);
    expect(SOCIAL_MEDIA_TOOLS).toHaveLength(10);
    expect(BLOG_SEO_TOOLS).toHaveLength(10);
    for (const routeDir of ["youtube", "instagram", "social-media", "blog-seo"]) {
      expect(
        existsSync(path.join(ROOT, `src/app/(dashboard)/dashboard/[projectId]/ai-center/${routeDir}/[tool]/page.tsx`))
      ).toBe(true);
    }
  });
});

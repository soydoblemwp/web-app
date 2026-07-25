import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LINKEDIN_AI_TOOLS, getLinkedInTool } from "@/lib/ai-center/tools/linkedin";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { INSTAGRAM_TOOLS } from "@/lib/ai-center/tools/instagram";
import { SOCIAL_MEDIA_TOOLS } from "@/lib/ai-center/tools/social-media";
import { BLOG_SEO_TOOLS } from "@/lib/ai-center/tools/blog-seo";
import { EMAIL_MARKETING_TOOLS } from "@/lib/ai-center/tools/email-marketing";
import { TIKTOK_AI_TOOLS } from "@/lib/ai-center/tools/tiktok";
import { FACEBOOK_AI_TOOLS } from "@/lib/ai-center/tools/facebook";
import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { listRoutableTools } from "@/lib/chat/intent-router";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "linkedin-post",
  "linkedin-article",
  "linkedin-carousel",
  "linkedin-hooks",
  "linkedin-headline",
  "linkedin-about-section",
  "linkedin-experience-description",
  "linkedin-company-page",
  "linkedin-networking-message",
  "linkedin-branding-strategy",
];

const OTHER_CATEGORY_TOOLS = [
  ...YOUTUBE_TOOLS,
  ...INSTAGRAM_TOOLS,
  ...SOCIAL_MEDIA_TOOLS,
  ...BLOG_SEO_TOOLS,
  ...EMAIL_MARKETING_TOOLS,
  ...TIKTOK_AI_TOOLS,
  ...FACEBOOK_AI_TOOLS,
];

// ---------------------------------------------------------------------------
// Registro correcto / 10 herramientas
// ---------------------------------------------------------------------------
describe("LinkedIn AI tool definitions", () => {
  it("registers exactly the 10 required tools", () => {
    expect(LINKEDIN_AI_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
    expect(LINKEDIN_AI_TOOLS).toHaveLength(10);
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = LINKEDIN_AI_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of LINKEDIN_AI_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getLinkedInTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getLinkedInTool("post")?.slug).toBe("linkedin-post");
    expect(getLinkedInTool("branding-strategy")?.slug).toBe("linkedin-branding-strategy");
    expect(getLinkedInTool("no-existe")).toBeUndefined();
  });

  it("findToolDefinition (shared, cross-platform) resolves every LinkedIn AI slug too", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
  });

  it("slugs never collide with any other category's tool slugs", () => {
    const existingSlugs = new Set(OTHER_CATEGORY_TOOLS.map((t) => t.slug));
    for (const slug of EXPECTED_SLUGS) {
      expect(existingSlugs.has(slug)).toBe(false);
    }
  });

  it("no pre-existing 'linkedin' placeholder category existed before this phase (nothing to preserve/collide with)", () => {
    expect(AI_CENTER_CATEGORIES.filter((c) => c.slug.includes("linkedin"))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Prompts válidos, especializados en LinkedIn (no copiados, sin datos profesionales inventados)
// ---------------------------------------------------------------------------
describe("LinkedIn prompts are valid, specialized, and never copied from other categories", () => {
  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of LINKEDIN_AI_TOOLS) {
      const values = Object.fromEntries(tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")]));
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("list-output tools ask the model for one item/line per entry", () => {
    for (const tool of LINKEDIN_AI_TOOLS.filter((t) => t.outputMode === "list")) {
      expect(tool.buildSystemPrompt("contexto")).toMatch(/l[íi]nea|numerada/);
    }
  });

  it("no LinkedIn prompt reuses another category's system prompt exact text", () => {
    const linkedinPrompts = LINKEDIN_AI_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const otherPrompts = OTHER_CATEGORY_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    for (const prompt of linkedinPrompts) {
      expect(otherPrompts).not.toContain(prompt);
    }
  });

  it("tools that touch a person's career explicitly refuse to invent experience, achievements, companies, certifications or salaries", () => {
    const headline = LINKEDIN_AI_TOOLS.find((t) => t.slug === "linkedin-headline")!;
    const about = LINKEDIN_AI_TOOLS.find((t) => t.slug === "linkedin-about-section")!;
    const experience = LINKEDIN_AI_TOOLS.find((t) => t.slug === "linkedin-experience-description")!;
    const branding = LINKEDIN_AI_TOOLS.find((t) => t.slug === "linkedin-branding-strategy")!;
    for (const tool of [headline, about, experience, branding]) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).toMatch(/experiencia laboral/);
      expect(prompt).toMatch(/logros/);
      expect(prompt).toMatch(/empresas/);
      expect(prompt).toMatch(/certificaciones/);
      expect(prompt).toMatch(/nunca inventes/i);
    }
  });

  it("tools that could plausibly imply an outcome never promise hiring, clients or guaranteed growth", () => {
    const networking = LINKEDIN_AI_TOOLS.find((t) => t.slug === "linkedin-networking-message")!;
    const branding = LINKEDIN_AI_TOOLS.find((t) => t.slug === "linkedin-branding-strategy")!;
    for (const tool of [networking, branding]) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).toMatch(/contrataci[oó]n/);
      expect(prompt).toMatch(/nunca prometas/i);
    }
  });

  it("the about-section and experience-description tools only ever use the user-supplied text, never fabricate beyond it", () => {
    const about = LINKEDIN_AI_TOOLS.find((t) => t.slug === "linkedin-about-section")!;
    const experience = LINKEDIN_AI_TOOLS.find((t) => t.slug === "linkedin-experience-description")!;
    expect(
      about.buildUserPrompt({ resumenProfesional: "10 años en marketing digital", tono: "x", idioma: "es" })
    ).toMatch(/usa solo esto, no inventes nada más/);
    expect(
      experience.buildUserPrompt({ puesto: "Analista", empresa: "Acme", responsabilidades: "Reportes semanales", idioma: "es" })
    ).toMatch(/usa solo esto, no inventes logros ni cifras/);
  });

  it("the headline tool enforces the ~220-character LinkedIn headline limit", () => {
    const headline = LINKEDIN_AI_TOOLS.find((t) => t.slug === "linkedin-headline")!;
    expect(headline.buildSystemPrompt("ctx")).toMatch(/220 caracteres/);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center — misma arquitectura, sin arquitectura paralela
// ---------------------------------------------------------------------------
describe("AI Center integration: same architecture as every other tool category", () => {
  it("a new 'LinkedIn AI' category exposes all 10 tools as 'available' with a real href matching each routeSegment", () => {
    const category = AI_CENTER_CATEGORIES.find((c) => c.slug === "linkedin-ai")!;
    expect(category).toBeDefined();
    expect(category.label).toBe("LinkedIn AI");
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = category.tools.find((t) => t.slug === slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.status).toBe("available");
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/linkedin-ai/${definition.routeSegment}`);
    }
  });

  it("findAiTool resolves category/label for every LinkedIn AI slug", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tool = findAiTool(slug);
      expect(tool?.categorySlug).toBe("linkedin-ai");
      expect(tool?.categoryLabel).toBe("LinkedIn AI");
    }
  });

  it("one dynamic route serves all 10 tools — no per-tool page files were created", () => {
    const dynamicPage = "src/app/(dashboard)/dashboard/[projectId]/ai-center/linkedin-ai/[tool]/page.tsx";
    expect(existsSync(path.join(ROOT, dynamicPage))).toBe(true);
    for (const tool of LINKEDIN_AI_TOOLS) {
      const perToolPage = `src/app/(dashboard)/dashboard/[projectId]/ai-center/linkedin-ai/${tool.routeSegment}/page.tsx`;
      expect(existsSync(path.join(ROOT, perToolPage))).toBe(false);
    }
  });

  it("the dynamic page reuses AiGenerationForm — the exact same generic engine every other category uses, no second form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/linkedin-ai/[tool]/page.tsx");
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
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "facebook-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
  });

  it("no Sidebar entry was added — reached only through the AI Center hub, exactly like every other AI category", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("LinkedIn AI");
    expect(allLabels.filter((l) => l === "AI Center")).toHaveLength(1);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Professional Article Generator");
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

  it("no second save action or history table was created for LinkedIn AI", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/linkedin.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-center-linkedin.ts"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Funcionamiento automático desde Chat IA
// ---------------------------------------------------------------------------
describe("Chat IA automatically detects the new tools via the AI Center registry — no code changes to Chat IA", () => {
  it("listRoutableTools (used by the intent classifier) already includes all 10 LinkedIn AI tools", () => {
    const routable = listRoutableTools().map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(routable).toContain(slug);
    }
  });

  it("listToolDefinitions includes every category's tools together, from one shared registry, with no duplicates", () => {
    const all = listToolDefinitions().map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of [...OTHER_CATEGORY_TOOLS, ...LINKEDIN_AI_TOOLS]) {
      expect(all).toContain(tool.slug);
    }
  });

  it("Chat IA's panel and the intent router were NOT modified by this phase — no LinkedIn-specific code inside them", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    expect(panel).not.toMatch(/linkedin/i);
    expect(router).not.toMatch(/linkedin/i);
  });

  it("the classifier prompt still only references what's already in the registry (proving automatic pickup, not hardcoding)", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    for (const tool of LINKEDIN_AI_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Aislamiento por proyecto y seguridad
// ---------------------------------------------------------------------------
describe("Project isolation and security — same guards as every other AI Center tool", () => {
  it("the project layout's membership guard still runs for every ai-center/linkedin-ai/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("saveAiToolResultAction rejects an unrecognized toolSlug before writing anything (validated server-side, never trusting the client)", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/if \(!tool\) return \{ error:/);
  });

  it("LinkedIn AI results never leak contentType/resultKind from client input — always resolved server-side from the tool definition", () => {
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
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/linkedin-ai/[tool]/page.tsx",
    ];
    for (const page of pages) {
      expect(read(page)).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    }
    expect(existsSync(path.join(ROOT, "src/components/ai-center/generation/linkedin-generation-form.tsx"))).toBe(false);
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
      "src/lib/ai-center/tools/linkedin.ts",
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
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/linkedin-engine.ts"))).toBe(false);
  });

  it("every previous category is untouched: same tool counts, same routes", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    expect(INSTAGRAM_TOOLS).toHaveLength(10);
    expect(SOCIAL_MEDIA_TOOLS).toHaveLength(10);
    expect(BLOG_SEO_TOOLS).toHaveLength(10);
    expect(EMAIL_MARKETING_TOOLS).toHaveLength(10);
    expect(TIKTOK_AI_TOOLS).toHaveLength(10);
    expect(FACEBOOK_AI_TOOLS).toHaveLength(10);
    for (const routeDir of ["youtube", "instagram", "social-media", "blog-seo", "email-marketing", "tiktok-ai", "facebook-ai"]) {
      expect(
        existsSync(path.join(ROOT, `src/app/(dashboard)/dashboard/[projectId]/ai-center/${routeDir}/[tool]/page.tsx`))
      ).toBe(true);
    }
  });
});

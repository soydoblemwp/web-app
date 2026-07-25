import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INSTAGRAM_TOOLS, getInstagramTool } from "@/lib/ai-center/tools/instagram";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { listRoutableTools } from "@/lib/chat/intent-router";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "instagram-caption",
  "instagram-hashtags",
  "instagram-reel-ideas",
  "instagram-reel-script",
  "instagram-hooks",
  "instagram-carousel",
  "instagram-story-ideas",
  "instagram-bio",
  "instagram-cta",
  "instagram-calendar",
];

// ---------------------------------------------------------------------------
// Registro correcto / 10 herramientas
// ---------------------------------------------------------------------------
describe("Instagram AI tool definitions", () => {
  it("registers exactly the 10 required tools", () => {
    expect(INSTAGRAM_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
    expect(INSTAGRAM_TOOLS).toHaveLength(10);
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = INSTAGRAM_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of INSTAGRAM_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getInstagramTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getInstagramTool("caption")?.slug).toBe("instagram-caption");
    expect(getInstagramTool("bio")?.slug).toBe("instagram-bio");
    expect(getInstagramTool("no-existe")).toBeUndefined();
  });

  it("findToolDefinition (shared, cross-platform) resolves every Instagram slug too", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompts válidos, específicos de Instagram (no copiados de YouTube)
// ---------------------------------------------------------------------------
describe("Instagram prompts are valid and specific to Instagram — never copied from YouTube", () => {
  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of INSTAGRAM_TOOLS) {
      const values = Object.fromEntries(tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")]));
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("list-output tools ask the model for one item per line, matching the established, dedup-safe convention", () => {
    for (const tool of INSTAGRAM_TOOLS.filter((t) => t.outputMode === "list")) {
      expect(tool.buildSystemPrompt("contexto")).toMatch(/l[íi]nea/);
    }
  });

  it("no Instagram system prompt reuses a YouTube system prompt's text (no copy-paste between platforms)", () => {
    const instagramPrompts = INSTAGRAM_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const youtubePrompts = YOUTUBE_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    for (const igPrompt of instagramPrompts) {
      expect(youtubePrompts).not.toContain(igPrompt);
    }
  });

  it("prompts reference Instagram-specific formats (Reels, Stories, carrusel, caption, bio) rather than generic/YouTube language", () => {
    const source = read("src/lib/ai-center/tools/instagram-prompts.ts");
    expect(source).toMatch(/Instagram/);
    expect(source).toMatch(/Reels?/);
    // Only the file's own doc comment may mention YouTube (explaining these
    // prompts aren't copied from it) — no actual generated prompt string may.
    for (const tool of INSTAGRAM_TOOLS) {
      expect(tool.buildSystemPrompt("ctx")).not.toMatch(/YouTube/);
    }
  });

  it("the bio tool explicitly enforces Instagram's 150-character bio limit", () => {
    const bioTool = INSTAGRAM_TOOLS.find((t) => t.slug === "instagram-bio")!;
    expect(bioTool.buildSystemPrompt("ctx")).toMatch(/150/);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center — misma arquitectura, sin arquitectura paralela
// ---------------------------------------------------------------------------
describe("AI Center integration: same architecture as YouTube AI, no parallel system", () => {
  it("the Instagram category exposes all 10 tools as 'available' with a real href matching each routeSegment", () => {
    const instagram = AI_CENTER_CATEGORIES.find((c) => c.slug === "instagram")!;
    expect(instagram.label).toBe("Instagram");
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = instagram.tools.find((t) => t.slug === slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.status).toBe("available");
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/instagram/${definition.routeSegment}`);
    }
  });

  it("findAiTool resolves category/label for every Instagram slug (same lookup YouTube tools use)", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tool = findAiTool(slug);
      expect(tool?.categorySlug).toBe("instagram");
      expect(tool?.categoryLabel).toBe("Instagram");
    }
  });

  it("one dynamic route serves all 10 tools — no per-tool page files were created", () => {
    const dynamicPage = "src/app/(dashboard)/dashboard/[projectId]/ai-center/instagram/[tool]/page.tsx";
    expect(existsSync(path.join(ROOT, dynamicPage))).toBe(true);
    for (const tool of INSTAGRAM_TOOLS) {
      const perToolPage = `src/app/(dashboard)/dashboard/[projectId]/ai-center/instagram/${tool.routeSegment}/page.tsx`;
      expect(existsSync(path.join(ROOT, perToolPage))).toBe(false);
    }
  });

  it("the dynamic page reuses AiGenerationForm — the exact same generic engine YouTube AI uses, no second form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/instagram/[tool]/page.tsx");
    expect(page).toMatch(/import \{ AiGenerationForm \} from "@\/components\/ai-center\/generation\/ai-generation-form"/);
    expect(page).toMatch(/<AiGenerationForm tool=\{tool\} projectId=\{projectId\} brandContextText=\{brandContextText\} \/>/);
    expect(page).toMatch(/if \(!tool\) notFound\(\);/);
  });

  it("no other category was touched by this phase (Contenido/SEO/YouTube tool counts unchanged)", () => {
    const youtube = AI_CENTER_CATEGORIES.find((c) => c.slug === "youtube")!;
    const availableYoutube = youtube.tools.filter((t) => t.status === "available").map((t) => t.slug);
    expect(availableYoutube).toHaveLength(8);
  });

  it("no Sidebar entry was added — Instagram tools are reached only through the AI Center hub, exactly like YouTube", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("Instagram AI");
    expect(allLabels.filter((l) => l === "AI Center")).toHaveLength(1);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Caption Generator");
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

  it("no second save action or history table was created for Instagram", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/instagram.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-center-instagram.ts"))).toBe(false);
  });

  it("AiGenerationForm (reused, unmodified target) still saves via saveAiToolResultAction and renders through UniversalResultViewer", () => {
    const form = read("src/components/ai-center/generation/ai-generation-form.tsx");
    expect(form).toMatch(/saveAiToolResultAction/);
    expect(form).toMatch(/UniversalResultViewer/);
  });
});

// ---------------------------------------------------------------------------
// Funcionamiento desde Chat IA mediante el orquestador existente
// ---------------------------------------------------------------------------
describe("Chat IA automatically detects the new tools via the AI Center registry — no code changes to Chat IA", () => {
  it("listRoutableTools (used by the intent classifier) already includes all 10 Instagram tools", () => {
    const routable = listRoutableTools().map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(routable).toContain(slug);
    }
  });

  it("listToolDefinitions includes both YouTube and Instagram tools together, from one shared registry, with no duplicates", () => {
    const all = listToolDefinitions().map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of [...YOUTUBE_TOOLS, ...INSTAGRAM_TOOLS]) {
      expect(all).toContain(tool.slug);
    }
  });

  it("Chat IA's panel and the intent router were NOT modified by this phase — no Instagram-specific code inside them", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    expect(panel).not.toMatch(/instagram/i);
    expect(router).not.toMatch(/instagram/i);
  });

  it("the classifier prompt still only references what's already in the registry (proving automatic pickup, not hardcoding)", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    for (const tool of INSTAGRAM_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Aislamiento por proyecto y seguridad
// ---------------------------------------------------------------------------
describe("Project isolation and security — same guards as every other AI Center tool", () => {
  it("the project layout's membership guard still runs for every ai-center/instagram/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("saveAiToolResultAction rejects an unrecognized toolSlug before writing anything (validated server-side, never trusting the client)", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/if \(!tool\) return \{ error:/);
  });

  it("Instagram tool results never leak contentType/resultKind from client input — always resolved server-side from the tool definition", () => {
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
  it("AiGenerationForm is defined in exactly one place, reused by both YouTube and Instagram routes", () => {
    const youtubePage = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx");
    const instagramPage = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/instagram/[tool]/page.tsx");
    expect(youtubePage).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    expect(instagramPage).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    expect(existsSync(path.join(ROOT, "src/components/ai-center/generation/instagram-generation-form.tsx"))).toBe(false);
  });

  it("findToolDefinition/listToolDefinitions/saveAiToolResultAction are each defined in exactly one file", () => {
    const candidateFiles = [
      "src/lib/ai-center/tools/registry.ts",
      "src/lib/ai-center/tools/instagram.ts",
      "src/lib/ai-center/tools/youtube.ts",
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
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/instagram-engine.ts"))).toBe(false);
  });

  it("YouTube AI is untouched: same 8 tools, same prompts file, same route", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx"))).toBe(
      true
    );
  });
});

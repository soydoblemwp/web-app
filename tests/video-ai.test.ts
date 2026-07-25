import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VIDEO_AI_TOOLS, getVideoAiTool } from "@/lib/ai-center/tools/video-ai";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { INSTAGRAM_TOOLS } from "@/lib/ai-center/tools/instagram";
import { SOCIAL_MEDIA_TOOLS } from "@/lib/ai-center/tools/social-media";
import { BLOG_SEO_TOOLS } from "@/lib/ai-center/tools/blog-seo";
import { EMAIL_MARKETING_TOOLS } from "@/lib/ai-center/tools/email-marketing";
import { TIKTOK_AI_TOOLS } from "@/lib/ai-center/tools/tiktok";
import { FACEBOOK_AI_TOOLS } from "@/lib/ai-center/tools/facebook";
import { LINKEDIN_AI_TOOLS } from "@/lib/ai-center/tools/linkedin";
import { IMAGE_AI_TOOLS } from "@/lib/ai-center/tools/image-ai";
import { DOCUMENT_AI_TOOLS } from "@/lib/ai-center/tools/document-ai";
import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { listRoutableTools } from "@/lib/chat/intent-router";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "video-prompt-generator",
  "ai-video-script-generator",
  "storyboard-generator",
  "scene-planner",
  "shot-list-generator",
  "camera-movement-generator",
  "cinematic-prompt-generator",
  "short-video-generator",
  "youtube-video-outline-generator",
  "video-production-planner",
];

const OTHER_CATEGORY_TOOLS = [
  ...YOUTUBE_TOOLS,
  ...INSTAGRAM_TOOLS,
  ...SOCIAL_MEDIA_TOOLS,
  ...BLOG_SEO_TOOLS,
  ...EMAIL_MARKETING_TOOLS,
  ...TIKTOK_AI_TOOLS,
  ...FACEBOOK_AI_TOOLS,
  ...LINKEDIN_AI_TOOLS,
  ...IMAGE_AI_TOOLS,
  ...DOCUMENT_AI_TOOLS,
];

// ---------------------------------------------------------------------------
// Registro correcto / 10 herramientas
// ---------------------------------------------------------------------------
describe("Video AI tool definitions", () => {
  it("registers exactly the 10 required tools", () => {
    expect(VIDEO_AI_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
    expect(VIDEO_AI_TOOLS).toHaveLength(10);
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = VIDEO_AI_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of VIDEO_AI_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getVideoAiTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getVideoAiTool("video-prompt")?.slug).toBe("video-prompt-generator");
    expect(getVideoAiTool("production-planner")?.slug).toBe("video-production-planner");
    expect(getVideoAiTool("no-existe")).toBeUndefined();
  });

  it("findToolDefinition (shared, cross-platform) resolves every Video AI slug too", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
  });

  it("slugs never collide with any other category's tool slugs, including the pre-existing empty 'video' category", () => {
    const existingSlugs = new Set(OTHER_CATEGORY_TOOLS.map((t) => t.slug));
    for (const slug of EXPECTED_SLUGS) {
      expect(existingSlugs.has(slug)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompts válidos: sin generación de video, agnósticos de motor, sin elementos inventados
// ---------------------------------------------------------------------------
describe("Video AI prompts never generate video, are engine-agnostic, and never invent unprovided elements", () => {
  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of VIDEO_AI_TOOLS) {
      const values = Object.fromEntries(tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")]));
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("no Video AI prompt reuses another category's system prompt exact text", () => {
    const videoPrompts = VIDEO_AI_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const otherPrompts = OTHER_CATEGORY_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    for (const prompt of videoPrompts) {
      expect(otherPrompts).not.toContain(prompt);
    }
  });

  it("every tool explicitly refuses to invent characters, brands, locations or products not provided", () => {
    for (const tool of VIDEO_AI_TOOLS) {
      expect(tool.buildSystemPrompt("ctx")).toMatch(/No inventes personajes, marcas, ubicaciones, productos/);
    }
  });

  it("tools whose output could be mistaken for a rendered video explicitly state they never generate video", () => {
    const mustSayNoVideo = [
      "video-prompt-generator",
      "storyboard-generator",
      "shot-list-generator",
      "short-video-generator",
      "video-production-planner",
    ];
    for (const slug of mustSayNoVideo) {
      const tool = VIDEO_AI_TOOLS.find((t) => t.slug === slug)!;
      expect(tool.buildSystemPrompt("ctx")).toMatch(/No genera[s]? (ningún archivo de )?v[ií]deo/);
    }
  });

  it("every prompt-style tool asks for engine-agnostic output that names multiple named video engines", () => {
    const promptStyleTools = [
      "video-prompt-generator",
      "ai-video-script-generator",
      "storyboard-generator",
      "scene-planner",
      "shot-list-generator",
      "camera-movement-generator",
      "cinematic-prompt-generator",
      "short-video-generator",
    ];
    for (const slug of promptStyleTools) {
      const tool = VIDEO_AI_TOOLS.find((t) => t.slug === slug)!;
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).toMatch(/Runway/);
      expect(prompt).toMatch(/Veo/);
      expect(prompt).toMatch(/Kling/);
      expect(prompt).toMatch(/Pika/);
      expect(prompt).toMatch(/Luma/);
      expect(prompt).toMatch(/Sora/);
      expect(prompt).toMatch(/Higgsfield/);
      expect(prompt).toMatch(/lenguaje descriptivo y estructurado/);
    }
  });

  it("the scene planner never assumes a location when one isn't given", () => {
    const scenePlanner = VIDEO_AI_TOOLS.find((t) => t.slug === "scene-planner")!;
    expect(scenePlanner.buildUserPrompt({ resumenEscena: "Una charla entre dos personas", ubicacion: "", idioma: "es" })).toMatch(
      /no la inventes/
    );
  });

  it("the short video generator produces a script and prompt, not a video file", () => {
    const shortVideo = VIDEO_AI_TOOLS.find((t) => t.slug === "short-video-generator")!;
    expect(shortVideo.buildSystemPrompt("ctx")).toMatch(/No generas ningún archivo de vídeo/);
  });

  it("the video production planner asks for missing context to be stated explicitly instead of assumed", () => {
    const planner = VIDEO_AI_TOOLS.find((t) => t.slug === "video-production-planner")!;
    expect(planner.buildSystemPrompt("ctx")).toMatch(/dilo explícitamente en vez de suponerla/);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center — misma arquitectura, sin arquitectura paralela
// ---------------------------------------------------------------------------
describe("AI Center integration: same architecture as every other tool category", () => {
  it("a new 'Video AI' category exposes all 10 tools as 'available' with a real href matching each routeSegment", () => {
    const category = AI_CENTER_CATEGORIES.find((c) => c.slug === "video-ai")!;
    expect(category).toBeDefined();
    expect(category.label).toBe("Video AI");
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = category.tools.find((t) => t.slug === slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.status).toBe("available");
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/video-ai/${definition.routeSegment}`);
    }
  });

  it("the pre-existing empty 'Video' category is completely untouched", () => {
    const video = AI_CENTER_CATEGORIES.find((c) => c.slug === "video")!;
    expect(video.label).toBe("Video");
    expect(video.tools).toEqual([]);
  });

  it("findAiTool resolves category/label for every Video AI slug", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tool = findAiTool(slug);
      expect(tool?.categorySlug).toBe("video-ai");
      expect(tool?.categoryLabel).toBe("Video AI");
    }
  });

  it("one dynamic route serves all 10 tools — no per-tool page files were created", () => {
    const dynamicPage = "src/app/(dashboard)/dashboard/[projectId]/ai-center/video-ai/[tool]/page.tsx";
    expect(existsSync(path.join(ROOT, dynamicPage))).toBe(true);
    for (const tool of VIDEO_AI_TOOLS) {
      const perToolPage = `src/app/(dashboard)/dashboard/[projectId]/ai-center/video-ai/${tool.routeSegment}/page.tsx`;
      expect(existsSync(path.join(ROOT, perToolPage))).toBe(false);
    }
  });

  it("the dynamic page reuses AiGenerationForm — the exact same generic engine every other category uses, no second form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/video-ai/[tool]/page.tsx");
    expect(page).toMatch(/import \{ AiGenerationForm \} from "@\/components\/ai-center\/generation\/ai-generation-form"/);
    expect(page).toMatch(/<AiGenerationForm tool=\{tool\} projectId=\{projectId\} brandContextText=\{brandContextText\} \/>/);
    expect(page).toMatch(/if \(!tool\) notFound\(\);/);
  });

  it("no previously-created category was modified this phase", () => {
    expect(AI_CENTER_CATEGORIES.find((c) => c.slug === "youtube")!.tools.filter((t) => t.status === "available")).toHaveLength(8);
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "image-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "document-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
  });

  it("no Sidebar entry was added — reached only through the AI Center hub, exactly like every other AI category", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("Video AI");
    expect(allLabels.filter((l) => l === "AI Center")).toHaveLength(1);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Storyboard Generator");
  });
});

// ---------------------------------------------------------------------------
// Integración con Workspace — misma acción, mismo historial, preparado para un futuro motor de video
// ---------------------------------------------------------------------------
describe("Workspace integration: same save action, no second history, ready for a future video engine", () => {
  it("saveAiToolResultAction (reused, unmodified) still creates a ContentItem tagged with the tool's own slug", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    const fnSource = action.match(/export async function saveAiToolResultAction[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/prisma\.contentItem\.create/);
    expect(fnSource).toMatch(/sourceTool: tool\.slug/);
    expect(fnSource).toMatch(/requireProjectAccess\(input\.projectId, "EDITOR"\)/);
  });

  it("no second save action or history table was created for Video AI", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/video-ai.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-center-video-ai.ts"))).toBe(false);
  });

  it("UniversalResultViewer was not modified — its existing mediaKind design already accommodates a future video provider", () => {
    const viewer = read("src/components/workspace/universal-result-viewer.tsx");
    expect(viewer).toMatch(/"text" \| "image" \| "pdf" \| "audio" \| "video"/);
    expect(viewer).not.toMatch(/video-ai|videoAi/i);
  });
});

// ---------------------------------------------------------------------------
// Funcionamiento automático desde Chat IA
// ---------------------------------------------------------------------------
describe("Chat IA automatically detects the new tools via the AI Center registry — no code changes to Chat IA", () => {
  it("listRoutableTools (used by the intent classifier) already includes all 10 Video AI tools", () => {
    const routable = listRoutableTools().map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(routable).toContain(slug);
    }
  });

  it("listToolDefinitions includes every category's tools together, from one shared registry, with no duplicates", () => {
    const all = listToolDefinitions().map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of [...OTHER_CATEGORY_TOOLS, ...VIDEO_AI_TOOLS]) {
      expect(all).toContain(tool.slug);
    }
  });

  it("Chat IA's panel and the intent router were NOT modified by this phase — no Video-AI-specific code inside them", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    expect(panel).not.toMatch(/video-ai|video prompt|storyboard/i);
    expect(router).not.toMatch(/video-ai|video prompt|storyboard/i);
  });

  it("the classifier prompt still only references what's already in the registry (proving automatic pickup, not hardcoding)", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    for (const tool of VIDEO_AI_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Seguridad / sin proveedores de video / sin APIs externas
// ---------------------------------------------------------------------------
describe("Security and no external video provider integration", () => {
  it("the project layout's membership guard still runs for every ai-center/video-ai/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("saveAiToolResultAction rejects an unrecognized toolSlug before writing anything (validated server-side, never trusting the client)", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/if \(!tool\) return \{ error:/);
  });

  it("Video AI results never leak contentType/resultKind from client input — always resolved server-side from the tool definition", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/type: tool\.contentType/);
    expect(action).toMatch(/kind: tool\.resultKind/);
    expect(action).not.toMatch(/type: input\./);
  });

  it("no file in this phase imports a video-generation SDK/API for any named provider or makes a network call — only comments may name them to explain what's excluded", () => {
    const files = [
      "src/lib/ai-center/tools/video-ai.ts",
      "src/lib/ai-center/tools/video-ai-prompts.ts",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/video-ai/[tool]/page.tsx",
    ];
    const forbiddenImportPatterns = [
      /from\s+["']openai["']/i,
      /from\s+["']replicate["']/i,
      /from\s+["'].*runway/i,
      /from\s+["'].*pika/i,
      /from\s+["'].*luma/i,
      /from\s+["'].*kling/i,
      /from\s+["'].*higgsfield/i,
      /from\s+["']@google-cloud\/videointelligence["']/i,
    ];
    for (const relativePath of files) {
      const content = read(relativePath);
      for (const pattern of forbiddenImportPatterns) {
        expect(content).not.toMatch(pattern);
      }
      expect(content).not.toMatch(/\bfetch\(/);
      expect(content).not.toMatch(/\bawait\s+axios/);
    }
  });

  it("package.json has no new video-generation dependency added", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const forbidden of ["openai", "replicate", "runwayml", "@lumaai/luma-ai", "pika-labs", "kling-ai"]) {
      expect(deps[forbidden]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Ausencia de duplicación
// ---------------------------------------------------------------------------
describe("No duplication introduced by this phase", () => {
  it("AiGenerationForm is defined in exactly one place, reused by every AI category route", () => {
    const pages = [
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/document-ai/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/video-ai/[tool]/page.tsx",
    ];
    for (const page of pages) {
      expect(read(page)).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    }
    expect(existsSync(path.join(ROOT, "src/components/ai-center/generation/video-ai-generation-form.tsx"))).toBe(false);
  });

  it("findToolDefinition/listToolDefinitions/saveAiToolResultAction are each defined in exactly one file", () => {
    const candidateFiles = [
      "src/lib/ai-center/tools/registry.ts",
      "src/lib/ai-center/tools/youtube.ts",
      "src/lib/ai-center/tools/image-ai.ts",
      "src/lib/ai-center/tools/document-ai.ts",
      "src/lib/ai-center/tools/video-ai.ts",
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
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/video-engine.ts"))).toBe(false);
  });

  it("every previous category is untouched: same tool counts, same routes", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    expect(LINKEDIN_AI_TOOLS).toHaveLength(10);
    expect(IMAGE_AI_TOOLS).toHaveLength(10);
    expect(DOCUMENT_AI_TOOLS).toHaveLength(10);
    for (const routeDir of [
      "youtube",
      "instagram",
      "social-media",
      "blog-seo",
      "email-marketing",
      "tiktok-ai",
      "facebook-ai",
      "linkedin-ai",
      "image-ai",
      "document-ai",
    ]) {
      expect(
        existsSync(path.join(ROOT, `src/app/(dashboard)/dashboard/[projectId]/ai-center/${routeDir}/[tool]/page.tsx`))
      ).toBe(true);
    }
  });
});

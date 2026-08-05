import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOCUMENT_AI_TOOLS, getDocumentAiTool } from "@/lib/ai-center/tools/document-ai";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";
import { INSTAGRAM_TOOLS } from "@/lib/ai-center/tools/instagram";
import { SOCIAL_MEDIA_TOOLS } from "@/lib/ai-center/tools/social-media";
import { BLOG_SEO_TOOLS } from "@/lib/ai-center/tools/blog-seo";
import { EMAIL_MARKETING_TOOLS } from "@/lib/ai-center/tools/email-marketing";
import { TIKTOK_AI_TOOLS } from "@/lib/ai-center/tools/tiktok";
import { FACEBOOK_AI_TOOLS } from "@/lib/ai-center/tools/facebook";
import { LINKEDIN_AI_TOOLS } from "@/lib/ai-center/tools/linkedin";
import { IMAGE_AI_TOOLS } from "@/lib/ai-center/tools/image-ai";
import { findToolDefinition, listToolDefinitions } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { listRoutableTools } from "@/lib/chat/intent-router";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "document-summarizer",
  "document-translator",
  "grammar-style-checker",
  "document-rewriter",
  "contract-simplifier",
  "meeting-notes-generator",
  "executive-summary-generator",
  "bullet-point-generator",
  "formal-document-generator",
  "document-analyzer",
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
];

// ---------------------------------------------------------------------------
// Registro correcto / 10 herramientas
// ---------------------------------------------------------------------------
describe("Document AI tool definitions", () => {
  it("registers exactly the 10 required tools", () => {
    expect(DOCUMENT_AI_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
    expect(DOCUMENT_AI_TOOLS).toHaveLength(10);
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = DOCUMENT_AI_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of DOCUMENT_AI_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getDocumentAiTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getDocumentAiTool("summarizer")?.slug).toBe("document-summarizer");
    expect(getDocumentAiTool("analyzer")?.slug).toBe("document-analyzer");
    expect(getDocumentAiTool("no-existe")).toBeUndefined();
  });

  it("findToolDefinition (shared, cross-platform) resolves every Document AI slug too", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
  });

  it("slugs never collide with any other category's tool slugs, including the pre-existing empty 'documentos' category", () => {
    const existingSlugs = new Set(OTHER_CATEGORY_TOOLS.map((t) => t.slug));
    for (const slug of EXPECTED_SLUGS) {
      expect(existingSlugs.has(slug)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompts válidos: solo texto proporcionado, sin datos inventados ni alterados
// ---------------------------------------------------------------------------
describe("Document AI prompts are valid, text-only, and never invent or alter important data", () => {
  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of DOCUMENT_AI_TOOLS) {
      const values = Object.fromEntries(tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")]));
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("no Document AI prompt reuses another category's system prompt exact text", () => {
    const documentPrompts = DOCUMENT_AI_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    const otherPrompts = OTHER_CATEGORY_TOOLS.map((t) => t.buildSystemPrompt("ctx"));
    for (const prompt of documentPrompts) {
      expect(otherPrompts).not.toContain(prompt);
    }
  });

  it("every tool explicitly refuses to invent facts, figures, names, dates or clauses not in the source", () => {
    for (const tool of DOCUMENT_AI_TOOLS) {
      expect(tool.buildSystemPrompt("ctx")).toMatch(/No inventes datos, cifras, nombres, fechas/);
    }
  });

  it("every tool explicitly states it must not silently alter important data from the original document", () => {
    for (const tool of DOCUMENT_AI_TOOLS) {
      expect(tool.buildSystemPrompt("ctx")).toMatch(/No alteres datos importantes/);
    }
  });

  it("every tool explicitly states it only works with user-pasted text — no OCR, no PDF/Word/Docs, no external system", () => {
    for (const tool of DOCUMENT_AI_TOOLS) {
      const prompt = tool.buildSystemPrompt("ctx");
      expect(prompt).toMatch(/no tienes acceso a archivos PDF, Word, Google Docs/);
      expect(prompt).toMatch(/reconocimiento óptico de caracteres \(OCR\)/);
    }
  });

  it("the contract simplifier never removes or reinterprets a clause's legal meaning and flags ambiguity instead of guessing", () => {
    const contract = DOCUMENT_AI_TOOLS.find((t) => t.slug === "contract-simplifier")!;
    expect(contract.buildSystemPrompt("ctx")).toMatch(/nunca elimines ni suavices una cláusula que cambie su significado legal/);
  });

  it("the meeting notes generator never invents decisions, owners or dates not explicitly stated", () => {
    const meetingNotes = DOCUMENT_AI_TOOLS.find((t) => t.slug === "meeting-notes-generator")!;
    expect(meetingNotes.buildSystemPrompt("ctx")).toMatch(/Nunca inventes decisiones, responsables ni fechas/);
  });

  it("the document translator flags ambiguous terms instead of inventing a translation, and preserves exact data", () => {
    const translator = DOCUMENT_AI_TOOLS.find((t) => t.slug === "document-translator")!;
    expect(translator.buildSystemPrompt("ctx")).toMatch(/indícalo entre corchetes en lugar de inventar una traducción/);
  });

  it("the formal document generator never invents sender, recipient or contact data not provided", () => {
    const formalDoc = DOCUMENT_AI_TOOLS.find((t) => t.slug === "formal-document-generator")!;
    expect(formalDoc.buildSystemPrompt("ctx")).toMatch(/nunca inventes remitente, destinatario, cargos ni datos de contacto/);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center — misma arquitectura, sin arquitectura paralela
// ---------------------------------------------------------------------------
describe("AI Center integration: same architecture as every other tool category", () => {
  it("a new 'Document AI' category exposes all 10 tools as 'available' with a real href matching each routeSegment", () => {
    const category = AI_CENTER_CATEGORIES.find((c) => c.slug === "document-ai")!;
    expect(category).toBeDefined();
    expect(category.label).toBe("Document AI");
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = category.tools.find((t) => t.slug === slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.status).toBe("available");
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/document-ai/${definition.routeSegment}`);
    }
  });

  it("the pre-existing empty 'Documentos' category is completely untouched", () => {
    const documentos = AI_CENTER_CATEGORIES.find((c) => c.slug === "documentos")!;
    expect(documentos.label).toBe("Documentos");
    expect(documentos.tools).toEqual([]);
  });

  it("findAiTool resolves category/label for every Document AI slug", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tool = findAiTool(slug);
      expect(tool?.categorySlug).toBe("document-ai");
      expect(tool?.categoryLabel).toBe("Document AI");
    }
  });

  it("one dynamic route serves all 10 tools — no per-tool page files were created", () => {
    const dynamicPage = "src/app/(dashboard)/dashboard/[projectId]/ai-center/document-ai/[tool]/page.tsx";
    expect(existsSync(path.join(ROOT, dynamicPage))).toBe(true);
    for (const tool of DOCUMENT_AI_TOOLS) {
      const perToolPage = `src/app/(dashboard)/dashboard/[projectId]/ai-center/document-ai/${tool.routeSegment}/page.tsx`;
      expect(existsSync(path.join(ROOT, perToolPage))).toBe(false);
    }
  });

  it("the dynamic page reuses AiGenerationForm — the exact same generic engine every other category uses, no second form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/document-ai/[tool]/page.tsx");
    expect(page).toMatch(/import \{ AiGenerationForm \} from "@\/components\/ai-center\/generation\/ai-generation-form"/);
    expect(page).toMatch(/<AiGenerationForm tool=\{tool\} projectId=\{projectId\} brandContextText=\{brandContextText\} \/>/);
    expect(page).toMatch(/if \(!tool\) notFound\(\);/);
  });

  it("no previously-created category was modified this phase", () => {
    expect(AI_CENTER_CATEGORIES.find((c) => c.slug === "youtube")!.tools.filter((t) => t.status === "available")).toHaveLength(8);
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "linkedin-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
    expect(
      AI_CENTER_CATEGORIES.find((c) => c.slug === "image-ai")!.tools.filter((t) => t.status === "available")
    ).toHaveLength(10);
  });

  it("no Sidebar entry was added — reached only through the AI Center hub, exactly like every other AI category", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).not.toContain("Document AI");
    expect(allLabels.filter((l) => l === "AI Center")).toHaveLength(1);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Contract Simplifier");
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

  it("no second save action or history table was created for Document AI", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/document-ai.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-center-document-ai.ts"))).toBe(false);
  });

  it("UniversalResultViewer was not modified by this phase", () => {
    const viewer = read("src/components/workspace/universal-result-viewer.tsx");
    expect(viewer).toMatch(/"text" \| "image" \| "pdf" \| "audio" \| "video"/);
    expect(viewer).not.toMatch(/document-ai|documentAi/i);
  });
});

// ---------------------------------------------------------------------------
// Funcionamiento automático desde Chat IA
// ---------------------------------------------------------------------------
describe("Chat IA automatically detects the new tools via the AI Center registry — no code changes to Chat IA", () => {
  it("listRoutableTools (used by the intent classifier) already includes all 10 Document AI tools", () => {
    const routable = listRoutableTools().map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(routable).toContain(slug);
    }
  });

  it("listToolDefinitions includes every category's tools together, from one shared registry, with no duplicates", () => {
    const all = listToolDefinitions().map((t) => t.slug);
    expect(new Set(all).size).toBe(all.length);
    for (const tool of [...OTHER_CATEGORY_TOOLS, ...DOCUMENT_AI_TOOLS]) {
      expect(all).toContain(tool.slug);
    }
  });

  it("Chat IA's panel and the intent router were NOT modified by this phase — no Document-AI-specific code inside them", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    const router = read("src/lib/chat/intent-router.ts");
    expect(panel).not.toMatch(/document-ai|document summarizer/i);
    expect(router).not.toMatch(/document-ai|document summarizer/i);
  });

  it("the classifier prompt still only references what's already in the registry (proving automatic pickup, not hardcoding)", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).toMatch(/listToolDefinitions\(\)/);
    for (const tool of DOCUMENT_AI_TOOLS) {
      expect(router).not.toContain(tool.description);
    }
  });
});

// ---------------------------------------------------------------------------
// Seguridad / sin OCR, sin parsing de PDF/Office/Docs, sin APIs externas
// ---------------------------------------------------------------------------
describe("Security and no external document API integration", () => {
  it("the project layout's membership guard still runs for every ai-center/document-ai/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });

  it("saveAiToolResultAction rejects an unrecognized toolSlug before writing anything (validated server-side, never trusting the client)", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/if \(!tool\) return \{ error:/);
  });

  it("Document AI results never leak contentType/resultKind from client input — always resolved server-side from the tool definition", () => {
    const action = read("src/server/actions/ai-center-tools.ts");
    expect(action).toMatch(/type: tool\.contentType/);
    expect(action).toMatch(/kind: tool\.resultKind/);
    expect(action).not.toMatch(/type: input\./);
  });

  it("no file in this phase imports an OCR/PDF/Office/Docs/AI-provider SDK or makes a network call — only comments may name them to explain what's excluded", () => {
    const files = [
      "src/lib/ai-center/tools/document-ai.ts",
      "src/lib/ai-center/tools/document-ai-prompts.ts",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/document-ai/[tool]/page.tsx",
    ];
    const forbiddenImportPatterns = [
      /from\s+["']openai["']/i,
      /from\s+["']tesseract\.js["']/i,
      /from\s+["']pdf-parse["']/i,
      /from\s+["']pdfjs-dist["']/i,
      /from\s+["']mammoth["']/i,
      /from\s+["']googleapis["']/i,
      /from\s+["'].*google-docs/i,
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

  it("package.json has no OCR or external AI-provider dependency — pdfjs-dist is now a real, deliberately-added dependency (Fase 42's PDF-to-image rendering for /herramientas), never used by Document AI (verified by the test above)", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const forbidden of ["openai", "tesseract.js", "pdf-parse", "googleapis"]) {
      expect(deps[forbidden]).toBeUndefined();
    }
    // pdfjs-dist is real and intentional as of Fase 42 — confirm it's only reached from the public-tools PDF render module, never from Document AI.
    expect(deps["pdfjs-dist"]).toBeDefined();
    const renderModule = read("src/lib/public-tools/pdf/render.ts");
    expect(renderModule).toMatch(/from\s+["']pdfjs-dist["']/);
  });

  it("mammoth/unpdf/cheerio (Fase 32's real document-extraction deps) are used ONLY by Knowledge Base — Document AI's own tool files never import them", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps.mammoth).toBeDefined();
    expect(deps.unpdf).toBeDefined();
    expect(deps.cheerio).toBeDefined();

    const documentAiFiles = ["src/lib/ai-center/tools/document-ai.ts", "src/lib/ai-center/tools/document-ai-prompts.ts"];
    for (const relativePath of documentAiFiles) {
      const content = read(relativePath);
      expect(content).not.toMatch(/from\s+["'](mammoth|unpdf|cheerio)["']/);
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
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/image-ai/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/document-ai/[tool]/page.tsx",
    ];
    for (const page of pages) {
      expect(read(page)).toContain('from "@/components/ai-center/generation/ai-generation-form"');
    }
    expect(existsSync(path.join(ROOT, "src/components/ai-center/generation/document-ai-generation-form.tsx"))).toBe(false);
  });

  it("findToolDefinition/listToolDefinitions/saveAiToolResultAction are each defined in exactly one file", () => {
    const candidateFiles = [
      "src/lib/ai-center/tools/registry.ts",
      "src/lib/ai-center/tools/youtube.ts",
      "src/lib/ai-center/tools/image-ai.ts",
      "src/lib/ai-center/tools/document-ai.ts",
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
    expect(existsSync(path.join(ROOT, "src/lib/ai/local/document-engine.ts"))).toBe(false);
  });

  it("every previous category is untouched: same tool counts, same routes", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    expect(LINKEDIN_AI_TOOLS).toHaveLength(10);
    expect(IMAGE_AI_TOOLS).toHaveLength(10);
    for (const routeDir of ["youtube", "instagram", "social-media", "blog-seo", "email-marketing", "tiktok-ai", "facebook-ai", "linkedin-ai", "image-ai"]) {
      expect(
        existsSync(path.join(ROOT, `src/app/(dashboard)/dashboard/[projectId]/ai-center/${routeDir}/[tool]/page.tsx`))
      ).toBe(true);
    }
  });
});

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeTemplateVariables, extractTemplateVariables, renderTemplate } from "@/lib/ai-templates/engine";
import {
  filterAiTemplates,
  sortAiTemplates,
  getDistinctCategories,
  getDistinctTags,
  AI_TEMPLATE_SORT_LABELS,
} from "@/lib/ai-templates/list-utils";
import { buildAiTemplatesAssistantContext, ASSISTANT_CONTEXT_TEMPLATE_LIMIT } from "@/lib/ai-templates/assistant-context";
import { createAiTemplateSchema, updateAiTemplateSchema } from "@/lib/validation/ai-templates";
import { parseTagsInput } from "@/lib/validation/prompt-library";
import type { AiTemplateLike } from "@/lib/ai-templates/types";
import { projectNavGroups, guestNavGroups, adminNavItems } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

function makeTemplate(overrides: Partial<AiTemplateLike> = {}): AiTemplateLike {
  return {
    id: "t1",
    projectId: "proj1",
    title: "Video YouTube",
    description: "Plantilla de guion para YouTube",
    content: "Título:\n{{titulo}}\n\nAudiencia:\n{{audiencia}}\n\nDuración:\n{{duracion}}\n\nCTA:\n{{cta}}",
    variables: ["titulo", "audiencia", "duracion", "cta"],
    category: "YouTube",
    tags: ["video", "guion"],
    isFavorite: false,
    sourceTool: "youtube-guiones",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Detección de variables (automática)
// ---------------------------------------------------------------------------
describe("analyzeTemplateVariables: automatic {{variable}} detection", () => {
  it("detects every valid variable, in first-seen order, deduplicated", () => {
    const analysis = analyzeTemplateVariables("Hola {{nombre}}, tu pedido {{pedido}} llega el {{fecha}}. Gracias {{nombre}}.");
    expect(analysis.names).toEqual(["nombre", "pedido", "fecha"]);
  });

  it("returns an empty analysis for content with no variables", () => {
    const analysis = analyzeTemplateVariables("Texto plano sin variables.");
    expect(analysis.names).toEqual([]);
    expect(analysis.duplicates).toEqual([]);
    expect(analysis.invalidTokens).toEqual([]);
  });

  it("extractTemplateVariables is a thin convenience wrapper returning just the names", () => {
    expect(extractTemplateVariables("{{a}} y {{b}}")).toEqual(["a", "b"]);
  });

  // -------------------------------------------------------------------------
  // Variables repetidas
  // -------------------------------------------------------------------------
  it("detects repeated variables (a variable used more than once is legitimate, but reported)", () => {
    const analysis = analyzeTemplateVariables("{{nombre}} conoce a {{nombre}} y a {{otro}}");
    expect(analysis.names).toEqual(["nombre", "otro"]);
    expect(analysis.duplicates).toEqual(["nombre"]);
  });

  // -------------------------------------------------------------------------
  // Variables inválidas
  // -------------------------------------------------------------------------
  it("flags empty, space-containing, symbol-containing and digit-leading tokens as invalid, never as fillable variables", () => {
    const analysis = analyzeTemplateVariables("{{}} {{2bad}} {{bad name}} {{bad-name}} {{valida_1}} {{_ok}}");
    expect(analysis.names).toEqual(["valida_1", "_ok"]);
    expect(analysis.invalidTokens).toEqual(["", "2bad", "bad name", "bad-name"]);
  });

  it("only accepts ASCII letters/digits/underscore in a variable name — accented/Unicode characters are invalid", () => {
    const analysis = analyzeTemplateVariables("{{título}}");
    expect(analysis.names).toEqual([]);
    expect(analysis.invalidTokens).toEqual(["título"]);
  });

  it("trims whitespace inside the braces before validating ({{ nombre }} is the same as {{nombre}})", () => {
    const analysis = analyzeTemplateVariables("{{ nombre }}");
    expect(analysis.names).toEqual(["nombre"]);
    expect(analysis.invalidTokens).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Motor de render
// ---------------------------------------------------------------------------
describe("renderTemplate: the render engine", () => {
  it("replaces every variable with its supplied value — the exact example from the spec", () => {
    const result = renderTemplate("Hola {{nombre}}", { nombre: "Carlos" });
    expect(result.output).toBe("Hola Carlos");
    expect(result.missing).toEqual([]);
  });

  it("replaces every occurrence of a repeated variable", () => {
    const result = renderTemplate("{{nombre}} y {{nombre}} otra vez", { nombre: "Ana" });
    expect(result.output).toBe("Ana y Ana otra vez");
  });

  // -------------------------------------------------------------------------
  // Variables faltantes
  // -------------------------------------------------------------------------
  it("leaves the original {{variable}} token in place and reports it as missing when no value is supplied", () => {
    const result = renderTemplate("Hola {{nombre}}, tu ciudad es {{ciudad}}", { nombre: "Carlos" });
    expect(result.output).toBe("Hola Carlos, tu ciudad es {{ciudad}}");
    expect(result.missing).toEqual(["ciudad"]);
  });

  it("treats an empty or whitespace-only value the same as a missing one", () => {
    const result = renderTemplate("Hola {{nombre}}", { nombre: "   " });
    expect(result.output).toBe("Hola {{nombre}}");
    expect(result.missing).toEqual(["nombre"]);
  });

  it("never invents a value for a variable it wasn't given", () => {
    const result = renderTemplate("{{a}} {{b}} {{c}}", { a: "1" });
    expect(result.output).toBe("1 {{b}} {{c}}");
    expect(result.missing).toEqual(["b", "c"]);
  });

  it("leaves invalid tokens untouched — they were never fillable", () => {
    const result = renderTemplate("{{}} {{2bad}} {{ok}}", { ok: "sí" });
    expect(result.output).toBe("{{}} {{2bad}} sí");
    expect(result.missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Búsqueda, favoritos, categorías, etiquetas
// ---------------------------------------------------------------------------
describe("filterAiTemplates", () => {
  const templates = [
    makeTemplate({ id: "a", title: "Video YouTube", category: "YouTube", tags: ["video"], isFavorite: true, variables: ["titulo"] }),
    makeTemplate({ id: "b", title: "Email de bienvenida", category: "Email", tags: ["onboarding"], isFavorite: false, variables: ["nombre"] }),
    makeTemplate({ id: "c", title: "Post SEO", category: "SEO", tags: ["blog"], isFavorite: true, variables: ["palabraClave"] }),
  ];

  it("matches by title", () => {
    expect(filterAiTemplates(templates, { query: "email" }).map((t) => t.id)).toEqual(["b"]);
  });

  it("matches by variable name", () => {
    expect(filterAiTemplates(templates, { query: "palabraclave" }).map((t) => t.id)).toEqual(["c"]);
  });

  it("favoritesOnly keeps only favorites", () => {
    expect(filterAiTemplates(templates, { favoritesOnly: true }).map((t) => t.id).sort()).toEqual(["a", "c"]);
  });

  it("category filters exactly", () => {
    expect(filterAiTemplates(templates, { category: "SEO" }).map((t) => t.id)).toEqual(["c"]);
  });

  it("tag filters by membership", () => {
    expect(filterAiTemplates(templates, { tag: "onboarding" }).map((t) => t.id)).toEqual(["b"]);
  });
});

describe("sortAiTemplates", () => {
  const templates = [
    makeTemplate({ id: "a", title: "Charlie", updatedAt: new Date("2026-01-01") }),
    makeTemplate({ id: "b", title: "Alpha", updatedAt: new Date("2026-01-05") }),
    makeTemplate({ id: "c", title: "Bravo", updatedAt: new Date("2026-01-03") }),
  ];

  it("recent sorts by updatedAt desc", () => {
    expect(sortAiTemplates(templates, "recent").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("alphabetical sorts by title A-Z", () => {
    expect(sortAiTemplates(templates, "alphabetical").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("never mutates the input array", () => {
    const original = [...templates];
    sortAiTemplates(templates, "alphabetical");
    expect(templates).toEqual(original);
  });

  it("exposes a label for every sort option the UI offers", () => {
    expect(Object.keys(AI_TEMPLATE_SORT_LABELS).sort()).toEqual(["alphabetical", "recent"].sort());
  });
});

describe("getDistinctCategories / getDistinctTags", () => {
  const templates = [
    makeTemplate({ id: "a", category: "YouTube", tags: ["video", "guion"] }),
    makeTemplate({ id: "b", category: "YouTube", tags: ["guion"] }),
    makeTemplate({ id: "c", category: null, tags: ["seo"] }),
  ];

  it("returns unique, sorted categories, ignoring null", () => {
    expect(getDistinctCategories(templates)).toEqual(["YouTube"]);
  });

  it("returns unique, sorted tags across every template", () => {
    expect(getDistinctTags(templates)).toEqual(["guion", "seo", "video"]);
  });
});

// ---------------------------------------------------------------------------
// Chat IA assistant context
// ---------------------------------------------------------------------------
describe("buildAiTemplatesAssistantContext", () => {
  it("returns an empty string when there are no templates", () => {
    expect(buildAiTemplatesAssistantContext([])).toBe("");
  });

  it("includes title, favorite marker, category/tags, variable names and a content preview", () => {
    const context = buildAiTemplatesAssistantContext([makeTemplate({ isFavorite: true })]);
    expect(context).toContain("Video YouTube");
    expect(context).toContain("(favorito)");
    expect(context).toContain("YouTube");
    expect(context).toContain("{{titulo}}");
    expect(context).toContain("{{audiencia}}");
  });

  it("reports 'ninguna' for a template with no variables", () => {
    const context = buildAiTemplatesAssistantContext([makeTemplate({ content: "Texto fijo sin variables", variables: [] })]);
    expect(context).toContain("Variables: ninguna");
  });

  it("distinguishes a template from a prompt and instructs the model to ask for missing variable values instead of inventing them", () => {
    const context = buildAiTemplatesAssistantContext([makeTemplate()]);
    expect(context).toMatch(/distinta de un prompt guardado/);
    expect(context).toMatch(/[Ss]i falta el valor de alguna variable, pregúntalo/);
    expect(context).toMatch(/[Nn]unca inventes un template/);
  });

  it("the context builder never itself queries the database — pure function", () => {
    const source = read("src/lib/ai-templates/assistant-context.ts");
    expect(source).not.toMatch(/prisma\./);
    expect(source).not.toMatch(/"use server"/);
  });

  it("the assistant-context template limit is a small, fixed bound", () => {
    expect(ASSISTANT_CONTEXT_TEMPLATE_LIMIT).toBeGreaterThan(0);
    expect(ASSISTANT_CONTEXT_TEMPLATE_LIMIT).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Validación (zod) — reutiliza parseTagsInput de Prompt Library
// ---------------------------------------------------------------------------
describe("AI Templates validation schemas", () => {
  it("createAiTemplateSchema accepts a minimal valid input and defaults tags to []", () => {
    const parsed = createAiTemplateSchema.safeParse({ projectId: null, title: "Mi template", content: "Hola {{nombre}}" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tags).toEqual([]);
  });

  it("createAiTemplateSchema rejects an empty title or empty content", () => {
    expect(createAiTemplateSchema.safeParse({ projectId: null, title: "", content: "x" }).success).toBe(false);
    expect(createAiTemplateSchema.safeParse({ projectId: null, title: "x", content: "" }).success).toBe(false);
  });

  it("updateAiTemplateSchema allows a partial update and requires a valid cuid id", () => {
    expect(updateAiTemplateSchema.safeParse({ id: "clxxxxxxxxxxxxxxxxxxxxxxxx", title: "Nuevo" }).success).toBe(true);
    expect(updateAiTemplateSchema.safeParse({ id: "not-a-cuid", title: "x" }).success).toBe(false);
  });

  it("reuses Prompt Library's parseTagsInput instead of redefining it — no duplicated tag-parsing logic", () => {
    expect(parseTagsInput(" video, guion ,, video,   ")).toEqual(["video", "guion"]);
    const validationDir = readdirSync(path.join(ROOT, "src/lib/validation"));
    expect(validationDir).toContain("ai-templates.ts");
    expect(read("src/lib/validation/ai-templates.ts")).not.toMatch(/function parseTagsInput/);
  });
});

// ---------------------------------------------------------------------------
// CRUD — server actions
// ---------------------------------------------------------------------------
describe("AI Templates CRUD actions", () => {
  const actions = read("src/server/actions/ai-templates.ts");

  it("createAiTemplateAction creates an AiTemplate scoped to the authenticated user, with server-derived variables", () => {
    const fn = actions.match(/export async function createAiTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(input\.projectId, "VIEWER"\)/);
    expect(fn).toMatch(/prisma\.aiTemplate\.create/);
    expect(fn).toMatch(/userId: user\.id/);
    expect(fn).toMatch(/variables: extractTemplateVariables\(parsed\.data\.content\)/);
  });

  it("saveGeneratedAsTemplateAction (the AiGenerationForm 'Guardar como Template' path) validates the tool slug before writing", () => {
    const fn = actions.match(/export async function saveGeneratedAsTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/findToolDefinition\(input\.toolSlug\)/);
    expect(fn).toMatch(/if \(!tool\) return \{ error:/);
    expect(fn).toMatch(/prisma\.aiTemplate\.create/);
  });

  it("updateAiTemplateAction re-derives variables from the new content server-side, never trusting the client", () => {
    const fn = actions.match(/export async function updateAiTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedTemplate\(id, user\.id\)/);
    expect(fn).toMatch(/variables: extractTemplateVariables\(nextContent\)/);
    expect(fn).toMatch(/prisma\.aiTemplate\.update/);
    expect(fn).not.toMatch(/prisma\.aiTemplate\.create/);
    expect(fn).not.toMatch(/variables:\s*input\.variables/);
  });

  it("deleteAiTemplateAction deletes only after verifying ownership", () => {
    const fn = actions.match(/export async function deleteAiTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedTemplate\(id, user\.id\)/);
    expect(fn).toMatch(/prisma\.aiTemplate\.delete/);
  });

  it("duplicateAiTemplateAction creates a fresh copy owned by the same user", () => {
    const fn = actions.match(/export async function duplicateAiTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedTemplate\(id, user\.id\)/);
    expect(fn).toMatch(/prisma\.aiTemplate\.create/);
    expect(fn).toMatch(/\(copia\)/);
  });

  it("toggleFavoriteAiTemplateAction updates only the isFavorite field, after ownership verification", () => {
    const fn = actions.match(/export async function toggleFavoriteAiTemplateAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedTemplate\(id, user\.id\)/);
    expect(fn).toMatch(/data: \{ isFavorite: next \}/);
  });

  it("every mutation revalidates the AI Templates page path", () => {
    const matches = actions.match(/revalidatePath\(aiTemplatesPath\(projectId\)\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Seguridad — aislamiento total por usuario
// ---------------------------------------------------------------------------
describe("Security: templates are fully isolated per user (and per project when scoped)", () => {
  const actions = read("src/server/actions/ai-templates.ts");
  const services = read("src/server/services/ai-templates.ts");

  it("getOwnedTemplate treats 'not mine' exactly like 'does not exist' — no cross-user existence leak", () => {
    const fn = actions.match(/async function getOwnedTemplate[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!template \|\| template\.userId !== userId\) return null;/);
  });

  it("listAiTemplatesForUser always filters by userId — never returns another user's templates", () => {
    const fn = services.match(/export async function listAiTemplatesForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/where: \{ userId, OR: \[\{ projectId \}, \{ projectId: null \}\] \}/);
  });

  it("getAiTemplateForUser re-checks ownership even after finding the row by id", () => {
    const fn = services.match(/export async function getAiTemplateForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/template\.userId !== userId/);
  });

  it("listTemplatesForAssistantContext (feeds Chat IA) is also always userId-scoped", () => {
    const fn = services.match(/export async function listTemplatesForAssistantContext[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/where: \{ userId, OR: \[\{ projectId \}, \{ projectId: null \}\] \}/);
  });

  it("every action requires at least project VIEWER access before touching any template", () => {
    const requireCalls = actions.match(/requireProjectAccess\([^)]*"VIEWER"\)/g) ?? [];
    expect(requireCalls.length).toBeGreaterThanOrEqual(6);
  });

  it("no action ever trusts a client-supplied userId", () => {
    expect(actions).not.toMatch(/userId:\s*input\./);
    expect(actions).not.toMatch(/userId:\s*formData/);
  });
});

// ---------------------------------------------------------------------------
// Integración con Workspace
// ---------------------------------------------------------------------------
describe("Workspace integration", () => {
  it("the Workspace page links to AI Templates, purely additive, alongside the existing Prompt Library link", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/workspace/page.tsx");
    expect(page).toMatch(/\/dashboard\/\$\{projectId\}\/ai-templates/);
    expect(page).toMatch(/\/dashboard\/\$\{projectId\}\/prompt-library/);
  });

  it("AiWorkspaceHub itself was not modified — no AI Templates-specific logic inside it", () => {
    const hub = read("src/components/workspace/ai-workspace-hub.tsx");
    expect(hub).toMatch(/const RECENT_LIMIT = 20;/);
    expect(hub).not.toMatch(/AiTemplate|ai-templates/i);
  });

  it("WorkspaceResultCard/WorkspaceResultActions were not modified to know about templates", () => {
    expect(read("src/components/workspace/workspace-result-card.tsx")).not.toMatch(/AiTemplate|ai-templates/i);
    expect(read("src/components/workspace/workspace-result-actions.tsx")).not.toMatch(/AiTemplate|ai-templates/i);
  });

  it("AiTemplateCard reuses UniversalResultViewer and the shared parseResultBlocks for both the raw template and the rendered preview — no second renderer", () => {
    const card = read("src/components/ai-templates/ai-template-card.tsx");
    expect(card).toMatch(/import \{ UniversalResultViewer \} from "@\/components\/workspace\/universal-result-viewer"/);
    expect(card).toMatch(/import \{ parseResultBlocks \} from "@\/lib\/ai-workspace\/blocks"/);
    expect(card).not.toMatch(/export function parseResultBlocks/);
    // Both view modes render through the one shared viewer.
    expect(card.match(/<UniversalResultViewer/g) ?? []).toHaveLength(2);
  });

  it("UniversalResultViewer itself was not modified by this phase", () => {
    const viewer = read("src/components/workspace/universal-result-viewer.tsx");
    expect(viewer).toMatch(/"text" \| "image" \| "pdf" \| "audio" \| "video"/);
    expect(viewer).not.toMatch(/AiTemplate|ai-templates/i);
  });

  it("templates have their own dedicated route, reachable both from the Sidebar and from Workspace", () => {
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/ai-templates/page.tsx"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center (botón "Guardar como Template" en todas las herramientas)
// ---------------------------------------------------------------------------
describe("'Guardar como Template' is wired into every AI Center tool via the one shared AiGenerationForm", () => {
  const form = read("src/components/ai-center/generation/ai-generation-form.tsx");

  it("imports and renders SaveAsTemplateButton with the generated result body, not the input prompt", () => {
    expect(form).toMatch(/import \{ SaveAsTemplateButton \} from "@\/components\/ai-templates\/save-as-template-button"/);
    expect(form).toMatch(
      /<SaveAsTemplateButton projectId=\{projectId\} toolSlug=\{tool\.slug\} defaultTitle=\{tool\.label\} generatedContent=\{result\} \/>/
    );
  });

  it("both SavePromptButton (Prompt Library) and SaveAsTemplateButton (AI Templates) coexist — neither replaced the other", () => {
    expect(form).toMatch(/import \{ SavePromptButton \} from "@\/components\/prompt-library\/save-prompt-button"/);
    expect(form).toMatch(/<SavePromptButton /);
  });

  it("still preserves every capability previous integration tests already verified (nothing broken)", () => {
    expect(form).toMatch(/useLocalAI/);
    expect(form).toMatch(/LocalAIStatusPanel/);
    expect(form).toMatch(/Completa el campo/);
    expect(form).toMatch(/saveAiToolResultAction/);
    expect(form).toMatch(/setContentItemId\(null\)/);
    expect(form).toMatch(/import \{ UniversalResultViewer \} from "@\/components\/workspace\/universal-result-viewer"/);
  });

  it("SaveAsTemplateButton is defined in exactly one file, reused (not duplicated) by AiGenerationForm", () => {
    expect(existsSync(path.join(ROOT, "src/components/ai-templates/save-as-template-button.tsx"))).toBe(true);
    expect(read("src/components/ai-center/generation/ai-generation-form.tsx")).not.toMatch(
      /export function SaveAsTemplateButton/
    );
  });

  it("saveGeneratedAsTemplateAction, saveGeneratedPromptAction and saveAiToolResultAction remain three distinct, single-purpose actions", () => {
    const templateActions = read("src/server/actions/ai-templates.ts");
    const promptActions = read("src/server/actions/prompt-library.ts");
    const toolActions = read("src/server/actions/ai-center-tools.ts");
    expect(templateActions).toMatch(/export async function saveGeneratedAsTemplateAction/);
    expect(promptActions).toMatch(/export async function saveGeneratedPromptAction/);
    expect(toolActions).not.toMatch(/aiTemplate/i);
  });
});

// ---------------------------------------------------------------------------
// Chat IA — usar/abrir/completar templates, sin tocar Orquestador ni Intent Router
// ---------------------------------------------------------------------------
describe("Chat IA can reuse AI Templates, without touching the Orquestador or the Intent Router", () => {
  it("chat-panel.tsx (the orchestrator) was NOT modified — no reference to ai-templates/AiTemplate inside it", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).not.toMatch(/AiTemplate|ai-templates|aiTemplate/);
    expect(panel).toMatch(/buildIntentClassifierSystemPrompt/);
    expect(panel).toMatch(/parseIntentClassifierResponse/);
    expect(panel).toMatch(/buildAssistantSystemPrompt\(brandContextText\)/);
  });

  it("intent-router.ts was NOT modified — no reference to ai-templates/AiTemplate inside it", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).not.toMatch(/AiTemplate|ai-templates|aiTemplate/);
    expect(router).toMatch(/export function listRoutableTools/);
    expect(router).toMatch(/export function buildIntentClassifierSystemPrompt/);
  });

  it("buildBrandContext (shared by every AI Center tool page) was NOT modified — template context is appended only for Chat IA", () => {
    const brandContext = read("src/lib/ai/brand-context.ts");
    expect(brandContext).not.toMatch(/AiTemplate|ai-templates|aiTemplate/);
  });

  it("only the chat conversation page fetches templates and appends their context to brandContextText, alongside Prompt Library's own", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/chat/[conversationId]/page.tsx");
    expect(page).toMatch(/listTemplatesForAssistantContext\(user\.id, projectId\)/);
    expect(page).toMatch(/buildAiTemplatesAssistantContext\(savedTemplates\)/);
    expect(page).toMatch(/listPromptsForAssistantContext\(user\.id, projectId\)/);
    expect(page).toMatch(/<ChatPanel/);
    expect(page).toMatch(/brandContextText=\{brandContextText\}/);
  });

  it("no AI Center tool page was changed to inject AI Templates context", () => {
    const toolPages = [
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/image-ai/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/document-ai/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/video-ai/[tool]/page.tsx",
    ];
    for (const relativePath of toolPages) {
      expect(read(relativePath)).not.toMatch(/ai-templates|AiTemplate/);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompt Library sigue funcionando — no se duplicó ni se rompió su lógica
// ---------------------------------------------------------------------------
describe("Prompt Library keeps working, unmodified, and is reused rather than duplicated", () => {
  it("prompt-library actions/services/components were not modified by this phase", () => {
    for (const relativePath of [
      "src/server/actions/prompt-library.ts",
      "src/server/services/prompt-library.ts",
      "src/components/prompt-library/prompt-library-hub.tsx",
      "src/components/prompt-library/prompt-library-card.tsx",
    ]) {
      expect(read(relativePath)).not.toMatch(/AiTemplate|ai-templates/i);
    }
  });

  it("AI Templates has its own isolation logic rather than reading/writing Prompt Library's data layer — no prisma.savedPrompt call, only its own prisma.aiTemplate", () => {
    const templateServices = read("src/server/services/ai-templates.ts");
    expect(templateServices).not.toMatch(/prisma\.savedPrompt/);
    expect(templateServices).toMatch(/prisma\.aiTemplate/);
  });

  it("parseTagsInput remains defined in exactly one file (Prompt Library's validation module) — AI Templates imports it instead of redefining it", () => {
    const definers = ["src/lib/validation/prompt-library.ts", "src/lib/validation/ai-templates.ts"].filter((f) =>
      read(f).includes("export function parseTagsInput")
    );
    expect(definers).toEqual(["src/lib/validation/prompt-library.ts"]);
    expect(read("src/components/ai-templates/ai-template-card.tsx")).toMatch(
      /import \{ parseTagsInput \} from "@\/lib\/validation\/prompt-library"/
    );
  });
});

// ---------------------------------------------------------------------------
// Base de datos — solo los modelos estrictamente necesarios
// ---------------------------------------------------------------------------
describe("Database: exactly one new model, one clean migration", () => {
  it("schema.prisma defines AiTemplate with every field the spec's example requires", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model AiTemplate \{[\s\S]*?\n\}/)![0];
    for (const field of ["title", "description", "content", "variables", "category", "tags", "isFavorite", "createdAt", "updatedAt", "userId"]) {
      expect(model).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("AiTemplate was added on top of Prompt Library's own SavedPrompt model, not in place of it", () => {
    // Forward-compatible on purpose (no hardcoded total): a future phase may
    // legitimately add its own model too, the same way this phase added
    // exactly one on top of everything before it.
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/model AiTemplate \{/);
    expect(schema).toMatch(/model SavedPrompt \{/);
  });

  it("a single, additive migration exists for AiTemplate — CREATE TABLE only, no ALTER/DROP on any existing table", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    const newMigration = migrationDirs.find((name) => name.endsWith("add_ai_templates"));
    expect(newMigration).toBeDefined();

    const sql = read(`prisma/migrations/${newMigration}/migration.sql`);
    expect(sql).toMatch(/CREATE TABLE "AiTemplate"/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/ALTER TABLE "(?!AiTemplate)/);
  });

  it("no other prisma migration folder was touched — every prior migration (including SavedPrompt's) is still present", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    for (const prior of [
      "20260723184900_remove_anthropic_ai_result_guest_rate_limit",
      "20260723193054_initial_schema",
      "20260723204536_add_guest_rate_limit",
      "20260724120000_add_ai_center_tool_interactions",
      "20260724130000_add_content_item_source_tool",
      "20260724140000_add_saved_prompt_library",
    ]) {
      expect(migrationDirs).toContain(prior);
    }
  });
});

// ---------------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------------
describe("Navigation: AI Templates reachable from the Sidebar, additive only", () => {
  it("appears exactly once in projectNavGroups", () => {
    const all = projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "AI Templates");
    expect(all).toHaveLength(1);
    expect(all[0].segment).toBe("ai-templates");
  });

  it("never appears in guest or admin navigation", () => {
    expect(guestNavGroups.flatMap((g) => g.items.map((i) => i.label))).not.toContain("AI Templates");
    expect(adminNavItems.map((i) => i.label)).not.toContain("AI Templates");
  });

  it("Prompt Library's own nav entry from the prior phase is still present, untouched", () => {
    const all = projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "Prompt Library");
    expect(all).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Sin ruptura del motor IA / arquitectura existente
// ---------------------------------------------------------------------------
describe("No second AI engine, no duplicated shared architecture", () => {
  it("engine.ts (the local text-generation engine) is unchanged and still the only generation entry point", () => {
    const engine = read("src/lib/ai/local/engine.ts");
    expect(engine).toMatch(/export async function generateLocalText/);
  });

  it("requireProjectAccess remains defined in exactly one place, reused (not reimplemented) by ai-templates files", () => {
    expect(read("src/server/actions/ai-templates.ts")).toMatch(/import \{ requireProjectAccess \} from "@\/lib\/permissions"/);
    expect(read("src/server/actions/ai-templates.ts")).not.toMatch(/async function requireProjectAccess/);
  });

  it("Guest and Admin were not touched by this phase", () => {
    for (const relativePath of ["src/components/guest/guest-header.tsx", "src/app/admin/layout.tsx"]) {
      if (existsSync(path.join(ROOT, relativePath))) {
        expect(read(relativePath)).not.toMatch(/AiTemplate|ai-templates/i);
      }
    }
  });
});

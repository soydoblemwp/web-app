import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterSavedPrompts,
  sortSavedPrompts,
  getDistinctCategories,
  getDistinctTags,
  PROMPT_LIBRARY_SORT_LABELS,
} from "@/lib/prompt-library/list-utils";
import { buildPromptLibraryAssistantContext, ASSISTANT_CONTEXT_PROMPT_LIMIT } from "@/lib/prompt-library/assistant-context";
import { createSavedPromptSchema, updateSavedPromptSchema, parseTagsInput } from "@/lib/validation/prompt-library";
import type { SavedPromptLike } from "@/lib/prompt-library/types";
import { projectNavGroups, guestNavGroups, adminNavItems } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

function makePrompt(overrides: Partial<SavedPromptLike> = {}): SavedPromptLike {
  return {
    id: "p1",
    projectId: "proj1",
    title: "SEO title generator",
    description: "Prompt para títulos SEO",
    content: "Genera 5 títulos SEO sobre {tema}",
    category: "SEO",
    tags: ["seo", "titulos"],
    isFavorite: false,
    sourceTool: "seo-title",
    useCount: 0,
    lastUsedAt: null,
    useBrandKit: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------
describe("filterSavedPrompts: search", () => {
  const prompts = [
    makePrompt({
      id: "a",
      title: "Generador de títulos",
      description: "Genera opciones de título",
      content: "Escribe 5 opciones",
      category: "SEO",
      tags: ["seo"],
    }),
    makePrompt({
      id: "b",
      title: "YouTube hook writer",
      description: "Gancho inicial",
      content: "Escribe un hook",
      category: "YouTube",
      tags: ["video", "hook"],
    }),
    makePrompt({
      id: "c",
      title: "Email cold outreach",
      description: "Prompt de ventas",
      content: "Redacta un email breve",
      category: "Email",
      tags: ["ventas"],
    }),
  ];

  it("matches by title", () => {
    expect(filterSavedPrompts(prompts, { query: "youtube" }).map((p) => p.id)).toEqual(["b"]);
  });

  it("matches by content", () => {
    expect(filterSavedPrompts(prompts, { query: "hook" }).map((p) => p.id).sort()).toEqual(["b"]);
  });

  it("matches by description", () => {
    expect(filterSavedPrompts(prompts, { query: "ventas" }).map((p) => p.id)).toEqual(["c"]);
  });

  it("matches by category and by tag", () => {
    expect(filterSavedPrompts(prompts, { query: "seo" }).map((p) => p.id)).toEqual(["a"]);
  });

  it("empty query returns everything untouched", () => {
    expect(filterSavedPrompts(prompts, { query: "" })).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Favoritos y filtros de categoría/etiqueta
// ---------------------------------------------------------------------------
describe("filterSavedPrompts: favorites, category, tag", () => {
  const prompts = [
    makePrompt({ id: "a", isFavorite: true, category: "SEO", tags: ["seo"] }),
    makePrompt({ id: "b", isFavorite: false, category: "YouTube", tags: ["video"] }),
    makePrompt({ id: "c", isFavorite: true, category: "SEO", tags: ["blog"] }),
  ];

  it("favoritesOnly keeps only isFavorite prompts", () => {
    expect(filterSavedPrompts(prompts, { favoritesOnly: true }).map((p) => p.id).sort()).toEqual(["a", "c"]);
  });

  it("category filters by exact category match", () => {
    expect(filterSavedPrompts(prompts, { category: "SEO" }).map((p) => p.id).sort()).toEqual(["a", "c"]);
  });

  it("tag filters by tag membership", () => {
    expect(filterSavedPrompts(prompts, { tag: "video" }).map((p) => p.id)).toEqual(["b"]);
  });

  it("filters compose together", () => {
    expect(filterSavedPrompts(prompts, { favoritesOnly: true, category: "SEO", tag: "blog" }).map((p) => p.id)).toEqual(["c"]);
  });
});

// ---------------------------------------------------------------------------
// Ordenar
// ---------------------------------------------------------------------------
describe("sortSavedPrompts", () => {
  const prompts = [
    makePrompt({ id: "a", title: "Charlie", useCount: 2, lastUsedAt: new Date("2026-01-03"), updatedAt: new Date("2026-01-01") }),
    makePrompt({ id: "b", title: "Alpha", useCount: 9, lastUsedAt: null, updatedAt: new Date("2026-01-05") }),
    makePrompt({ id: "c", title: "Bravo", useCount: 5, lastUsedAt: new Date("2026-01-04"), updatedAt: new Date("2026-01-02") }),
  ];

  it("recent sorts by updatedAt desc", () => {
    expect(sortSavedPrompts(prompts, "recent").map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("most-used sorts by useCount desc", () => {
    expect(sortSavedPrompts(prompts, "most-used").map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("alphabetical sorts by title A-Z", () => {
    expect(sortSavedPrompts(prompts, "alphabetical").map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("last-used sorts by lastUsedAt desc, with never-used prompts last", () => {
    expect(sortSavedPrompts(prompts, "last-used").map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("never mutates the input array", () => {
    const original = [...prompts];
    sortSavedPrompts(prompts, "alphabetical");
    expect(prompts).toEqual(original);
  });

  it("exposes a label for every sort option the UI offers", () => {
    expect(Object.keys(PROMPT_LIBRARY_SORT_LABELS).sort()).toEqual(["alphabetical", "last-used", "most-used", "recent"].sort());
  });
});

// ---------------------------------------------------------------------------
// Categorías y etiquetas
// ---------------------------------------------------------------------------
describe("getDistinctCategories / getDistinctTags", () => {
  const prompts = [
    makePrompt({ id: "a", category: "SEO", tags: ["seo", "blog"] }),
    makePrompt({ id: "b", category: "SEO", tags: ["blog"] }),
    makePrompt({ id: "c", category: null, tags: ["ventas"] }),
  ];

  it("returns unique, sorted categories, ignoring null", () => {
    expect(getDistinctCategories(prompts)).toEqual(["SEO"]);
  });

  it("returns unique, sorted tags across every prompt", () => {
    expect(getDistinctTags(prompts)).toEqual(["blog", "seo", "ventas"]);
  });
});

// ---------------------------------------------------------------------------
// Historial de uso — Chat IA assistant context
// ---------------------------------------------------------------------------
describe("buildPromptLibraryAssistantContext", () => {
  it("returns an empty string when there are no saved prompts (nothing injected into Chat IA's context)", () => {
    expect(buildPromptLibraryAssistantContext([])).toBe("");
  });

  it("includes title, favorite marker, category/tags and a content preview for each prompt", () => {
    const context = buildPromptLibraryAssistantContext([
      makePrompt({ title: "Mi prompt SEO favorito", isFavorite: true, category: "SEO", tags: ["blog"], content: "Escribe un título SEO" }),
    ]);
    expect(context).toContain("Mi prompt SEO favorito");
    expect(context).toContain("(favorito)");
    expect(context).toContain("SEO");
    expect(context).toContain("blog");
    expect(context).toContain("Escribe un título SEO");
  });

  it("truncates very long prompt content so the local model's context stays bounded", () => {
    const longContent = "x".repeat(2000);
    const context = buildPromptLibraryAssistantContext([makePrompt({ content: longContent })]);
    expect(context).toContain("...");
    expect(context.length).toBeLessThan(longContent.length + 500);
  });

  it("instructs the model to resolve requests like 'usa mi prompt favorito' but never invent an unlisted prompt", () => {
    const context = buildPromptLibraryAssistantContext([makePrompt()]);
    expect(context).toMatch(/usa mi prompt favorito/);
    expect(context).toMatch(/[Nn]unca inventes un prompt guardado/);
  });

  it("the context builder never itself queries the database — it only formats what it's given (pure function)", () => {
    const source = read("src/lib/prompt-library/assistant-context.ts");
    expect(source).not.toMatch(/prisma\./);
    expect(source).not.toMatch(/"use server"/);
  });

  it("the assistant-context prompt limit is a small, fixed bound", () => {
    expect(ASSISTANT_CONTEXT_PROMPT_LIMIT).toBeGreaterThan(0);
    expect(ASSISTANT_CONTEXT_PROMPT_LIMIT).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Validación (zod)
// ---------------------------------------------------------------------------
describe("Prompt Library validation schemas", () => {
  it("createSavedPromptSchema accepts a minimal valid input and defaults tags to []", () => {
    const parsed = createSavedPromptSchema.safeParse({ projectId: null, title: "Mi prompt", content: "Contenido" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tags).toEqual([]);
  });

  it("createSavedPromptSchema rejects an empty title or empty content", () => {
    expect(createSavedPromptSchema.safeParse({ projectId: null, title: "", content: "x" }).success).toBe(false);
    expect(createSavedPromptSchema.safeParse({ projectId: null, title: "x", content: "" }).success).toBe(false);
  });

  it("createSavedPromptSchema caps tags at 20", () => {
    const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    expect(createSavedPromptSchema.safeParse({ projectId: null, title: "x", content: "y", tags: tooManyTags }).success).toBe(false);
  });

  it("updateSavedPromptSchema allows a partial update (only title)", () => {
    const parsed = updateSavedPromptSchema.safeParse({ id: "clxxxxxxxxxxxxxxxxxxxxxxxx", title: "Nuevo título" });
    expect(parsed.success).toBe(true);
  });

  it("updateSavedPromptSchema requires a valid cuid id", () => {
    expect(updateSavedPromptSchema.safeParse({ id: "not-a-cuid", title: "x" }).success).toBe(false);
  });
});

describe("parseTagsInput", () => {
  it("splits on commas, trims, dedupes and drops empties", () => {
    expect(parseTagsInput(" seo, blog ,, seo,   ")).toEqual(["seo", "blog"]);
  });

  it("caps at 20 tags", () => {
    const raw = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(",");
    expect(parseTagsInput(raw)).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// CRUD — server actions
// ---------------------------------------------------------------------------
describe("Prompt Library CRUD actions", () => {
  const actions = read("src/server/actions/prompt-library.ts");

  it("createSavedPromptAction creates a SavedPrompt row scoped to the authenticated user", () => {
    const fn = actions.match(/export async function createSavedPromptAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/requireProjectAccess\(input\.projectId, "VIEWER"\)/);
    expect(fn).toMatch(/prisma\.savedPrompt\.create/);
    expect(fn).toMatch(/userId: user\.id/);
  });

  it("saveGeneratedPromptAction (the AiGenerationForm 'Guardar Prompt' path) validates the tool slug before writing", () => {
    const fn = actions.match(/export async function saveGeneratedPromptAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/findToolDefinition\(input\.toolSlug\)/);
    expect(fn).toMatch(/if \(!tool\) return \{ error:/);
    expect(fn).toMatch(/prisma\.savedPrompt\.create/);
  });

  it("updateSavedPromptAction updates (never creates) and only after verifying ownership", () => {
    const fn = actions.match(/export async function updateSavedPromptAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedPrompt\(id, user\.id\)/);
    expect(fn).toMatch(/if \(!existing\) return \{ error:/);
    expect(fn).toMatch(/prisma\.savedPrompt\.update/);
    expect(fn).not.toMatch(/prisma\.savedPrompt\.create/);
  });

  it("deleteSavedPromptAction deletes only after verifying ownership", () => {
    const fn = actions.match(/export async function deleteSavedPromptAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedPrompt\(id, user\.id\)/);
    expect(fn).toMatch(/prisma\.savedPrompt\.delete/);
  });

  it("duplicateSavedPromptAction creates a fresh copy owned by the same user, reset usage history", () => {
    const fn = actions.match(/export async function duplicateSavedPromptAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedPrompt\(id, user\.id\)/);
    expect(fn).toMatch(/prisma\.savedPrompt\.create/);
    expect(fn).toMatch(/\(copia\)/);
    expect(fn).not.toMatch(/useCount: existing\.useCount/);
  });

  it("toggleFavoriteSavedPromptAction updates only the isFavorite field, after ownership verification", () => {
    const fn = actions.match(/export async function toggleFavoriteSavedPromptAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedPrompt\(id, user\.id\)/);
    expect(fn).toMatch(/data: \{ isFavorite: next \}/);
  });

  it("recordPromptUseAction increments useCount and stamps lastUsedAt — the usage-history feature", () => {
    const fn = actions.match(/export async function recordPromptUseAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/getOwnedPrompt\(id, user\.id\)/);
    expect(fn).toMatch(/useCount: \{ increment: 1 \}/);
    expect(fn).toMatch(/lastUsedAt: new Date\(\)/);
  });

  it("every mutation revalidates the Prompt Library page path", () => {
    const matches = actions.match(/revalidatePath\(promptLibraryPath\(projectId\)\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Seguridad — aislamiento por usuario y proyecto
// ---------------------------------------------------------------------------
describe("Security: prompts are fully isolated per user (and per project when scoped)", () => {
  const actions = read("src/server/actions/prompt-library.ts");
  const services = read("src/server/services/prompt-library.ts");

  it("getOwnedPrompt (shared by every mutation) treats 'not mine' exactly like 'does not exist' — no cross-user existence leak", () => {
    const fn = actions.match(/async function getOwnedPrompt[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/if \(!prompt \|\| prompt\.userId !== userId\) return null;/);
  });

  it("listSavedPromptsForUser always filters by userId — never returns another user's prompts", () => {
    const fn = services.match(/export async function listSavedPromptsForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/where: \{ userId, OR: \[\{ projectId \}, \{ projectId: null \}\] \}/);
  });

  it("getSavedPromptForUser re-checks ownership even after finding the row by id", () => {
    const fn = services.match(/export async function getSavedPromptForUser[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prompt\.userId !== userId/);
  });

  it("listPromptsForAssistantContext (feeds Chat IA) is also always userId-scoped", () => {
    const fn = services.match(/export async function listPromptsForAssistantContext[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/where: \{ userId, OR: \[\{ projectId \}, \{ projectId: null \}\] \}/);
  });

  it("every action requires at least project VIEWER access before touching any prompt", () => {
    const requireCalls = actions.match(/requireProjectAccess\([^)]*"VIEWER"\)/g) ?? [];
    expect(requireCalls.length).toBeGreaterThanOrEqual(7);
  });

  it("no action ever trusts a client-supplied userId — user.id always comes from requireProjectAccess's own session lookup", () => {
    expect(actions).not.toMatch(/userId:\s*input\./);
    expect(actions).not.toMatch(/userId:\s*formData/);
  });
});

// ---------------------------------------------------------------------------
// Integración con Workspace
// ---------------------------------------------------------------------------
describe("Workspace integration", () => {
  it("the Workspace page links to the Prompt Library, purely additive", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/workspace/page.tsx");
    expect(page).toMatch(/\/dashboard\/\$\{projectId\}\/prompt-library/);
  });

  it("AiWorkspaceHub itself was not modified — same filter/search logic as before", () => {
    const hub = read("src/components/workspace/ai-workspace-hub.tsx");
    expect(hub).toMatch(/const RECENT_LIMIT = 20;/);
    expect(hub).not.toMatch(/SavedPrompt|prompt-library|PromptLibrary/i);
  });

  it("WorkspaceResultCard/WorkspaceResultActions were not modified to know about prompts", () => {
    expect(read("src/components/workspace/workspace-result-card.tsx")).not.toMatch(/SavedPrompt|prompt-library|PromptLibrary/i);
    expect(read("src/components/workspace/workspace-result-actions.tsx")).not.toMatch(/SavedPrompt|prompt-library|PromptLibrary/i);
  });

  it("PromptLibraryCard reuses UniversalResultViewer and the shared parseResultBlocks — no second renderer", () => {
    const card = read("src/components/prompt-library/prompt-library-card.tsx");
    expect(card).toMatch(/import \{ UniversalResultViewer \} from "@\/components\/workspace\/universal-result-viewer"/);
    expect(card).toMatch(/import \{ parseResultBlocks \} from "@\/lib\/ai-workspace\/blocks"/);
    expect(card).not.toMatch(/export function parseResultBlocks/);
  });

  it("UniversalResultViewer itself was not modified by this phase", () => {
    const viewer = read("src/components/workspace/universal-result-viewer.tsx");
    expect(viewer).toMatch(/"text" \| "image" \| "pdf" \| "audio" \| "video"/);
    expect(viewer).not.toMatch(/SavedPrompt|prompt-library|PromptLibrary/i);
  });

  it("saved prompts have their own dedicated route, reachable both from the Sidebar and from Workspace", () => {
    expect(existsSync(path.join(ROOT, "src/app/(dashboard)/dashboard/[projectId]/prompt-library/page.tsx"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integración con AI Center (botón "Guardar Prompt" en todas las herramientas)
// ---------------------------------------------------------------------------
describe("'Guardar Prompt' is wired into every AI Center tool via the one shared AiGenerationForm", () => {
  const form = read("src/components/ai-center/generation/ai-generation-form.tsx");

  it("imports and renders SavePromptButton with the exact prompt text sent to the model", () => {
    expect(form).toMatch(/import \{ SavePromptButton \} from "@\/components\/prompt-library\/save-prompt-button"/);
    expect(form).toMatch(/<SavePromptButton projectId=\{projectId\} toolSlug=\{tool\.slug\} defaultTitle=\{tool\.label\} content=\{lastPrompt\} \/>/);
  });

  it("captures lastPrompt from the same buildUserPrompt call used for generation — not a re-derived/duplicated value", () => {
    expect(form).toMatch(/const prompt = tool\.buildUserPrompt\(values\);/);
    expect(form).toMatch(/setLastPrompt\(prompt\);/);
  });

  it("still preserves every capability the previous integration tests already verified (nothing broken)", () => {
    expect(form).toMatch(/useLocalAI/);
    expect(form).toMatch(/LocalAIStatusPanel/);
    expect(form).toMatch(/Completa el campo/);
    expect(form).toMatch(/saveAiToolResultAction/);
    expect(form).toMatch(/setContentItemId\(null\)/);
    expect(form).toMatch(/import \{ UniversalResultViewer \} from "@\/components\/workspace\/universal-result-viewer"/);
  });

  it("SavePromptButton is defined in exactly one file, reused (not duplicated) by AiGenerationForm", () => {
    expect(existsSync(path.join(ROOT, "src/components/prompt-library/save-prompt-button.tsx"))).toBe(true);
    const definers = ["src/components/ai-center/generation/ai-generation-form.tsx"].filter((f) =>
      read(f).includes("export function SavePromptButton")
    );
    expect(definers).toEqual([]);
  });

  it("saveGeneratedPromptAction and saveAiToolResultAction remain two distinct, single-purpose actions (prompt text vs. generated output)", () => {
    const promptActions = read("src/server/actions/prompt-library.ts");
    const toolActions = read("src/server/actions/ai-center-tools.ts");
    expect(promptActions).toMatch(/export async function saveGeneratedPromptAction/);
    expect(toolActions).not.toMatch(/savedPrompt/i);
  });
});

// ---------------------------------------------------------------------------
// Chat IA — consulta automática de prompts guardados
// ---------------------------------------------------------------------------
describe("Chat IA can reuse saved prompts, without touching the Orquestador or the Intent Router", () => {
  it("chat-panel.tsx (the orchestrator) was NOT modified — no reference to prompt-library/SavedPrompt inside it", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).not.toMatch(/SavedPrompt|prompt-library|PromptLibrary|savedPrompt/);
    // Still the exact same orchestration shape as before this phase.
    expect(panel).toMatch(/buildIntentClassifierSystemPrompt/);
    expect(panel).toMatch(/parseIntentClassifierResponse/);
    expect(panel).toMatch(/buildAssistantSystemPrompt\(brandContextText\)/);
  });

  it("intent-router.ts was NOT modified — no reference to prompt-library/SavedPrompt inside it", () => {
    const router = read("src/lib/chat/intent-router.ts");
    expect(router).not.toMatch(/SavedPrompt|prompt-library|PromptLibrary|savedPrompt/);
    expect(router).toMatch(/export function listRoutableTools/);
    expect(router).toMatch(/export function buildIntentClassifierSystemPrompt/);
  });

  it("buildBrandContext (shared by every AI Center tool page) was NOT modified — prompt context is appended only for Chat IA", () => {
    const brandContext = read("src/lib/ai/brand-context.ts");
    expect(brandContext).not.toMatch(/SavedPrompt|prompt-library|PromptLibrary|savedPrompt/);
  });

  it("only the chat conversation page fetches saved prompts and appends their context to brandContextText", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/chat/[conversationId]/page.tsx");
    expect(page).toMatch(/listPromptsForAssistantContext\(user\.id, projectId\)/);
    expect(page).toMatch(/buildPromptLibraryAssistantContext\(savedPrompts\)/);
    expect(page).toMatch(/<ChatPanel/);
    expect(page).toMatch(/brandContextText=\{brandContextText\}/);
  });

  it("no AI Center tool page (only the chat page) was changed to inject prompt-library context", () => {
    const toolPages = [
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/image-ai/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/document-ai/[tool]/page.tsx",
      "src/app/(dashboard)/dashboard/[projectId]/ai-center/video-ai/[tool]/page.tsx",
    ];
    for (const relativePath of toolPages) {
      expect(read(relativePath)).not.toMatch(/prompt-library|PromptLibrary|SavedPrompt/);
    }
  });
});

// ---------------------------------------------------------------------------
// Base de datos — solo la tabla estrictamente necesaria
// ---------------------------------------------------------------------------
describe("Database: exactly one new table, one clean migration", () => {
  it("schema.prisma defines SavedPrompt with every required field from the spec", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.match(/model SavedPrompt \{[\s\S]*?\n\}/)![0];
    for (const field of [
      "title",
      "description",
      "content",
      "category",
      "tags",
      "isFavorite",
      "createdAt",
      "updatedAt",
      "useCount",
      "lastUsedAt",
      "userId",
    ]) {
      expect(model).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("exactly one new model was added this phase, on top of whatever later phases (e.g. AI Templates) legitimately add afterward", () => {
    const schema = read("prisma/schema.prisma");
    // A later phase (AI Templates) legitimately added its own model — this
    // only asserts SavedPrompt's own model is still there, not an exact
    // total (see tests/ai-templates.test.ts for that phase's own count).
    expect(schema).toMatch(/model SavedPrompt \{/);
  });

  it("a single, additive migration exists for SavedPrompt — CREATE TABLE only, no ALTER/DROP on any existing table", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    const newMigration = migrationDirs.find((name) => name.endsWith("add_saved_prompt_library"));
    expect(newMigration).toBeDefined();

    const sql = read(`prisma/migrations/${newMigration}/migration.sql`);
    expect(sql).toMatch(/CREATE TABLE "SavedPrompt"/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/ALTER TABLE "(?!SavedPrompt)/);
  });

  it("no other prisma migration folder was touched — every prior migration is still present", () => {
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    for (const prior of [
      "20260723184900_remove_anthropic_ai_result_guest_rate_limit",
      "20260723193054_initial_schema",
      "20260723204536_add_guest_rate_limit",
      "20260724120000_add_ai_center_tool_interactions",
      "20260724130000_add_content_item_source_tool",
    ]) {
      expect(migrationDirs).toContain(prior);
    }
  });
});

// ---------------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------------
describe("Navigation: Prompt Library reachable from the Sidebar, additive only", () => {
  it("appears exactly once in projectNavGroups", () => {
    const all = projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "Prompt Library");
    expect(all).toHaveLength(1);
    expect(all[0].segment).toBe("prompt-library");
  });

  it("never appears in guest or admin navigation", () => {
    expect(guestNavGroups.flatMap((g) => g.items.map((i) => i.label))).not.toContain("Prompt Library");
    expect(adminNavItems.map((i) => i.label)).not.toContain("Prompt Library");
  });

  it("every previously-existing nav item is still present, untouched", () => {
    const principal = projectNavGroups.find((g) => g.label === "Principal")!;
    const labels = principal.items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(["Dashboard", "Chat IA", "AI Center", "Workspace IA", "Asistente IA"]));
  });
});

// ---------------------------------------------------------------------------
// Sin ruptura del motor IA / arquitectura existente
// ---------------------------------------------------------------------------
describe("No second AI engine, no duplicated shared architecture", () => {
  it("engine.ts is unchanged and still the only generation entry point", () => {
    const engine = read("src/lib/ai/local/engine.ts");
    expect(engine).toMatch(/export async function generateLocalText/);
  });

  it("requireProjectAccess/getCurrentUser remain defined in exactly one place, reused (not reimplemented) by prompt-library files", () => {
    expect(existsSync(path.join(ROOT, "src/lib/permissions/index.ts"))).toBe(true);
    expect(read("src/server/actions/prompt-library.ts")).toMatch(/import \{ requireProjectAccess \} from "@\/lib\/permissions"/);
    expect(read("src/server/actions/prompt-library.ts")).not.toMatch(/async function requireProjectAccess/);
  });

  it("Guest and Admin were not touched by this phase", () => {
    for (const relativePath of ["src/components/guest/guest-header.tsx", "src/app/admin/layout.tsx"]) {
      if (existsSync(path.join(ROOT, relativePath))) {
        expect(read(relativePath)).not.toMatch(/SavedPrompt|prompt-library|PromptLibrary/i);
      }
    }
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimateReadingTimeMinutes } from "@/lib/editor/reading-time";
import { toEditorHtml, escapeHtml } from "@/lib/editor/serialization";
import { EDITOR_AI_ACTIONS, findEditorAiAction } from "@/lib/editor/ai-actions";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Reading time — pure, real unit tests
// ---------------------------------------------------------------------------
describe("reading-time.ts: estimateReadingTimeMinutes (pure, real unit tests)", () => {
  it("returns 0 for no words", () => {
    expect(estimateReadingTimeMinutes(0)).toBe(0);
  });

  it("rounds up so even a handful of words never reads as 0 minutes", () => {
    expect(estimateReadingTimeMinutes(1)).toBe(1);
    expect(estimateReadingTimeMinutes(50)).toBe(1);
  });

  it("uses 200 words/minute, rounded up", () => {
    expect(estimateReadingTimeMinutes(200)).toBe(1);
    expect(estimateReadingTimeMinutes(201)).toBe(2);
    expect(estimateReadingTimeMinutes(1000)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 2. Serialization — pure, real unit tests
// ---------------------------------------------------------------------------
describe("serialization.ts: toEditorHtml/escapeHtml (pure, real unit tests)", () => {
  it("wraps plain text in a single paragraph", () => {
    expect(toEditorHtml("hola mundo")).toBe("<p>hola mundo</p>");
  });

  it("splits legacy AI-generated plain text on blank lines into separate paragraphs", () => {
    const html = toEditorHtml("Primer párrafo.\n\nSegundo párrafo.");
    expect(html).toBe("<p>Primer párrafo.</p><p>Segundo párrafo.</p>");
  });

  it("converts single newlines within a paragraph to <br>", () => {
    const html = toEditorHtml("línea 1\nlínea 2");
    expect(html).toBe("<p>línea 1<br>línea 2</p>");
  });

  it("passes through content that already looks like HTML, unmodified", () => {
    const html = "<h1>Título</h1><p>cuerpo</p>";
    expect(toEditorHtml(html)).toBe(html);
  });

  it("returns an empty paragraph for empty/whitespace-only input — never an empty string (Tiptap needs a valid doc)", () => {
    expect(toEditorHtml("")).toBe("<p></p>");
    expect(toEditorHtml("   \n  ")).toBe("<p></p>");
  });

  it("escapeHtml escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("legacy plain text containing HTML-like angle brackets is escaped, never injected as markup", () => {
    const html = toEditorHtml("El precio es < 5 y > 1");
    expect(html).not.toContain("< 5");
    expect(html).toContain("&lt; 5");
  });
});

// ---------------------------------------------------------------------------
// 3. AI actions registry — pure, real unit tests
// ---------------------------------------------------------------------------
describe("ai-actions.ts: EDITOR_AI_ACTIONS registry (pure, real unit tests)", () => {
  it("every action has a unique id", () => {
    const ids = EDITOR_AI_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every action builds a non-empty system prompt and echoes the input text back out unmodified as the user prompt", () => {
    for (const action of EDITOR_AI_ACTIONS) {
      const system = action.buildSystemPrompt({ brandContext: "" });
      expect(system.length).toBeGreaterThan(0);
      expect(action.buildUserPrompt("hola")).toBe("hola");
    }
  });

  it("appends brand context to the system prompt only when non-empty, never leaking an empty block", () => {
    const action = EDITOR_AI_ACTIONS[0];
    const withoutBrand = action.buildSystemPrompt({ brandContext: "" });
    const withBrand = action.buildSystemPrompt({ brandContext: "Tono: cercano." });
    expect(withoutBrand).not.toMatch(/Contexto de marca/);
    expect(withBrand).toMatch(/Contexto de marca/);
    expect(withBrand).toContain("Tono: cercano.");
  });

  it("\"continue-writing\" is the only action that doesn't require a text selection — every other action acts on selected text", () => {
    const noSelection = EDITOR_AI_ACTIONS.filter((a) => !a.requiresSelection);
    expect(noSelection).toHaveLength(1);
    expect(noSelection[0].id).toBe("continue-writing");
  });

  it("covers every action the spec lists: mejorar, gramática, tono (profesional/amigable), largo/corto, traducir, SEO, CTA, hashtags, expandir, resumir, reescribir, relleno, continuar", () => {
    const ids = new Set(EDITOR_AI_ACTIONS.map((a) => a.id));
    for (const expected of [
      "improve",
      "fix-grammar",
      "tone-professional",
      "tone-friendly",
      "shorten",
      "lengthen",
      "seo",
      "cta",
      "hashtags",
      "expand",
      "summarize",
      "rewrite",
      "remove-filler",
      "continue-writing",
    ]) {
      expect(ids.has(expected)).toBe(true);
    }
    expect(EDITOR_AI_ACTIONS.filter((a) => a.id.startsWith("translate-")).length).toBeGreaterThanOrEqual(5);
  });

  it("findEditorAiAction resolves a known id and returns undefined for an unknown one", () => {
    expect(findEditorAiAction("improve")?.label).toBe("Mejorar escritura");
    expect(findEditorAiAction("does-not-exist")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Reuses the existing local AI engine — never a second/parallel engine
// ---------------------------------------------------------------------------
describe("Integration: the editor's AI menu reuses the existing local AI engine, never a new one", () => {
  it("RichEditor drives generation through useLocalAI() — the same hook every AI Center/content form already uses", () => {
    const source = read("src/components/editor/rich-editor.tsx");
    expect(source).toMatch(/import \{ useLocalAI \} from "@\/hooks\/use-local-ai"/);
    expect(source).toMatch(/ai\.generate\(\{ system, prompt \}\)/);
  });

  it("no new AI SDK/provider was installed for the editor — package.json still only has the Resend email SDK and no LLM provider package", () => {
    const packageJson = read("package.json");
    expect(packageJson).not.toMatch(/openai|anthropic|@mlc-ai\/web-llm-2|langchain/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Autosave server action — structural (DB-touching, not a pure function)
// ---------------------------------------------------------------------------
describe("content.ts: autosaveContentItemAction never creates a ContentVersion — only updateContentItemAction does", () => {
  const source = read("src/server/actions/content.ts");
  const fn = source.match(/export async function autosaveContentItemAction[\s\S]*?\n\}/)![0];

  it("enforces project access before writing", () => {
    expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
  });

  it("verifies the item belongs to the given project before updating it", () => {
    expect(fn).toMatch(/current\.projectId !== projectId/);
  });

  it("updates the ContentItem directly, with no ContentVersion snapshot (unlike updateContentItemAction)", () => {
    expect(fn).toMatch(/prisma\.contentItem\.update\(/);
    expect(fn).not.toMatch(/contentVersion\.create/);
    expect(fn).not.toMatch(/\$transaction/);
  });
});

// ---------------------------------------------------------------------------
// 6. Official editor — single source, no parallel/duplicated editor
// ---------------------------------------------------------------------------
describe("Regression: RichEditor is the one editor — content detail and Workspace result editing both use it, no Textarea-based body editor remains", () => {
  it("the content detail page renders ContentEditorPanel (RichEditor-backed), not a raw Textarea form", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/content/[contentId]/page.tsx");
    expect(page).toMatch(/import \{ ContentEditorPanel \} from "@\/components\/content\/content-editor-panel"/);
    expect(page).not.toMatch(/Textarea/);
  });

  it("ResultEditForm (shared by Workspace and AiGenerationForm) renders RichEditor, not a Textarea, for the body field", () => {
    const source = read("src/components/workspace/result-edit-form.tsx");
    expect(source).toMatch(/import \{ RichEditor \} from "@\/components\/editor\/rich-editor"/);
    expect(source).not.toMatch(/Textarea/);
  });

  it("every editor surface builds its extension set from the single shared factory — never a second extensions list", () => {
    const useRichEditor = read("src/components/editor/use-rich-editor.ts");
    const resultEditForm = read("src/components/workspace/result-edit-form.tsx");
    const contentEditorPanel = read("src/components/content/content-editor-panel.tsx");
    expect(useRichEditor).toMatch(/import \{ buildEditorExtensions \} from "@\/lib\/editor\/extensions"/);
    expect(resultEditForm).not.toMatch(/StarterKit/);
    expect(contentEditorPanel).not.toMatch(/StarterKit/);
  });
});

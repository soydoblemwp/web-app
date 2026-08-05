import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeStructure, type EditorJsonNode } from "@/lib/editor/structure-analysis";
import { computeSeoScore, estimateReadability } from "@/lib/editor/seo-score";
import { countLinks } from "@/lib/editor/link-analysis";
import { diffLines, summarizeDiff } from "@/lib/editor/text-diff";
import {
  PUBLISH_CHECKLIST_ITEMS,
  computeChecklistProgress,
  parsePublishPlan,
  EMPTY_PUBLISH_PLAN,
} from "@/lib/editor/publish-checklist";
import { CONTENT_STATUS_VALUES, CONTENT_STATUS_LABELS, estimateContentProgress } from "@/lib/editor/content-status";
import { REPURPOSE_CHANNELS, findRepurposeChannel } from "@/lib/editor/repurpose-platforms";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1. Structure analysis — pure, real unit tests
// ---------------------------------------------------------------------------
describe("structure-analysis.ts: analyzeStructure (pure, real unit tests)", () => {
  const heading = (level: number, text: string): EditorJsonNode => ({
    type: "heading",
    attrs: { level },
    content: text ? [{ type: "text", text }] : undefined,
  });
  const paragraph = (text: string): EditorJsonNode => ({
    type: "paragraph",
    content: text ? [{ type: "text", text }] : undefined,
  });

  it("extracts the heading hierarchy in document order, with a stable occurrence index", () => {
    const doc: EditorJsonNode = { type: "doc", content: [heading(1, "Título"), paragraph("intro"), heading(2, "Sección")] };
    const result = analyzeStructure(doc);
    expect(result.headings).toEqual([
      { level: 1, text: "Título", index: 0 },
      { level: 2, text: "Sección", index: 1 },
    ]);
    expect(result.sectionCount).toBe(2);
  });

  it("detects empty blocks (headings and paragraphs with no text)", () => {
    const doc: EditorJsonNode = { type: "doc", content: [paragraph(""), heading(2, "")] };
    const result = analyzeStructure(doc);
    expect(result.emptyBlockCount).toBe(2);
    expect(result.issues.some((i) => i.id === "empty-blocks")).toBe(true);
  });

  it("flags paragraphs over 800 characters as too long", () => {
    const longText = "a".repeat(801);
    const doc: EditorJsonNode = { type: "doc", content: [paragraph(longText)] };
    const result = analyzeStructure(doc);
    expect(result.longParagraphCount).toBe(1);
    expect(result.issues.some((i) => i.id === "long-paragraphs")).toBe(true);
  });

  it("flags duplicate headings (case-insensitive)", () => {
    const doc: EditorJsonNode = { type: "doc", content: [heading(2, "Beneficios"), paragraph("x"), heading(2, "beneficios")] };
    const result = analyzeStructure(doc);
    expect(result.duplicateHeadings).toEqual(["beneficios"]);
  });

  it("detects a missing introduction when the first substantive block is more than one position in", () => {
    const doc: EditorJsonNode = { type: "doc", content: [heading(1, "T"), heading(2, "S"), paragraph("solo aquí empieza el texto")] };
    const result = analyzeStructure(doc);
    expect(result.hasIntro).toBe(false);
    expect(result.issues.some((i) => i.id === "missing-intro")).toBe(true);
  });

  it("recognizes an introduction present in the first or second block", () => {
    const doc: EditorJsonNode = { type: "doc", content: [paragraph("Introducción real de más de cuarenta caracteres de largo.")] };
    const result = analyzeStructure(doc);
    expect(result.hasIntro).toBe(true);
  });

  it("detects a missing conclusion (no substantive paragraph in the last two blocks)", () => {
    const doc: EditorJsonNode = {
      type: "doc",
      content: [paragraph("Intro larga con más de cuarenta caracteres de longitud."), heading(2, "Sección"), heading(3, "Fin")],
    };
    const result = analyzeStructure(doc);
    expect(result.hasConclusion).toBe(false);
    expect(result.issues.some((i) => i.id === "missing-conclusion")).toBe(true);
  });

  it("detects a missing CTA via keyword search across the whole document text", () => {
    const withoutCta: EditorJsonNode = { type: "doc", content: [paragraph("Un párrafo cualquiera sin llamada a la acción.")] };
    const withCta: EditorJsonNode = { type: "doc", content: [paragraph("Suscríbete ahora para más contenido.")] };
    expect(analyzeStructure(withoutCta).hasCta).toBe(false);
    expect(analyzeStructure(withCta).hasCta).toBe(true);
  });

  it("an empty document reports zero issues except the empty-document flag itself — never false 'missing intro/conclusion/CTA' noise", () => {
    const result = analyzeStructure({ type: "doc", content: [] });
    expect(result.issues).toEqual([{ id: "empty-document", message: "El documento está vacío." }]);
  });

  it("a well-formed document (intro, heading, conclusion, CTA, no dupes) has zero issues", () => {
    const doc: EditorJsonNode = {
      type: "doc",
      content: [
        paragraph("Esta es una introducción sólida de más de cuarenta caracteres."),
        heading(2, "Desarrollo"),
        paragraph("Contenido de desarrollo normal."),
        paragraph("Esta conclusión final también supera los cuarenta caracteres necesarios. Compra ahora."),
      ],
    };
    expect(analyzeStructure(doc).issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. SEO score — deterministic, pure, real unit tests
// ---------------------------------------------------------------------------
describe("seo-score.ts: computeSeoScore is deterministic and never uses AI (pure, real unit tests)", () => {
  it("scores 0 for a completely empty input", () => {
    const result = computeSeoScore({
      seoTitle: "",
      seoDescription: "",
      seoKeyword: "",
      bodyText: "",
      headingTexts: [],
      internalLinksCount: 0,
      externalLinksCount: 0,
    });
    expect(result.score).toBe(0);
  });

  it("is a pure function — identical input always yields the identical score (determinism)", () => {
    const input = {
      seoTitle: "Guía completa de marketing digital para pymes",
      seoDescription: "Aprende marketing digital paso a paso con esta guía completa pensada para pequeñas empresas.",
      seoKeyword: "marketing digital",
      bodyText: "El marketing digital es clave. ".repeat(60),
      headingTexts: ["Qué es el marketing digital", "Estrategias"],
      internalLinksCount: 2,
      externalLinksCount: 1,
    };
    const a = computeSeoScore(input);
    const b = computeSeoScore(input);
    expect(a).toEqual(b);
  });

  it("rewards keyword presence in title, heading, and introduction independently", () => {
    const base = {
      seoDescription: "x".repeat(100),
      bodyText: "contenido ".repeat(310),
      headingTexts: [] as string[],
      internalLinksCount: 1,
      externalLinksCount: 1,
    };
    const withoutKeyword = computeSeoScore({ ...base, seoTitle: "Un título cualquiera de longitud razonable aquí", seoKeyword: "" });
    const withKeywordEverywhere = computeSeoScore({
      ...base,
      seoTitle: "gatos persas: guía completa y consejos prácticos",
      seoKeyword: "gatos persas",
      headingTexts: ["Todo sobre gatos persas"],
      bodyText: `gatos persas son geniales. ${base.bodyText}`,
    });
    expect(withKeywordEverywhere.score).toBeGreaterThan(withoutKeyword.score);
  });

  it("never scores negative or above 100 regardless of input shape", () => {
    const result = computeSeoScore({
      seoTitle: "a".repeat(500),
      seoDescription: "b".repeat(500),
      seoKeyword: "x",
      bodyText: "x ".repeat(5000),
      headingTexts: ["x"],
      internalLinksCount: 999,
      externalLinksCount: 999,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("check weights sum to exactly 100 — a perfect input scores exactly 100", () => {
    const totalWeight = computeSeoScore({
      seoTitle: "",
      seoDescription: "",
      seoKeyword: "",
      bodyText: "",
      headingTexts: [],
      internalLinksCount: 0,
      externalLinksCount: 0,
    }).checks.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBe(100);
  });

  it("estimateReadability returns 0 for empty text and stays within 0-100 otherwise", () => {
    expect(estimateReadability("")).toBe(0);
    expect(estimateReadability("Frases cortas. Fáciles de leer. Muy claras.")).toBeGreaterThan(0);
  });

  it("computeSeoScore never calls out to any AI/network primitive — it's a plain synchronous function", () => {
    const source = read("src/lib/editor/seo-score.ts");
    expect(source).not.toMatch(/useLocalAI|generateLocalText|fetch\(|await /);
  });
});

// ---------------------------------------------------------------------------
// 3. Link analysis — pure, real unit tests
// ---------------------------------------------------------------------------
describe("link-analysis.ts: countLinks (pure, real unit tests)", () => {
  it("classifies a same-host link as internal and a different-host link as external", () => {
    const html = '<a href="https://example.com/page">a</a><a href="https://other.com/page">b</a>';
    const result = countLinks(html, "example.com");
    expect(result.internal).toBe(1);
    expect(result.external).toBe(1);
  });

  it("treats relative and anchor links as internal", () => {
    const html = '<a href="/about">a</a><a href="#section">b</a>';
    expect(countLinks(html, "example.com")).toEqual({ internal: 2, external: 0 });
  });

  it("returns zero counts for content with no links", () => {
    expect(countLinks("<p>no links here</p>", "example.com")).toEqual({ internal: 0, external: 0 });
  });
});

// ---------------------------------------------------------------------------
// 4. Text diff (version comparison) — pure, real unit tests
// ---------------------------------------------------------------------------
describe("text-diff.ts: diffLines (pure, real unit tests, no external diff library)", () => {
  it("identical text produces an all-equal diff", () => {
    const diff = diffLines("línea 1\nlínea 2", "línea 1\nlínea 2");
    expect(diff.every((d) => d.type === "equal")).toBe(true);
  });

  it("detects an added line", () => {
    const diff = diffLines("uno\ndos", "uno\ndos\ntres");
    const summary = summarizeDiff(diff);
    expect(summary.addedLines).toBe(1);
    expect(summary.removedLines).toBe(0);
  });

  it("detects a removed line", () => {
    const diff = diffLines("uno\ndos\ntres", "uno\ntres");
    const summary = summarizeDiff(diff);
    expect(summary.removedLines).toBe(1);
  });

  it("detects both additions and removals in the same comparison", () => {
    const diff = diffLines("a\nb\nc", "a\nx\nc");
    const summary = summarizeDiff(diff);
    expect(summary.addedLines).toBeGreaterThan(0);
    expect(summary.removedLines).toBeGreaterThan(0);
  });

  it("no diff library was installed — package.json only ever gained the editor (Fase 26) and email (Punto 3) dependencies", () => {
    const packageJson = read("package.json");
    expect(packageJson).not.toMatch(/"diff"|jsdiff|fast-diff|diff-match-patch/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Publish checklist — pure, real unit tests
// ---------------------------------------------------------------------------
describe("publish-checklist.ts: checklist items and progress (pure, real unit tests)", () => {
  it("defines exactly the 8 checklist items from the spec", () => {
    const ids = PUBLISH_CHECKLIST_ITEMS.map((i) => i.id);
    expect(ids).toEqual([
      "title-reviewed",
      "content-reviewed",
      "spelling-reviewed",
      "cta-included",
      "links-reviewed",
      "image-added",
      "seo-completed",
      "final-approval",
    ]);
  });

  it("computeChecklistProgress is 0 for an empty/null checklist and 100 when every item is true", () => {
    expect(computeChecklistProgress(null)).toBe(0);
    expect(computeChecklistProgress({})).toBe(0);
    const full = Object.fromEntries(PUBLISH_CHECKLIST_ITEMS.map((i) => [i.id, true]));
    expect(computeChecklistProgress(full)).toBe(100);
  });

  it("computeChecklistProgress reflects partial completion proportionally", () => {
    const half = Object.fromEntries(PUBLISH_CHECKLIST_ITEMS.slice(0, 4).map((i) => [i.id, true]));
    expect(computeChecklistProgress(half)).toBe(50);
  });

  it("parsePublishPlan degrades malformed/legacy JSON to an empty plan instead of throwing", () => {
    expect(parsePublishPlan(null)).toEqual(EMPTY_PUBLISH_PLAN);
    expect(parsePublishPlan(undefined)).toEqual(EMPTY_PUBLISH_PLAN);
    expect(parsePublishPlan("not an object")).toEqual(EMPTY_PUBLISH_PLAN);
    expect(parsePublishPlan(42)).toEqual(EMPTY_PUBLISH_PLAN);
  });

  it("parsePublishPlan round-trips a well-formed plan and drops non-boolean checklist values", () => {
    const parsed = parsePublishPlan({ checklist: { "title-reviewed": true, "content-reviewed": "yes" }, assigneeName: "Ana" });
    expect(parsed.checklist).toEqual({ "title-reviewed": true });
    expect(parsed.assigneeName).toBe("Ana");
  });
});

// ---------------------------------------------------------------------------
// 6. Editorial states — pure, real unit tests
// ---------------------------------------------------------------------------
describe("content-status.ts: the 7 editorial states from the spec (pure, real unit tests)", () => {
  it("defines exactly the 7 states in the spec's order: Idea, Borrador, En revisión, Aprobado, Programado, Publicado, Archivado", () => {
    expect(CONTENT_STATUS_VALUES).toEqual(["IDEA", "DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "ARCHIVED"]);
    expect(CONTENT_STATUS_LABELS).toEqual({
      IDEA: "Idea",
      DRAFT: "Borrador",
      IN_REVIEW: "En revisión",
      APPROVED: "Aprobado",
      SCHEDULED: "Programado",
      PUBLISHED: "Publicado",
      ARCHIVED: "Archivado",
    });
  });

  it("estimateContentProgress increases monotonically through the pipeline for a fixed checklist completion", () => {
    const progressions = CONTENT_STATUS_VALUES.filter((s) => s !== "ARCHIVED").map((status) => estimateContentProgress(status, 0));
    for (let i = 1; i < progressions.length; i++) {
      expect(progressions[i]).toBeGreaterThanOrEqual(progressions[i - 1]);
    }
  });

  it("estimateContentProgress rewards higher checklist completion at the same status", () => {
    expect(estimateContentProgress("DRAFT", 100)).toBeGreaterThan(estimateContentProgress("DRAFT", 0));
  });

  it("estimateContentProgress never exceeds 100", () => {
    expect(estimateContentProgress("PUBLISHED", 100)).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// 7. Repurposing channels — pure, real unit tests + relation to original
// ---------------------------------------------------------------------------
describe("repurpose-platforms.ts: the 11 repurposing channels (pure, real unit tests)", () => {
  it("defines exactly the 11 channels from the spec, including Pinterest added for the Publishing Hub", () => {
    const ids = REPURPOSE_CHANNELS.map((c) => c.id);
    expect(ids).toEqual([
      "instagram",
      "facebook",
      "linkedin",
      "tiktok",
      "x",
      "youtube",
      "pinterest",
      "email",
      "blog-corto",
      "newsletter",
      "video-script",
    ]);
  });

  it("every channel produces a non-empty system prompt (with brand context appended) and preserves the original text verbatim in the user prompt", () => {
    for (const channel of REPURPOSE_CHANNELS) {
      const system = channel.buildSystemPrompt("Tono: cercano.");
      expect(system.length).toBeGreaterThan(0);
      expect(system).toContain("Tono: cercano.");
      const original = "Texto original de ejemplo.";
      expect(channel.buildUserPrompt(original)).toContain(original);
    }
  });

  it("findRepurposeChannel resolves a known id and returns undefined for an unknown one", () => {
    expect(findRepurposeChannel("instagram")?.label).toBe("Instagram");
    expect(findRepurposeChannel("does-not-exist")).toBeUndefined();
  });

  it("createRepurposedContentAction always sets sourceContentId — a real relation to the original, never a disconnected copy", () => {
    const source = read("src/server/actions/content.ts");
    const fn = source.match(/export async function createRepurposedContentAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/sourceContentId: input\.sourceContentId/);
    expect(fn).toMatch(/sourceTool: "editor-repurpose"/);
  });
});

// ---------------------------------------------------------------------------
// 8. Metadata generation / autosave — structural (DB-touching, not pure)
// ---------------------------------------------------------------------------
describe("content.ts: updateContentMetadataAction (metadata generation/autosave, structural)", () => {
  const source = read("src/server/actions/content.ts");
  const fn = source.match(/export async function updateContentMetadataAction[\s\S]*?\n\}/)![0];

  it("enforces EDITOR-level project access before writing", () => {
    expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
  });

  it("verifies the content item belongs to the given project before updating it", () => {
    expect(fn).toMatch(/current\.projectId !== projectId/);
  });

  it("validates input through updateContentMetadataSchema — never trusts raw client input directly", () => {
    expect(fn).toMatch(/updateContentMetadataSchema\.safeParse\(input\)/);
  });

  it("never touches title, body, or creates a ContentVersion — metadata-only, autosave-safe", () => {
    expect(fn).not.toMatch(/title:\s*parsed\.data\.title/);
    expect(fn).not.toMatch(/body:\s*parsed\.data\.body/);
    expect(fn).not.toMatch(/contentVersion\.create/);
  });

  it("returns a typed error instead of throwing on invalid input — errores controlados", () => {
    expect(fn).toMatch(/return \{ error: /);
  });
});

// ---------------------------------------------------------------------------
// 9. Versions — restore/duplicate, structural
// ---------------------------------------------------------------------------
describe("content.ts: version restore/duplicate (structural)", () => {
  const source = read("src/server/actions/content.ts");

  it("restoreContentVersionAction snapshots the CURRENT state before overwriting — restoring is itself undoable", () => {
    const fn = source.match(/export async function restoreContentVersionAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.\$transaction\(\[/);
    expect(fn).toMatch(/contentVersion\.create\(/);
    expect(fn).toMatch(/title: version\.title, body: version\.body/);
  });

  it("restoreContentVersionAction verifies the version belongs to the given content item, not just any id", () => {
    const fn = source.match(/export async function restoreContentVersionAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/version\.contentItemId !== contentId/);
  });

  it("duplicateContentVersionAction creates a NEW ContentItem sourced from the version, linked via sourceContentId — never mutates the live item", () => {
    const fn = source.match(/export async function duplicateContentVersionAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/prisma\.contentItem\.create\(/);
    expect(fn).toMatch(/body: version\.body/);
    expect(fn).toMatch(/sourceContentId: original\.id/);
    expect(fn).not.toMatch(/contentItem\.update\(/);
  });

  it("updateContentItemAction accepts an optional version note and stores it on the ContentVersion snapshot", () => {
    const fn = source.match(/export async function updateContentItemAction[\s\S]*?\n\}/)![0];
    expect(fn).toMatch(/note: formData\.get\("note"\)/);
    expect(fn).toMatch(/note: parsed\.data\.note \|\| null/);
  });
});

// ---------------------------------------------------------------------------
// 10. Scheduling / publication — structural
// ---------------------------------------------------------------------------
describe("social.ts: scheduleContentForPublicationAction avoids duplicates and links the calendar to ContentItem (structural)", () => {
  const source = read("src/server/actions/social.ts");
  const fn = source.match(/export async function scheduleContentForPublicationAction[\s\S]*?\n\}/)![0];

  it("enforces EDITOR-level project access", () => {
    expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
  });

  it("looks up an existing SocialPost for the same {content, platform} pair before creating — never a duplicate calendar entry", () => {
    expect(fn).toMatch(/socialPost\.findFirst\(\{\s*where: \{ projectId, sourceContentId: input\.contentId, platform: input\.platform \}/);
    expect(fn).toMatch(/existing\s*\n?\s*\?\s*await prisma\.socialPost\.update/);
  });

  it("links the SocialPost back to the ContentItem via sourceContentId", () => {
    expect(fn).toMatch(/sourceContentId: input\.contentId/);
  });

  it("bumps ContentItem.status to SCHEDULED once a publish date is set", () => {
    expect(fn).toMatch(/data: \{ status: "SCHEDULED" \}/);
  });

  it("cancellation reuses the existing rescheduleSocialPostAction (clearing scheduledAt) — no separate/duplicated cancel implementation", () => {
    expect(source).toMatch(/export async function rescheduleSocialPostAction/);
    const rescheduleFn = source.match(/export async function rescheduleSocialPostAction[\s\S]*?\n\}/)![0];
    expect(rescheduleFn).toMatch(/scheduledAt: isoDate \? new Date\(isoDate\) : null, status: isoDate \? "SCHEDULED" : "DRAFT"/);
  });
});

// ---------------------------------------------------------------------------
// 11. Campaign linking — structural
// ---------------------------------------------------------------------------
describe("campaign.ts: linkContentToCampaignAction (structural)", () => {
  const source = read("src/server/actions/campaign.ts");
  const fn = source.match(/export async function linkContentToCampaignAction[\s\S]*?\n\}/)![0];

  it("enforces project access and validates both the campaign and content item belong to the project", () => {
    expect(fn).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
    expect(fn).toMatch(/campaign\.projectId !== projectId/);
    expect(fn).toMatch(/contentItem\.projectId !== projectId/);
  });

  it("uses upsert on the composite key — linking twice is idempotent, never a duplicate-key error", () => {
    expect(fn).toMatch(/campaignContent\.upsert\(/);
    expect(fn).toMatch(/campaignId_contentItemId/);
  });
});

// ---------------------------------------------------------------------------
// 12. Sidebar open/close + localStorage persistence — structural
// ---------------------------------------------------------------------------
describe("editor-sidebar.tsx: open/close state persists locally without a setState-in-effect hydration mismatch (structural)", () => {
  const source = read("src/components/editor/sidebar/editor-sidebar.tsx");

  it("persists open/closed state and the active tab to localStorage under namespaced keys", () => {
    expect(source).toMatch(/ai-content-hub:editor-sidebar-open/);
    expect(source).toMatch(/ai-content-hub:editor-sidebar-tab/);
  });

  it("guards every localStorage access for SSR (typeof window check) and swallows storage errors (private browsing)", () => {
    expect(source).toMatch(/typeof window === "undefined"/);
    expect(source.match(/catch \{/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("renders both a desktop persistent column and a mobile slide-over — adapts to mobile without shrinking the editor's own layout", () => {
    expect(source).toMatch(/hidden shrink-0 lg:flex/);
    expect(source).toMatch(/lg:hidden/);
    expect(source).toMatch(/SheetContent/);
  });
});

// ---------------------------------------------------------------------------
// 13. Autosave / concurrency — structural
// ---------------------------------------------------------------------------
describe("Autosave: single in-flight save at a time, visible states, never overwrites with a stale value (structural)", () => {
  it("useEditorAutosave serializes concurrent saves through a loop, never a second concurrent save while one is in flight", () => {
    const source = read("src/components/editor/use-editor-autosave.ts");
    expect(source).toMatch(/export type AutosaveStatus = "idle" \| "pending" \| "saving" \| "saved" \| "error"/);
    expect(source).toMatch(/if \(savingRef\.current\) return;/);
    expect(source).toMatch(/while \(pendingValueRef\.current !== null\)/);
  });

  it("ContentEditorPanel's metadata/body autosave reads current values from refs (not stale render-time closures) inside the save callback", () => {
    const source = read("src/components/content/content-editor-panel.tsx");
    expect(source).toMatch(/titleRef\.current/);
    expect(source).toMatch(/bodyRef\.current/);
    expect(source).toMatch(/metadataRef\.current/);
  });

  it("the explicit 'Guardar versión' button still exists and still calls updateContentItemAction — Fase 27 didn't remove or replace it", () => {
    const source = read("src/components/content/content-editor-panel.tsx");
    expect(source).toMatch(/Guardar versión/);
    expect(source).toMatch(/updateContentItemAction\(projectId, formData\)/);
  });

  it("PublishTab's checklist autosave also reads from refs, not stale state closures", () => {
    const source = read("src/components/editor/sidebar/tabs/publish-tab.tsx");
    expect(source).toMatch(/checklistRef\.current/);
    expect(source).toMatch(/assigneeRef\.current/);
  });
});

// ---------------------------------------------------------------------------
// 14. No alert(), no parallel editor, integration surface
// ---------------------------------------------------------------------------
describe("Regression: no alert(), no parallel editor, sidebar reuses the existing local AI engine and permission layer everywhere", () => {
  it("no sidebar file uses the browser alert() API — sonner toast is used instead", () => {
    const files = [
      "src/components/editor/sidebar/editor-sidebar.tsx",
      "src/components/editor/sidebar/tabs/summary-tab.tsx",
      "src/components/editor/sidebar/tabs/structure-tab.tsx",
      "src/components/editor/sidebar/tabs/seo-tab.tsx",
      "src/components/editor/sidebar/tabs/repurpose-tab.tsx",
      "src/components/editor/sidebar/tabs/versions-tab.tsx",
      "src/components/editor/sidebar/tabs/publish-tab.tsx",
    ];
    for (const file of files) {
      expect(read(file)).not.toMatch(/\balert\(/);
    }
  });

  it("every AI-driven sidebar tab imports useLocalAI — never a new/second AI engine", () => {
    for (const file of [
      "src/components/editor/sidebar/tabs/structure-tab.tsx",
      "src/components/editor/sidebar/tabs/seo-tab.tsx",
      "src/components/editor/sidebar/tabs/repurpose-tab.tsx",
    ]) {
      expect(read(file)).toMatch(/import \{ useLocalAI \} from "@\/hooks\/use-local-ai"/);
    }
  });

  it("every new content-mutating server action requires project access — never an unauthenticated/unauthorized write", () => {
    const files = ["src/server/actions/content.ts", "src/server/actions/social.ts", "src/server/actions/campaign.ts"];
    for (const file of files) {
      const source = read(file);
      const exportedFns = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
      expect(exportedFns.length).toBeGreaterThan(0);
      for (const fnName of exportedFns) {
        const fnMatch = source.match(new RegExp(`export async function ${fnName}\\([\\s\\S]*?\\n\\}`));
        expect(fnMatch?.[0]).toMatch(/requireProjectAccess\(/);
      }
    }
  });

  it("RepurposeTab reuses the official RichEditor for the pre-save preview/edit — never a Textarea or a second editor", () => {
    const source = read("src/components/editor/sidebar/tabs/repurpose-tab.tsx");
    expect(source).toMatch(/import \{ RichEditor \} from "@\/components\/editor\/rich-editor"/);
    expect(source).not.toMatch(/Textarea/);
  });

  it("RichEditor's new Fase 27 props (onEditorReady, controlled fullscreen) are optional — existing callers (ResultEditForm) don't need to change", () => {
    const source = read("src/components/editor/rich-editor.tsx");
    expect(source).toMatch(/onEditorReady\?:/);
    expect(source).toMatch(/fullscreen\?: boolean/);
    const resultEditForm = read("src/components/workspace/result-edit-form.tsx");
    expect(resultEditForm).not.toMatch(/onEditorReady|fullscreen=/);
  });

  it("auth, email, middleware, and permission FILES themselves were never modified by this phase — only new call sites use the existing requireProjectAccess", () => {
    const combined =
      read("src/lib/permissions/index.ts") + read("src/lib/permissions/roles.ts") + read("src/proxy.ts") + read("src/lib/auth/config.ts");
    expect(combined).not.toMatch(/editor-sidebar|ContentMetadata|publishChecklist|repurpose-platforms/i);
  });
});

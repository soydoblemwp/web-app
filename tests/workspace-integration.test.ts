import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectNavGroups, guestNavGroups, adminNavItems } from "@/lib/navigation";
import { resolveHighlightId, mapContentItemToWorkspaceResult } from "@/lib/ai-workspace/types";
import { YOUTUBE_TOOLS } from "@/lib/ai-center/tools/youtube";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// 1-5: Sidebar link
// ---------------------------------------------------------------------------
describe("Task 1: 'Workspace IA' Sidebar link", () => {
  it("1. appears exactly once in the project Sidebar, in Principal, right after AI Center", () => {
    const principal = projectNavGroups.find((g) => g.label === "Principal")!;
    const labels = principal.items.map((i) => i.label);
    const matches = labels.filter((l) => l === "Workspace IA");
    expect(matches).toHaveLength(1);
    expect(labels.indexOf("Workspace IA")).toBe(labels.indexOf("AI Center") + 1);
    expect(principal.items.find((i) => i.label === "Workspace IA")?.segment).toBe("workspace");
  });

  it("appears exactly once across the whole projectNavGroups tree (no accidental duplicate in another group)", () => {
    const all = projectNavGroups.flatMap((g) => g.items).filter((i) => i.label === "Workspace IA");
    expect(all).toHaveLength(1);
  });

  it("2. never appears in guest navigation", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("Workspace IA");
  });

  it("3. never appears in admin navigation or the admin layout", () => {
    expect(adminNavItems.map((i) => i.label)).not.toContain("Workspace IA");
    expect(read("src/app/admin/layout.tsx")).not.toMatch(/Workspace/);
  });

  it("4. is unreachable outside a project — Sidebar (the only renderer of projectNavGroups) is mounted exclusively in [projectId]/layout.tsx", () => {
    const consumers = readFileSync(path.join(ROOT, "src/components/layout/sidebar.tsx"), "utf8");
    expect(consumers).toContain("projectNavGroups");
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/<Sidebar projectId=\{project\.id\} \/>/);
    // Sidebar itself is never imported by /dashboard's own (project-less) page.
    const dashboardHome = read("src/app/(dashboard)/dashboard/page.tsx");
    expect(dashboardHome).not.toMatch(/Sidebar/);
  });

  it("5. the link always resolves under the active projectId — Sidebar builds every href generically from `${base}/${segment}`, no special-casing for workspace", () => {
    const sidebar = read("src/components/layout/sidebar.tsx");
    expect(sidebar).toMatch(/const href = item\.segment \? `\$\{base\}\/\$\{item\.segment\}` : base;/);
    expect(sidebar).not.toMatch(/"\/dashboard\/.*\/workspace"/);
  });

  it("does not add submenus or extra links beyond the one Workspace IA entry", () => {
    const workspaceItem = projectNavGroups.flatMap((g) => g.items).find((i) => i.label === "Workspace IA");
    expect(workspaceItem).toBeDefined();
    expect(Object.keys(workspaceItem!).sort()).toEqual(["icon", "label", "segment"]);
  });
});

// ---------------------------------------------------------------------------
// 6-7: UniversalResultViewer integration, no duplicate parser
// ---------------------------------------------------------------------------
describe("Task 2: AiGenerationForm reuses UniversalResultViewer — one visual system, one parser", () => {
  const FORM = read("src/components/ai-center/generation/ai-generation-form.tsx");

  it("6. imports and renders UniversalResultViewer", () => {
    expect(FORM).toMatch(/import \{ UniversalResultViewer \} from "@\/components\/workspace\/universal-result-viewer"/);
    expect(FORM).toMatch(/<UniversalResultViewer blocks=\{blocks\} \/>/);
  });

  it("7. delegates all block-splitting to the single shared parseResultBlocks — no second/local list parser", () => {
    expect(FORM).toMatch(/import \{ parseResultBlocks \} from "@\/lib\/ai-workspace\/blocks"/);
    // The old bespoke splitter (stripBulletMarker/manual "\n".split + regex) is gone from this file.
    expect(FORM).not.toContain("stripBulletMarker");
    expect(FORM).not.toMatch(/result\s*\.split\("\\n"\)/);

    const blocksModuleOccurrences = [
      "src/lib/ai-workspace/blocks.ts",
      "src/components/ai-center/generation/ai-generation-form.tsx",
      "src/components/workspace/workspace-result-card.tsx",
    ].filter((relativePath) => read(relativePath).includes("export function parseResultBlocks"));
    // Only blocks.ts may *define* parseResultBlocks; the other two only import/call it.
    expect(blocksModuleOccurrences).toEqual(["src/lib/ai-workspace/blocks.ts"]);
  });

  it("still preserves every existing capability: validation, useLocalAI, loading state, errors, LocalAIStatusPanel, sourceTool", () => {
    expect(FORM).toMatch(/useLocalAI/);
    expect(FORM).toMatch(/LocalAIStatusPanel/);
    expect(FORM).toMatch(/Completa el campo/);
    expect(FORM).toMatch(/debe ser un número entre/);
    expect(FORM).toMatch(/toolSlug: tool\.slug/);
    expect(FORM).toMatch(/saveAiToolResultAction/);
  });

  it("8. every one of the 8 YouTube tools is still registered and still resolves a real routeSegment (nothing broken by the form change)", () => {
    expect(YOUTUBE_TOOLS).toHaveLength(8);
    for (const tool of YOUTUBE_TOOLS) {
      expect(tool.routeSegment.length).toBeGreaterThan(0);
      expect(tool.fields.length).toBeGreaterThan(0);
    }
  });

  it("the dynamic YouTube tool page still renders AiGenerationForm unchanged", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx");
    expect(page).toMatch(/<AiGenerationForm tool=\{tool\} projectId=\{projectId\} brandContextText=\{brandContextText\} \/>/);
  });
});

// ---------------------------------------------------------------------------
// 9-10: copy/download never persist
// ---------------------------------------------------------------------------
describe("Tasks 3-4: post-generation actions never create hidden ContentItem records", () => {
  const ACTIONS = read("src/components/workspace/workspace-result-actions.tsx");

  it("9. copy is a pure clipboard write — no server action, no fetch, no prisma call", () => {
    const copyFn = ACTIONS.match(/function handleCopy\(\)[\s\S]*?\n  \}/)![0];
    expect(copyFn).toMatch(/navigator\.clipboard\.writeText/);
    expect(copyFn).not.toMatch(/Action\(|fetch\(|prisma\./);
  });

  it("10. download is a pure Blob/anchor download — no server action, no fetch, no prisma call", () => {
    const downloadFn = ACTIONS.match(/function handleDownload\([\s\S]*?\n  \}/)![0];
    expect(downloadFn).toMatch(/toPlainTextDocument|toMarkdownDocument/);
    expect(downloadFn).not.toMatch(/Action\(|fetch\(|prisma\./);
    expect(ACTIONS).toMatch(/function downloadTextFile/);
  });

  it("share is a placeholder — no server call, structure only per spec", () => {
    const shareFn = ACTIONS.match(/function handleShare\(\)[\s\S]*?\n  \}/)![0];
    expect(shareFn).toMatch(/toast\(/);
    expect(shareFn).not.toMatch(/Action\(|fetch\(|prisma\./);
  });
});

// ---------------------------------------------------------------------------
// 11-12: edit/favorite update the existing ContentItem, never create one
// ---------------------------------------------------------------------------
describe("Tasks 3, 5: editing and favoriting always target the real, already-created ContentItem", () => {
  it("11. ResultEditForm calls the existing updateContentItemAction (update-only) — never contentItem.create", () => {
    const editForm = read("src/components/workspace/result-edit-form.tsx");
    expect(editForm).toMatch(/import \{ updateContentItemAction \} from "@\/server\/actions\/content"/);
    expect(editForm).toMatch(/updateContentItemAction\(projectId, formData\)/);
    expect(editForm).not.toMatch(/prisma\.contentItem\.create/);

    const contentActions = read("src/server/actions/content.ts");
    const fnSource = contentActions.match(/export async function updateContentItemAction[\s\S]*?\n\}/)![0];
    // It legitimately creates a ContentVersion snapshot (version history) —
    // it must never create a second ContentItem.
    expect(fnSource).not.toMatch(/prisma\.contentItem\.create/);
    expect(fnSource).toMatch(/prisma\.contentItem\.update/);
  });

  it("edit never alters sourceTool or content type — updateContentItemAction only ever writes title/body", () => {
    const contentActions = read("src/server/actions/content.ts");
    const fnSource = contentActions.match(/export async function updateContentItemAction[\s\S]*?\n\}/)![0];
    expect(fnSource).not.toMatch(/sourceTool/);
    expect(fnSource).not.toMatch(/type:\s*(parsed\.data\.type|input\.type)/);
  });

  it("12. the new favorite action inside WorkspaceResultActions calls the existing toggleFavoriteContentAction (update-only)", () => {
    const actionsBar = read("src/components/workspace/workspace-result-actions.tsx");
    expect(actionsBar).toMatch(/import \{ toggleFavoriteContentAction \} from "@\/server\/actions\/content"/);
    expect(actionsBar).toMatch(/toggleFavoriteContentAction\.bind\(null, projectId, result\.id, !\(result\.isFavorite \?\? false\)\)/);

    const contentActions = read("src/server/actions/content.ts");
    const fnSource = contentActions.match(/export async function toggleFavoriteContentAction[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/\.update\(/);
    expect(fnSource).not.toMatch(/\.create\(/);
  });

  it("the favorite/open-in-workspace buttons only ever render once a real ContentItem id exists (never for id === null)", () => {
    const actionsBar = read("src/components/workspace/workspace-result-actions.tsx");
    expect(actionsBar).toMatch(/showFavorite && result\.id/);
    expect(actionsBar).toMatch(/showOpenInWorkspace && result\.id/);
  });

  it("WorkspaceResultActions' existing Workspace usage is unchanged: no new props passed, so favorite/open-in-workspace default off", () => {
    const card = read("src/components/workspace/workspace-result-card.tsx");
    expect(card).toMatch(/<WorkspaceResultActions result=\{result\} projectId=\{projectId\} \/>/);
  });
});

// ---------------------------------------------------------------------------
// 13: regenerate flow unchanged (still creates a fresh ContentItem)
// ---------------------------------------------------------------------------
describe("Task 4: regenerate keeps creating a new ContentItem, exactly like before", () => {
  it("13. saveAiToolResultAction still creates (never updates) a ContentItem, and now also returns its real id", () => {
    const actionFile = read("src/server/actions/ai-center-tools.ts");
    const fnSource = actionFile.match(/export async function saveAiToolResultAction[\s\S]*?\n\}/)![0];
    expect(fnSource).toMatch(/prisma\.contentItem\.create/);
    expect(fnSource).not.toMatch(/prisma\.contentItem\.update/);
    expect(fnSource).toMatch(/contentItemId: created\.id/);
  });

  it("AiGenerationForm resets its saved id on every new generation, so a regenerate can never silently reuse the previous ContentItem", () => {
    const form = read("src/components/ai-center/generation/ai-generation-form.tsx");
    expect(form).toMatch(/setContentItemId\(null\)/);
  });
});

// ---------------------------------------------------------------------------
// 14-15: Abrir en Workspace — server-verified ownership, safe on unknown ids
// ---------------------------------------------------------------------------
describe("Task 6: 'Abrir en Workspace' never trusts the client-side id alone", () => {
  const BASE_ITEM = {
    id: "item-1",
    title: "T",
    body: "B",
    language: "es",
    type: "OTHER",
    isFavorite: false,
    sourceTool: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const results = [mapContentItemToWorkspaceResult(BASE_ITEM), mapContentItemToWorkspaceResult({ ...BASE_ITEM, id: "item-2" })];

  it("14. resolves an id that truly belongs to this project's already project-scoped result list", () => {
    expect(resolveHighlightId(results, "item-1")).toBe("item-1");
  });

  it("never exposes a result belonging to a different project: an id absent from this project's list resolves to null", () => {
    expect(resolveHighlightId(results, "some-other-projects-item")).toBeNull();
  });

  it("15. an unknown/nonexistent id is safely ignored (null), not thrown or leaked", () => {
    expect(resolveHighlightId(results, "does-not-exist")).toBeNull();
    expect(resolveHighlightId(results, undefined)).toBeNull();
    expect(resolveHighlightId(results, null)).toBeNull();
    expect(resolveHighlightId([], "item-1")).toBeNull();
  });

  it("the workspace page only ever calls resolveHighlightId against the already project-scoped `results`, never the raw prisma table", () => {
    const page = read("src/app/(dashboard)/dashboard/[projectId]/workspace/page.tsx");
    expect(page).toMatch(/resolveHighlightId\(results, query\.result\)/);
    expect(page).not.toMatch(/prisma\.contentItem\.findUnique/);
  });

  it("the open-in-workspace link always targets the current project's own workspace route", () => {
    const actionsBar = read("src/components/workspace/workspace-result-actions.tsx");
    expect(actionsBar).toMatch(/`\/dashboard\/\$\{projectId\}\/workspace\?result=\$\{result\.id\}`/);
  });
});

// ---------------------------------------------------------------------------
// 16: no new tables/migrations in THIS (workspace-integration) phase
// ---------------------------------------------------------------------------
describe("Task (DB): no new tables or migrations were introduced in this integration phase", () => {
  it("16. prisma/migrations still contains every migration created up to and including this phase", () => {
    // A later phase (Prompt Library) legitimately added its own migration —
    // this only asserts that everything up to this phase is still present,
    // not that nothing has been added since.
    const migrationDirs = readdirSync(path.join(ROOT, "prisma/migrations")).filter((name) => name !== "migration_lock.toml");
    for (const expected of [
      "20260723184900_remove_anthropic_ai_result_guest_rate_limit",
      "20260723193054_initial_schema",
      "20260723204536_add_guest_rate_limit",
      "20260724120000_add_ai_center_tool_interactions",
      "20260724130000_add_content_item_source_tool",
    ]) {
      expect(migrationDirs).toContain(expected);
    }
  });

  it("schema.prisma still has ContentItem — later phases (Prompt Library, AI Templates) added their own models on top, not in place of this phase's own", () => {
    // Later phases legitimately add their own models — see
    // tests/prompt-library.test.ts and tests/ai-templates.test.ts for each
    // phase's own count checks.
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/model ContentItem \{/);
  });
});

// ---------------------------------------------------------------------------
// 17: Admin/Guest/auth intact
// ---------------------------------------------------------------------------
describe("Task (Security): Admin, Guest and auth remain untouched", () => {
  it("17. admin layout/auth files have no reference to the workspace or its new components", () => {
    for (const relativePath of [
      "src/app/admin/layout.tsx",
      "src/lib/auth/config.ts",
      "src/lib/auth/edge-config.ts",
    ]) {
      if (existsSync(path.join(ROOT, relativePath))) {
        expect(read(relativePath)).not.toMatch(/workspace|Workspace|UniversalResultViewer/);
      }
    }
  });

  it("guest header/nav/components have no reference to the workspace", () => {
    expect(read("src/components/guest/guest-header.tsx")).not.toMatch(/workspace|Workspace/);
    expect(read("src/lib/navigation.ts")).toMatch(/guestNavGroups/);
  });

  it("every persistent action still gates on requireProjectAccess with the appropriate role", () => {
    expect(read("src/server/actions/content.ts")).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
    expect(read("src/server/actions/ai-center-tools.ts")).toMatch(/requireProjectAccess\(input\.projectId, "EDITOR"\)/);
  });
});

// ---------------------------------------------------------------------------
// 18: Light/Dark tokens
// ---------------------------------------------------------------------------
describe("Task (UI): Light/Dark/System still rely on existing tokens only", () => {
  it("18. every new/modified workspace and generation component uses existing token classes, never a hardcoded hex color", () => {
    const files = [
      "src/components/workspace/workspace-result-actions.tsx",
      "src/components/workspace/workspace-result-card.tsx",
      "src/components/workspace/result-edit-form.tsx",
      "src/components/workspace/ai-workspace-hub.tsx",
      "src/components/ai-center/generation/ai-generation-form.tsx",
    ];
    for (const relativePath of files) {
      const content = read(relativePath);
      expect(content).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    }
  });

  it("globals.css was not touched by this phase — no new tokens introduced", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--color-success: var(--success);");
    expect(css).not.toMatch(/--color-workspace/);
  });

  it("highlighted result styling uses the existing --primary/--ring token classes, not a new color", () => {
    const card = read("src/components/workspace/workspace-result-card.tsx");
    expect(card).toMatch(/ring-2 ring-primary/);
  });
});

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseResultBlocks } from "@/lib/ai-workspace/blocks";
import { toPlainTextDocument, toMarkdownDocument, buildDownloadFilename } from "@/lib/ai-workspace/download";
import { mapContentItemToWorkspaceResult } from "@/lib/ai-workspace/types";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

describe("parseResultBlocks: pure, dependency-free formatting used by UniversalResultViewer", () => {
  it("groups consecutive bullet lines into one unordered list block", () => {
    const blocks = parseResultBlocks("- uno\n- dos\n- tres");
    expect(blocks).toEqual([{ kind: "list", ordered: false, items: ["uno", "dos", "tres"] }]);
  });

  it("groups consecutive numbered lines into one ordered list block", () => {
    const blocks = parseResultBlocks("1. uno\n2. dos");
    expect(blocks).toEqual([{ kind: "list", ordered: true, items: ["uno", "dos"] }]);
  });

  it("extracts a fenced code block with its language, without disturbing surrounding text", () => {
    const body = "Antes\n\n```sql\nSELECT 1;\n```\n\nDespués";
    const blocks = parseResultBlocks(body);
    expect(blocks).toEqual([
      { kind: "paragraph", content: "Antes" },
      { kind: "code", language: "sql", content: "SELECT 1;" },
      { kind: "paragraph", content: "Después" },
    ]);
  });

  it("recognizes markdown-style headings", () => {
    const blocks = parseResultBlocks("# Introducción\nTexto normal");
    expect(blocks[0]).toEqual({ kind: "heading", content: "Introducción" });
    expect(blocks[1]).toEqual({ kind: "paragraph", content: "Texto normal" });
  });

  it("does not treat a chapter timestamp line as a numbered list item", () => {
    const blocks = parseResultBlocks("00:00 Introducción\n01:30 Desarrollo");
    expect(blocks).toEqual([{ kind: "paragraph", content: "00:00 Introducción\n01:30 Desarrollo" }]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseResultBlocks("")).toEqual([]);
  });
});

describe("download formatters: pure, no DOM/Blob APIs", () => {
  it("toPlainTextDocument puts the title above the body", () => {
    expect(toPlainTextDocument({ title: "Mi título", body: "Cuerpo del resultado" })).toBe(
      "Mi título\n\nCuerpo del resultado\n"
    );
  });

  it("toMarkdownDocument renders the title as a heading and includes the tool label when present", () => {
    const doc = toMarkdownDocument({ title: "Mi título", body: "Cuerpo", toolLabel: "Generador de títulos" });
    expect(doc).toContain("# Mi título");
    expect(doc).toContain("_Generado con: Generador de títulos_");
    expect(doc).toContain("Cuerpo");
  });

  it("toMarkdownDocument omits the tool label line when there is none", () => {
    const doc = toMarkdownDocument({ title: "T", body: "B" });
    expect(doc).not.toContain("Generado con");
  });

  it("buildDownloadFilename slugifies the title and strips accents", () => {
    expect(buildDownloadFilename("Título con Acentos y Ñ", "txt")).toBe("titulo-con-acentos-y-n.txt");
    expect(buildDownloadFilename("", "md")).toBe("resultado.md");
  });
});

describe("mapContentItemToWorkspaceResult: resolves tool/category from the existing AI Center registry", () => {
  const BASE = {
    id: "c1",
    title: "T",
    body: "B",
    language: "es",
    type: "OTHER",
    isFavorite: false,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  };

  it("resolves a known sourceTool to its registry label and category", () => {
    const result = mapContentItemToWorkspaceResult({ ...BASE, sourceTool: "youtube-titulos" });
    expect(result.toolLabel).toBe("Generador de títulos");
    expect(result.categoryLabel).toBe("YouTube");
  });

  it("degrades gracefully (null labels, no throw) for content with no recognized sourceTool", () => {
    const result = mapContentItemToWorkspaceResult({ ...BASE, sourceTool: null });
    expect(result.toolLabel).toBeNull();
    expect(result.categoryLabel).toBeNull();
  });

  it("degrades gracefully for a stale/unknown sourceTool slug instead of throwing", () => {
    const result = mapContentItemToWorkspaceResult({ ...BASE, sourceTool: "herramienta-eliminada" });
    expect(result.toolLabel).toBeNull();
  });
});

describe("existing save actions now tag their ContentItem with sourceTool (minimal, additive change)", () => {
  it("content.ts sets sourceTool for the content, ideas and adapter actions", () => {
    const content = read("src/server/actions/content.ts");
    expect(content).toMatch(/sourceTool: "generador-contenido"/);
    expect(content).toMatch(/sourceTool: "ideas-redes-sociales"/);
    expect(content).toMatch(/sourceTool: "adaptador-contenido"/);
  });

  it("reply.ts sets sourceTool for the reply action", () => {
    expect(read("src/server/actions/reply.ts")).toMatch(/sourceTool: "generador-respuestas"/);
  });

  it("ai-center-tools.ts tags every YouTube tool result with its own real slug, never a hardcoded one", () => {
    const content = read("src/server/actions/ai-center-tools.ts");
    expect(content).toMatch(/sourceTool: tool\.slug/);
  });
});

describe("workspace route and page reuse existing data access, no new queries duplicated", () => {
  const PAGE = "src/app/(dashboard)/dashboard/[projectId]/workspace/page.tsx";

  it("the workspace page exists and fetches through the existing listContentItems service", () => {
    expect(existsSync(path.join(ROOT, PAGE))).toBe(true);
    const page = read(PAGE);
    expect(page).toMatch(/listContentItems\(projectId, \{\}\)/);
    expect(page).not.toContain("prisma.contentItem.findMany");
  });

  it("the project layout's membership guard still runs for /workspace like every other project route", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });
});

describe("workspace card reuses existing content actions verbatim — no parallel/duplicated mutation logic", () => {
  const CARD = read("src/components/workspace/workspace-result-card.tsx");

  it("imports the same existing favorite/duplicate/delete actions, and delegates editing to the shared ResultEditForm", () => {
    expect(CARD).toMatch(/import \{\s*toggleFavoriteContentAction,\s*duplicateContentAction,\s*deleteContentAction,\s*\} from "@\/server\/actions\/content"/);
    expect(CARD).toMatch(/import \{ ResultEditForm \} from "@\/components\/workspace\/result-edit-form"/);
  });

  it("never defines its own contentItem mutation logic", () => {
    expect(CARD).not.toMatch(/prisma\.contentItem\.(update|delete|create)/);
  });
});

describe("no new server action file was introduced beyond what genuinely required new logic", () => {
  it("no src/server/actions/ai-workspace.ts file exists — everything routes through existing content actions", () => {
    expect(existsSync(path.join(ROOT, "src/server/actions/ai-workspace.ts"))).toBe(false);
  });
});

describe("no AI Center, Guest, or Admin file was touched by this phase", () => {
  it("the AI Center hub/registry/tool-card files were not modified to reference the workspace", () => {
    for (const relativePath of [
      "src/components/ai-center/ai-center-hub.tsx",
      "src/components/ai-center/tool-card.tsx",
      "src/components/ai-center/tool-grid.tsx",
    ]) {
      expect(read(relativePath)).not.toMatch(/workspace|Workspace/);
    }
  });

  it("admin layout has no reference to the workspace", () => {
    expect(read("src/app/admin/layout.tsx")).not.toMatch(/workspace|Workspace/);
  });

  it("guest navigation and guest header are untouched", () => {
    expect(read("src/lib/navigation.ts")).toMatch(/guestNavGroups/); // sanity: file still intact
    expect(read("src/components/guest/guest-header.tsx")).not.toMatch(/workspace|Workspace/);
  });
});

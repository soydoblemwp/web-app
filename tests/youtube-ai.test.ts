import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { YOUTUBE_TOOLS, getYoutubeTool } from "@/lib/ai-center/tools/youtube";
import { findToolDefinition } from "@/lib/ai-center/tools/registry";
import { AI_CENTER_CATEGORIES, findAiTool } from "@/lib/ai-center/registry";
import { stripBulletMarker, dedupeLines } from "@/lib/ai-center/tools/format";
import { projectNavGroups, guestNavGroups } from "@/lib/navigation";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const EXPECTED_SLUGS = [
  "youtube-titulos",
  "youtube-descripciones",
  "youtube-hashtags",
  "youtube-etiquetas",
  "youtube-hooks",
  "youtube-capitulos",
  "youtube-ideas",
  "youtube-guiones",
];

describe("YouTube AI tool definitions", () => {
  it("registers exactly the eight tools required for this phase", () => {
    expect(YOUTUBE_TOOLS.map((t) => t.slug).sort()).toEqual([...EXPECTED_SLUGS].sort());
  });

  it("every tool has a unique routeSegment and at least one required field", () => {
    const segments = YOUTUBE_TOOLS.map((t) => t.routeSegment);
    expect(new Set(segments).size).toBe(segments.length);
    for (const tool of YOUTUBE_TOOLS) {
      expect(tool.fields.some((f) => f.required)).toBe(true);
    }
  });

  it("getYoutubeTool resolves by routeSegment and returns undefined for unknown segments", () => {
    expect(getYoutubeTool("titulos")?.slug).toBe("youtube-titulos");
    expect(getYoutubeTool("no-existe")).toBeUndefined();
  });

  it("every tool builds a non-empty system prompt and user prompt from its own fields", () => {
    for (const tool of YOUTUBE_TOOLS) {
      const values = Object.fromEntries(
        tool.fields.map((f) => [f.name, String(f.defaultValue ?? "valor de prueba")])
      );
      expect(tool.buildSystemPrompt("Contexto de marca de prueba").length).toBeGreaterThan(0);
      expect(tool.buildUserPrompt(values).length).toBeGreaterThan(0);
      expect(tool.buildItemTitle(values).length).toBeGreaterThan(0);
    }
  });

  it("list-output tools ask the model for one item per line, never space/comma-separated on one line", () => {
    const listTools = YOUTUBE_TOOLS.filter((t) => t.outputMode === "list");
    for (const tool of listTools) {
      const system = tool.buildSystemPrompt("contexto");
      expect(system).toMatch(/por línea/);
    }
  });

  it("findToolDefinition resolves every registered slug and returns undefined for unknown ones", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(findToolDefinition(slug)?.slug).toBe(slug);
    }
    expect(findToolDefinition("no-existe")).toBeUndefined();
  });
});

describe("format helpers used by the generic generation UI", () => {
  it("stripBulletMarker removes list/number markers but leaves timestamps untouched", () => {
    expect(stripBulletMarker("- Idea uno")).toBe("Idea uno");
    expect(stripBulletMarker("1. Primer título")).toBe("Primer título");
    expect(stripBulletMarker("2) Otro título")).toBe("Otro título");
    expect(stripBulletMarker("00:00 Introducción")).toBe("00:00 Introducción");
  });

  it("dedupeLines removes case-insensitive duplicates and keeps first-seen order", () => {
    expect(dedupeLines(["#viaje", "#Viaje", "#comida", "#VIAJE"])).toEqual(["#viaje", "#comida"]);
  });
});

describe("AI Center registry: YouTube category is now fully available (except thumbnail prompts, out of scope)", () => {
  it("every implemented YouTube tool is 'available' with a real href, thumbnail-prompts stays coming-soon", () => {
    const youtube = AI_CENTER_CATEGORIES.find((c) => c.slug === "youtube")!;
    for (const slug of EXPECTED_SLUGS) {
      const tool = youtube.tools.find((t) => t.slug === slug)!;
      expect(tool.status).toBe("available");
      expect(tool.href?.("proj1")).toMatch(/^\/dashboard\/proj1\/ai-center\/youtube\//);
    }
    const thumbnail = youtube.tools.find((t) => t.slug === "youtube-thumbnail-prompts")!;
    expect(thumbnail.status).toBe("coming-soon");
    expect(thumbnail.href).toBeUndefined();
  });

  it("the registry href for each tool matches that tool's actual routeSegment", () => {
    for (const slug of EXPECTED_SLUGS) {
      const registryTool = findAiTool(slug)!;
      const definition = findToolDefinition(slug)!;
      expect(registryTool.href?.("proj1")).toBe(`/dashboard/proj1/ai-center/youtube/${definition.routeSegment}`);
    }
  });

  it("no other category was touched by this phase", () => {
    const contenido = AI_CENTER_CATEGORIES.find((c) => c.slug === "contenido")!;
    const available = contenido.tools.filter((t) => t.status === "available").map((t) => t.slug);
    expect(available.sort()).toEqual(["adaptador-contenido", "generador-contenido"].sort());
  });
});

describe("routing: one dynamic page serves all eight tools, project membership guard still applies", () => {
  const PAGE = "src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/[tool]/page.tsx";

  it("the dynamic YouTube tool page exists", () => {
    expect(existsSync(path.join(ROOT, PAGE))).toBe(true);
  });

  it("it 404s on an unknown tool segment instead of rendering something arbitrary", () => {
    expect(read(PAGE)).toMatch(/if \(!tool\) notFound\(\);/);
  });

  it("no separate per-tool page files were created (single dynamic route, no duplicated page logic)", () => {
    for (const segment of ["titulos", "descripcion", "hashtags", "etiquetas", "hooks", "capitulos", "ideas", "guion"]) {
      expect(
        existsSync(path.join(ROOT, `src/app/(dashboard)/dashboard/[projectId]/ai-center/youtube/${segment}/page.tsx`))
      ).toBe(false);
    }
  });

  it("the project layout's membership guard still runs for every ai-center/youtube/* request", () => {
    const layout = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(layout).toMatch(/getProjectForUser\(user\.id, projectId\)/);
  });
});

describe("persistence: the shared save action never trusts client-supplied metadata", () => {
  const ACTION = read("src/server/actions/ai-center-tools.ts");

  it("requires real project membership at EDITOR level before writing", () => {
    const fnSource = ACTION.match(/export async function saveAiToolResultAction[\s\S]*?\n}/)![0];
    expect(fnSource).toMatch(/requireProjectAccess\(input\.projectId, "EDITOR"\)/);
  });

  it("looks up contentType/resultKind from the server-side tool definition, never from the request body", () => {
    expect(ACTION).toMatch(/findToolDefinition\(input\.toolSlug\)/);
    expect(ACTION).toMatch(/type: tool\.contentType/);
    expect(ACTION).toMatch(/kind: tool\.resultKind/);
    expect(ACTION).not.toMatch(/type: input\./);
    expect(ACTION).not.toMatch(/kind: input\./);
  });

  it("rejects an unrecognized toolSlug before writing anything", () => {
    expect(ACTION).toMatch(/if \(!tool\) return \{ error:/);
  });
});

describe("no Sidebar, guest, or admin surface was touched by this phase", () => {
  it("projectNavGroups gained no new items beyond the later Workspace IA/Prompt Library/AI Templates/Brand Kits/AI Workflows links — YouTube tools are reached only through the AI Center hub", () => {
    const allLabels = projectNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(allLabels).toEqual([
      "Dashboard",
      "Chat IA",
      "AI Center",
      "Workspace IA",
      "Prompt Library",
      "AI Templates",
      "Brand Kits",
      "AI Workflows",
      "Asistente IA",
      "Contenido",
      "Adaptador de contenido",
      "SEO",
      "Biblioteca",
      "Publicaciones",
      "Ideas para redes sociales",
      "Analizador de publicaciones",
      "Calendario",
      "Campañas",
      "Respuestas",
      "Colaboraciones",
      "Monitoreo",
      "Enlaces",
      "Automatizaciones",
      "WordPress",
      "GitHub",
      "Kit de marca",
      "Analíticas",
      "Configuración",
    ]);
  });

  it("guest navigation is untouched", () => {
    const labels = guestNavGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain("YouTube AI");
    expect(labels).not.toContain("Generador de títulos");
  });

  it("admin layout has no reference to the YouTube tools", () => {
    expect(read("src/app/admin/layout.tsx")).not.toMatch(/youtube|Youtube|YouTube/);
  });
});

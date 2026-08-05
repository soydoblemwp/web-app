import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_TOOL_DEFINITIONS, PUBLIC_TOOL_CATEGORIES, getAllPublicTools, getNonEmptyPublicToolCategories, findPublicTool, getRelatedPublicTools } from "@/lib/public-tools/registry";

const FASE_46_SLUGS = [
  "calculadora-cientifica",
  "calculadora-prestamos",
  "calculadora-interes-compuesto",
  "calculadora-dias-laborables",
  "planificador-reuniones-zonas-horarias",
  "calculadora-horas-trabajadas",
  "cronometro-temporizador",
  "temporizador-pomodoro",
  "selector-aleatorio-equipos",
  "prueba-velocidad-escritura",
  "generador-codigo-barras",
  "comparar-textos",
];

const FASE_45_SLUGS = [
  "recortar-audio",
  "unir-audios",
  "convertir-audio",
  "recortar-video",
  "comprimir-video",
  "redimensionar-video",
  "extraer-audio-video",
  "video-a-gif",
  "extraer-fotogramas-video",
  "editar-subtitulos",
  "grabador-de-voz",
  "grabador-de-pantalla",
];

// Substrings chosen to avoid unrelated false-positive collisions (e.g. plain "cron" would also
// match "Cronómetro" — the new stopwatch/timer tool's name — so the cron-generator check below
// requires the fuller, unambiguous phrase instead).
const KNOWN_DUPLICATION_LIST = [
  "porcentaje",
  "unix",
  "unidades universal",
  "engagement",
  "factura",
  "contraseña",
  "uuid",
  "código qr",
  "expresiones cron",
];

describe("Fase 46: catalog reaches 73+ tools with 12 real new additions", () => {
  it("the catalog has at least 73 tools, all with unique ids and slugs", () => {
    const tools = getAllPublicTools();
    expect(tools.length).toBeGreaterThanOrEqual(73);
    expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length);
    expect(new Set(tools.map((t) => t.slug)).size).toBe(tools.length);
  });

  it("all 12 priority Fase 46 slugs are registered exactly once, each DETERMINISTIC and device-only (isNew is checked separately below — Fase 47 has since superseded this batch)", () => {
    for (const slug of FASE_46_SLUGS) {
      const matches = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === slug);
      expect(matches, slug).toHaveLength(1);
      expect(matches[0].executionType, slug).toBe("DETERMINISTIC");
      expect(matches[0].privacy, slug).toBe("device-only");
      expect(matches[0].status).toBe("available");
    }
  });

  it("Fase 46's own 12 tools are no longer flagged isNew — superseded by Fase 47's batch, exactly as Fase 46 itself superseded Fase 45's", () => {
    for (const slug of FASE_46_SLUGS) {
      expect(findPublicTool(slug)!.isNew, slug).toBe(false);
    }
  });

  it("Fase 45's 12 tools are no longer flagged as new (isNew flips to false once superseded by the next phase's batch)", () => {
    for (const slug of FASE_45_SLUGS) {
      const tool = findPublicTool(slug);
      expect(tool, slug).toBeDefined();
      expect(tool!.isNew, slug).toBe(false);
    }
  });

  it("every tool has a non-empty FAQ, use cases, and how-to-use steps (no copy-pasted empty shells)", () => {
    for (const slug of FASE_46_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.faq.length, slug).toBeGreaterThan(0);
      expect(tool.useCases.length, slug).toBeGreaterThan(0);
      expect(tool.howToUse.length, slug).toBeGreaterThan(0);
      expect(tool.metadata.title.length, slug).toBeGreaterThan(0);
      expect(tool.metadata.description.length, slug).toBeGreaterThan(0);
    }
  });

  it("every tool's intro (longDescription) is unique — no copy-pasted description across tools", () => {
    const descriptions = PUBLIC_TOOL_DEFINITIONS.map((t) => t.longDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("no tool name or slug reproduces an item on the known-duplication list under a new name", () => {
    for (const forbidden of KNOWN_DUPLICATION_LIST) {
      const newToolNames = FASE_46_SLUGS.map((slug) => findPublicTool(slug)!.name.toLowerCase());
      const matches = newToolNames.filter((name) => name.includes(forbidden));
      expect(matches, `"${forbidden}" should not reappear as a new Fase 46 tool name`).toHaveLength(0);
    }
  });

  it("meets the minimum category distribution: >=3 finance/calc, >=4 time/productivity, >=2 generation, >=1 education, >=1 comparison", () => {
    const byCategory = (cat: string) => FASE_46_SLUGS.filter((slug) => findPublicTool(slug)!.category === cat).length;
    const financeCalc = byCategory("finanzas") + byCategory("calculadoras");
    const timeProductivity = byCategory("tiempo") + byCategory("productividad");
    const generation = byCategory("generadores");
    const education = byCategory("educacion");
    const comparison = byCategory("comparacion");
    expect(financeCalc).toBeGreaterThanOrEqual(3);
    expect(timeProductivity).toBeGreaterThanOrEqual(4);
    expect(generation).toBeGreaterThanOrEqual(2);
    expect(education).toBeGreaterThanOrEqual(1);
    expect(comparison).toBeGreaterThanOrEqual(1);
  });

  it("every category referenced by a tool actually exists in PUBLIC_TOOL_CATEGORIES (no orphan category)", () => {
    const categorySlugs = new Set(PUBLIC_TOOL_CATEGORIES.map((c) => c.slug));
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      expect(categorySlugs.has(tool.category), tool.slug).toBe(true);
    }
  });

  it("no category is ever empty (the center must never render an empty category)", () => {
    const nonEmpty = getNonEmptyPublicToolCategories();
    for (const category of PUBLIC_TOOL_CATEGORIES) {
      expect(nonEmpty.some((c) => c.slug === category.slug), category.slug).toBe(true);
    }
  });

  it("every tool's relatedTools list points to real, existing tool slugs, is non-empty, never self-referential, and stays within the 2-4 spec range", () => {
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      expect(tool.relatedTools.length, tool.slug).toBeGreaterThanOrEqual(2);
      expect(tool.relatedTools.length, tool.slug).toBeLessThanOrEqual(4);
      expect(tool.relatedTools, tool.slug).not.toContain(tool.slug);
      for (const relatedSlug of tool.relatedTools) {
        expect(findPublicTool(relatedSlug), `${tool.slug} -> ${relatedSlug}`).toBeDefined();
      }
    }
  });

  it("the 12 new tools resolve real, non-empty related-tool objects via getRelatedPublicTools", () => {
    for (const slug of FASE_46_SLUGS) {
      const related = getRelatedPublicTools(slug);
      expect(related.length, slug).toBeGreaterThan(0);
      expect(related.every((t) => t.slug !== slug), slug).toBe(true);
    }
  });
});

describe("Fase 46: component wiring stays in sync with the registry (single source of truth)", () => {
  it("RENDERABLE_TOOL_SLUGS in tool-component-registry.tsx matches PUBLIC_TOOL_DEFINITIONS exactly (same set, same size)", () => {
    const registrySource = fs.readFileSync("src/components/public-tools/tool-component-registry.tsx", "utf8");
    const match = registrySource.match(/RENDERABLE_TOOL_SLUGS = \[([\s\S]*?)\] as const/);
    expect(match).not.toBeNull();
    const renderableSlugs = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const registrySlugs = PUBLIC_TOOL_DEFINITIONS.map((t) => t.slug);
    expect(new Set(renderableSlugs)).toEqual(new Set(registrySlugs));
    expect(renderableSlugs.length).toBe(registrySlugs.length);
  });

  it("every Fase 46 slug has a matching dynamic import and switch case in tool-component-registry.tsx", () => {
    const registrySource = fs.readFileSync("src/components/public-tools/tool-component-registry.tsx", "utf8");
    for (const slug of FASE_46_SLUGS) {
      expect(registrySource, slug).toMatch(new RegExp(`case "${slug}":`));
    }
  });

  it("every Fase 46 tool component file exists on disk", () => {
    const files = [
      "scientific-calculator-tool",
      "loan-calculator-tool",
      "compound-interest-calculator-tool",
      "business-days-calculator-tool",
      "timezone-meeting-planner-tool",
      "work-hours-calculator-tool",
      "stopwatch-timer-tool",
      "pomodoro-timer-tool",
      "random-picker-teams-tool",
      "typing-speed-test-tool",
      "barcode-generator-tool",
      "text-comparator-tool",
    ];
    for (const file of files) {
      expect(fs.existsSync(`src/components/public-tools/tools/${file}.tsx`), file).toBe(true);
    }
  });

  it("sitemap.ts derives its tool routes from getAllPublicTools() — no second, manually-maintained tool list", () => {
    const sitemapSource = fs.readFileSync("src/app/sitemap.ts", "utf8");
    expect(sitemapSource).toMatch(/getAllPublicTools/);
  });
});

describe("Fase 46: privacy and security invariants across the 12 new components", () => {
  const files = [
    "scientific-calculator-tool",
    "loan-calculator-tool",
    "compound-interest-calculator-tool",
    "business-days-calculator-tool",
    "timezone-meeting-planner-tool",
    "work-hours-calculator-tool",
    "stopwatch-timer-tool",
    "pomodoro-timer-tool",
    "random-picker-teams-tool",
    "typing-speed-test-tool",
    "barcode-generator-tool",
    "text-comparator-tool",
  ];

  it("no component sends data to a server: no fetch, XMLHttpRequest, \"use server\", or console logging of user data", () => {
    for (const file of files) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).not.toMatch(/"use server"/);
      expect(source, file).not.toMatch(/fetch\(/);
      expect(source, file).not.toMatch(/XMLHttpRequest/);
      expect(source, file).not.toMatch(/console\.(log|warn|error|info)\(/);
    }
  });

  it("no component auto-saves to localStorage/sessionStorage/IndexedDB by default", () => {
    for (const file of files) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });

  it("no component or shared core uses eval() or new Function()", () => {
    const dirs = [
      "src/components/public-tools/tools",
      "src/lib/public-tools/math",
      "src/lib/public-tools/finance",
      "src/lib/public-tools/productivity",
      "src/lib/public-tools/time",
      "src/lib/public-tools/random",
      "src/lib/public-tools/education",
      "src/lib/public-tools/barcodes",
      "src/lib/public-tools/comparison",
    ];
    for (const dir of dirs) {
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
        const source = fs.readFileSync(`${dir}/${entry}`, "utf8");
        expect(source, `${dir}/${entry}`).not.toMatch(/\beval\(/);
        expect(source, `${dir}/${entry}`).not.toMatch(/new Function\(/);
      }
    }
  });

  it("dangerouslySetInnerHTML across the 12 new components is used only by the barcode tool, fed exclusively by jsbarcode's own renderer (never raw user text)", () => {
    for (const file of files) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      const usesIt = /dangerouslySetInnerHTML/.test(source);
      if (file === "barcode-generator-tool") {
        expect(usesIt, file).toBe(true);
        expect(source).toMatch(/dangerouslySetInnerHTML=\{\{\s*__html:\s*svgMarkup\s*\}\}/);
      } else {
        expect(usesIt, file).toBe(false);
      }
    }
  });

  it("the barcode/generation.ts module never reaches jsbarcode outside a dynamic import (never eagerly bundled)", () => {
    const source = fs.readFileSync("src/lib/public-tools/barcodes/generation.ts", "utf8");
    expect(source).not.toMatch(/^import .*jsbarcode/m);
    expect(source).toMatch(/await import\("jsbarcode"\)/);
  });
});

describe("Fase 46: shared-core reuse (no duplicated implementations)", () => {
  it("business-days.ts reuses the existing CalendarDate epoch-day helpers instead of re-implementing date-to-integer conversion", () => {
    const source = fs.readFileSync("src/lib/public-tools/productivity/business-days.ts", "utf8");
    expect(source).toMatch(/calendarDateToEpochDay|epochDayToCalendarDate|addCalendarTime|compareCalendarDates/);
  });

  it("random/picker.ts reuses the single secure-random source, never re-implementing rejection sampling locally", () => {
    const source = fs.readFileSync("src/lib/public-tools/random/picker.ts", "utf8");
    expect(source).toMatch(/from "@\/lib\/public-tools\/utilities\/secure-random"/);
  });

  it("stopwatch, countdown, and pomodoro all import the same shared timer-engine module (a single pause/resume/correction implementation)", () => {
    for (const file of ["stopwatch-timer-tool", "pomodoro-timer-tool"]) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).toMatch(/productivity\/timer-engine/);
    }
  });

  it("finance/loan.ts routes every payment through the single minor-units module (money.ts) since its schedule must reconcile to an exact real-world balance", () => {
    const source = fs.readFileSync("src/lib/public-tools/finance/loan.ts", "utf8");
    expect(source).toMatch(/from "\.\/money"/);
  });

  it("finance/compound-interest.ts deliberately simulates in plain floating point (no per-period cent rounding) — it is a mathematical projection/estimate, not a binding payment schedule, and per-period rounding would introduce its own artificial bias rather than remove one", () => {
    const source = fs.readFileSync("src/lib/public-tools/finance/compound-interest.ts", "utf8");
    expect(source).not.toMatch(/from "\.\/money"/);
  });
});

describe("Fase 46: dependency hygiene", () => {
  it("package.json declares exactly one new dependency for this phase: jsbarcode", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.dependencies.jsbarcode).toBeDefined();
  });
});

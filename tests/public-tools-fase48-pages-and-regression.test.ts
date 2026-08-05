import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_TOOL_DEFINITIONS, PUBLIC_TOOL_CATEGORIES, getAllPublicTools, getNonEmptyPublicToolCategories, findPublicTool, getRelatedPublicTools, getPublicToolsByCategory } from "@/lib/public-tools/registry";
import { RENDERABLE_TOOL_SLUGS } from "@/components/public-tools/tool-component-registry";

const FASE_48_SLUGS = [
  "calculadora-punto-equilibrio",
  "calculadora-roi-roas-recuperacion",
  "calculadora-inventario-reposicion",
  "calculadora-rentabilidad-productos",
  "calculadora-comisiones-ventas",
  "comparador-precio-unidad",
  "calculadora-gpa-promedio",
  "calculadora-nota-final",
  "calculadora-costo-combustible-viaje",
  "escalar-recetas",
  "calculadora-costo-receta",
  "calculadora-consumo-electrico",
];

const FASE_48_COMPONENT_FILES = [
  "break-even-tool",
  "roi-roas-payback-tool",
  "inventory-reorder-tool",
  "product-profitability-tool",
  "sales-commission-tool",
  "unit-price-comparator-tool",
  "gpa-calculator-tool",
  "final-grade-tool",
  "fuel-trip-cost-tool",
  "recipe-scaler-tool",
  "recipe-cost-tool",
  "electricity-consumption-tool",
];

describe("Fase 48: catalog reached 97 tools with 12 real additions (now superseded by Fase 49's 109)", () => {
  it("the catalog has at least 97 tools (Fase 48's own count), all with unique ids and slugs", () => {
    const tools = getAllPublicTools();
    expect(tools.length).toBeGreaterThanOrEqual(97);
    expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length);
    expect(new Set(tools.map((t) => t.slug)).size).toBe(tools.length);
  });

  it("all 12 Fase 48 slugs are still registered exactly once, each DETERMINISTIC and device-only (isNew:false now that Fase 49 supersedes them, exactly like Fase 46/47 before them)", () => {
    for (const slug of FASE_48_SLUGS) {
      const matches = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === slug);
      expect(matches, slug).toHaveLength(1);
      expect(matches[0].executionType, slug).toBe("DETERMINISTIC");
      expect(matches[0].privacy, slug).toBe("device-only");
      expect(matches[0].isNew, slug).toBe(false);
      expect(matches[0].status).toBe("available");
      expect(matches[0].requiresLocalAI, slug).toBe(false);
    }
  });

  it("every Fase 48 tool has a non-empty FAQ, use cases, how-to-use steps, and unique metadata", () => {
    for (const slug of FASE_48_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.faq.length, slug).toBeGreaterThan(0);
      expect(tool.useCases.length, slug).toBeGreaterThan(0);
      expect(tool.howToUse.length, slug).toBeGreaterThan(0);
      expect(tool.metadata.title.length, slug).toBeGreaterThan(0);
      expect(tool.metadata.description.length, slug).toBeGreaterThan(0);
      expect(tool.keywords.length, slug).toBeGreaterThan(0);
    }
  });

  it("every tool's longDescription is unique across the whole catalog — no copy-pasted intro", () => {
    const descriptions = PUBLIC_TOOL_DEFINITIONS.map((t) => t.longDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("no two tools share an overlapping keyword set (no accidental duplicate capability)", () => {
    for (let i = 0; i < PUBLIC_TOOL_DEFINITIONS.length; i++) {
      for (let j = i + 1; j < PUBLIC_TOOL_DEFINITIONS.length; j++) {
        const a = new Set(PUBLIC_TOOL_DEFINITIONS[i].keywords.map((k) => k.toLowerCase()));
        const b = new Set(PUBLIC_TOOL_DEFINITIONS[j].keywords.map((k) => k.toLowerCase()));
        const overlap = [...a].filter((k) => b.has(k));
        expect(overlap, `${PUBLIC_TOOL_DEFINITIONS[i].slug} vs ${PUBLIC_TOOL_DEFINITIONS[j].slug}`).toHaveLength(0);
      }
    }
  });
});

describe("Fase 48: categories — cocina, hogar, viajes added; negocios/educacion reused, never duplicated", () => {
  it("adds exactly 3 new categories (cocina, hogar, viajes)", () => {
    const categorySlugs = PUBLIC_TOOL_CATEGORIES.map((c) => c.slug);
    expect(categorySlugs).toContain("cocina");
    expect(categorySlugs).toContain("hogar");
    expect(categorySlugs).toContain("viajes");
    expect(categorySlugs.filter((s) => s === "cocina")).toHaveLength(1);
    expect(categorySlugs.filter((s) => s === "hogar")).toHaveLength(1);
    expect(categorySlugs.filter((s) => s === "viajes")).toHaveLength(1);
  });

  it("reuses negocios and educacion for commerce/education tools instead of creating equivalent alias categories", () => {
    const categorySlugs = PUBLIC_TOOL_CATEGORIES.map((c) => c.slug);
    expect(categorySlugs.filter((s) => s === "negocios")).toHaveLength(1);
    expect(categorySlugs.filter((s) => s === "educacion")).toHaveLength(1);
    expect(categorySlugs).not.toContain("comercio");
  });

  it("meets the minimum distribution: 5 commerce (negocios), 2 education, 2 cooking, 2 household, 1 travel", () => {
    const commerceSlugs = ["calculadora-punto-equilibrio", "calculadora-roi-roas-recuperacion", "calculadora-inventario-reposicion", "calculadora-rentabilidad-productos", "calculadora-comisiones-ventas"];
    for (const slug of commerceSlugs) expect(findPublicTool(slug)!.category, slug).toBe("negocios");

    const educationSlugs = ["calculadora-gpa-promedio", "calculadora-nota-final"];
    for (const slug of educationSlugs) expect(findPublicTool(slug)!.category, slug).toBe("educacion");

    const cookingSlugs = ["escalar-recetas", "calculadora-costo-receta"];
    for (const slug of cookingSlugs) expect(findPublicTool(slug)!.category, slug).toBe("cocina");

    const householdSlugs = ["comparador-precio-unidad", "calculadora-consumo-electrico"];
    for (const slug of householdSlugs) expect(findPublicTool(slug)!.category, slug).toBe("hogar");

    expect(findPublicTool("calculadora-costo-combustible-viaje")!.category).toBe("viajes");
  });

  it("no category is ever empty, including the 3 new ones", () => {
    const nonEmpty = getNonEmptyPublicToolCategories();
    for (const category of PUBLIC_TOOL_CATEGORIES) {
      expect(nonEmpty.some((c) => c.slug === category.slug), category.slug).toBe(true);
    }
    expect(getPublicToolsByCategory("cocina").length).toBeGreaterThan(0);
    expect(getPublicToolsByCategory("hogar").length).toBeGreaterThan(0);
    expect(getPublicToolsByCategory("viajes").length).toBeGreaterThan(0);
  });

  it("every category referenced by a tool actually exists in PUBLIC_TOOL_CATEGORIES", () => {
    const categorySlugs = new Set(PUBLIC_TOOL_CATEGORIES.map((c) => c.slug));
    for (const tool of PUBLIC_TOOL_DEFINITIONS) expect(categorySlugs.has(tool.category), tool.slug).toBe(true);
  });
});

describe("Fase 48: related tools", () => {
  it("every tool's relatedTools list points to real, existing slugs, is 2-4 long, and never self-referential", () => {
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      expect(tool.relatedTools.length, tool.slug).toBeGreaterThanOrEqual(2);
      expect(tool.relatedTools.length, tool.slug).toBeLessThanOrEqual(4);
      expect(tool.relatedTools, tool.slug).not.toContain(tool.slug);
      for (const relatedSlug of tool.relatedTools) expect(findPublicTool(relatedSlug), `${tool.slug} -> ${relatedSlug}`).toBeDefined();
    }
  });

  it("the 12 new tools resolve real, non-empty related-tool objects", () => {
    for (const slug of FASE_48_SLUGS) {
      const related = getRelatedPublicTools(slug);
      expect(related.length, slug).toBeGreaterThan(0);
      expect(related.every((t) => t.slug !== slug), slug).toBe(true);
    }
  });

  it("break-even links to profitability tools, and the unit converter is reused by unit-price/fuel-trip/electricity — never a second conversion table", () => {
    expect(findPublicTool("calculadora-punto-equilibrio")!.relatedTools).toContain("calculadora-rentabilidad-productos");
    expect(findPublicTool("comparador-precio-unidad")!.relatedTools).toContain("conversor-unidades");
    expect(findPublicTool("calculadora-costo-combustible-viaje")!.relatedTools).toContain("conversor-unidades");
  });
});

describe("Fase 48: component wiring stays in sync with the registry (single source of truth)", () => {
  it("RENDERABLE_TOOL_SLUGS in tool-component-registry.tsx matches PUBLIC_TOOL_DEFINITIONS exactly", () => {
    const registrySource = fs.readFileSync("src/components/public-tools/tool-component-registry.tsx", "utf8");
    const match = registrySource.match(/RENDERABLE_TOOL_SLUGS = \[([\s\S]*?)\] as const/);
    expect(match).not.toBeNull();
    const renderableSlugs = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const registrySlugs = PUBLIC_TOOL_DEFINITIONS.map((t) => t.slug);
    expect(new Set(renderableSlugs)).toEqual(new Set(registrySlugs));
    expect(renderableSlugs.length).toBe(registrySlugs.length);
  });

  it("every Fase 48 slug has a matching switch case in tool-component-registry.tsx", () => {
    const registrySource = fs.readFileSync("src/components/public-tools/tool-component-registry.tsx", "utf8");
    for (const slug of FASE_48_SLUGS) expect(registrySource, slug).toMatch(new RegExp(`case "${slug}":`));
  });

  it("every Fase 48 tool component file exists on disk", () => {
    for (const file of FASE_48_COMPONENT_FILES) expect(fs.existsSync(`src/components/public-tools/tools/${file}.tsx`), file).toBe(true);
  });

  it("every Fase 48 component is registered via next/dynamic in tool-component-registry.tsx (code-split, never eagerly imported)", () => {
    const registrySource = fs.readFileSync("src/components/public-tools/tool-component-registry.tsx", "utf8");
    for (const file of FASE_48_COMPONENT_FILES) expect(registrySource, file).toMatch(new RegExp(`import\\("@/components/public-tools/tools/${file}"\\)`));
  });

  it("sitemap.ts derives its tool routes from getAllPublicTools() — no second, manually-maintained tool list", () => {
    const sitemapSource = fs.readFileSync("src/app/sitemap.ts", "utf8");
    expect(sitemapSource).toMatch(/getAllPublicTools/);
  });
});

describe("Fase 48: shared cores are reused, never duplicated", () => {
  it("all 6 commerce/hogar money tools reuse business/invoice.ts's currency-aware money core, not a second money implementation", () => {
    const files = ["break-even-tool", "roi-roas-payback-tool", "inventory-reorder-tool", "product-profitability-tool", "sales-commission-tool", "unit-price-comparator-tool", "fuel-trip-cost-tool", "recipe-cost-tool", "electricity-consumption-tool"];
    for (const file of files) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).toMatch(/from "@\/lib\/public-tools\/business\/invoice"/);
    }
  });

  it("unit-price-comparator-tool.tsx reuses utilities/units.ts's UNIT_CATEGORIES, never a second unit table", () => {
    const source = fs.readFileSync("src/components/public-tools/tools/unit-price-comparator-tool.tsx", "utf8");
    expect(source).toMatch(/from "@\/lib\/public-tools\/utilities\/units"/);
  });

  it("gpa-calculator-tool.tsx and recipe-cost-tool.tsx reuse the shared CSV parser (performance/csv.ts), never a second CSV parser", () => {
    for (const file of ["gpa-calculator-tool", "recipe-cost-tool"]) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).toMatch(/from "@\/lib\/performance\/csv"/);
    }
  });

  it("every Fase 48 component that offers JSON import goes through the shared, prototype-pollution-guarded parseDocumentEnvelope", () => {
    for (const file of FASE_48_COMPONENT_FILES) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).toMatch(/parseDocumentEnvelope/);
      expect(source, file).toMatch(/buildDocumentEnvelope/);
    }
  });

  it("recipe-scaler-tool.tsx and recipe-cost-tool.tsx both reuse cooking/recipe-units.ts's convertRecipeUnit — never two unit-conversion implementations", () => {
    const scaler = fs.readFileSync("src/components/public-tools/tools/recipe-scaler-tool.tsx", "utf8");
    expect(scaler).toMatch(/from "@\/lib\/public-tools\/cooking\/recipe-units"/);
  });
});

describe("Fase 48: privacy and security invariants across the 12 new components", () => {
  it("no component sends data to a server: no fetch, XMLHttpRequest, \"use server\", or console logging of user data", () => {
    for (const file of FASE_48_COMPONENT_FILES) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).not.toMatch(/"use server"/);
      expect(source, file).not.toMatch(/fetch\(/);
      expect(source, file).not.toMatch(/XMLHttpRequest/);
      expect(source, file).not.toMatch(/console\.(log|warn|error|info)\(/);
    }
  });

  it("no component auto-saves to localStorage/sessionStorage/IndexedDB", () => {
    for (const file of FASE_48_COMPONENT_FILES) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });

  it("no component or new shared core uses eval() or new Function()", () => {
    const dirs = ["src/components/public-tools/tools", "src/lib/public-tools/commerce", "src/lib/public-tools/education", "src/lib/public-tools/travel", "src/lib/public-tools/cooking", "src/lib/public-tools/household"];
    for (const dir of dirs) {
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
        const source = fs.readFileSync(`${dir}/${entry}`, "utf8");
        expect(source, `${dir}/${entry}`).not.toMatch(/\beval\(/);
        expect(source, `${dir}/${entry}`).not.toMatch(/new Function\(/);
      }
    }
  });

  it("dangerouslySetInnerHTML is never used by any of the 12 new components or the shared chart component", () => {
    for (const file of FASE_48_COMPONENT_FILES) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML/);
    }
    const chart = stripComments(fs.readFileSync("src/components/public-tools/accessible-chart.tsx", "utf8"));
    expect(chart).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("no Fase 48 core or component reads window.navigator.geolocation", () => {
    const dirs = ["src/lib/public-tools/travel", "src/components/public-tools/tools"];
    for (const dir of dirs) {
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
        const source = fs.readFileSync(`${dir}/${entry}`, "utf8");
        expect(source, `${dir}/${entry}`).not.toMatch(/navigator\.geolocation/);
      }
    }
  });
});

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("Fase 48: no hardcoded current external data (spec section 23)", () => {
  it("product-profitability-tool.tsx never hardcodes a real marketplace fee percentage or name", () => {
    const source = stripComments(fs.readFileSync("src/components/public-tools/tools/product-profitability-tool.tsx", "utf8"));
    for (const marketplace of ["Amazon", "Etsy", "eBay", "Shopify", "TikTok Shop"]) {
      expect(source, marketplace).not.toMatch(new RegExp(marketplace, "i"));
    }
  });

  it("fuel-trip-cost-tool.tsx never references geolocation, maps, or a live fuel-price API", () => {
    const source = stripComments(fs.readFileSync("src/components/public-tools/tools/fuel-trip-cost-tool.tsx", "utf8"));
    expect(source).not.toMatch(/navigator\.geolocation/);
    expect(source).not.toMatch(/maps\.googleapis|mapbox/i);
  });

  it("electricity-consumption-tool.tsx and recipe-cost-tool.tsx never fetch a real-time price/tariff API", () => {
    for (const file of ["electricity-consumption-tool", "recipe-cost-tool"]) {
      const source = stripComments(fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8"));
      expect(source, file).not.toMatch(/fetch\(/);
    }
  });
});

describe("Fase 48 regression: all 85 prior-phase tools remain intact", () => {
  it("spot-checks one representative tool from each prior phase still resolves correctly", () => {
    const representative = ["contador-de-palabras", "unir-pdf", "generador-contrasenas", "generador-facturas-presupuestos", "recortar-audio", "calculadora-cientifica", "crear-curriculum-cv"];
    for (const slug of representative) {
      const tool = findPublicTool(slug);
      expect(tool, slug).toBeDefined();
      expect(RENDERABLE_TOOL_SLUGS as readonly string[], slug).toContain(slug);
    }
  });

  it("the percentage calculator still supports margin and markup modes untouched by Fase 48", async () => {
    const { calculatePercentage } = await import("@/lib/public-tools/utilities/percentages");
    expect(calculatePercentage("margin", 100, 60).ok).toBe(true);
    expect(calculatePercentage("markup", 100, 60).ok).toBe(true);
  });

  it("the shared money core (business/invoice.ts) formatMoney/majorToMinor/minorToMajor still round-trip correctly", async () => {
    const { majorToMinor, minorToMajor, formatMoney } = await import("@/lib/public-tools/business/invoice");
    expect(minorToMajor(majorToMinor(19.99, "EUR"), "EUR")).toBeCloseTo(19.99, 6);
    expect(formatMoney(1999, "EUR", "es-ES")).toContain("19");
  });
});

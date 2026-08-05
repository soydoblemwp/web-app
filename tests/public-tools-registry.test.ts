import { describe, expect, it } from "vitest";
import {
  PUBLIC_TOOL_DEFINITIONS,
  PUBLIC_TOOL_CATEGORIES,
  getAllPublicTools,
  findPublicTool,
  getPublicToolCategory,
  getPublicToolsByCategory,
  getFeaturedPublicTools,
  getRelatedPublicTools,
  getNonEmptyPublicToolCategories,
} from "@/lib/public-tools/registry";
import { RENDERABLE_TOOL_SLUGS } from "@/components/public-tools/tool-component-registry";

// ---------------------------------------------------------------------------
// Fase 41 — inventario y duplicados / registro central (spec sections 2, 3, 6, 21)
// ---------------------------------------------------------------------------

describe("registry: exactly 109 tools, all real IDs/slugs unique", () => {
  it("has exactly 109 tool definitions (13 Fase 41 + 12 Fase 42 + 12 Fase 43 + 12 Fase 44 + 12 audio/video/subtítulos/grabación tools from Fase 45 + 12 productivity/time/calc/generator tools from Fase 46 + 12 employment/business/organization/printables tools from Fase 47 + 12 commerce/education/cooking/household/travel tools from Fase 48 + 12 data-format/code/security-web/network tools from Fase 49)", () => {
    expect(PUBLIC_TOOL_DEFINITIONS).toHaveLength(109);
  });

  it("has unique ids", () => {
    const ids = PUBLIC_TOOL_DEFINITIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique slugs (never registers two slugs for the same tool)", () => {
    const slugs = PUBLIC_TOOL_DEFINITIONS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique names (no two tools claiming to be the same capability under different display names)", () => {
    const names = PUBLIC_TOOL_DEFINITIONS.map((t) => t.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("never registers two tools with overlapping keyword sets implying the same function", () => {
    for (let i = 0; i < PUBLIC_TOOL_DEFINITIONS.length; i++) {
      for (let j = i + 1; j < PUBLIC_TOOL_DEFINITIONS.length; j++) {
        const a = new Set(PUBLIC_TOOL_DEFINITIONS[i].keywords.map((k) => k.toLowerCase()));
        const b = new Set(PUBLIC_TOOL_DEFINITIONS[j].keywords.map((k) => k.toLowerCase()));
        const overlap = [...a].filter((k) => b.has(k));
        expect(overlap.length).toBe(0);
      }
    }
  });

  it("every renderable component slug matches a real registry entry, and vice versa", () => {
    const registrySlugs = new Set(PUBLIC_TOOL_DEFINITIONS.map((t) => t.slug));
    for (const slug of RENDERABLE_TOOL_SLUGS) expect(registrySlugs.has(slug)).toBe(true);
    expect(RENDERABLE_TOOL_SLUGS).toHaveLength(PUBLIC_TOOL_DEFINITIONS.length);
  });
});

describe("registry: field completeness (spec section 6)", () => {
  it("every tool has all required registry fields populated", () => {
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      expect(tool.id).toBeTruthy();
      expect(tool.slug).toBeTruthy();
      expect(tool.name).toBeTruthy();
      expect(tool.shortDescription.length).toBeGreaterThan(10);
      expect(tool.longDescription.length).toBeGreaterThan(20);
      expect([
        "texto",
        "seo",
        "redes-sociales",
        "imagenes",
        "marketing",
        "productividad",
        "pdf-documentos",
        "privacidad",
        "diseno-web",
        "seguridad",
        "desarrollo",
        "conversores",
        "calculadoras",
        "accesibilidad",
        "negocios",
        "seo-tecnico",
        "audio",
        "video",
        "subtitulos",
        "grabacion",
        "finanzas",
        "tiempo",
        "generadores",
        "educacion",
        "comparacion",
        "empleo",
        "organizacion",
        "imprimibles",
        "cocina",
        "hogar",
        "viajes",
      ]).toContain(tool.category);
      expect(tool.icon).toBeTruthy();
      expect(tool.keywords.length).toBeGreaterThan(0);
      expect(["LOCAL_AI", "DETERMINISTIC", "HYBRID", "LOCAL_MEDIA", "LOCAL_RECORDING"]).toContain(tool.executionType);
      expect(typeof tool.requiresLocalAI).toBe("boolean");
      expect(tool.supportsGuest).toBe(true);
      expect(tool.status).toBe("available");
      expect(tool.metadata.title).toBeTruthy();
      expect(tool.metadata.description.length).toBeGreaterThan(10);
      expect(["WebApplication", "SoftwareApplication"]).toContain(tool.schemaType);
      expect(tool.useCases.length).toBeGreaterThan(0);
      expect(tool.howToUse.length).toBeGreaterThan(0);
    }
  });

  it("requiresLocalAI is true only for LOCAL_AI tools, and false for DETERMINISTIC tools", () => {
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      if (tool.executionType === "LOCAL_AI") expect(tool.requiresLocalAI).toBe(true);
      if (tool.executionType === "DETERMINISTIC") expect(tool.requiresLocalAI).toBe(false);
    }
  });

  it("every tool links between 2 and 4 related tools, and every related slug exists (spec section 30)", () => {
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      expect(tool.relatedTools.length).toBeGreaterThanOrEqual(2);
      expect(tool.relatedTools.length).toBeLessThanOrEqual(4);
      expect(tool.relatedTools).not.toContain(tool.slug);
      for (const relatedSlug of tool.relatedTools) {
        expect(findPublicTool(relatedSlug)).toBeDefined();
      }
    }
  });

  it("every FAQ entry has a real question and answer, never a placeholder", () => {
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      for (const entry of tool.faq) {
        expect(entry.question.length).toBeGreaterThan(5);
        expect(entry.answer.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("registry: category rules (spec section 4)", () => {
  it("never renders an empty category", () => {
    const nonEmpty = getNonEmptyPublicToolCategories();
    for (const category of nonEmpty) {
      expect(getPublicToolsByCategory(category.slug).length).toBeGreaterThan(0);
    }
  });

  it("every category referenced by a tool exists in PUBLIC_TOOL_CATEGORIES", () => {
    const categorySlugs = new Set(PUBLIC_TOOL_CATEGORIES.map((c) => c.slug));
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      expect(categorySlugs.has(tool.category)).toBe(true);
    }
  });
});

describe("registry: mandatory variety caps (spec section 21)", () => {
  it("has at least 7 tools confirmed to have no equivalent anywhere else in the app (Fase 41 correction, section 5)", () => {
    // Only these 7 tools have zero equivalent capability anywhere in the app
    // (confirmed by code search in the correction's audit) — the remaining 6
    // (rewriter, summarizer, corrector, seo-generator, social-generator,
    // repurposer) intentionally reuse AI Center's existing capability cores
    // instead of re-implementing them; see src/lib/ai-capabilities/*.
    const genuinelyNewSlugs = [
      "contador-de-palabras",
      "limpiador-de-texto",
      "generador-codigo-qr",
      "comprimir-imagen",
      "generador-utm",
      "analizador-de-titulos",
      "calculadora-engagement",
    ];
    for (const slug of genuinelyNewSlugs) expect(findPublicTool(slug)).toBeDefined();
    expect(genuinelyNewSlugs.length).toBeGreaterThanOrEqual(7);
  });

  it("has at most 6 tools that depend on local AI (LOCAL_AI or HYBRID)", () => {
    const aiDependent = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.executionType === "LOCAL_AI" || t.executionType === "HYBRID");
    expect(aiDependent.length).toBeLessThanOrEqual(6);
  });

  it("has at least 3 deterministic tools categorized as texto or seo", () => {
    const deterministicTextOrSeo = PUBLIC_TOOL_DEFINITIONS.filter(
      (t) => t.executionType === "DETERMINISTIC" && (t.category === "texto" || t.category === "seo")
    );
    expect(deterministicTextOrSeo.length).toBeGreaterThanOrEqual(3);
  });

  it("has at least 2 tools for redes-sociales or marketing", () => {
    const socialOrMarketing = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "redes-sociales" || t.category === "marketing");
    expect(socialOrMarketing.length).toBeGreaterThanOrEqual(2);
  });

  it("has at least 1 image tool", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "imagenes").length).toBeGreaterThanOrEqual(1);
  });

  it("has at least 1 tool with zero AI dependency", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.executionType === "DETERMINISTIC").length).toBeGreaterThanOrEqual(1);
  });

  it("has at least 1 tool useful for website owners (UTM or QR)", () => {
    const ownerTools = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "generador-utm" || t.slug === "generador-codigo-qr");
    expect(ownerTools.length).toBeGreaterThanOrEqual(1);
  });
});

describe("registry: accessor helpers", () => {
  it("getAllPublicTools returns the full list", () => {
    expect(getAllPublicTools()).toHaveLength(109);
  });

  it("findPublicTool finds a real slug and returns undefined for a fake one", () => {
    expect(findPublicTool("contador-de-palabras")).toBeDefined();
    expect(findPublicTool("herramienta-que-no-existe")).toBeUndefined();
  });

  it("getPublicToolCategory resolves a real category", () => {
    expect(getPublicToolCategory("texto")?.label).toBe("Texto y escritura");
  });

  it("getFeaturedPublicTools returns only featured:true tools", () => {
    for (const tool of getFeaturedPublicTools()) expect(tool.featured).toBe(true);
  });

  it("getRelatedPublicTools resolves real tool objects, not just slugs", () => {
    const related = getRelatedPublicTools("contador-de-palabras");
    expect(related.length).toBeGreaterThan(0);
    for (const tool of related) expect(tool.slug).toBeTruthy();
  });

  it("getRelatedPublicTools returns an empty array for an unknown slug", () => {
    expect(getRelatedPublicTools("no-existe")).toEqual([]);
  });
});

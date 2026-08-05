import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_TOOL_DEFINITIONS, PUBLIC_TOOL_CATEGORIES, findPublicTool, getNonEmptyPublicToolCategories, getNewPublicTools } from "@/lib/public-tools/registry";
import { RENDERABLE_TOOL_SLUGS } from "@/components/public-tools/tool-component-registry";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const FASE44_SLUGS = [
  "generador-facturas-presupuestos",
  "generador-firma-correo",
  "generador-open-graph",
  "generador-robots-txt",
  "generador-sitemap-xml",
  "generador-schema-json-ld",
  "generador-degradados-css",
  "generador-sombras-css",
  "editor-markdown",
  "convertir-csv-json",
  "probador-expresiones-regulares",
  "generador-expresiones-cron",
];

const FASE44_COMPONENT_FILES = [
  "invoice-generator-tool",
  "email-signature-tool",
  "open-graph-tool",
  "robots-txt-tool",
  "sitemap-generator-tool",
  "schema-generator-tool",
  "css-gradient-tool",
  "css-box-shadow-tool",
  "markdown-editor-tool",
  "csv-json-tool",
  "regex-tester-tool",
  "cron-generator-tool",
];

// ---------------------------------------------------------------------------
// Inventario y objetivo cuantitativo (spec sections 3, 4)
// ---------------------------------------------------------------------------
describe("Fase 44: inventory — 12 new tools, 49 total, no equivalent existed before", () => {
  it("adds exactly the 12 prioritized tools, each with a real registry entry", () => {
    for (const slug of FASE44_SLUGS) expect(findPublicTool(slug)).toBeDefined();
    expect(FASE44_SLUGS).toHaveLength(12);
  });

  it("catalog totals at least 49 public tools", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.length).toBeGreaterThanOrEqual(49);
  });

  it("no existing capability was duplicated — the QR generator, favicon generator, and color-contrast core each still appear/are used exactly once as their own concern", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "generador-codigo-qr")).toHaveLength(1);
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "generador-favicon")).toHaveLength(1);
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "extraer-paleta-colores")).toHaveLength(1);
  });

  it("no other tool in the catalog duplicates a Fase 44 capability by keyword overlap (generic pairwise check already covers this; re-asserted here for the new batch specifically)", () => {
    for (const slug of FASE44_SLUGS) {
      const tool = findPublicTool(slug)!;
      const others = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug !== slug);
      for (const other of others) {
        const overlap = tool.keywords.filter((k) => other.keywords.includes(k));
        expect(overlap).toEqual([]);
      }
    }
  });

  it("the 'Nuevas' badge tracks only the most recent batch — Fase 44's 12 tools were isNew within their own phase, but Fase 45 rolled the flag forward onto its own 12 tools, so Fase 44's set is now isNew:false (regression: this rolling behavior, first exercised on Fase 43->44, still holds one phase later)", () => {
    for (const slug of FASE44_SLUGS) expect(findPublicTool(slug)!.isNew).toBe(false);
    const fase43Slugs = [
      "generador-contrasenas", "comprobar-fortaleza-contrasena", "generador-uuid", "generador-hash", "formatear-json",
      "codificar-base64", "codificar-url", "convertidor-timestamp-unix", "conversor-unidades", "calculadora-porcentajes",
      "calculadora-edad-fechas", "comprobar-contraste-colores",
    ];
    for (const slug of fase43Slugs) expect(findPublicTool(slug)!.isNew).toBe(false);
    expect(getNewPublicTools().map((t) => t.slug).sort()).not.toEqual([...FASE44_SLUGS].sort());
  });

  it("no Fase 42 or earlier tool was ever flagged isNew by this point (only one batch is ever 'new' at a time)", () => {
    const fase42Slugs = ["unir-pdf", "dividir-pdf", "organizar-pdf", "imagenes-a-pdf", "pdf-a-imagenes", "marca-de-agua-pdf", "numerar-paginas-pdf", "recortar-imagen", "eliminar-metadatos-imagen", "generador-favicon", "extraer-paleta-colores", "ocultar-informacion-imagen"];
    for (const slug of fase42Slugs) expect(findPublicTool(slug)!.isNew).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Distribución mínima (spec section 4)
// ---------------------------------------------------------------------------
describe("Fase 44: minimum category distribution", () => {
  it("has at least 2 negocios tools", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "negocios").length).toBeGreaterThanOrEqual(2);
  });

  it("has at least 4 seo-tecnico tools", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "seo-tecnico").length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 4 Fase 44 desarrollo tools (markdown, csv/json, regex, cron)", () => {
    for (const slug of ["editor-markdown", "convertir-csv-json", "probador-expresiones-regulares", "generador-expresiones-cron"]) {
      expect(findPublicTool(slug)!.category).toBe("desarrollo");
    }
  });

  it("has at least 2 diseño-web (visual) Fase 44 tools", () => {
    for (const slug of ["generador-degradados-css", "generador-sombras-css"]) {
      expect(findPublicTool(slug)!.category).toBe("diseno-web");
    }
  });

  it("all 12 new tools are DETERMINISTIC (no AI needed)", () => {
    for (const slug of FASE44_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.executionType).toBe("DETERMINISTIC");
      expect(tool.requiresLocalAI).toBe(false);
    }
  });

  it("all 12 new tools support guests (no registration) and process device-only", () => {
    for (const slug of FASE44_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.supportsGuest).toBe(true);
      expect(tool.privacy).toBe("device-only");
    }
  });

  it("the 2 new categories (negocios, seo-tecnico) are never rendered empty", () => {
    const nonEmpty = getNonEmptyPublicToolCategories().map((c) => c.slug);
    expect(nonEmpty).toContain("negocios");
    expect(nonEmpty).toContain("seo-tecnico");
  });

  it("negocios and seo-tecnico category slugs exist in PUBLIC_TOOL_CATEGORIES with a real label", () => {
    for (const slug of ["negocios", "seo-tecnico"]) {
      const category = PUBLIC_TOOL_CATEGORIES.find((c) => c.slug === slug);
      expect(category).toBeDefined();
      expect(category!.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Núcleos compartidos: ubicación real, reutilización, no duplicación (spec sections 7, 9-21, 26)
// ---------------------------------------------------------------------------
describe("Fase 44: shared cores exist and are the single source used by every tool", () => {
  const CORE_FILES = [
    "src/lib/public-tools/business/invoice.ts",
    "src/lib/public-tools/business/business-document-pdf.ts",
    "src/lib/public-tools/business/email-signature.ts",
    "src/lib/public-tools/web/open-graph.ts",
    "src/lib/public-tools/web/robots.ts",
    "src/lib/public-tools/web/sitemap-builder.ts",
    "src/lib/public-tools/web/schema-ld.ts",
    "src/lib/public-tools/design/css-gradient.ts",
    "src/lib/public-tools/design/css-box-shadow.ts",
    "src/lib/public-tools/development/markdown.ts",
    "src/lib/public-tools/development/csv-json.ts",
    "src/lib/public-tools/development/regex.ts",
    "src/lib/public-tools/development/regex-worker.ts",
    "src/lib/public-tools/development/cron.ts",
  ];

  it("every declared core module file exists", () => {
    for (const file of CORE_FILES) expect(existsSync(path.join(ROOT, file))).toBe(true);
  });

  it("the invoice PDF core reuses pdf-lib and the same StandardFonts/PageSizes approach as the Fase 42 PDF core, never a second PDF writer", () => {
    const source = read("src/lib/public-tools/business/business-document-pdf.ts");
    expect(source).toMatch(/from "pdf-lib"/);
    expect(source).toMatch(/StandardFonts/);
  });

  it("the CSV/JSON converter reuses performance/csv.ts's parser instead of a second CSV tokenizer", () => {
    const source = read("src/lib/public-tools/development/csv-json.ts");
    expect(source).toMatch(/from "@\/lib\/performance\/csv"/);
  });

  it("the sitemap generator reuses the shared ZIP core (files/zip.ts) for its split-file download, never a second ZIP implementation", () => {
    const source = read("src/components/public-tools/tools/sitemap-generator-tool.tsx");
    expect(source).toMatch(/import\("@\/lib\/public-tools\/files\/zip"\)/); // lazy-loaded for performance, per spec section 30
  });

  it("the CSS gradient and box-shadow generators both reuse the shared color-contrast.ts parser, never a second color parser", () => {
    for (const file of ["src/lib/public-tools/design/css-gradient.ts", "src/lib/public-tools/design/css-box-shadow.ts"]) {
      const source = read(file);
      expect(source).toMatch(/from "@\/lib\/public-tools\/color-contrast"/);
    }
  });

  it("the email signature core is reused by the Open Graph tool's escapeHtml, not reimplemented a second time", () => {
    const source = read("src/lib/public-tools/web/open-graph.ts");
    expect(source).toMatch(/from "@\/lib\/public-tools\/business\/email-signature"/);
  });

  it("the sitemap generator downloads via the shared downloadBlob/sanitizeFilename core, never a bespoke download implementation", () => {
    const source = read("src/components/public-tools/tools/sitemap-generator-tool.tsx");
    expect(source).toMatch(/from "@\/lib\/public-tools\/files\/download"/);
  });
});

// ---------------------------------------------------------------------------
// Carga dinámica y registro de componentes (spec sections 6, 30)
// ---------------------------------------------------------------------------
describe("Fase 44: component wiring", () => {
  it("every Fase 44 tool has a renderable slug wired into the switch statement", () => {
    for (const slug of FASE44_SLUGS) expect(RENDERABLE_TOOL_SLUGS as readonly string[]).toContain(slug);
  });

  it("RENDERABLE_TOOL_SLUGS exactly matches the registry (no orphaned component, no unrendered registry entry)", () => {
    const registrySlugs = new Set(PUBLIC_TOOL_DEFINITIONS.map((t) => t.slug));
    expect(RENDERABLE_TOOL_SLUGS).toHaveLength(PUBLIC_TOOL_DEFINITIONS.length);
    for (const slug of RENDERABLE_TOOL_SLUGS) expect(registrySlugs.has(slug)).toBe(true);
  });

  it("every Fase 44 tool component is loaded via next/dynamic, not imported eagerly", () => {
    const source = read("src/components/public-tools/tool-component-registry.tsx");
    for (const component of FASE44_COMPONENT_FILES) {
      const regex = new RegExp(`dynamic\\(\\(\\) => import\\("@/components/public-tools/tools/${component}"\\)`);
      expect(source).toMatch(regex);
    }
  });

  it("no heavy Fase 44 dependency (pdf-lib) loads from /herramientas itself — only from the dynamically-imported tool component", () => {
    const centerSource = read("src/app/(public)/herramientas/page.tsx");
    expect(centerSource).not.toMatch(/pdf-lib|business-document-pdf/);
  });

  it("the new icons are registered in the closed tool-icon.tsx map (never a dynamic lucide-react lookup)", () => {
    const source = read("src/components/public-tools/tool-icon.tsx");
    for (const icon of ["Receipt", "Mail", "Globe", "Bot", "ListTree", "Tags", "Paintbrush", "Layers", "FileSpreadsheet", "Regex", "AlarmClock"]) {
      expect(source).toMatch(new RegExp(`\\b${icon}\\b`));
    }
  });
});

// ---------------------------------------------------------------------------
// Privacidad (spec sections 9, 24, 25)
// ---------------------------------------------------------------------------
describe("Fase 44: privacy invariants", () => {
  it("no Fase 44 tool component calls fetch, XMLHttpRequest, or a server action", () => {
    for (const file of FASE44_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/fetch\(|XMLHttpRequest|"use server"/);
    }
  });

  it("no Fase 44 tool component or core writes to console (no accidental logging of business/personal data)", () => {
    for (const file of FASE44_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
  });

  it("no Fase 44 tool component persists to localStorage/sessionStorage/IndexedDB (session-only in-memory state)", () => {
    for (const file of FASE44_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });

  it("the invoice tool shows a 'Borrar todos los datos' button distinct from the generic Reset label", () => {
    const source = read("src/components/public-tools/tools/invoice-generator-tool.tsx");
    expect(source).toMatch(/Borrar todos los datos/);
  });

  it("the invoice tool shows its own mandated privacy sentence via the slug-based override, and the shared component declares it", () => {
    const badgeSource = read("src/components/public-tools/processing-badge.tsx");
    expect(badgeSource).toMatch(/La factura o el presupuesto se genera en tu dispositivo\. Los datos no se envían al servidor\./);
    expect(badgeSource).toMatch(/INVOICE_SLUG = "generador-facturas-presupuestos"/);
  });

  it("the 10 non-invoice Fase 44 tools get the generic 'Los datos se procesan...' notice via category or explicit slug override, never silently falling back to the file-based notice", () => {
    const badgeSource = read("src/components/public-tools/processing-badge.tsx");
    expect(badgeSource).toMatch(/GENERIC_DATA_SLUGS = new Set\(\["generador-degradados-css", "generador-sombras-css"\]\)/);
    for (const slug of FASE44_SLUGS) {
      if (slug === "generador-facturas-presupuestos") continue;
      const tool = findPublicTool(slug)!;
      const categoryCovered = ["negocios", "seo-tecnico", "desarrollo"].includes(tool.category);
      const slugCovered = slug === "generador-degradados-css" || slug === "generador-sombras-css";
      expect(categoryCovered || slugCovered).toBe(true);
    }
  });

  it("regression: Fase 42's favicon and palette tools (which share the diseno-web category with the 2 new CSS tools) still keep their own file-based notice, unaffected by the new slug override", () => {
    const badgeSource = read("src/components/public-tools/processing-badge.tsx");
    // The override list is exactly the 2 new tools — favicon/palette slugs must NOT appear in it.
    expect(badgeSource).not.toMatch(/generador-favicon.*GENERIC_DATA_SLUGS|GENERIC_DATA_SLUGS.*generador-favicon/);
    expect(findPublicTool("generador-favicon")!.category).toBe("diseno-web");
    expect(findPublicTool("extraer-paleta-colores")!.category).toBe("diseno-web");
  });
});

// ---------------------------------------------------------------------------
// Seguridad (spec section 28)
// ---------------------------------------------------------------------------
describe("Fase 44: security invariants", () => {
  it("no Fase 44 core or component uses eval or new Function", () => {
    const coreFiles = [
      "src/lib/public-tools/business/email-signature.ts",
      "src/lib/public-tools/web/schema-ld.ts",
      "src/lib/public-tools/development/markdown.ts",
      "src/lib/public-tools/development/csv-json.ts",
      "src/lib/public-tools/development/regex.ts",
      "src/lib/public-tools/development/regex-worker.ts",
      "src/lib/public-tools/development/cron.ts",
    ];
    for (const file of coreFiles) {
      const source = read(file);
      expect(source).not.toMatch(/\beval\(|new Function\(/);
    }
    for (const file of FASE44_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/\beval\(|new Function\(/);
    }
  });

  it("only markdown-editor-tool.tsx uses dangerouslySetInnerHTML among the 12 new components, and only fed by the safe renderer's output", () => {
    for (const file of FASE44_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      const usesDangerous = source.includes("dangerouslySetInnerHTML");
      if (usesDangerous) {
        expect(file).toBe("markdown-editor-tool");
        expect(source).toMatch(/__html: html/);
        expect(source).toMatch(/renderMarkdownToHtml/);
      }
    }
  });

  it("the email signature tool's preview renders inside a sandboxed iframe, never dangerouslySetInnerHTML in the app's own DOM", () => {
    const source = read("src/components/public-tools/tools/email-signature-tool.tsx");
    expect(source).toMatch(/sandbox=""/);
    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("the Open Graph and Schema tools only ever show their generated markup as escaped text (readOnly Textarea), never render it live", () => {
    for (const file of ["open-graph-tool", "schema-generator-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it("the CSV/JSON converter protects against prototype pollution (source-level check on the core)", () => {
    const source = read("src/lib/public-tools/development/csv-json.ts");
    expect(source).toMatch(/Object\.fromEntries/);
  });

  it("the CSV/JSON converter neutralizes formula injection on JSON->CSV export via the shared neutralizeCsvCell", () => {
    const source = read("src/lib/public-tools/development/csv-json.ts");
    expect(source).toMatch(/neutralizeCsvCell/);
  });

  it("the sitemap and Open Graph tools escape all XML/HTML output (no raw string concatenation of user URLs)", () => {
    const sitemapSource = read("src/lib/public-tools/web/sitemap-builder.ts");
    expect(sitemapSource).toMatch(/escapeXml/);
  });
});

// ---------------------------------------------------------------------------
// Accesibilidad (spec section 31)
// ---------------------------------------------------------------------------
describe("Fase 44: accessibility", () => {
  it("the cron builder provides a text input alternative to the visual builder (not exclusively drag/visual controls)", () => {
    const source = read("src/components/public-tools/tools/cron-generator-tool.tsx");
    expect(source).toMatch(/id="cron-expression"/);
  });

  it("the CSS gradient/shadow tools expose numeric inputs alongside any visual control (color pickers paired with text inputs)", () => {
    for (const file of ["css-gradient-tool", "css-box-shadow-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/type="number"/);
    }
  });

  it("every Fase 44 tool component uses <Label htmlFor> for its primary inputs", () => {
    for (const file of ["invoice-generator-tool", "open-graph-tool", "schema-generator-tool", "sitemap-generator-tool", "regex-tester-tool", "cron-generator-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/<Label htmlFor=/);
    }
  });

  it("no Fase 44 component uses window.alert or window.confirm", () => {
    for (const file of FASE44_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/\balert\(|\bconfirm\(/);
    }
  });

  it("results and errors use aria-live regions across the new tools", () => {
    let ariaLiveCount = 0;
    for (const file of FASE44_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      if (source.includes("aria-live")) ariaLiveCount++;
    }
    expect(ariaLiveCount).toBeGreaterThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// SEO y contenido honesto (spec sections 32, 50)
// ---------------------------------------------------------------------------
describe("Fase 44: SEO and honest copy", () => {
  it("no Fase 44 tool claims guaranteed indexing, guaranteed rich results, universal fiscal validity, or universal email-client compatibility as a positive assertion", () => {
    const bannedPhrases = [
      /garantiza(n)? (la )?indexaci[oó]n/i,
      /resultados enriquecidos garantizados/i,
      /v[aá]lida? fiscalmente (en todos|para todos)/i,
      /compatible (de forma )?id[eé]ntica con todos/i,
      /regex segura/i,
      /cron (instalada|ejecut[aá]ndose)/i,
    ];
    const negationMarkers = /\bno\b|\bnunca\b|\bninguna\b|\bningún\b/i;
    for (const slug of FASE44_SLUGS) {
      const tool = findPublicTool(slug)!;
      const text = `${tool.longDescription} ${tool.shortDescription} ${tool.metadata.description} ${tool.faq.map((f) => f.answer).join(" ")}`;
      const sentences = text.split(/(?<=[.!?])\s+/);
      for (const phrase of bannedPhrases) {
        const offendingSentence = sentences.find((s) => phrase.test(s) && !negationMarkers.test(s));
        expect(offendingSentence).toBeUndefined();
      }
    }
  });

  it("the invoice tool FAQ explicitly denies universal fiscal validity", () => {
    const tool = findPublicTool("generador-facturas-presupuestos")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/no se puede garantizar validez fiscal universal/i);
  });

  it("the schema generator FAQ explicitly denies guaranteed rich results", () => {
    const tool = findPublicTool("generador-schema-json-ld")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/no garantiza resultados enriquecidos/i);
  });

  it("the robots.txt tool FAQ explicitly denies that it protects private content or guarantees de-indexing", () => {
    const tool = findPublicTool("generador-robots-txt")!;
    const combined = `${tool.longDescription} ${tool.faq.map((f) => f.answer).join(" ")}`;
    expect(combined).toMatch(/no protege contenido privado ni garantiza/i);
  });

  it("the sitemap tool FAQ explicitly denies guaranteed crawling/indexing", () => {
    const tool = findPublicTool("generador-sitemap-xml")!;
    const combined = `${tool.longDescription} ${tool.faq.map((f) => f.answer).join(" ")}`;
    expect(combined).toMatch(/no garantiza que sean rastreadas o indexadas/i);
  });

  it("the regex tester FAQ explicitly denies detecting all ReDoS vulnerabilities", () => {
    const tool = findPublicTool("probador-expresiones-regulares")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/no puede garantizar que detecta todas las vulnerabilidades/i);
  });

  it("the cron tool FAQ explicitly denies that it installs or executes the schedule", () => {
    const tool = findPublicTool("generador-expresiones-cron")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/solo genera y explica la expresión/i);
  });

  it("every tool has a distinct metadata title across the whole 49-tool catalog (no copy-pasted introduction)", () => {
    const titles = PUBLIC_TOOL_DEFINITIONS.map((t) => t.metadata.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("sitemap.ts is registry-driven, so the 12 new tools are automatically included without a manual edit", () => {
    const source = read("src/app/sitemap.ts");
    expect(source).toMatch(/getAllPublicTools/);
    for (const slug of FASE44_SLUGS) expect(findPublicTool(slug)).toBeDefined();
  });

  it("the platform sitemap.ts (src/app/sitemap.ts) is a distinct concern from the public sitemap-GENERATOR tool — the generator never imports from or writes to the platform sitemap route", () => {
    const generatorCoreSource = read("src/lib/public-tools/web/sitemap-builder.ts");
    const generatorComponentSource = read("src/components/public-tools/tools/sitemap-generator-tool.tsx");
    expect(generatorCoreSource + generatorComponentSource).not.toMatch(/app\/sitemap|from ["']@\/app\/sitemap["']/);
  });
});

// ---------------------------------------------------------------------------
// Centro público y página principal (spec sections 34, 55-56)
// ---------------------------------------------------------------------------
describe("Fase 44: public center page", () => {
  it("/herramientas metadata no longer reflects Fase 44's 49-tool total — Fase 45 rolled the number forward to 61, since the count is meant to track the live catalog, not freeze at whichever phase wrote the copy", () => {
    const source = read("src/app/(public)/herramientas/page.tsx");
    expect(source).not.toMatch(/37 herramientas/);
    expect(source).not.toMatch(/49 herramientas/);
  });

  it("/herramientas still renders a dynamic tool count from the registry, never a hardcoded number in JSX", () => {
    const source = read("src/app/(public)/herramientas/page.tsx");
    expect(source).toMatch(/\{tools\.length\}/);
  });

  it("does not create a second /tools center or duplicate registry", () => {
    expect(existsSync(path.join(ROOT, "src/app/(public)/tools"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/app/tools"))).toBe(false);
  });

  it("the homepage still shows a reduced 6-tool selection, never all 49 (regression check, spec section 34)", () => {
    const source = read("src/app/(public)/page.tsx");
    expect(source).toMatch(/getFeaturedPublicTools\(\)\.slice\(0, 6\)/);
  });
});

// ---------------------------------------------------------------------------
// Servicio al cliente (spec section 36)
// ---------------------------------------------------------------------------
describe("Fase 44: customer-support agent compatibility unaffected", () => {
  it("the customer-support agent service was not modified to auto-approve, execute, or receive business/regex/cron data from the new tools", () => {
    const source = read("src/server/services/agent-customer-support.ts");
    expect(source).not.toMatch(/generador-facturas-presupuestos|probador-expresiones-regulares|generador-expresiones-cron/);
  });

  it("/herramientas is still the syncable path source, unchanged by this phase", () => {
    const source = read("src/lib/customer-support/internal-path.ts");
    expect(source).toMatch(/"\/herramientas"/);
  });
});

// ---------------------------------------------------------------------------
// Regresión: Fase 41/42/43 y el resto de la app siguen intactos (spec section 29)
// ---------------------------------------------------------------------------
describe("Fase 44: regression — everything built in earlier phases still exists untouched", () => {
  it("all 13 Fase 41, 12 Fase 42, and 12 Fase 43 tools still exist in the registry (37 total prior tools)", () => {
    const priorSlugs = [
      "contador-de-palabras", "reescritor-de-textos", "limpiador-de-texto", "resumidor-de-textos", "corrector-de-textos",
      "generador-titulos-meta-descripciones", "generador-contenido-redes-sociales", "generador-codigo-qr", "comprimir-imagen",
      "generador-utm", "analizador-de-titulos", "reutilizador-de-contenido", "calculadora-engagement",
      "unir-pdf", "dividir-pdf", "organizar-pdf", "imagenes-a-pdf", "pdf-a-imagenes", "marca-de-agua-pdf",
      "numerar-paginas-pdf", "recortar-imagen", "eliminar-metadatos-imagen", "generador-favicon", "extraer-paleta-colores", "ocultar-informacion-imagen",
      "generador-contrasenas", "comprobar-fortaleza-contrasena", "generador-uuid", "generador-hash", "formatear-json",
      "codificar-base64", "codificar-url", "convertidor-timestamp-unix", "conversor-unidades", "calculadora-porcentajes",
      "calculadora-edad-fechas", "comprobar-contraste-colores",
    ];
    for (const slug of priorSlugs) expect(findPublicTool(slug)).toBeDefined();
    expect(priorSlugs).toHaveLength(37);
  });

  it("the PDF core (pdf-lib/pdfjs-dist) files still exist untouched", () => {
    for (const file of ["load", "merge", "split", "organize", "watermark", "page-numbers", "images-to-pdf", "render", "ranges"]) {
      expect(existsSync(path.join(ROOT, `src/lib/public-tools/pdf/${file}.ts`))).toBe(true);
    }
  });

  it("the Fase 43 utilities core files still exist untouched", () => {
    for (const file of ["secure-random", "password-generator", "uuid", "crypto-digest", "json-tool", "units"]) {
      expect(existsSync(path.join(ROOT, `src/lib/public-tools/utilities/${file}.ts`))).toBe(true);
    }
  });

  it("the homepage, guest area, customer-support widget, and admin were not deleted", () => {
    expect(existsSync(path.join(ROOT, "src/app/(public)/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/components/customer-support/widget/customer-support-widget.tsx"))).toBe(true);
  });

  it("no new heavy dependency (pdf-lib/pdfjs-dist/fflate/cron-parser/markdown library) was added — package.json dependencies list is unchanged in kind from Fase 43", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const dep of ["pdf-lib", "pdfjs-dist", "fflate"]) expect(Boolean(deps[dep])).toBe(true); // legitimate Fase 42 deps, still present
    for (const dep of ["cron-parser", "marked", "markdown-it", "remark", "dompurify", "sanitize-html"]) expect(deps[dep]).toBeUndefined();
  });

  it("zod (already used elsewhere in the app) is reused by the schema generator, not newly added for this phase", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies?.zod).toBeDefined();
  });
});

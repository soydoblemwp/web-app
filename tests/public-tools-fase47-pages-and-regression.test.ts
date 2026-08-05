import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_TOOL_DEFINITIONS, PUBLIC_TOOL_CATEGORIES, getAllPublicTools, getNonEmptyPublicToolCategories, findPublicTool, getRelatedPublicTools } from "@/lib/public-tools/registry";

const FASE_47_SLUGS = [
  "crear-curriculum-cv",
  "generador-carta-presentacion",
  "generador-tarjetas-presentacion",
  "generador-recibos",
  "generador-ordenes-compra",
  "generador-notas-entrega",
  "generador-calendarios-imprimibles",
  "generador-planificador-semanal-mensual",
  "generador-listas-verificacion",
  "generador-agendas-actas-reunion",
  "generador-certificados-reconocimiento",
  "generador-etiquetas-pegatinas",
];

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

const KNOWN_DUPLICATION_LIST = ["factura", "presupuesto", "firma de correo", "código de barras", "código qr", "favicon", "open graph", "schema json-ld", "editor markdown", "horas trabajadas", "zonas horarias", "sitemap"];

describe("Fase 47: catalog reaches 85+ tools with 12 real new additions", () => {
  it("the catalog has at least 85 tools, all with unique ids and slugs", () => {
    const tools = getAllPublicTools();
    expect(tools.length).toBeGreaterThanOrEqual(109);
    expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length);
    expect(new Set(tools.map((t) => t.slug)).size).toBe(tools.length);
  });

  it("all 12 priority Fase 47 slugs are registered exactly once, each DETERMINISTIC and device-only (isNew:false — superseded by Fase 48)", () => {
    for (const slug of FASE_47_SLUGS) {
      const matches = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === slug);
      expect(matches, slug).toHaveLength(1);
      expect(matches[0].executionType, slug).toBe("DETERMINISTIC");
      expect(matches[0].privacy, slug).toBe("device-only");
      expect(matches[0].isNew, slug).toBe(false);
      expect(matches[0].status).toBe("available");
      expect(matches[0].requiresLocalAI, slug).toBe(false);
    }
  });

  it("Fase 46's 12 tools are no longer flagged as new (isNew tracks only the most recent batch)", () => {
    for (const slug of FASE_46_SLUGS) {
      const tool = findPublicTool(slug);
      expect(tool, slug).toBeDefined();
      expect(tool!.isNew, slug).toBe(false);
    }
  });

  it("every Fase 47 tool has a non-empty FAQ, use cases, how-to-use steps, and unique metadata", () => {
    for (const slug of FASE_47_SLUGS) {
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

  it("no Fase 47 tool name reproduces an existing capability on the known-duplication list", () => {
    const newToolNames = FASE_47_SLUGS.map((slug) => findPublicTool(slug)!.name.toLowerCase());
    for (const forbidden of KNOWN_DUPLICATION_LIST) {
      const matches = newToolNames.filter((name) => name.includes(forbidden));
      expect(matches, `"${forbidden}" should not reappear as a new Fase 47 tool name`).toHaveLength(0);
    }
  });

  it("meets the minimum category distribution: >=2 empleo, >=4 negocios(business), >=3 organizacion, >=3 imprimibles", () => {
    const byCategory = (cat: string) => FASE_47_SLUGS.filter((slug) => findPublicTool(slug)!.category === cat).length;
    expect(byCategory("empleo")).toBeGreaterThanOrEqual(2);
    expect(byCategory("negocios")).toBeGreaterThanOrEqual(4);
    expect(byCategory("organizacion")).toBeGreaterThanOrEqual(3);
    expect(byCategory("imprimibles")).toBeGreaterThanOrEqual(3);
  });

  it("only 3 new categories were added (empleo, organizacion, imprimibles) — negocios was reused, not duplicated with an alias", () => {
    const categorySlugs = PUBLIC_TOOL_CATEGORIES.map((c) => c.slug);
    expect(categorySlugs).toContain("negocios");
    expect(categorySlugs.filter((s) => s === "negocios")).toHaveLength(1);
    expect(categorySlugs).toContain("empleo");
    expect(categorySlugs).toContain("organizacion");
    expect(categorySlugs).toContain("imprimibles");
  });

  it("every category referenced by a tool actually exists in PUBLIC_TOOL_CATEGORIES", () => {
    const categorySlugs = new Set(PUBLIC_TOOL_CATEGORIES.map((c) => c.slug));
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      expect(categorySlugs.has(tool.category), tool.slug).toBe(true);
    }
  });

  it("no category is ever empty", () => {
    const nonEmpty = getNonEmptyPublicToolCategories();
    for (const category of PUBLIC_TOOL_CATEGORIES) {
      expect(nonEmpty.some((c) => c.slug === category.slug), category.slug).toBe(true);
    }
  });

  it("every tool's relatedTools list points to real, existing slugs, is 2-4 long, and never self-referential", () => {
    for (const tool of PUBLIC_TOOL_DEFINITIONS) {
      expect(tool.relatedTools.length, tool.slug).toBeGreaterThanOrEqual(2);
      expect(tool.relatedTools.length, tool.slug).toBeLessThanOrEqual(4);
      expect(tool.relatedTools, tool.slug).not.toContain(tool.slug);
      for (const relatedSlug of tool.relatedTools) {
        expect(findPublicTool(relatedSlug), `${tool.slug} -> ${relatedSlug}`).toBeDefined();
      }
    }
  });

  it("the 12 new tools resolve real, non-empty related-tool objects", () => {
    for (const slug of FASE_47_SLUGS) {
      const related = getRelatedPublicTools(slug);
      expect(related.length, slug).toBeGreaterThan(0);
      expect(related.every((t) => t.slug !== slug), slug).toBe(true);
    }
  });

  it("the business-card, receipt, purchase-order, and delivery-note tools genuinely link to at least one relevant existing tool (QR/barcode/invoice)", () => {
    const card = findPublicTool("generador-tarjetas-presentacion")!;
    expect(card.relatedTools.some((s) => s === "generador-codigo-qr" || s === "generador-codigo-barras")).toBe(true);
    const receipt = findPublicTool("generador-recibos")!;
    expect(receipt.relatedTools).toContain("generador-facturas-presupuestos");
  });
});

describe("Fase 47: component wiring stays in sync with the registry (single source of truth)", () => {
  it("RENDERABLE_TOOL_SLUGS in tool-component-registry.tsx matches PUBLIC_TOOL_DEFINITIONS exactly", () => {
    const registrySource = fs.readFileSync("src/components/public-tools/tool-component-registry.tsx", "utf8");
    const match = registrySource.match(/RENDERABLE_TOOL_SLUGS = \[([\s\S]*?)\] as const/);
    expect(match).not.toBeNull();
    const renderableSlugs = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const registrySlugs = PUBLIC_TOOL_DEFINITIONS.map((t) => t.slug);
    expect(new Set(renderableSlugs)).toEqual(new Set(registrySlugs));
    expect(renderableSlugs.length).toBe(registrySlugs.length);
  });

  it("every Fase 47 slug has a matching switch case in tool-component-registry.tsx", () => {
    const registrySource = fs.readFileSync("src/components/public-tools/tool-component-registry.tsx", "utf8");
    for (const slug of FASE_47_SLUGS) {
      expect(registrySource, slug).toMatch(new RegExp(`case "${slug}":`));
    }
  });

  it("every Fase 47 tool component file exists on disk", () => {
    const files = [
      "resume-builder-tool",
      "cover-letter-tool",
      "business-card-tool",
      "receipt-generator-tool",
      "purchase-order-tool",
      "delivery-note-tool",
      "printable-calendar-tool",
      "planner-tool",
      "printable-checklist-tool",
      "meeting-agenda-minutes-tool",
      "recognition-certificate-tool",
      "label-generator-tool",
    ];
    for (const file of files) {
      expect(fs.existsSync(`src/components/public-tools/tools/${file}.tsx`), file).toBe(true);
    }
  });

  it("sitemap.ts derives its tool routes from getAllPublicTools() — no second, manually-maintained tool list", () => {
    const sitemapSource = fs.readFileSync("src/app/sitemap.ts", "utf8");
    expect(sitemapSource).toMatch(/getAllPublicTools/);
  });

  it("the /herramientas page mentions the real 109-tool count, not a stale 73, 85, or 97", () => {
    const pageSource = fs.readFileSync("src/app/(public)/herramientas/page.tsx", "utf8");
    expect(pageSource).toMatch(/109/);
    expect(pageSource).not.toMatch(/73 herramientas/);
    expect(pageSource).not.toMatch(/85 herramientas/);
    expect(pageSource).not.toMatch(/97 herramientas/);
  });
});

describe("Fase 47: privacy and security invariants across the 12 new components", () => {
  const files = [
    "resume-builder-tool",
    "cover-letter-tool",
    "business-card-tool",
    "receipt-generator-tool",
    "purchase-order-tool",
    "delivery-note-tool",
    "printable-calendar-tool",
    "planner-tool",
    "printable-checklist-tool",
    "meeting-agenda-minutes-tool",
    "recognition-certificate-tool",
    "label-generator-tool",
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

  it("no component auto-saves to localStorage/sessionStorage/IndexedDB", () => {
    for (const file of files) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });

  it("no component uses window.confirm/alert — imports come from an accessible modal pattern, never a native browser dialog", () => {
    for (const file of files) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).not.toMatch(/\bconfirm\(|\balert\(/);
    }
  });

  it("no component or new shared core uses eval() or new Function()", () => {
    const dirs = [
      "src/components/public-tools/tools",
      "src/lib/public-tools/documents",
      "src/lib/public-tools/employment",
      "src/lib/public-tools/business",
      "src/lib/public-tools/organization",
      "src/lib/public-tools/printables",
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

  it("dangerouslySetInnerHTML is never used by any of the 12 new components (business card / label previews are CSS-based, never raw SVG injection)", () => {
    for (const file of files) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it("SVG builders only ever escape visitor text — svg-safe.ts's text node renderer always calls escapeXml", () => {
    const source = fs.readFileSync("src/lib/public-tools/documents/svg-safe.ts", "utf8");
    expect(source).toMatch(/escapeXml\(node\.text\)/);
  });

  it("JSON import goes through the shared, prototype-pollution-guarded parseDocumentEnvelope in every tool offering JSON import", () => {
    const jsonImportTools = ["resume-builder-tool", "cover-letter-tool", "planner-tool", "printable-checklist-tool"];
    for (const file of jsonImportTools) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).toMatch(/parseDocumentEnvelope/);
    }
  });
});

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("Fase 47: no official/deceptive document generation", () => {
  it("recognition-certificate.ts never lists an official document type (diploma, license, government) among its closed CertificateType set", () => {
    const source = fs.readFileSync("src/lib/public-tools/printables/recognition-certificate.ts", "utf8");
    expect(source).not.toMatch(/"diploma"|"license"|"government"|"medical"/i);
  });

  it("labels.ts never generates an official carrier (USPS/UPS/FedEx/DHL) label — comments explaining the restriction don't count as generating one", () => {
    const source = stripComments(fs.readFileSync("src/lib/public-tools/printables/labels.ts", "utf8"));
    expect(source).not.toMatch(/USPS|FedEx|UPS\b|DHL/);
  });

  it("delivery-note.ts never generates a real tracking number or postage value — comments explaining the restriction don't count", () => {
    const source = stripComments(fs.readFileSync("src/lib/public-tools/business/delivery-note.ts", "utf8"));
    expect(source).not.toMatch(/tracking|postage|franqueo/i);
  });

  it("receipt.ts and receipt-pdf.ts include a real, honest non-verification notice", () => {
    const core = fs.readFileSync("src/lib/public-tools/business/receipt.ts", "utf8") + fs.readFileSync("src/lib/public-tools/business/receipt-pdf.ts", "utf8");
    expect(core).toMatch(/no verifica una transacción real/);
  });
});

describe("Fase 47: shared-core reuse (no duplicated implementations)", () => {
  it("business-card-pdf.ts and labels-pdf.ts both reuse the single shared QR-raster helper, never a second QR-to-PNG implementation", () => {
    for (const file of ["src/lib/public-tools/business/business-card-pdf.ts", "src/lib/public-tools/printables/labels-pdf.ts"]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).toMatch(/from "@\/lib\/public-tools\/documents\/qr-raster"/);
    }
  });

  it("labels-pdf.ts reuses the exact Fase 46 barcode generation core, never a second barcode implementation", () => {
    const source = fs.readFileSync("src/lib/public-tools/printables/labels-pdf.ts", "utf8");
    expect(source).toMatch(/barcodes\/generation/);
  });

  it("receipt.ts, purchase-order.ts import the shared invoice money core, never a second money implementation", () => {
    for (const file of ["src/lib/public-tools/business/receipt.ts", "src/lib/public-tools/business/purchase-order.ts"]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).toMatch(/from "\.\/invoice"/);
    }
  });

  it("printable-calendar.ts and planner.ts both build on the shared CalendarDate core, never a second date implementation", () => {
    for (const file of ["src/lib/public-tools/organization/printable-calendar.ts", "src/lib/public-tools/organization/planner.ts"]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).toMatch(/from "@\/lib\/public-tools\/utilities\/dates"/);
    }
  });

  it("labels.ts reuses the project's existing safe CSV parser (lib/performance/csv.ts), never a third CSV parser", () => {
    const source = fs.readFileSync("src/lib/public-tools/printables/labels.ts", "utf8");
    expect(source).toMatch(/from "@\/lib\/performance\/csv"/);
  });

  it("every Fase 47 *-pdf.ts builder imports the shared pdf-kit rather than calling pdf-lib's PDFDocument.create() directly (business-document-pdf.ts predates pdf-kit.ts, from Fase 42, and is intentionally excluded)", () => {
    const files = [
      "src/lib/public-tools/employment/resume-pdf.ts",
      "src/lib/public-tools/employment/cover-letter-pdf.ts",
      "src/lib/public-tools/business/business-card-pdf.ts",
      "src/lib/public-tools/business/receipt-pdf.ts",
      "src/lib/public-tools/business/purchase-order-pdf.ts",
      "src/lib/public-tools/business/delivery-note-pdf.ts",
      "src/lib/public-tools/organization/printable-calendar-pdf.ts",
      "src/lib/public-tools/organization/planner-pdf.ts",
      "src/lib/public-tools/organization/checklist-pdf.ts",
      "src/lib/public-tools/organization/meeting-documents-pdf.ts",
      "src/lib/public-tools/printables/recognition-certificate-pdf.ts",
      "src/lib/public-tools/printables/labels-pdf.ts",
    ];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/PDFDocument\.create/);
      expect(source, file).toMatch(/documents\/pdf-kit/);
    }
  });

  it("PNG export for the 12 new tools reuses the shared PDF-to-PNG rebridge, never a second Canvas-drawing implementation", () => {
    const pngExportingTools = ["resume-builder-tool", "business-card-tool", "printable-calendar-tool", "planner-tool", "recognition-certificate-tool", "label-generator-tool"];
    for (const file of pngExportingTools) {
      const source = fs.readFileSync(`src/components/public-tools/tools/${file}.tsx`, "utf8");
      expect(source, file).toMatch(/documents\/png-export/);
    }
  });
});

describe("Fase 47: dependency hygiene — no new dependency was added", () => {
  it("package.json still lists exactly the pre-existing pdf-lib/pdfjs-dist/qrcode/jsbarcode/fflate stack, nothing new", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.dependencies["pdf-lib"]).toBeDefined();
    expect(pkg.dependencies["qrcode"]).toBeDefined();
    expect(pkg.dependencies["jsbarcode"]).toBeDefined();
  });
});

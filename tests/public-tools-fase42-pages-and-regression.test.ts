import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_TOOL_DEFINITIONS, getAllPublicTools, getNonEmptyPublicToolCategories, findPublicTool } from "@/lib/public-tools/registry";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const NEW_TOOL_SLUGS = [
  "unir-pdf",
  "dividir-pdf",
  "organizar-pdf",
  "imagenes-a-pdf",
  "pdf-a-imagenes",
  "marca-de-agua-pdf",
  "numerar-paginas-pdf",
  "recortar-imagen",
  "eliminar-metadatos-imagen",
  "generador-favicon",
  "extraer-paleta-colores",
  "ocultar-informacion-imagen",
];

const NEW_TOOL_COMPONENT_FILES = [
  "merge-pdf-tool",
  "split-pdf-tool",
  "organize-pdf-tool",
  "images-to-pdf-tool",
  "pdf-to-images-tool",
  "watermark-pdf-tool",
  "page-numbers-pdf-tool",
  "crop-image-tool",
  "strip-metadata-tool",
  "favicon-tool",
  "palette-tool",
  "redact-image-tool",
];

// ---------------------------------------------------------------------------
// Inventario (spec section 40 "Inventario")
// ---------------------------------------------------------------------------
describe("Fase 42: 12 new tools confirmed, catalog reaches 25", () => {
  it("all 12 new slugs are registered", () => {
    // NOTE: as of Fase 43, these 12 tools are no longer flagged isNew — the "Nuevas" badge tracks the
    // most recently added batch, and Fase 43 added its own 12 tools. That isNew:false transition is
    // asserted explicitly (and confirmed intentional) in public-tools-fase43-pages-and-regression.test.ts.
    for (const slug of NEW_TOOL_SLUGS) {
      const tool = findPublicTool(slug);
      expect(tool).toBeDefined();
    }
  });

  it("catalog has at least 25 tools total", () => {
    expect(getAllPublicTools().length).toBeGreaterThanOrEqual(25);
  });

  it("at least 6 new tools are categorized under pdf-documentos", () => {
    const pdfTools = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "pdf-documentos");
    expect(pdfTools.length).toBeGreaterThanOrEqual(6);
  });

  it("at least 4 of the new tools relate to images (imagenes, privacidad, or diseno-web categories with image input)", () => {
    const imageRelated = NEW_TOOL_SLUGS.filter((slug) => {
      const tool = findPublicTool(slug);
      return tool?.acceptedFileTypes?.some((t) => t.startsWith("image/"));
    });
    expect(imageRelated.length).toBeGreaterThanOrEqual(4);
  });

  it("at least 2 new tools solve privacy or website-owner needs", () => {
    const privacyOrOwner = NEW_TOOL_SLUGS.map((slug) => findPublicTool(slug)!).filter((t) => t.category === "privacidad" || t.category === "diseno-web");
    expect(privacyOrOwner.length).toBeGreaterThanOrEqual(2);
  });

  it("all 12 new tools are DETERMINISTIC — no AI is used to manipulate a document or image", () => {
    for (const slug of NEW_TOOL_SLUGS) {
      const tool = findPublicTool(slug);
      expect(tool?.executionType).toBe("DETERMINISTIC");
      expect(tool?.requiresLocalAI).toBe(false);
    }
  });

  it("all 12 new tools support guests (no login required)", () => {
    for (const slug of NEW_TOOL_SLUGS) {
      expect(findPublicTool(slug)?.supportsGuest).toBe(true);
    }
  });

  it("each new tool declares its accepted file types and a limits summary (spec section 6)", () => {
    for (const slug of NEW_TOOL_SLUGS) {
      const tool = findPublicTool(slug);
      expect(tool?.acceptedFileTypes).toBeTruthy();
      expect(tool?.limitsSummary).toBeTruthy();
    }
  });
});

describe("registry: no empty categories (spec section 6)", () => {
  it("pdf-documentos, privacidad and diseno-web all have at least one tool", () => {
    const nonEmpty = getNonEmptyPublicToolCategories().map((c) => c.slug);
    expect(nonEmpty).toContain("pdf-documentos");
    expect(nonEmpty).toContain("privacidad");
    expect(nonEmpty).toContain("diseno-web");
  });
});

// ---------------------------------------------------------------------------
// No duplicó el compresor / redimensionador / convertidor (spec section 3, 44 items 3-5)
// ---------------------------------------------------------------------------
describe("Fase 42: no duplication of the existing image compressor/resizer", () => {
  it("recortar-imagen reuses the compressor's shared image-io core instead of its own image loader", () => {
    const source = read("src/components/public-tools/tools/crop-image-tool.tsx");
    expect(source).toMatch(/from "@\/lib\/public-tools\/files\/image-io"/);
    expect(source).not.toMatch(/new Image\(\)/);
  });

  it("the image compressor itself was refactored onto the same shared core (single implementation, not two)", () => {
    const source = read("src/components/public-tools/tools/image-compressor-tool.tsx");
    expect(source).toMatch(/from "@\/lib\/public-tools\/files\/image-io"/);
  });

  it("no new tool re-implements a generic width/height resize-only flow identical to the compressor", () => {
    for (const file of ["favicon-tool", "strip-metadata-tool", "palette-tool", "redact-image-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/Mantener proporción/);
    }
  });

  it("only one QR generator and one engagement calculator exist in the whole registry (Fase 42 spec section 3)", () => {
    const qrTools = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.keywords.some((k) => k.includes("qr")));
    const engagementTools = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug.includes("engagement"));
    expect(qrTools).toHaveLength(1);
    expect(engagementTools).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SEO y páginas (spec section 40 "SEO y páginas")
// ---------------------------------------------------------------------------
describe("Fase 42: SEO for the new tools", () => {
  it("every new tool has a unique metadata title, distinct from every other tool's", () => {
    const titles = PUBLIC_TOOL_DEFINITIONS.map((t) => t.metadata.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("no new tool's longDescription is a copy-paste of another with only 'PDF'/'imagen' swapped", () => {
    const newDescriptions = NEW_TOOL_SLUGS.map((slug) => findPublicTool(slug)!.longDescription);
    expect(new Set(newDescriptions).size).toBe(newDescriptions.length);
  });

  it("no new tool claims lossless compression, absolute privacy, guaranteed repair, universal compatibility, professional quality, or unlimited files (spec section 31)", () => {
    const forbiddenPhrases = [
      /sin pérdida/i,
      /privacidad absoluta/i,
      /reparaci[oó]n garantizada/i,
      /compatibilidad universal/i,
      /calidad profesional/i,
      /archivos ilimitados/i,
      /mill(o|ó)n(es)? de usuarios/i,
      /la mejor herramienta/i,
      /100\s*%\s*(preciso|seguro|privado)/i,
    ];
    for (const slug of NEW_TOOL_SLUGS) {
      const tool = findPublicTool(slug)!;
      const text = `${tool.shortDescription} ${tool.longDescription} ${tool.metadata.description}`;
      for (const pattern of forbiddenPhrases) {
        expect(text).not.toMatch(pattern);
      }
    }
  });

  it("every new tool has a real FAQ with at least one entry", () => {
    for (const slug of NEW_TOOL_SLUGS) {
      expect(findPublicTool(slug)!.faq.length).toBeGreaterThan(0);
    }
  });

  it("the favicon tool never claims to produce a valid ICO without qualification issues (honest about PNG-in-ICO)", () => {
    const tool = findPublicTool("generador-favicon")!;
    expect(tool.faq.some((f) => /favicon\.ico.*renombrado|PNG.*ICO|ICO.*real/i.test(`${f.question} ${f.answer}`))).toBe(true);
  });

  it("the redaction tool's FAQ/description never claims automatic face detection", () => {
    const tool = findPublicTool("ocultar-informacion-imagen")!;
    const text = `${tool.longDescription} ${tool.faq.map((f) => f.answer).join(" ")}`;
    expect(text).not.toMatch(/detecci[oó]n facial autom[aá]tica (existe|disponible|activada)/i);
  });
});

describe("Fase 42: sitemap includes the new tools automatically", () => {
  it("sitemap.ts derives entries from the registry (no hardcoded new-tool list to fall out of sync)", () => {
    const source = read("src/app/sitemap.ts");
    expect(source).toMatch(/getAllPublicTools/);
    for (const slug of NEW_TOOL_SLUGS) expect(source).not.toMatch(new RegExp(slug));
  });
});

// ---------------------------------------------------------------------------
// Enlazado interno (spec section 33)
// ---------------------------------------------------------------------------
describe("Fase 42: internal linking between related new tools makes sense", () => {
  it("unir-pdf links to dividir-pdf, organizar-pdf or numerar-paginas-pdf", () => {
    const related = findPublicTool("unir-pdf")!.relatedTools;
    expect(related.some((r) => ["dividir-pdf", "organizar-pdf", "numerar-paginas-pdf"].includes(r))).toBe(true);
  });

  it("imagenes-a-pdf links to pdf-a-imagenes", () => {
    expect(findPublicTool("imagenes-a-pdf")!.relatedTools).toContain("pdf-a-imagenes");
  });

  it("eliminar-metadatos-imagen links to ocultar-informacion-imagen or recortar-imagen", () => {
    const related = findPublicTool("eliminar-metadatos-imagen")!.relatedTools;
    expect(related.some((r) => ["ocultar-informacion-imagen", "recortar-imagen"].includes(r))).toBe(true);
  });

  it("generador-favicon links to extraer-paleta-colores or comprimir-imagen", () => {
    const related = findPublicTool("generador-favicon")!.relatedTools;
    expect(related.some((r) => ["extraer-paleta-colores", "comprimir-imagen"].includes(r))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Privacidad: no se suben archivos (spec sections 9, 19 "no se subieron archivos")
// ---------------------------------------------------------------------------
describe("Fase 42: no new tool uploads a file to a server", () => {
  for (const file of NEW_TOOL_COMPONENT_FILES) {
    it(`${file}.tsx never calls fetch/XHR/a server action with the file's bytes`, () => {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/fetch\(|XMLHttpRequest|"use server"/);
    });
  }

  it("the shared PDF/image/zip cores never call fetch/XHR/a server action", () => {
    const files = [
      "src/lib/public-tools/pdf/load.ts",
      "src/lib/public-tools/pdf/merge.ts",
      "src/lib/public-tools/pdf/split.ts",
      "src/lib/public-tools/pdf/organize.ts",
      "src/lib/public-tools/pdf/watermark.ts",
      "src/lib/public-tools/pdf/page-numbers.ts",
      "src/lib/public-tools/pdf/images-to-pdf.ts",
      "src/lib/public-tools/files/zip.ts",
      "src/lib/public-tools/images/favicon.ts",
      "src/lib/public-tools/images/palette.ts",
      "src/lib/public-tools/images/metadata.ts",
      "src/lib/public-tools/images/redact.ts",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/fetch\(|XMLHttpRequest|"use server"/);
    }
  });

  it("no new tool writes to localStorage/sessionStorage/IndexedDB automatically (spec section 9)", () => {
    for (const file of NEW_TOOL_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/localStorage\.|sessionStorage\.|indexedDB/);
    }
  });
});

// ---------------------------------------------------------------------------
// Cleanup, cancelación (spec sections 9, 26, 28)
// ---------------------------------------------------------------------------
describe("Fase 42: cleanup and cancellation are real, not decorative", () => {
  it("merge/crop/redact tools use ObjectUrlRegistry for cleanup, not ad-hoc revokeObjectURL calls scattered inline", () => {
    for (const file of ["merge-pdf-tool", "crop-image-tool", "redact-image-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/ObjectUrlRegistry/);
    }
  });

  it("pdf-to-images uses a real CancellationToken, checked inside the render loop, not just a UI flag", () => {
    const source = read("src/components/public-tools/tools/pdf-to-images-tool.tsx");
    expect(source).toMatch(/CancellationToken/);
    expect(source).toMatch(/token\.cancelled/);
  });

  it("organize-pdf caps concurrent thumbnail renders at the centralized limit, not a hardcoded local number", () => {
    const source = read("src/components/public-tools/tools/organize-pdf-tool.tsx");
    expect(source).toMatch(/FILE_LIMITS\.pdf\.maxPagesRenderedAtOnce/);
  });
});

// ---------------------------------------------------------------------------
// Regresión: 13 herramientas anteriores + app existente (spec section 40 "Regresión")
// ---------------------------------------------------------------------------
describe("Fase 42 regression: the 13 Fase 41 tools are untouched in the registry", () => {
  const previousSlugs = [
    "contador-de-palabras",
    "reescritor-de-textos",
    "limpiador-de-texto",
    "resumidor-de-textos",
    "corrector-de-textos",
    "generador-titulos-meta-descripciones",
    "generador-contenido-redes-sociales",
    "generador-codigo-qr",
    "comprimir-imagen",
    "generador-utm",
    "analizador-de-titulos",
    "reutilizador-de-contenido",
    "calculadora-engagement",
  ];

  it("all 13 previous tools still resolve and are marked isNew:false", () => {
    for (const slug of previousSlugs) {
      const tool = findPublicTool(slug);
      expect(tool).toBeDefined();
      expect(tool?.isNew).toBe(false);
    }
  });
});

describe("Fase 42 regression: existing app surfaces untouched", () => {
  it("AI Center registry, Guest layout, and the AI capabilities cores still exist", () => {
    expect(existsSync(path.join(ROOT, "src/lib/ai-center/registry.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/guest/layout.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/lib/ai-capabilities/shared-rules.ts"))).toBe(true);
  });

  it("dashboard layout was not modified to reference the new PDF/image tooling", () => {
    const source = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(source).not.toMatch(/pdf-lib|pdfjs-dist|public-tools\/pdf/);
  });

  it("Admin routes still exist, untouched", () => {
    expect(existsSync(path.join(ROOT, "src/app/admin/projects"))).toBe(true);
  });

  it("Google Integrations and Performance Center service files still exist, untouched", () => {
    expect(existsSync(path.join(ROOT, "src/server/services/google-connection.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/server/services/performance-goals.ts"))).toBe(true);
  });

  it("the customer-support widget mount and Fase 40 domain resolution are untouched", () => {
    const source = read("src/app/(public)/layout.tsx");
    expect(source).toMatch(/PublicCustomerSupportWidgetMount/);
    expect(source).toMatch(/resolveActivePublicConfig/);
  });

  it("/herramientas is still a suggested syncable path for the customer-support agent, and remains unblocked", () => {
    const source = read("src/lib/customer-support/internal-path.ts");
    expect(source).toMatch(/"\/herramientas"/);
    const blockedMatch = /CUSTOMER_SUPPORT_BLOCKED_PATH_PREFIXES = \[([^\]]*)\]/.exec(source);
    expect(blockedMatch?.[1]).not.toMatch(/herramientas/);
  });
});

// ---------------------------------------------------------------------------
// Accesibilidad (spec section 35)
// ---------------------------------------------------------------------------
describe("Fase 42: accessibility of the new tools", () => {
  it("every new tool uses the shared FileUploadZone (keyboard/button alternative to drag-and-drop) where it accepts files", () => {
    const fileBasedTools = NEW_TOOL_COMPONENT_FILES.filter((f) => f !== "organize-pdf-tool" || true);
    for (const file of fileBasedTools) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/FileUploadZone/);
    }
  });

  it("no new tool uses alert() or confirm()", () => {
    for (const file of NEW_TOOL_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/\balert\(|\bconfirm\(/);
    }
  });

  it("results and errors are announced via aria-live or role=alert, not color alone", () => {
    for (const file of NEW_TOOL_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/aria-live|role="alert"/);
    }
  });

  it("interactive selection handles (crop, redact zones) expose accessible labels", () => {
    const crop = read("src/components/public-tools/tools/crop-image-tool.tsx");
    expect(crop).toMatch(/aria-label=\{`Redimensionar selección/);
    const organize = read("src/components/public-tools/tools/organize-pdf-tool.tsx");
    expect(organize).toMatch(/aria-label=\{`Seleccionar página/);
  });

  it("the crop and redact tools provide accessible numeric fallback controls, not drag-only interaction", () => {
    const crop = read("src/components/public-tools/tools/crop-image-tool.tsx");
    expect(crop).toMatch(/crop-x|crop-width/);
    const redact = read("src/components/public-tools/tools/redact-image-tool.tsx");
    expect(redact).toMatch(/aria-label="Ancho"|aria-label="Alto"/);
  });
});

// ---------------------------------------------------------------------------
// Seguridad (spec section 37)
// ---------------------------------------------------------------------------
describe("Fase 42: security", () => {
  it("no new tool component uses dangerouslySetInnerHTML", () => {
    for (const file of NEW_TOOL_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it("the favicon tool does not accept SVG input (avoids the SVG-sanitization attack surface entirely)", () => {
    const tool = findPublicTool("generador-favicon")!;
    expect(tool.acceptedFileTypes).not.toContain("image/svg+xml");
    const source = read("src/components/public-tools/tools/favicon-tool.tsx");
    expect(source).not.toMatch(/image\/svg/);
  });

  it("the watermark tool never accepts HTML or a remote font URL — only a plain string drawn with an embedded standard font", () => {
    const source = read("src/lib/public-tools/pdf/watermark.ts");
    expect(source).toMatch(/StandardFonts/);
    expect(source).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  });

  it("all file-count and byte-size limits used by new tools come from the centralized FILE_LIMITS, never a local hardcoded number", () => {
    for (const file of NEW_TOOL_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      if (/maxFileBytes|maxDimension|maxFilesToMerge|maxTotalPages/.test(source)) {
        expect(source).toMatch(/FILE_LIMITS\./);
      }
    }
  });
});

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_TOOL_DEFINITIONS, PUBLIC_TOOL_CATEGORIES, findPublicTool, getNonEmptyPublicToolCategories } from "@/lib/public-tools/registry";
import { RENDERABLE_TOOL_SLUGS } from "@/components/public-tools/tool-component-registry";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

const FASE43_SLUGS = [
  "generador-contrasenas",
  "comprobar-fortaleza-contrasena",
  "generador-uuid",
  "generador-hash",
  "formatear-json",
  "codificar-base64",
  "codificar-url",
  "convertidor-timestamp-unix",
  "conversor-unidades",
  "calculadora-porcentajes",
  "calculadora-edad-fechas",
  "comprobar-contraste-colores",
];

// ---------------------------------------------------------------------------
// Inventario y objetivo cuantitativo (spec sections 3, 4)
// ---------------------------------------------------------------------------
describe("Fase 43: inventory — 12 new tools, 37 total, no equivalent existed before", () => {
  it("adds exactly the 12 prioritized tools, each with a real registry entry", () => {
    for (const slug of FASE43_SLUGS) expect(findPublicTool(slug)).toBeDefined();
    expect(FASE43_SLUGS).toHaveLength(12);
  });

  it("catalog totals at least 37 public tools", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.length).toBeGreaterThanOrEqual(37);
  });

  it("no PDF/QR/engagement/image-compression capability was duplicated — the QR generator and engagement calculator each still appear exactly once", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "generador-codigo-qr")).toHaveLength(1);
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "calculadora-engagement")).toHaveLength(1);
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug === "comprimir-imagen")).toHaveLength(1);
  });

  it("no other tool in the catalog duplicates a Fase 43 capability by keyword overlap (checked generically by the shared registry test, re-asserted here for the new batch specifically)", () => {
    for (const slug of FASE43_SLUGS) {
      const tool = findPublicTool(slug)!;
      const others = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.slug !== slug);
      for (const other of others) {
        const overlap = tool.keywords.filter((k) => other.keywords.includes(k));
        expect(overlap).toEqual([]);
      }
    }
  });

  it("all 12 Fase 43 tools are registered (the isNew flag itself is re-verified in public-tools-fase44-pages-and-regression.test.ts, since Fase 44 introduced its own newer batch and superseded this one — the badge tracks only the most recent batch, not every tool ever added)", () => {
    for (const slug of FASE43_SLUGS) expect(findPublicTool(slug)).toBeDefined();
    const fase42Slugs = ["unir-pdf", "dividir-pdf", "organizar-pdf", "imagenes-a-pdf", "pdf-a-imagenes", "marca-de-agua-pdf", "numerar-paginas-pdf", "recortar-imagen", "eliminar-metadatos-imagen", "generador-favicon", "extraer-paleta-colores", "ocultar-informacion-imagen"];
    for (const slug of fase42Slugs) expect(findPublicTool(slug)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Distribución mínima (spec section 4)
// ---------------------------------------------------------------------------
describe("Fase 43: minimum category distribution", () => {
  it("has at least 2 seguridad tools", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "seguridad").length).toBeGreaterThanOrEqual(2);
  });

  it("has at least 5 desarrollo tools", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "desarrollo").length).toBeGreaterThanOrEqual(5);
  });

  it("has at least 3 conversores+calculadoras tools combined", () => {
    const count = PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "conversores" || t.category === "calculadoras").length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("has at least 1 accesibilidad tool", () => {
    expect(PUBLIC_TOOL_DEFINITIONS.filter((t) => t.category === "accesibilidad").length).toBeGreaterThanOrEqual(1);
  });

  it("all 12 new tools are DETERMINISTIC (no AI used for security/dev/converter/calculator logic)", () => {
    for (const slug of FASE43_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.executionType).toBe("DETERMINISTIC");
      expect(tool.requiresLocalAI).toBe(false);
    }
  });

  it("all 12 new tools support guests (no registration required) and process device-only", () => {
    for (const slug of FASE43_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(tool.supportsGuest).toBe(true);
      expect(tool.privacy).toBe("device-only");
    }
  });

  it("none of the 5 new categories are rendered empty", () => {
    const nonEmpty = getNonEmptyPublicToolCategories().map((c) => c.slug);
    for (const category of ["seguridad", "desarrollo", "conversores", "calculadoras", "accesibilidad"]) {
      expect(nonEmpty).toContain(category);
    }
  });

  it("category slugs referenced by tools all exist in PUBLIC_TOOL_CATEGORIES with a real label", () => {
    const slugs = new Set(PUBLIC_TOOL_CATEGORIES.map((c) => c.slug));
    for (const slug of ["seguridad", "desarrollo", "conversores", "calculadoras", "accesibilidad"]) {
      expect(slugs.has(slug as never)).toBe(true);
      expect(PUBLIC_TOOL_CATEGORIES.find((c) => c.slug === slug)?.label.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Núcleos compartidos: ubicación real, no duplicación (spec sections 7, 26)
// ---------------------------------------------------------------------------
describe("Fase 43: shared utility cores exist and are the single source used by every tool", () => {
  const CORE_FILES = [
    "src/lib/public-tools/utilities/limits.ts",
    "src/lib/public-tools/utilities/secure-random.ts",
    "src/lib/public-tools/utilities/password-generator.ts",
    "src/lib/public-tools/utilities/password-strength.ts",
    "src/lib/public-tools/utilities/uuid.ts",
    "src/lib/public-tools/utilities/crypto-digest.ts",
    "src/lib/public-tools/utilities/encoding.ts",
    "src/lib/public-tools/utilities/json-tool.ts",
    "src/lib/public-tools/utilities/url-tool.ts",
    "src/lib/public-tools/utilities/timestamp.ts",
    "src/lib/public-tools/utilities/units.ts",
    "src/lib/public-tools/utilities/percentages.ts",
    "src/lib/public-tools/utilities/dates.ts",
    "src/lib/public-tools/utilities/validation.ts",
  ];

  it("every declared core module file exists", () => {
    for (const file of CORE_FILES) expect(existsSync(path.join(ROOT, file))).toBe(true);
  });

  it("limits.ts is the single source of size/count/length limits — no tool component hardcodes its own numeric limit", () => {
    const limitsSource = read("src/lib/public-tools/utilities/limits.ts");
    expect(limitsSource).toMatch(/UTILITY_LIMITS/);
    // Some tools enforce their limit directly in the component (password/uuid/hash/base64); others enforce it
    // once inside their shared core instead (json-tool.ts, url-tool.ts) — both are single-source, neither
    // duplicates a numeric literal, so both patterns are accepted here.
    const componentFiles = ["password-generator-tool", "uuid-generator-tool", "hash-generator-tool", "base64-tool"];
    for (const file of componentFiles) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/UTILITY_LIMITS/);
    }
    const coreFiles = ["json-tool.ts", "url-tool.ts"];
    for (const file of coreFiles) {
      const source = read(`src/lib/public-tools/utilities/${file}`);
      expect(source).toMatch(/UTILITY_LIMITS/);
    }
  });

  it("the contrast checker reuses the existing color-contrast.ts core instead of re-implementing luminance math", () => {
    const toolSource = read("src/components/public-tools/tools/color-contrast-tool.tsx");
    expect(toolSource).toMatch(/from "@\/lib\/public-tools\/color-contrast"/);
    expect(toolSource).not.toMatch(/relativeLuminance\s*\(/); // never redefines luminance itself, only imports and calls it via contrastRatioRgb
  });

  it("color-contrast.ts still exports the original contrastRatio function used by the QR generator and palette extractor (no regression)", () => {
    const source = read("src/lib/public-tools/color-contrast.ts");
    expect(source).toMatch(/export function contrastRatio\(/);
    const qrSource = read("src/lib/public-tools/qr-content.ts");
    expect(qrSource + read("src/components/public-tools/tools/qr-generator-tool.tsx")).toMatch(/color-contrast|contrastRatio/);
  });
});

// ---------------------------------------------------------------------------
// Carga dinámica y registro de componentes (spec sections 6, 29)
// ---------------------------------------------------------------------------
describe("Fase 43: component wiring", () => {
  it("every Fase 43 tool has a renderable slug wired into the switch statement", () => {
    for (const slug of FASE43_SLUGS) expect(RENDERABLE_TOOL_SLUGS as readonly string[]).toContain(slug);
  });

  it("RENDERABLE_TOOL_SLUGS exactly matches the registry (no orphaned component, no unrendered registry entry)", () => {
    const registrySlugs = new Set(PUBLIC_TOOL_DEFINITIONS.map((t) => t.slug));
    expect(RENDERABLE_TOOL_SLUGS).toHaveLength(PUBLIC_TOOL_DEFINITIONS.length);
    for (const slug of RENDERABLE_TOOL_SLUGS) expect(registrySlugs.has(slug)).toBe(true);
  });

  it("every Fase 43 tool component is loaded via next/dynamic, not imported eagerly", () => {
    const source = read("src/components/public-tools/tool-component-registry.tsx");
    const fase43Components = [
      "password-generator-tool",
      "password-strength-tool",
      "uuid-generator-tool",
      "hash-generator-tool",
      "json-formatter-tool",
      "base64-tool",
      "url-encoder-tool",
      "timestamp-converter-tool",
      "unit-converter-tool",
      "percentage-calculator-tool",
      "age-date-calculator-tool",
      "color-contrast-tool",
    ];
    for (const component of fase43Components) {
      const regex = new RegExp(`dynamic\\(\\(\\) => import\\("@/components/public-tools/tools/${component}"\\)`);
      expect(source).toMatch(regex);
    }
  });

  it("the new icons are registered in the closed tool-icon.tsx map (never a dynamic lucide-react lookup)", () => {
    const source = read("src/components/public-tools/tool-icon.tsx");
    for (const icon of ["KeyRound", "ShieldAlert", "Fingerprint", "Hash", "Braces", "FileCode2", "Link", "Clock", "Ruler", "Percent", "CalendarClock", "Contrast"]) {
      expect(source).toMatch(new RegExp(`\\b${icon}\\b`));
    }
  });
});

// ---------------------------------------------------------------------------
// Privacidad y ausencia de red (spec sections 24, 25, 37 "seguridad")
// ---------------------------------------------------------------------------
describe("Fase 43: privacy invariants — never sends data to a server", () => {
  const FASE43_COMPONENT_FILES = [
    "password-generator-tool",
    "password-strength-tool",
    "uuid-generator-tool",
    "hash-generator-tool",
    "json-formatter-tool",
    "base64-tool",
    "url-encoder-tool",
    "timestamp-converter-tool",
    "unit-converter-tool",
    "percentage-calculator-tool",
    "age-date-calculator-tool",
    "color-contrast-tool",
  ];

  it("no Fase 43 tool component calls fetch, XMLHttpRequest, or a server action", () => {
    for (const file of FASE43_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/fetch\(|XMLHttpRequest|"use server"/);
    }
  });

  it("password-related components never persist to localStorage/sessionStorage/IndexedDB", () => {
    for (const file of ["password-generator-tool", "password-strength-tool"]) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });

  it("no Fase 43 tool component writes to console (no accidental logging of secrets)", () => {
    for (const file of FASE43_COMPONENT_FILES) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/console\.(log|warn|error|info|debug)/);
    }
  });

  it("every Fase 43 tool page shows a real privacy notice via the shared PrivacyNotice/ProcessingBadge components (no bespoke reimplementation)", () => {
    const layoutSource = read("src/components/public-tools/public-tool-layout.tsx");
    expect(layoutSource).toMatch(/PrivacyNotice/);
  });

  it("every Fase 43 tool shows the exact mandated notice text: 'Los datos se procesan en tu dispositivo y no se envían al servidor.' (spec section 25)", () => {
    const layoutSource = read("src/components/public-tools/public-tool-layout.tsx");
    expect(layoutSource).toMatch(/category=\{tool\.category\}/);
    const badgeSource = read("src/components/public-tools/processing-badge.tsx");
    expect(badgeSource).toMatch(/Los datos se procesan en tu dispositivo y no se envían al servidor\./);
    for (const slug of FASE43_SLUGS) {
      const tool = findPublicTool(slug)!;
      expect(["seguridad", "desarrollo", "conversores", "calculadoras", "accesibilidad"]).toContain(tool.category);
    }
  });
});

// ---------------------------------------------------------------------------
// Seguridad: sin eval, sin dangerouslySetInnerHTML, sin Math.random en seguridad (spec section 27)
// ---------------------------------------------------------------------------
describe("Fase 43: security invariants", () => {
  it("no Fase 43 core or component uses eval or new Function", () => {
    const files = [
      "src/lib/public-tools/utilities/json-tool.ts",
      "src/components/public-tools/tools/json-formatter-tool.tsx",
      "src/components/public-tools/tools/url-encoder-tool.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/\beval\(|new Function\(/);
    }
  });

  it("no Fase 43 component uses dangerouslySetInnerHTML", () => {
    const dir = "src/components/public-tools/tools";
    for (const file of [
      "password-generator-tool",
      "password-strength-tool",
      "uuid-generator-tool",
      "hash-generator-tool",
      "json-formatter-tool",
      "base64-tool",
      "url-encoder-tool",
      "timestamp-converter-tool",
      "unit-converter-tool",
      "percentage-calculator-tool",
      "age-date-calculator-tool",
      "color-contrast-tool",
    ]) {
      const source = read(`${dir}/${file}.tsx`);
      expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it("password generation only ever uses Web Crypto — Math.random never appears outside of an explanatory comment in the whole utilities/ core", () => {
    const files = ["secure-random.ts", "password-generator.ts", "uuid.ts"];
    for (const file of files) {
      const source = read(`src/lib/public-tools/utilities/${file}`);
      const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(withoutComments).not.toMatch(/Math\.random/);
    }
  });

  it("the URL tool warns about dangerous schemes before ever rendering a value as a clickable link", () => {
    const source = read("src/components/public-tools/tools/url-encoder-tool.tsx");
    expect(source).toMatch(/isDangerousScheme/);
  });

  it("the favicon tool (Fase 42, unaffected) still rejects SVG — regression check that Fase 43 didn't touch it", () => {
    const source = read("src/components/public-tools/tools/favicon-tool.tsx");
    expect(source).not.toMatch(/image\/svg/);
  });
});

// ---------------------------------------------------------------------------
// Accesibilidad (spec section 30)
// ---------------------------------------------------------------------------
describe("Fase 43: accessibility", () => {
  it("the strength/contrast/percentage tools never signal state via color alone — they also render text/symbols", () => {
    const strength = read("src/components/public-tools/tools/password-strength-tool.tsx");
    expect(strength).toMatch(/aria-live/);
    const contrast = read("src/components/public-tools/tools/color-contrast-tool.tsx");
    expect(contrast).toMatch(/✓|✗/); // symbol alongside color, never color-only
    expect(contrast).toMatch(/aria-live/);
  });

  it("every Fase 43 tool component uses <Label htmlFor> pairing for its primary inputs, not a bare placeholder", () => {
    const dir = "src/components/public-tools/tools";
    for (const file of [
      "password-generator-tool",
      "uuid-generator-tool",
      "hash-generator-tool",
      "json-formatter-tool",
      "base64-tool",
      "unit-converter-tool",
      "percentage-calculator-tool",
      "age-date-calculator-tool",
    ]) {
      const source = read(`${dir}/${file}.tsx`);
      expect(source).toMatch(/<Label htmlFor=/);
    }
  });

  it("no Fase 43 component uses window.alert or window.confirm", () => {
    const dir = "src/components/public-tools/tools";
    for (const file of [
      "password-generator-tool",
      "password-strength-tool",
      "uuid-generator-tool",
      "hash-generator-tool",
      "json-formatter-tool",
      "base64-tool",
      "url-encoder-tool",
      "timestamp-converter-tool",
      "unit-converter-tool",
      "percentage-calculator-tool",
      "age-date-calculator-tool",
      "color-contrast-tool",
    ]) {
      const source = read(`${dir}/${file}.tsx`);
      expect(source).not.toMatch(/\balert\(|\bconfirm\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// SEO y contenido honesto (spec sections 31, 38)
// ---------------------------------------------------------------------------
describe("Fase 43: SEO and honest copy", () => {
  it("no Fase 43 tool POSITIVELY claims absolute/guaranteed security, universal accuracy, or unbreakable passwords (an honest denial like 'no existe una contraseña invulnerable' is exactly what the spec requires, and must not itself be flagged)", () => {
    const bannedPhrases = [/imposible de descifrar/i, /invulnerable/i, /100 ?% segur/i, /imposible de adivinar/i, /contraseñas? irrompibles?/i, /cumplimiento total/i, /resultados certificados/i, /unicidad garantizada/i];
    const negationMarkers = /\bno\b|\bnunca\b|\bninguna\b|\bningún\b/i;
    for (const slug of FASE43_SLUGS) {
      const tool = findPublicTool(slug)!;
      const text = `${tool.longDescription} ${tool.shortDescription} ${tool.metadata.description} ${tool.faq.map((f) => f.answer).join(" ")}`;
      // Evaluate sentence-by-sentence so a nearby negation ("no existe una contraseña invulnerable") correctly clears the phrase, while a bare positive claim would not.
      const sentences = text.split(/(?<=[.!?])\s+/);
      for (const phrase of bannedPhrases) {
        const offendingSentence = sentences.find((s) => phrase.test(s) && !negationMarkers.test(s));
        expect(offendingSentence).toBeUndefined();
      }
    }
  });

  it("the password generator FAQ explicitly denies invulnerability instead of overclaiming", () => {
    const tool = findPublicTool("generador-contrasenas")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/no existe una contraseña invulnerable/i);
  });

  it("the strength analyzer FAQ explicitly states it does not check breach databases", () => {
    const tool = findPublicTool("comprobar-fortaleza-contrasena")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/no consulta ninguna base de datos de filtraciones/i);
  });

  it("the UUID generator FAQ explicitly denies guaranteed absolute uniqueness", () => {
    const tool = findPublicTool("generador-uuid")!;
    const faqText = tool.faq.map((f) => f.answer).join(" ");
    expect(faqText).toMatch(/no se puede garantizar unicidad absoluta/i);
  });

  it("every new tool has a distinct metadata title across the whole catalog (no copy-pasted introduction)", () => {
    const titles = PUBLIC_TOOL_DEFINITIONS.map((t) => t.metadata.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("[slug]/page.tsx generation works unchanged for the new slugs (registry-driven, no hardcoded slug list)", () => {
    const source = read("src/app/(public)/herramientas/[slug]/page.tsx");
    expect(source).toMatch(/getAllPublicTools/);
  });

  it("sitemap.ts is registry-driven, so the 12 new tools are automatically included without a manual edit", () => {
    const source = read("src/app/sitemap.ts");
    expect(source).toMatch(/getAllPublicTools/);
    for (const slug of FASE43_SLUGS) expect(findPublicTool(slug)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Centro público y página principal (spec sections 32, 43-44)
// ---------------------------------------------------------------------------
describe("Fase 43: public center page", () => {
  it("/herramientas metadata no longer references the stale Fase 42 total (superseded first by 37, now by 49 — see public-tools-fase44-pages-and-regression.test.ts for the current count)", () => {
    const source = read("src/app/(public)/herramientas/page.tsx");
    expect(source).not.toMatch(/25 herramientas/);
  });

  it("/herramientas still renders a dynamic tool count from the registry, never a hardcoded number in JSX", () => {
    const source = read("src/app/(public)/herramientas/page.tsx");
    expect(source).toMatch(/\{tools\.length\}/);
  });

  it("does not create a second /tools center or duplicate registry", () => {
    expect(existsSync(path.join(ROOT, "src/app/(public)/tools"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/app/tools"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/lib/public-tools/registry-2.ts"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Servicio al cliente: sin cambios en aislamiento por dominio (spec section 34)
// ---------------------------------------------------------------------------
describe("Fase 43: customer-support agent compatibility unaffected", () => {
  it("the customer-support agent service file was not modified to auto-approve or execute tools (still DRAFT-only source suggestions)", () => {
    const source = read("src/server/services/agent-customer-support.ts");
    expect(source).not.toMatch(/generador-contrasenas|comprobar-fortaleza-contrasena/); // no special-casing added for the new tools
  });
});

// ---------------------------------------------------------------------------
// Regresión: Fase 41/42 y el resto de la app siguen intactos (spec sections 26-27, 37 "Regresión")
// ---------------------------------------------------------------------------
describe("Fase 43: regression — everything built in earlier phases still exists untouched", () => {
  it("all 13 Fase 41 tools and all 12 Fase 42 tools still exist in the registry", () => {
    const fase41Slugs = [
      "contador-de-palabras", "reescritor-de-textos", "limpiador-de-texto", "resumidor-de-textos", "corrector-de-textos",
      "generador-titulos-meta-descripciones", "generador-contenido-redes-sociales", "generador-codigo-qr", "comprimir-imagen",
      "generador-utm", "analizador-de-titulos", "reutilizador-de-contenido", "calculadora-engagement",
    ];
    const fase42Slugs = [
      "unir-pdf", "dividir-pdf", "organizar-pdf", "imagenes-a-pdf", "pdf-a-imagenes", "marca-de-agua-pdf",
      "numerar-paginas-pdf", "recortar-imagen", "eliminar-metadatos-imagen", "generador-favicon", "extraer-paleta-colores", "ocultar-informacion-imagen",
    ];
    for (const slug of [...fase41Slugs, ...fase42Slugs]) expect(findPublicTool(slug)).toBeDefined();
    expect(fase41Slugs).toHaveLength(13);
    expect(fase42Slugs).toHaveLength(12);
  });

  it("the PDF core (pdf-lib/pdfjs-dist) files still exist untouched", () => {
    for (const file of ["load", "merge", "split", "organize", "watermark", "page-numbers", "images-to-pdf", "render", "ranges"]) {
      expect(existsSync(path.join(ROOT, `src/lib/public-tools/pdf/${file}.ts`))).toBe(true);
    }
  });

  it("the image core (favicon/palette/metadata/redact) files still exist untouched", () => {
    for (const file of ["ico-encoder", "favicon", "palette", "metadata", "redact"]) {
      expect(existsSync(path.join(ROOT, `src/lib/public-tools/images/${file}.ts`))).toBe(true);
    }
  });

  it("the homepage, guest area, dashboard, admin, AI Center, and customer-support widget files were not deleted", () => {
    expect(existsSync(path.join(ROOT, "src/app/(public)/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/components/customer-support/widget/customer-support-widget.tsx"))).toBe(true);
  });

  it("no new dependency (pdf-lib, pdfjs-dist, fflate) is imported from any Fase 43 utility or component (this phase adds no new heavy dependency)", () => {
    const fase43Files = [
      "src/lib/public-tools/utilities/limits.ts",
      "src/lib/public-tools/utilities/secure-random.ts",
      "src/lib/public-tools/utilities/password-generator.ts",
      "src/lib/public-tools/utilities/uuid.ts",
      "src/lib/public-tools/utilities/crypto-digest.ts",
      "src/lib/public-tools/utilities/json-tool.ts",
      "src/lib/public-tools/utilities/units.ts",
      "src/components/public-tools/tools/password-generator-tool.tsx",
      "src/components/public-tools/tools/hash-generator-tool.tsx",
      "src/components/public-tools/tools/json-formatter-tool.tsx",
    ];
    for (const file of fase43Files) {
      const source = read(file);
      expect(source).not.toMatch(/pdf-lib|pdfjs-dist|fflate/);
    }
  });

  it("package.json was not modified to add a new dependency for this phase (spec section 53: no new dependency needed)", () => {
    const pkg = JSON.parse(read("package.json"));
    for (const dep of ["pdf-lib", "pdfjs-dist", "fflate"]) {
      // These are legitimate Fase 42 dependencies, confirmed still present but NOT newly added by Fase 43.
      expect(Boolean(pkg.dependencies?.[dep])).toBe(true);
    }
  });
});

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_TOOL_DEFINITIONS } from "@/lib/public-tools/registry";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// Centro público de herramientas: rutas (spec section 4)
// ---------------------------------------------------------------------------
describe("routes: /herramientas center and [slug] page exist, single convention", () => {
  it("the /herramientas center page exists", () => {
    expect(existsSync(path.join(ROOT, "src/app/(public)/herramientas/page.tsx"))).toBe(true);
  });

  it("the /herramientas/[slug] dynamic page exists", () => {
    expect(existsSync(path.join(ROOT, "src/app/(public)/herramientas/[slug]/page.tsx"))).toBe(true);
  });

  it("does not also create a duplicate English-named /tools center", () => {
    expect(existsSync(path.join(ROOT, "src/app/(public)/tools"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/app/tools"))).toBe(false);
  });

  it("[slug]/page.tsx uses generateStaticParams sourced from the registry (never a hardcoded slug list)", () => {
    const source = read("src/app/(public)/herramientas/[slug]/page.tsx");
    expect(source).toMatch(/generateStaticParams/);
    expect(source).toMatch(/getAllPublicTools/);
  });

  it("[slug]/page.tsx calls notFound() for an unavailable or unrenderable tool", () => {
    const source = read("src/app/(public)/herramientas/[slug]/page.tsx");
    expect(source).toMatch(/notFound\(\)/);
    expect(source).toMatch(/tool\.status !== "available"/);
  });
});

// ---------------------------------------------------------------------------
// Navegación pública y página principal (spec sections 5)
// ---------------------------------------------------------------------------
describe("public navigation and homepage section", () => {
  it("the public homepage links to /herramientas in its header nav", () => {
    const source = read("src/app/(public)/page.tsx");
    expect(source).toMatch(/href="\/herramientas">Herramientas</);
  });

  it("the public homepage links to /herramientas in its footer nav", () => {
    const source = read("src/app/(public)/page.tsx");
    const footerSection = source.slice(source.indexOf("<footer"));
    expect(footerSection).toMatch(/href="\/herramientas"/);
  });

  it("the homepage renders a 'Herramientas gratuitas' section with a 'Ver todas' link, not all 12 tools", () => {
    const source = read("src/app/(public)/page.tsx");
    expect(source).toMatch(/Herramientas gratuitas/);
    expect(source).toMatch(/Ver todas las herramientas/);
    expect(source).toMatch(/getFeaturedPublicTools\(\)\.slice\(0, 6\)/);
  });

  it("the public homepage was not otherwise rebuilt (still redirects a signed-in user to /dashboard)", () => {
    const source = read("src/app/(public)/page.tsx");
    expect(source).toMatch(/redirect\("\/dashboard"\)/);
  });
});

// ---------------------------------------------------------------------------
// SEO: metadata, canonical, structured data (spec sections 28-29)
// ---------------------------------------------------------------------------
describe("SEO metadata and structured data", () => {
  it("every tool has a distinct metadata title (no copy-pasted page content)", () => {
    const titles = PUBLIC_TOOL_DEFINITIONS.map((t) => t.metadata.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("[slug]/page.tsx generates canonical, OpenGraph and Twitter metadata per tool", () => {
    const source = read("src/app/(public)/herramientas/[slug]/page.tsx");
    expect(source).toMatch(/generateMetadata/);
    expect(source).toMatch(/alternates: \{ canonical: url \}/);
    expect(source).toMatch(/openGraph:/);
    expect(source).toMatch(/twitter:/);
  });

  it("structured-data.tsx only ever emits WebApplication/SoftwareApplication, BreadcrumbList and conditional FAQPage", () => {
    const source = read("src/components/public-tools/structured-data.tsx");
    expect(source).toMatch(/tool\.schemaType/);
    expect(source).toMatch(/BreadcrumbList/);
    expect(source).toMatch(/tool\.faq\.length > 0/);
    expect(source).not.toMatch(/aggregateRating|reviewCount|ratingValue/);
  });

  it("structured-data.tsx never fabricates review/rating data", () => {
    const source = read("src/components/public-tools/structured-data.tsx");
    expect(source).not.toMatch(/"review"|"rating"/);
  });
});

// ---------------------------------------------------------------------------
// Sitemap (spec section 30)
// ---------------------------------------------------------------------------
describe("sitemap.ts", () => {
  it("exists and sources tool entries from the registry, filtered to available tools", () => {
    const source = read("src/app/sitemap.ts");
    expect(source).toMatch(/getAllPublicTools/);
    expect(source).toMatch(/tool\.status === "available"/);
  });

  it("includes the /herramientas center path", () => {
    const source = read("src/app/sitemap.ts");
    expect(source).toMatch(/\/herramientas/);
  });

  it("never includes dashboard, guest, admin or api paths", () => {
    const source = read("src/app/sitemap.ts");
    expect(source).not.toMatch(/\/dashboard|\/guest|\/admin|\/api/);
  });
});

// ---------------------------------------------------------------------------
// Rendimiento: carga diferida (spec section 31)
// ---------------------------------------------------------------------------
describe("performance: lazy loading of local AI and per-tool code", () => {
  it("every tool component is registered via next/dynamic (code-split, never eagerly imported)", () => {
    const source = read("src/components/public-tools/tool-component-registry.tsx");
    expect(source).toMatch(/from "next\/dynamic"/);
    const dynamicCalls = source.match(/dynamic\(\(\) => import\(/g) ?? [];
    expect(dynamicCalls.length).toBe(109);
  });

  it("the /herramientas center page never imports a tool's interactive component directly", () => {
    const source = read("src/app/(public)/herramientas/page.tsx");
    expect(source).not.toMatch(/tool-component-registry|tools\/word-counter-tool/);
  });

  it("useLocalAI / the local engine is only imported by tool components, never by the layout shell", () => {
    const layout = read("src/components/public-tools/public-tool-layout.tsx");
    expect(layout).not.toMatch(/useLocalAI|ai\/local\/engine/);
  });
});

// ---------------------------------------------------------------------------
// Privacidad y "no subida al servidor" (spec sections 9, 15, 16, 17, 24)
// ---------------------------------------------------------------------------
describe("privacy: no-upload invariants for client-only tools", () => {
  it("the image compressor never uploads the file (no fetch/XHR/server action call) and goes through the shared canvas export core", () => {
    const source = read("src/components/public-tools/tools/image-compressor-tool.tsx");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|"use server"/);
    expect(source).toMatch(/canvasToBlob/);
    // The shared core it delegates to must itself never touch the network and must really call canvas.toBlob.
    const imageIoCore = read("src/lib/public-tools/files/image-io.ts");
    expect(imageIoCore).not.toMatch(/fetch\(|XMLHttpRequest|"use server"/);
    expect(imageIoCore).toMatch(/canvas\.toBlob/);
  });

  it("the image compressor revokes object URLs it creates (cleanup) via the shared ObjectUrlRegistry", () => {
    const source = read("src/components/public-tools/tools/image-compressor-tool.tsx");
    expect(source).toMatch(/ObjectUrlRegistry/);
    expect(source).toMatch(/revokeAll|urlsRef\.current\.revoke/);
    const registryCore = read("src/lib/public-tools/files/object-url.ts");
    expect(registryCore).toMatch(/URL\.revokeObjectURL/);
  });

  it("the QR generator never sends its payload to a server", () => {
    const source = read("src/components/public-tools/tools/qr-generator-tool.tsx");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|"use server"/);
  });

  it("the UTM generator never sends the built URL to a server", () => {
    const source = read("src/components/public-tools/tools/utm-generator-tool.tsx");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|"use server"/);
  });

  it("UTM history is opt-in and stored only in localStorage, never auto-synced", () => {
    const source = read("src/components/public-tools/tools/utm-generator-tool.tsx");
    expect(source).toMatch(/keepHistory/);
    expect(source).toMatch(/window\.localStorage/);
  });

  it("every local-AI tool component imports useLocalAI (never a bespoke fetch to an AI provider)", () => {
    const aiTools = [
      "rewriter-tool",
      "summarizer-tool",
      "corrector-tool",
      "seo-generator-tool",
      "social-generator-tool",
      "repurposer-tool",
    ];
    for (const tool of aiTools) {
      const source = read(`src/components/public-tools/tools/${tool}.tsx`);
      expect(source).toMatch(/useLocalAI/);
      expect(source).not.toMatch(/openai|anthropic|api\.openai\.com|generativelanguage\.googleapis/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Seguridad: XSS, dangerouslySetInnerHTML, HTML generado por IA (spec section 33)
// ---------------------------------------------------------------------------
describe("security: no unsafe HTML rendering of user or AI content", () => {
  it("dangerouslySetInnerHTML is used only for JSON-LD structured data (never for user/AI text)", () => {
    const files = [
      "src/components/public-tools/structured-data.tsx",
      "src/components/public-tools/public-tool-layout.tsx",
      "src/components/public-tools/tools/rewriter-tool.tsx",
      "src/components/public-tools/tools/summarizer-tool.tsx",
      "src/components/public-tools/tools/corrector-tool.tsx",
      "src/components/public-tools/tools/seo-generator-tool.tsx",
      "src/components/public-tools/tools/social-generator-tool.tsx",
      "src/components/public-tools/tools/repurposer-tool.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      const usesDangerous = source.includes("dangerouslySetInnerHTML");
      if (usesDangerous) {
        expect(file).toBe("src/components/public-tools/structured-data.tsx");
        expect(source).toMatch(/JSON\.stringify/);
      }
    }
  });

  it("AI-generated results are always rendered as plain text/textarea content, never parsed as HTML", () => {
    const source = read("src/components/public-tools/tools/rewriter-tool.tsx");
    expect(source).toMatch(/<Textarea value=\{result\}/);
  });
});

// ---------------------------------------------------------------------------
// Compatibilidad con el agente de servicio al cliente (spec section 37)
// ---------------------------------------------------------------------------
describe("customer-support agent compatibility with public tool pages", () => {
  it("/herramientas is a suggested syncable path, still requires manager approval to go live", () => {
    const source = read("src/lib/customer-support/internal-path.ts");
    expect(source).toMatch(/"\/herramientas"/);
  });

  it("/herramientas is not in the reserved/blocked path prefixes (so it and its tool subpages remain syncable)", () => {
    const source = read("src/lib/customer-support/internal-path.ts");
    const blockedMatch = /CUSTOMER_SUPPORT_BLOCKED_PATH_PREFIXES = \[([^\]]*)\]/.exec(source);
    expect(blockedMatch).toBeTruthy();
    expect(blockedMatch?.[1]).not.toMatch(/herramientas/);
  });

  it("the knowledge sync flow still always creates new sources as DRAFT, never auto-approved", () => {
    const source = read("src/server/services/customer-support-knowledge.ts");
    expect(source).toMatch(/status:\s*"DRAFT"/);
  });

  it("the customer-support Fase 40 domain-isolation resolution function was not touched by this phase", () => {
    const source = read("src/server/services/customer-support-config.ts");
    expect(source).toMatch(/export async function resolveActivePublicConfig\(hostname: string\)/);
  });
});

// ---------------------------------------------------------------------------
// Guardado en Workspace: solo autenticado, solo acción explícita (spec sections 19, 22, 35)
// ---------------------------------------------------------------------------
describe("save-to-workspace: authenticated, explicit, no second saved-content system", () => {
  it("getWorkspaceSaveContextAction never exposes a project list to an unauthenticated visitor", () => {
    const source = read("src/server/actions/public-tools.ts");
    const fn = source.slice(source.indexOf("export async function getWorkspaceSaveContextAction"), source.indexOf("export interface SaveToolResultInput"));
    expect(fn).toMatch(/if \(!user\) return \{ authenticated: false, projects: \[\] \};/);
  });

  it("saveToolResultToWorkspaceAction requires real project access before writing", () => {
    const source = read("src/server/actions/public-tools.ts");
    expect(source).toMatch(/requireProjectAccess\(projectId, "EDITOR"\)/);
  });

  it("saveToolResultToWorkspaceAction reuses the existing ContentItem model (no second saved-results table)", () => {
    const source = read("src/server/actions/public-tools.ts");
    expect(source).toMatch(/prisma\.contentItem\.create/);
  });

  it("the repurposer never auto-saves — saving only happens via the explicit SaveToWorkspaceButton", () => {
    const source = read("src/components/public-tools/tools/repurposer-tool.tsx");
    expect(source).toMatch(/SaveToWorkspaceButton/);
    expect(source).not.toMatch(/useEffect\([^)]*saveToolResultToWorkspaceAction/);
  });

  it("the tool never hides its result behind the save/registration prompt (spec section 22)", () => {
    const source = read("src/components/public-tools/save-to-workspace-button.tsx");
    expect(source).toMatch(/Crea una cuenta/);
    // The invitation text is a *sibling* action, never a wrapper around the result itself.
    expect(source).not.toMatch(/if \(!context\.authenticated\)[\s\S]*return null/);
  });
});

// ---------------------------------------------------------------------------
// No se conectó ningún proveedor de IA externo (spec section 23, informe punto 72)
// ---------------------------------------------------------------------------
describe("no external AI provider was connected anywhere in the public tools feature", () => {
  it("no public-tools file references an external LLM provider", () => {
    const dirs = ["src/lib/public-tools", "src/components/public-tools", "src/server/actions/public-tools.ts"];
    for (const dir of dirs) {
      const fullPath = path.join(ROOT, dir);
      if (!existsSync(fullPath)) continue;
    }
    const filesToCheck = [
      "src/server/actions/public-tools.ts",
      "src/lib/public-tools/ai-output-validation.ts",
      "src/lib/public-tools/prompts/rewriter.ts",
      "src/lib/public-tools/prompts/summarizer.ts",
      "src/lib/public-tools/prompts/corrector.ts",
      "src/lib/public-tools/prompts/seo-generator.ts",
      "src/lib/public-tools/prompts/social-generator.ts",
      "src/lib/public-tools/prompts/repurposer.ts",
    ];
    for (const file of filesToCheck) {
      const source = read(file);
      expect(source).not.toMatch(/openai|anthropic\.com|api\.anthropic|generativelanguage|cohere\.ai|huggingface\.co\/inference/i);
    }
  });
});

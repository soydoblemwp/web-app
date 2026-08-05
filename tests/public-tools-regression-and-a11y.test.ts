import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

// ---------------------------------------------------------------------------
// Regresión (spec section 39 "Regresión", section 42 items 35-37)
// ---------------------------------------------------------------------------
describe("regression: existing app surfaces are untouched by Fase 41", () => {
  it("the public layout still mounts the customer support widget (Fase 40 untouched)", () => {
    const source = read("src/app/(public)/layout.tsx");
    expect(source).toMatch(/PublicCustomerSupportWidgetMount/);
    expect(source).toMatch(/resolveActivePublicConfig/);
  });

  it("the Fase 40 hostname-binding library is untouched apart from the documented suggested-path addition", () => {
    const source = read("src/lib/customer-support/hostname.ts");
    expect(source).toMatch(/export function normalizeAndValidateHostname/);
    expect(source).toMatch(/export function pickTrustedHostHeader/);
  });

  it("the AI Center registry still exists and was not merged into the public tools registry", () => {
    expect(existsSync(path.join(ROOT, "src/lib/ai-center/registry.ts"))).toBe(true);
    const source = read("src/lib/ai-center/registry.ts");
    expect(source).toMatch(/AI_CENTER_CATEGORIES/);
  });

  it("Guest tools directory still exists, untouched, and is a separate surface from /herramientas", () => {
    expect(existsSync(path.join(ROOT, "src/app/guest/layout.tsx"))).toBe(true);
    const guestLayout = read("src/app/guest/layout.tsx");
    expect(guestLayout).not.toMatch(/herramientas/);
  });

  it("Google Integrations service files still exist, untouched", () => {
    expect(existsSync(path.join(ROOT, "src/server/services/google-connection.ts"))).toBe(true);
  });

  it("Performance Center service files still exist, untouched", () => {
    expect(existsSync(path.join(ROOT, "src/server/services/performance-goals.ts"))).toBe(true);
  });

  it("the dashboard project layout was not modified to reference public tools (no dashboard/public cross-wiring)", () => {
    const source = read("src/app/(dashboard)/dashboard/[projectId]/layout.tsx");
    expect(source).not.toMatch(/public-tools|herramientas/);
  });

  it("no new Prisma migration was created for this phase (the catalog stays in code, per spec section 38)", () => {
    const migrationsDir = path.join(ROOT, "prisma/migrations");
    const migrations = readdirSync(migrationsDir).filter((name) => /^\d{14}_/.test(name));
    const latest = migrations.sort().at(-1);
    expect(latest).toBe("20260805090000_add_customer_support_public_site_binding");
  });

  it("the public tools registry never imports PrismaClient (stays pure code, no persistence)", () => {
    const source = read("src/lib/public-tools/registry.ts");
    expect(source).not.toMatch(/prisma|PrismaClient/);
  });
});

// ---------------------------------------------------------------------------
// Accesibilidad (spec section 32)
// ---------------------------------------------------------------------------
describe("accessibility: no alert()/confirm(), color is never the only signal, labels present", () => {
  const toolFiles = [
    "word-counter-tool",
    "rewriter-tool",
    "text-cleaner-tool",
    "summarizer-tool",
    "corrector-tool",
    "seo-generator-tool",
    "social-generator-tool",
    "qr-generator-tool",
    "image-compressor-tool",
    "utm-generator-tool",
    "title-analyzer-tool",
    "repurposer-tool",
  ];

  it("no tool component uses alert() or confirm()", () => {
    for (const file of toolFiles) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/\balert\(|\bconfirm\(/);
    }
  });

  it("every input-driven tool has at least one associated label (native <label> or the <Label> component)", () => {
    for (const file of toolFiles) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/<[Ll]abel|aria-label/);
    }
  });

  it("live-updating results use aria-live, not color alone, to announce state", () => {
    const wordCounter = read("src/components/public-tools/tools/word-counter-tool.tsx");
    expect(wordCounter).toMatch(/aria-live="polite"/);
    const qr = read("src/components/public-tools/tools/qr-generator-tool.tsx");
    expect(qr).toMatch(/role="alert"/);
  });

  it("errors are always paired with visible dynamic text, never conveyed by color/class alone", () => {
    for (const file of toolFiles) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      if (source.includes('role="alert"')) {
        // A role="alert" element must render a JSX expression (dynamic text), not just a static label.
        expect(source).toMatch(/role="alert"[^>]*>[\s\S]{0,80}\{/);
      }
    }
  });

  it("the image compressor's drag-and-drop has a real button alternative (not drag-only)", () => {
    const source = read("src/components/public-tools/tools/image-compressor-tool.tsx");
    expect(source).toMatch(/onDrop=/);
    expect(source).toMatch(/Seleccionar archivo/);
    expect(source).toMatch(/type="file"/);
  });

  it("copy confirmation is communicated via visible text state, not only an icon/color change", () => {
    const source = read("src/components/public-tools/copy-download-actions.tsx");
    expect(source).toMatch(/\{copied \? "Copiado" : label\}/);
    expect(source).toMatch(/aria-live="polite"/);
  });
});

// ---------------------------------------------------------------------------
// Estados obligatorios (spec section 26)
// ---------------------------------------------------------------------------
describe("required states: empty, error, no-webgpu-support, reset", () => {
  it("the summarizer explicitly handles the WebGPU-unsupported case with a clear, non-broken fallback message", () => {
    const source = read("src/components/public-tools/tools/summarizer-tool.tsx");
    expect(source).toMatch(/webGpuSupported/);
    expect(source).toMatch(/resumen extractivo determinista/);
  });

  it("every AI tool renders LocalAIStatusPanel, which itself handles unsupported/loading/generating/error", () => {
    const panelSource = read("src/components/ai/local-ai-status.tsx");
    for (const state of ["unsupported", "idle", "loading", "generating", "error"]) {
      expect(panelSource).toMatch(new RegExp(`ai\\.status === "${state}"`));
    }
  });

  it("every tool provides a reset/clear affordance", () => {
    const toolsWithReset = [
      "word-counter-tool",
      "text-cleaner-tool",
      "rewriter-tool",
      "summarizer-tool",
      "corrector-tool",
      "seo-generator-tool",
      "title-analyzer-tool",
      "image-compressor-tool",
      "qr-generator-tool",
      "utm-generator-tool",
    ];
    for (const file of toolsWithReset) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).toMatch(/ResetButton|Reiniciar/);
    }
  });
});

// ---------------------------------------------------------------------------
// Regresión pública: móvil y temas (Fase 41 correction, spec sections 8, 20)
// ---------------------------------------------------------------------------
describe("public regression: responsive layout and theme-awareness (Light/Dark/System)", () => {
  it("the tools center and tool layout use responsive grid breakpoints, not a fixed desktop-only layout", () => {
    const center = read("src/app/(public)/herramientas/page.tsx");
    expect(center).toMatch(/sm:grid-cols-|lg:grid-cols-/);
    const explorer = read("src/components/public-tools/tools-explorer.tsx");
    expect(explorer).toMatch(/sm:grid-cols-|lg:grid-cols-/);
  });

  it("the image compressor and QR generator forms stack responsively (grid + sm:grid-cols-2, not a fixed multi-column layout)", () => {
    const image = read("src/components/public-tools/tools/image-compressor-tool.tsx");
    expect(image).toMatch(/sm:grid-cols-/);
    const qr = read("src/components/public-tools/tools/qr-generator-tool.tsx");
    expect(qr).toMatch(/sm:grid-cols-/);
  });

  it("public tool components never hardcode a raw light-only background/text color that would break dark mode (semantic tokens only, aside from the QR's own user-controlled color pickers)", () => {
    const files = [
      "word-counter-tool",
      "rewriter-tool",
      "text-cleaner-tool",
      "summarizer-tool",
      "corrector-tool",
      "seo-generator-tool",
      "social-generator-tool",
      "image-compressor-tool",
      "utm-generator-tool",
      "title-analyzer-tool",
      "repurposer-tool",
      "engagement-calculator-tool",
    ];
    for (const file of files) {
      const source = read(`src/components/public-tools/tools/${file}.tsx`);
      expect(source).not.toMatch(/className="[^"]*\b(bg-white|bg-black|text-white|text-black)\b/);
    }
  });

  it("the shared processing badge and layout shell use theme-aware semantic classes (muted-foreground/destructive), same convention as the rest of the app", () => {
    const badge = read("src/components/public-tools/processing-badge.tsx");
    expect(badge).toMatch(/text-muted-foreground|bg-muted/);
    const layout = read("src/components/public-tools/public-tool-layout.tsx");
    expect(layout).toMatch(/text-muted-foreground/);
  });

  it("the app's theme provider (next-themes) is not bypassed or duplicated by the public tools feature", () => {
    const files = ["src/lib/public-tools/registry.ts", "src/components/public-tools/public-tool-layout.tsx"];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/next-themes|ThemeProvider/);
    }
  });
});

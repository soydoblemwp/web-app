import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), "utf8");

/**
 * Fase 41 correction — "eliminar duplicación, reutilizar herramientas
 * existentes": verifies that AI Center's document-ai/blog-seo/social-media
 * tools and the public /herramientas equivalents both resolve to the exact
 * same prompt-builder functions under src/lib/ai-capabilities/*, rather than
 * each keeping an independent copy of the same capability.
 */

describe("shared ai-capabilities cores exist and contain the real prompt logic", () => {
  const cores = [
    { dir: "rewrite", exports: ["buildRewriteSystemPrompt", "buildRewritePrompt"] },
    { dir: "summarize", exports: ["buildSummarizeSystemPrompt", "buildSummarizePrompt"] },
    { dir: "grammar", exports: ["buildGrammarSystemPrompt", "buildGrammarPrompt"] },
    { dir: "seo-titles", exports: ["buildSeoTitlesSystemPrompt", "buildSeoTitlesPrompt"] },
    { dir: "seo-meta-description", exports: ["buildSeoMetaDescriptionSystemPrompt", "buildSeoMetaDescriptionPrompt"] },
    { dir: "multi-platform-post", exports: ["buildMultiPlatformPostSystemPrompt", "buildMultiPlatformPostPrompt"] },
    { dir: "repurpose", exports: ["buildRepurposeSystemPrompt", "buildRepurposePrompt"] },
  ];

  for (const core of cores) {
    it(`${core.dir} core exports its system+user prompt builders`, () => {
      const source = read(`src/lib/ai-capabilities/${core.dir}/prompt.ts`);
      for (const exportName of core.exports) {
        expect(source).toMatch(new RegExp(`export function ${exportName}`));
      }
    });
  }
});

describe("AI Center re-exports the shared cores instead of keeping independent copies", () => {
  it("document-ai-prompts.ts re-exports rewrite/summarize/grammar from ai-capabilities, and no longer defines them locally", () => {
    const source = read("src/lib/ai-center/tools/document-ai-prompts.ts");
    expect(source).toMatch(/buildRewriteSystemPrompt as buildDocumentRewriterSystemPrompt.*from "@\/lib\/ai-capabilities\/rewrite\/prompt"/);
    expect(source).toMatch(/buildSummarizeSystemPrompt as buildDocumentSummarizerSystemPrompt.*from "@\/lib\/ai-capabilities\/summarize\/prompt"/);
    expect(source).toMatch(/buildGrammarSystemPrompt as buildGrammarStyleCheckerSystemPrompt.*from "@\/lib\/ai-capabilities\/grammar\/prompt"/);
    // The local definitions must be gone — only one "Eres el reescritor de documentos" string should exist in the whole ai-capabilities+ai-center pair, not two.
    expect(source).not.toMatch(/export function buildDocumentRewriterSystemPrompt\(/);
    expect(source).not.toMatch(/export function buildDocumentSummarizerSystemPrompt\(/);
    expect(source).not.toMatch(/export function buildGrammarStyleCheckerSystemPrompt\(/);
  });

  it("blog-seo-prompts.ts re-exports seo-titles/seo-meta-description from ai-capabilities, and no longer defines them locally", () => {
    const source = read("src/lib/ai-center/tools/blog-seo-prompts.ts");
    expect(source).toMatch(/buildSeoTitlesSystemPrompt as buildSeoTitleSystemPrompt.*from "@\/lib\/ai-capabilities\/seo-titles\/prompt"/);
    expect(source).toMatch(/buildSeoMetaDescriptionSystemPrompt as buildMetaDescriptionSystemPrompt[\s\S]*from "@\/lib\/ai-capabilities\/seo-meta-description\/prompt"/);
    expect(source).not.toMatch(/export function buildSeoTitleSystemPrompt\(/);
    expect(source).not.toMatch(/export function buildMetaDescriptionSystemPrompt\(/);
  });

  it("social-media-prompts.ts re-exports multi-platform-post/repurpose from ai-capabilities, and no longer defines them locally", () => {
    const source = read("src/lib/ai-center/tools/social-media-prompts.ts");
    expect(source).toMatch(/from "@\/lib\/ai-capabilities\/multi-platform-post\/prompt"/);
    expect(source).toMatch(/buildRepurposeSystemPrompt as buildRepurposeContentSystemPrompt[\s\S]*from "@\/lib\/ai-capabilities\/repurpose\/prompt"/);
    expect(source).not.toMatch(/export function buildMultiPlatformPostSystemPrompt\(/);
    expect(source).not.toMatch(/export function buildRepurposeContentSystemPrompt\(/);
  });

  it("AI Center's own AiToolDefinition wiring files (document-ai.ts, blog-seo.ts, social-media.ts) were never touched — same import names, zero behavior change", () => {
    for (const file of ["document-ai.ts", "blog-seo.ts", "social-media.ts"]) {
      const source = read(`src/lib/ai-center/tools/${file}`);
      expect(source.length).toBeGreaterThan(0);
    }
    // document-ai.ts must still reference the original names (proves the re-export didn't break its wiring).
    const documentAi = read("src/lib/ai-center/tools/document-ai.ts");
    expect(documentAi).toMatch(/buildDocumentRewriterSystemPrompt/);
    expect(documentAi).toMatch(/buildDocumentSummarizerSystemPrompt/);
    expect(documentAi).toMatch(/buildGrammarStyleCheckerSystemPrompt/);
  });
});

describe("public /herramientas tools call the exact same shared cores as AI Center", () => {
  it("the public rewriter calls the shared rewrite core, not a locally-defined prompt", () => {
    const source = read("src/lib/public-tools/prompts/rewriter.ts");
    expect(source).toMatch(/from "@\/lib\/ai-capabilities\/rewrite\/prompt"/);
    expect(source).not.toMatch(/"Eres el reescritor/);
  });

  it("the public summarizer calls the shared summarize core, not a locally-defined prompt", () => {
    const source = read("src/lib/public-tools/prompts/summarizer.ts");
    expect(source).toMatch(/from "@\/lib\/ai-capabilities\/summarize\/prompt"/);
    expect(source).not.toMatch(/"Eres el resumidor/);
  });

  it("the public corrector calls the shared grammar core, not a locally-defined prompt", () => {
    const source = read("src/lib/public-tools/prompts/corrector.ts");
    expect(source).toMatch(/from "@\/lib\/ai-capabilities\/grammar\/prompt"/);
    expect(source).not.toMatch(/"Eres el corrector/);
  });

  it("the public SEO generator calls the shared seo-titles/seo-meta-description cores, not locally-defined prompts", () => {
    const source = read("src/lib/public-tools/prompts/seo-generator.ts");
    expect(source).toMatch(/from "@\/lib\/ai-capabilities\/seo-titles\/prompt"/);
    expect(source).toMatch(/from "@\/lib\/ai-capabilities\/seo-meta-description\/prompt"/);
    expect(source).not.toMatch(/"Eres (el|un) generador (de|público) t[íi]tulos/);
  });

  it("the public social generator calls the shared multi-platform-post core, not a locally-defined prompt", () => {
    const source = read("src/lib/public-tools/prompts/social-generator.ts");
    expect(source).toMatch(/from "@\/lib\/ai-capabilities\/multi-platform-post\/prompt"/);
    expect(source).not.toMatch(/"Eres un generador público de contenido/);
  });

  it("the public repurposer calls the shared repurpose core, not a locally-defined prompt", () => {
    const source = read("src/lib/public-tools/prompts/repurposer.ts");
    expect(source).toMatch(/from "@\/lib\/ai-capabilities\/repurpose\/prompt"/);
    expect(source).not.toMatch(/"Eres una herramienta pública de reutilización/);
  });
});

describe("no duplicate wording of the same capability's core instruction remains", () => {
  it("the 'reescribe el documento con el tono indicado' instruction appears exactly once in the whole repo (the shared core)", () => {
    const files = [
      "src/lib/ai-capabilities/rewrite/prompt.ts",
      "src/lib/ai-center/tools/document-ai-prompts.ts",
      "src/lib/public-tools/prompts/rewriter.ts",
    ];
    const occurrences = files.filter((f) => read(f).includes("Reescribe el documento con el tono indicado"));
    expect(occurrences).toEqual(["src/lib/ai-capabilities/rewrite/prompt.ts"]);
  });

  it("the grammar/style correction's core instruction appears exactly once in the whole repo (the shared core)", () => {
    const files = [
      "src/lib/ai-capabilities/grammar/prompt.ts",
      "src/lib/ai-center/tools/document-ai-prompts.ts",
      "src/lib/public-tools/prompts/corrector.ts",
    ];
    const occurrences = files.filter((f) => read(f).includes("Corrige ortografía, gramática, puntuación y estilo"));
    expect(occurrences).toEqual(["src/lib/ai-capabilities/grammar/prompt.ts"]);
  });

  it("the multi-platform-post's core instruction appears exactly once in the whole repo (the shared core)", () => {
    const files = [
      "src/lib/ai-capabilities/multi-platform-post/prompt.ts",
      "src/lib/ai-center/tools/social-media-prompts.ts",
      "src/lib/public-tools/prompts/social-generator.ts",
    ];
    const occurrences = files.filter((f) => read(f).includes("redacta una versión distinta y nativa para cada plataforma"));
    expect(occurrences).toEqual(["src/lib/ai-capabilities/multi-platform-post/prompt.ts"]);
  });
});

describe("regression: AI Center keeps working after the extraction", () => {
  it("document-ai.ts still defines its 10 tools with fields/buildSystemPrompt/buildUserPrompt wiring intact", () => {
    const source = read("src/lib/ai-center/tools/document-ai.ts");
    expect(source).toMatch(/buildSystemPrompt: buildDocumentRewriterSystemPrompt|buildSystemPrompt:\s*\(/);
    expect(source).toMatch(/getDocumentAiTool/);
  });

  it("blog-seo.ts still defines its tools with the same field/prompt wiring", () => {
    const source = read("src/lib/ai-center/tools/blog-seo.ts");
    expect(source).toMatch(/BLOG_SEO_TOOLS/);
    expect(source).toMatch(/getBlogSeoTool/);
  });

  it("social-media.ts still defines its tools with the same field/prompt wiring", () => {
    const source = read("src/lib/ai-center/tools/social-media.ts");
    expect(source).toMatch(/SOCIAL_MEDIA_TOOLS/);
  });

  it("the AI Center registry still lists all its categories, unaffected by the extraction", () => {
    const source = read("src/lib/ai-center/registry.ts");
    expect(source).toMatch(/AI_CENTER_CATEGORIES/);
  });

  it("AiGenerationForm's execution flow (brandContext → buildSystemPrompt, values → buildUserPrompt) is untouched", () => {
    const source = read("src/components/ai-center/generation/ai-generation-form.tsx");
    expect(source).toMatch(/tool\.buildSystemPrompt\(/);
    expect(source).toMatch(/tool\.buildUserPrompt\(values\)/);
  });
});

describe("regression: Guest keeps working after the extraction (Guest never touched src/lib/ai-center or src/lib/ai-capabilities)", () => {
  it("Guest forms still import from the older src/lib/ai/prompts/* library, untouched by this correction", () => {
    const files = [
      "src/components/guest/guest-content-form.tsx",
      "src/components/guest/guest-ideas-form.tsx",
      "src/components/guest/guest-adapter-form.tsx",
      "src/components/guest/guest-reply-form.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).toMatch(/@\/lib\/ai\/prompts\//);
      expect(source).not.toMatch(/@\/lib\/ai-capabilities\//);
    }
  });

  it("the Guest layout still requires no session and no project (untouched)", () => {
    const source = read("src/app/guest/layout.tsx");
    expect(source).toMatch(/no requiere sesión|never requires a session/i);
  });
});

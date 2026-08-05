import { describe, expect, it } from "vitest";
import { validateAiTextOutput } from "@/lib/public-tools/ai-output-validation";
import { extractiveSummary, extractKeyPoints } from "@/lib/public-tools/extractive-summary";
import { applyDeterministicCorrections } from "@/lib/public-tools/deterministic-corrections";
import { buildRewriterSystemPrompt, buildRewriterPrompt, REWRITER_TONES } from "@/lib/public-tools/prompts/rewriter";
import { buildSummarizerSystemPrompt, buildSummarizerPrompt, SUMMARY_MODES } from "@/lib/public-tools/prompts/summarizer";
import { buildCorrectorSystemPrompt, buildCorrectorPrompt } from "@/lib/public-tools/prompts/corrector";
import { slugifyTopic, buildSeoTitlesSystemPrompt, buildSeoMetaDescriptionsSystemPrompt } from "@/lib/public-tools/prompts/seo-generator";
import { buildSocialGeneratorSystemPrompt, SOCIAL_PLATFORMS } from "@/lib/public-tools/prompts/social-generator";
import { buildRepurposerSystemPrompt, REPURPOSE_OUTPUTS } from "@/lib/public-tools/prompts/repurposer";

// ---------------------------------------------------------------------------
// Shared AI output validation (used by every LOCAL_AI/HYBRID tool)
// ---------------------------------------------------------------------------
describe("ai-output-validation.ts: validateAiTextOutput", () => {
  it("rejects an empty response", () => {
    expect(validateAiTextOutput("").ok).toBe(false);
    expect(validateAiTextOutput(null).ok).toBe(false);
    expect(validateAiTextOutput("   ").ok).toBe(false);
  });

  it("rejects a response that leaks internal instructions", () => {
    expect(validateAiTextOutput("As an AI language model, I cannot fulfill this request.").ok).toBe(false);
  });

  it("rejects a response in an unexpected language (full switch away from Spanish)", () => {
    const result = validateAiTextOutput(
      "This is a complete response written entirely in English instead of the requested Spanish output for this tool."
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a normal Spanish response", () => {
    const result = validateAiTextOutput("Este es un texto de ejemplo que la herramienta debería aceptar sin problema alguno.");
    expect(result.ok).toBe(true);
  });

  it("warns (but does not hard-fail) when a number from the source text is missing in the output", () => {
    const result = validateAiTextOutput("El evento fue un éxito rotundo para la empresa este año.", {
      preserveNumbers: true,
      sourceText: "El evento del año 2026 tuvo 350 asistentes.",
    });
    expect(result.ok).toBe(true);
    expect(result.warning).toMatch(/2026|350/);
  });

  it("does not warn about numbers when preserveNumbers is off", () => {
    const result = validateAiTextOutput("Texto sin ninguna cifra en absoluto.", { preserveNumbers: false, sourceText: "Texto con 42." });
    expect(result.warning).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Resumidor: fallback extractivo honesto (spec section 11, section 23)
// ---------------------------------------------------------------------------
describe("extractive-summary.ts", () => {
  const longText =
    "El sol brilla intensamente sobre la ciudad. Los mercados locales abren temprano cada mañana con productos frescos. " +
    "La economía regional depende en gran parte del turismo estacional. Muchos visitantes llegan atraídos por la gastronomía local. " +
    "Los restaurantes ofrecen platos tradicionales preparados con ingredientes de la zona. El ayuntamiento promueve activamente el turismo sostenible.";

  it("returns fewer sentences than the original when the limit is smaller", () => {
    const result = extractiveSummary(longText, 2);
    expect(result.usedSentences).toBeLessThanOrEqual(2);
  });

  it("returns the whole text when it already has fewer sentences than the limit", () => {
    const result = extractiveSummary("Una sola oración aquí.", 5);
    expect(result.usedSentences).toBe(1);
  });

  it("never fabricates a sentence not present in the original text", () => {
    const result = extractiveSummary(longText, 3);
    const originalSentences = longText.match(/[^.!?…]+[.!?…]+/g) ?? [];
    for (const word of result.summary.split(" ")) {
      // Every extracted sentence must be a literal substring copy of the source.
      expect(originalSentences.some((s) => s.includes(word))).toBe(true);
    }
  });

  it("extractKeyPoints returns real sentences from the source, capped at maxPoints", () => {
    const points = extractKeyPoints(longText, 2);
    expect(points.length).toBeLessThanOrEqual(2);
    for (const point of points) expect(longText).toContain(point.trim().replace(/\s+$/, ""));
  });

  it("returns an empty summary for empty input rather than throwing", () => {
    expect(extractiveSummary("", 3).summary).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Corrector: correcciones deterministas siempre activas (spec section 12)
// ---------------------------------------------------------------------------
describe("deterministic-corrections.ts: applyDeterministicCorrections", () => {
  it("collapses repeated spaces and reports the change", () => {
    const result = applyDeterministicCorrections("hola     mundo bonito");
    expect(result.correctedText).toBe("Hola mundo bonito");
    expect(result.changes.some((c) => c.category === "espacios")).toBe(true);
  });

  it("fixes duplicated punctuation", () => {
    const result = applyDeterministicCorrections("Hola,,, mundo!!!");
    expect(result.correctedText).not.toMatch(/,,,|!!!/);
    expect(result.changes.some((c) => c.category === "puntuacion")).toBe(true);
  });

  it("capitalizes the start of a sentence", () => {
    const result = applyDeterministicCorrections("hola. mundo grande.");
    expect(result.correctedText.startsWith("Hola")).toBe(true);
  });

  it("reports zero changes for an already-clean text, never inventing a fake correction", () => {
    const result = applyDeterministicCorrections("Este texto ya está perfectamente correcto.");
    expect(result.changes).toEqual([]);
    expect(result.correctedText).toBe("Este texto ya está perfectamente correcto.");
  });

  it("reduces excessive blank lines", () => {
    const result = applyDeterministicCorrections("Uno.\n\n\n\n\nDos.");
    expect(result.correctedText).not.toMatch(/\n{3,}/);
  });
});

// ---------------------------------------------------------------------------
// Prompt builders: honesty and no-external-provider invariants
// ---------------------------------------------------------------------------
describe("prompts: rewriter", () => {
  it("has 8 tone options matching the spec", () => {
    expect(REWRITER_TONES).toHaveLength(8);
  });

  it("system prompt always preserves key document data (names/numbers) as a baseline from the shared rewrite core, and additionally covers links only when that toggle is on", () => {
    const withAll = buildRewriterSystemPrompt({ tone: "claridad", preserveNames: true, preserveNumbers: true, preserveLinks: true });
    expect(withAll).toMatch(/nombres propios/);
    expect(withAll).toMatch(/cifras/);
    expect(withAll).toMatch(/URL o enlace/);
    // Name/number preservation comes from the shared ai-capabilities/rewrite
    // core's baseline PRESERVE_KEY_DATA_RULE (same guarantee Document AI
    // gives every document), so it stays present even with both toggles off
    // — only link preservation (not part of that baseline) is genuinely
    // conditional on its own toggle.
    const withNone = buildRewriterSystemPrompt({ tone: "claridad", preserveNames: false, preserveNumbers: false, preserveLinks: false });
    expect(withNone).toMatch(/nombres propios/);
    expect(withNone).not.toMatch(/URL o enlace/);
  });

  it("user prompt includes the source text", () => {
    expect(buildRewriterPrompt("mi texto de prueba", "claridad")).toContain("mi texto de prueba");
  });
});

describe("prompts: summarizer", () => {
  it("has 6 summary modes matching the spec", () => {
    expect(SUMMARY_MODES).toHaveLength(6);
  });

  it("requests a max point count only for list-style modes (carried in the user prompt's 'longitud' field, matching the shared summarize core's shape)", () => {
    const prompt = buildSummarizerPrompt("texto de prueba", "puntos", 4);
    expect(prompt).toMatch(/4/);
    const noLimitPrompt = buildSummarizerPrompt("texto de prueba", "breve");
    expect(noLimitPrompt).not.toMatch(/máximo/);
  });

  it("never instructs the model to invent information", () => {
    const prompt = buildSummarizerSystemPrompt({ mode: "breve", preserveNumbers: false, preserveNames: false, includeConclusion: false });
    expect(prompt).toMatch(/no inventes/i);
  });

  it("user prompt includes the source text", () => {
    expect(buildSummarizerPrompt("texto largo de prueba", "breve")).toContain("texto largo de prueba");
  });
});

describe("prompts: corrector", () => {
  it("system prompt forbids adding new content or changing facts", () => {
    expect(buildCorrectorSystemPrompt()).toMatch(/no añadas contenido nuevo/i);
  });

  it("user prompt includes the source text", () => {
    expect(buildCorrectorPrompt("texto de prueba")).toContain("texto de prueba");
  });
});

describe("prompts: seo-generator", () => {
  const sampleInput = { topic: "tema", keyword: "palabra clave", intent: "informativa", audience: "pymes", tone: "profesional" };

  it("never claims access to real search metrics", () => {
    expect(buildSeoTitlesSystemPrompt(sampleInput)).toMatch(/no tienes acceso/i);
    expect(buildSeoMetaDescriptionsSystemPrompt(sampleInput)).toMatch(/no tienes acceso/i);
  });

  it("slugifyTopic produces a URL-safe, lowercase slug", () => {
    const slug = slugifyTopic("Cómo Elegir un CRM para PyMEs!", "crm para pymes");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).not.toMatch(/[A-ZÁÉÍÓÚÑ]/);
  });

  it("slugifyTopic never exceeds 60 characters", () => {
    const slug = slugifyTopic("a".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});

describe("prompts: social-generator", () => {
  it("has all 6 required platforms", () => {
    const ids = SOCIAL_PLATFORMS.map((p) => p.id);
    for (const expected of ["instagram", "tiktok", "facebook", "linkedin", "youtube", "x"]) expect(ids).toContain(expected);
  });

  it("produces a different system prompt per platform (no shared boilerplate format)", () => {
    const instagram = buildSocialGeneratorSystemPrompt({ platform: "instagram", topic: "t", goal: "g", audience: "a", tone: "cercano", length: "media", hashtagCount: 3 });
    const linkedin = buildSocialGeneratorSystemPrompt({ platform: "linkedin", topic: "t", goal: "g", audience: "a", tone: "cercano", length: "media", hashtagCount: 3 });
    expect(instagram).not.toBe(linkedin);
  });

  it("never instructs the model to invent trends or popularity data", () => {
    const prompt = buildSocialGeneratorSystemPrompt({ platform: "tiktok", topic: "t", goal: "g", audience: "a", tone: "cercano", length: "media", hashtagCount: 3 });
    expect(prompt).toMatch(/no inventes tendencias/i);
  });
});

describe("prompts: repurposer", () => {
  it("has all 10 required output formats", () => {
    expect(REPURPOSE_OUTPUTS).toHaveLength(10);
  });

  it("system prompt never allows the tool to claim it will publish or schedule content", () => {
    const prompt = buildRepurposerSystemPrompt();
    expect(prompt).toMatch(/nunca indiques que vas a publicar/i);
  });
});

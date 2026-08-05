import { describe, expect, it } from "vitest";
import { cleanText, DEFAULT_TEXT_CLEANER_OPTIONS } from "@/lib/public-tools/text-cleaner";
import { analyzeTitle } from "@/lib/public-tools/title-analyzer";
import { deriveHashtagsFromText, filterHashtagsToContent, parseHashtagLine } from "@/lib/public-tools/hashtags";
import { diffWords, countChanges } from "@/lib/public-tools/text-diff";
import { toSafeCsvCell, buildCsv } from "@/lib/public-tools/csv-export";
import { contrastRatio } from "@/lib/public-tools/color-contrast";
import { parseNumberedList, parseLabeledSections } from "@/lib/public-tools/prompts/parse-list";

// ---------------------------------------------------------------------------
// Limpiador de texto (spec section 20D)
// ---------------------------------------------------------------------------
describe("text-cleaner.ts: cleanText", () => {
  it("collapses repeated spaces", () => {
    expect(cleanText("hola     mundo", DEFAULT_TEXT_CLEANER_OPTIONS)).toBe("hola mundo");
  });

  it("collapses excessive blank lines", () => {
    const result = cleanText("linea1\n\n\n\n\nlinea2", DEFAULT_TEXT_CLEANER_OPTIONS);
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("removes zero-width and BOM characters", () => {
    const withInvisible = `hola${String.fromCharCode(0x200b)}mundo`;
    const result = cleanText(withInvisible, DEFAULT_TEXT_CLEANER_OPTIONS);
    expect(result).toBe("holamundo");
  });

  it("normalizes curly quotes and em/en dashes", () => {
    const result = cleanText("“hola” – mundo", DEFAULT_TEXT_CLEANER_OPTIONS);
    expect(result).toContain('"hola"');
    expect(result).toContain("-");
  });

  it("removes duplicate lines only when explicitly enabled", () => {
    const text = "linea a\nlinea a\nlinea b";
    const withoutDedup = cleanText(text, { ...DEFAULT_TEXT_CLEANER_OPTIONS, removeDuplicateLines: false });
    const withDedup = cleanText(text, { ...DEFAULT_TEXT_CLEANER_OPTIONS, removeDuplicateLines: true });
    expect(withoutDedup.match(/linea a/g)?.length).toBe(2);
    expect(withDedup.match(/linea a/g)?.length).toBe(1);
  });

  it("never rewrites the actual words of the text (only formatting)", () => {
    const result = cleanText("El   veloz  zorro   marron", DEFAULT_TEXT_CLEANER_OPTIONS);
    expect(result.replace(/\s+/g, " ")).toBe("El veloz zorro marron");
  });

  it("applies case modes correctly", () => {
    expect(cleanText("hola", { ...DEFAULT_TEXT_CLEANER_OPTIONS, caseMode: "upper" })).toBe("HOLA");
    expect(cleanText("HOLA", { ...DEFAULT_TEXT_CLEANER_OPTIONS, caseMode: "lower" })).toBe("hola");
  });
});

// ---------------------------------------------------------------------------
// Analizador de títulos (spec section 20E)
// ---------------------------------------------------------------------------
describe("title-analyzer.ts: analyzeTitle", () => {
  it("flags a title shorter than the recommended range", () => {
    const result = analyzeTitle("Título corto");
    expect(result.lengthWarning).toMatch(/por debajo/);
  });

  it("flags a title longer than the recommended range", () => {
    const longTitle = "Este es un título extremadamente largo que sin duda supera el límite recomendado de caracteres para SEO";
    const result = analyzeTitle(longTitle);
    expect(result.lengthWarning).toMatch(/por encima/);
  });

  it("detects repeated words", () => {
    const result = analyzeTitle("marketing digital para marketing de contenidos");
    expect(result.repeatedWords).toContain("marketing");
  });

  it("detects keyword presence when a keyword is provided", () => {
    const present = analyzeTitle("Guía completa de marketing digital", "marketing digital");
    expect(present.keywordPresent).toBe(true);
    const absent = analyzeTitle("Guía completa de ventas", "marketing digital");
    expect(absent.keywordPresent).toBe(false);
  });

  it("never invents an absolute numeric SEO score", () => {
    const result = analyzeTitle("Cualquier título de prueba");
    expect(Object.keys(result)).not.toContain("score");
  });
});

// ---------------------------------------------------------------------------
// Hashtags derivados del contenido (spec section 14)
// ---------------------------------------------------------------------------
describe("hashtags.ts", () => {
  it("derives hashtags only from words present in the source text", () => {
    const hashtags = deriveHashtagsFromText("Aprende marketing digital y estrategia de contenidos hoy mismo", 3);
    expect(hashtags.length).toBeGreaterThan(0);
    for (const tag of hashtags) {
      const word = tag.replace("#", "").toLowerCase();
      expect("aprende marketing digital estrategia contenidos".includes(word)).toBe(true);
    }
  });

  it("filterHashtagsToContent rejects a hashtag unrelated to the content", () => {
    const filtered = filterHashtagsToContent(["#marketing", "#totalmenteinventado"], "contenido sobre marketing digital");
    expect(filtered).toContain("#marketing");
    expect(filtered).not.toContain("#totalmenteinventado");
  });

  it("parseHashtagLine extracts real hashtags from a raw AI response line", () => {
    expect(parseHashtagLine("#marketing #ventas #pymes")).toEqual(["#marketing", "#ventas", "#pymes"]);
  });

  it("parseHashtagLine adds # to bare comma-separated words", () => {
    expect(parseHashtagLine("marketing, ventas")).toEqual(["#marketing", "#ventas"]);
  });
});

// ---------------------------------------------------------------------------
// Diff de texto para el corrector (spec section 12)
// ---------------------------------------------------------------------------
describe("text-diff.ts", () => {
  it("returns only equal tokens for identical texts", () => {
    const tokens = diffWords("hola mundo", "hola mundo");
    expect(tokens.every((t) => t.type === "equal")).toBe(true);
  });

  it("detects an added word", () => {
    const tokens = diffWords("hola mundo", "hola gran mundo");
    const counts = countChanges(tokens);
    expect(counts.added).toBeGreaterThan(0);
    expect(counts.removed).toBe(0);
  });

  it("detects a removed word", () => {
    const tokens = diffWords("hola gran mundo", "hola mundo");
    const counts = countChanges(tokens);
    expect(counts.removed).toBeGreaterThan(0);
  });

  it("counts zero changes when texts are identical", () => {
    const counts = countChanges(diffWords("sin cambios aqui", "sin cambios aqui"));
    expect(counts.added).toBe(0);
    expect(counts.removed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CSV export seguro (spec section 33 — CSV injection)
// ---------------------------------------------------------------------------
describe("csv-export.ts", () => {
  it("guards a cell starting with = against formula injection", () => {
    const cell = toSafeCsvCell("=SUM(A1:A10)");
    expect(cell.startsWith('"\'')).toBe(true);
  });

  it("guards cells starting with +, -, @", () => {
    expect(toSafeCsvCell("+1234").startsWith('"\'')).toBe(true);
    expect(toSafeCsvCell("-1234").startsWith('"\'')).toBe(true);
    expect(toSafeCsvCell("@mention").startsWith('"\'')).toBe(true);
  });

  it("does not guard an ordinary cell", () => {
    expect(toSafeCsvCell("hola mundo")).toBe('"hola mundo"');
  });

  it("escapes internal quotes", () => {
    expect(toSafeCsvCell('dice "hola"')).toBe('"dice ""hola"""');
  });

  it("buildCsv joins headers and rows with CRLF", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"]]);
    expect(csv).toContain("\r\n");
    expect(csv).toContain('"a","b"');
  });
});

// ---------------------------------------------------------------------------
// Contraste de color para QR (spec section 15)
// ---------------------------------------------------------------------------
describe("color-contrast.ts: contrastRatio", () => {
  it("returns the maximum ratio (21) for pure black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("returns close to 1 for identical colors", () => {
    expect(contrastRatio("#808080", "#808080")).toBeCloseTo(1, 1);
  });

  it("returns null for an invalid hex value", () => {
    expect(contrastRatio("not-a-color", "#ffffff")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Parsing helpers shared by every AI-backed tool
// ---------------------------------------------------------------------------
describe("prompts/parse-list.ts", () => {
  it("parses a numbered list into plain strings", () => {
    expect(parseNumberedList("1. Primero\n2. Segundo\n3. Tercero")).toEqual(["Primero", "Segundo", "Tercero"]);
  });

  it("parses labeled sections independently of order", () => {
    const raw = "GANCHO:\nUn gancho\nCTA:\nUn llamado a la accion";
    const sections = parseLabeledSections(raw, ["GANCHO", "CTA"]);
    expect(sections.GANCHO.trim()).toBe("Un gancho");
    expect(sections.CTA.trim()).toBe("Un llamado a la accion");
  });
});

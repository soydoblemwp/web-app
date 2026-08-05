import { describe, expect, it } from "vitest";
import { analyzeText, formatMinutes } from "@/lib/public-tools/word-counter";

describe("word-counter.ts: analyzeText (spec section 8, section 39 'Contador')", () => {
  it("counts words, characters, sentences and paragraphs correctly for a simple text", () => {
    const result = analyzeText("Hola mundo. Esto es una prueba.\n\nSegundo parrafo aqui.");
    expect(result.words).toBe(9);
    expect(result.sentences).toBe(3);
    expect(result.paragraphs).toBe(2);
    expect(result.charactersWithSpaces).toBeGreaterThan(0);
  });

  it("handles an empty text without throwing and returns all-zero metrics", () => {
    const result = analyzeText("");
    expect(result.words).toBe(0);
    expect(result.sentences).toBe(0);
    expect(result.paragraphs).toBe(0);
    expect(result.uniqueWords).toBe(0);
  });

  it("handles whitespace-only text as effectively empty", () => {
    const result = analyzeText("   \n\n  ");
    expect(result.words).toBe(0);
  });

  it("counts characters with and without spaces differently", () => {
    const result = analyzeText("a b c");
    expect(result.charactersWithSpaces).toBe(5);
    expect(result.charactersWithoutSpaces).toBe(3);
  });

  it("computes reading time proportional to word count", () => {
    const words = Array.from({ length: 200 }, () => "palabra").join(" ");
    const result = analyzeText(words);
    expect(result.readingTimeMinutes).toBeCloseTo(1, 1);
  });

  it("excludes Spanish stopwords from the frequent-words list", () => {
    const result = analyzeText("el gato y el perro y el gato corren en el parque");
    const topWords = result.topWords.map((w) => w.word);
    expect(topWords).not.toContain("el");
    expect(topWords).not.toContain("y");
    expect(topWords).toContain("gato");
  });

  it("counts unique words case-insensitively", () => {
    const result = analyzeText("Gato gato GATO perro");
    expect(result.uniqueWords).toBe(2);
  });

  it("handles a large text (10,000+ words) without throwing", () => {
    const large = Array.from({ length: 12000 }, (_, i) => `palabra${i % 50}`).join(" ");
    const result = analyzeText(large);
    expect(result.words).toBe(12000);
    expect(result.uniqueWords).toBeLessThanOrEqual(50);
  });

  it("computes average word and sentence length", () => {
    const result = analyzeText("Hola. Mundo grande.");
    expect(result.averageWordLength).toBeGreaterThan(0);
    expect(result.averageSentenceLength).toBeGreaterThan(0);
  });
});

describe("word-counter.ts: formatMinutes", () => {
  it("formats sub-minute durations in seconds", () => {
    expect(formatMinutes(0.5)).toMatch(/seg/);
  });

  it("formats multi-minute durations", () => {
    expect(formatMinutes(3)).toMatch(/3 min/);
  });

  it("formats near-zero durations without a negative or NaN value", () => {
    const formatted = formatMinutes(0);
    expect(formatted).not.toMatch(/NaN|-/);
  });
});

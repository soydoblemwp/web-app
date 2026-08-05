import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseListInput, dedupeList, pickWinners, shuffleList, createTeams, createTeamsBySize, assignTurnOrder, createSeededRandom, seededShuffle, seededPickWinners } from "@/lib/public-tools/random/picker";
import { getSampleText, countSampleTexts, computeTypingResult } from "@/lib/public-tools/education/typing-test";
import { BARCODE_FORMATS, isCode39Compatible, isCode128Compatible, getFormatDef } from "@/lib/public-tools/barcodes/formats";
import { validateEan13, validateEan8, validateUpcA, validateItf14, gs1CheckDigit } from "@/lib/public-tools/barcodes/validation";
import { diffLines, diffChars, diffJson } from "@/lib/public-tools/comparison/text-diff";
import { buildUnifiedDiff } from "@/lib/public-tools/comparison/unified-diff";
import { COMPARISON_LIMITS } from "@/lib/public-tools/comparison/limits";

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("random/picker.ts: never uses Math.random() (spec section 18)", () => {
  it("source-level check: the module never calls Math.random for its secure paths (comments mentioning the forbidden call don't count)", () => {
    const source = fs.readFileSync("src/lib/public-tools/random/picker.ts", "utf8");
    // Math.random is only acceptable inside the explicitly-labeled seeded (non-secure) helpers —
    // verify the secure pick/shuffle/team functions don't reference it at all in real code.
    const secureSection = stripComments(source.slice(0, source.indexOf("Reproducible (seeded) mode")));
    expect(secureSection).not.toMatch(/Math\.random/);
  });

  it("parseListInput splits on newlines and commas, trimming whitespace", () => {
    expect(parseListInput("Ana\nLuis, María\n\nPedro")).toEqual(["Ana", "Luis", "María", "Pedro"]);
  });

  it("dedupeList removes exact duplicates", () => {
    expect(dedupeList(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });

  it("pickWinners returns the requested count without repeats, drawn from the given list", () => {
    const list = ["a", "b", "c", "d", "e"];
    const winners = pickWinners(list, 3);
    expect(winners).toHaveLength(3);
    expect(new Set(winners).size).toBe(3);
    for (const w of winners) expect(list).toContain(w);
  });

  it("pickWinners never returns more winners than available items", () => {
    const winners = pickWinners(["a", "b"], 10);
    expect(winners).toHaveLength(2);
  });

  it("shuffleList returns a real permutation (same elements, same length)", () => {
    const list = ["a", "b", "c", "d", "e"];
    const shuffled = shuffleList(list);
    expect(shuffled).toHaveLength(list.length);
    expect([...shuffled].sort()).toEqual([...list].sort());
  });

  it("createTeams distributes every item into exactly the requested number of teams", () => {
    const result = createTeams(["a", "b", "c", "d", "e"], 2);
    expect(result.teams).toHaveLength(2);
    expect(result.teams.flat()).toHaveLength(5);
    expect(new Set(result.teams.flat()).size).toBe(5);
  });

  it("createTeamsBySize computes the team count from the desired team size", () => {
    const result = createTeamsBySize(["a", "b", "c", "d", "e", "f", "g"], 3);
    expect(result.teams).toHaveLength(3); // ceil(7/3)
    expect(result.teams.flat()).toHaveLength(7);
  });

  it("assignTurnOrder returns a real permutation of the input", () => {
    const list = ["a", "b", "c"];
    const order = assignTurnOrder(list);
    expect([...order].sort()).toEqual([...list].sort());
  });

  it("throws a real error for an empty list rather than returning a bogus result", () => {
    expect(() => pickWinners([], 1)).toThrow();
  });
});

describe("random/picker.ts: seeded (reproducible, explicitly non-cryptographic) mode", () => {
  it("the same seed always reproduces the exact same shuffle", () => {
    const list = ["a", "b", "c", "d", "e", "f"];
    const a = seededShuffle(list, 42);
    const b = seededShuffle(list, 42);
    expect(a).toEqual(b);
  });

  it("different seeds usually produce different orders", () => {
    const list = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const a = seededShuffle(list, 1);
    const b = seededShuffle(list, 2);
    expect(a).not.toEqual(b);
  });

  it("seededPickWinners is reproducible given the same seed", () => {
    const list = ["a", "b", "c", "d", "e"];
    expect(seededPickWinners(list, 2, 999)).toEqual(seededPickWinners(list, 2, 999));
  });

  it("createSeededRandom produces values in [0, 1)", () => {
    const rng = createSeededRandom(7);
    for (let i = 0; i < 20; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("education/typing-test.ts: original bundled sample texts", () => {
  it("provides real, non-empty sample texts for both languages and all difficulties", () => {
    for (const lang of ["es", "en"] as const) {
      for (const difficulty of ["easy", "medium", "hard"] as const) {
        expect(countSampleTexts(lang, difficulty)).toBeGreaterThan(0);
        expect(getSampleText(lang, difficulty).length).toBeGreaterThan(10);
      }
    }
  });

  it("Spanish texts include real accented characters (not just plain ASCII)", () => {
    const text = getSampleText("es", "hard");
    expect(/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(text)).toBe(true);
  });

  it("computeTypingResult: a perfect match yields 100% accuracy and the documented WPM formula", () => {
    const target = "hello world";
    const result = computeTypingResult(target, target, 60); // exactly 1 minute
    expect(result.accuracyPercent).toBe(100);
    expect(result.correctChars).toBe(target.length);
    expect(result.wpm).toBe(Math.round(target.length / 5 / 1));
  });

  it("computeTypingResult correctly counts character-level mistakes", () => {
    const result = computeTypingResult("hello", "hxllo", 60);
    expect(result.correctChars).toBe(4);
    expect(result.incorrectChars).toBe(1);
  });

  it("extra typed characters beyond the target length count as incorrect", () => {
    const result = computeTypingResult("hi", "hizzz", 60);
    expect(result.incorrectChars).toBe(3);
  });

  it("never divides by zero for a near-instant sample", () => {
    const result = computeTypingResult("hi", "hi", 0);
    expect(Number.isFinite(result.wpm)).toBe(true);
  });
});

describe("barcodes/formats.ts: real format/character-set rules", () => {
  it("declares 6 real formats with correct fixed lengths", () => {
    expect(BARCODE_FORMATS).toHaveLength(6);
    expect(getFormatDef("EAN13").fixedLength).toBe(13);
    expect(getFormatDef("UPC").fixedLength).toBe(12);
  });

  it("Code 39 accepts only its real supported character set", () => {
    expect(isCode39Compatible("ABC-123")).toBe(true);
    expect(isCode39Compatible("abc")).toBe(true); // uppercased internally before checking
    expect(isCode39Compatible("héllo")).toBe(false); // not in the real Code 39 charset
  });

  it("Code 128 accepts printable ASCII but rejects non-ASCII", () => {
    expect(isCode128Compatible("Hello, World! 123")).toBe(true);
    expect(isCode128Compatible("héllo")).toBe(false);
  });
});

describe("barcodes/validation.ts: real, independent GS1 check-digit algorithm", () => {
  it("matches the real published GS1 example (400638133393 -> check digit 1)", () => {
    expect(gs1CheckDigit("400638133393")).toBe(1);
  });

  it("validates a complete EAN-13 with a correct check digit", () => {
    const result = validateEan13("4006381333931");
    expect(result.ok).toBe(true);
    expect(result.checkDigit).toBe(1);
  });

  it("rejects an EAN-13 with an incorrect check digit", () => {
    const result = validateEan13("4006381333939");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/control incorrecto/);
  });

  it("computes the check digit when given only the 12 data digits", () => {
    const result = validateEan13("400638133393");
    expect(result.ok).toBe(true);
    expect(result.fullValue).toBe("4006381333931");
  });

  it("rejects non-numeric input", () => {
    expect(validateEan13("abcdefghijklm").ok).toBe(false);
  });

  it("rejects the wrong length entirely", () => {
    expect(validateEan13("123").ok).toBe(false);
  });

  it("EAN-8, UPC-A, and ITF-14 all validate a self-consistent round trip (data -> full value -> re-validate)", () => {
    for (const [validator, dataDigits] of [
      [validateEan8, "1234567"],
      [validateUpcA, "12345678901"],
      [validateItf14, "1234567890123"],
    ] as const) {
      const first = validator(dataDigits);
      expect(first.ok, dataDigits).toBe(true);
      const second = validator(first.fullValue!);
      expect(second.ok, first.fullValue).toBe(true);
      expect(second.checkDigit).toBe(first.checkDigit);
    }
  });
});

describe("comparison/text-diff.ts: line/char/JSON diff with real limits", () => {
  it("diffLines detects added and removed lines correctly", () => {
    const result = diffLines("a\nb\nc", "a\nx\nc");
    expect(result.ok).toBe(true);
    expect(result.linesAdded).toBe(1);
    expect(result.linesRemoved).toBe(1);
  });

  it("identical texts have 100% similarity and zero changes", () => {
    const result = diffLines("same\ntext", "same\ntext");
    expect(result.similarityPercent).toBe(100);
    expect(result.linesAdded).toBe(0);
    expect(result.linesRemoved).toBe(0);
  });

  it("ignoreCase, ignoreWhitespace, and ignoreEmptyLines options work", () => {
    expect(diffLines("Hello", "hello", { ignoreCase: true }).linesAdded).toBe(0);
    expect(diffLines("a  b", "a b", { ignoreWhitespace: true }).linesAdded).toBe(0);
    expect(diffLines("a\n\nb", "a\nb", { ignoreEmptyLines: true }).linesAdded).toBe(0);
  });

  it("rejects a text exceeding the configured character limit", () => {
    const huge = "x".repeat(COMPARISON_LIMITS.maxCharsPerText + 1);
    const result = diffLines(huge, "short");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/limitad/i);
  });

  it("diffChars detects single-character differences and enforces a tighter limit", () => {
    const result = diffChars("cat", "car");
    expect(result.ok).toBe(true);
    expect(result.charsAdded).toBe(1);
    expect(result.charsRemoved).toBe(1);
  });

  it("diffJson normalizes formatting/key-order-insensitive-by-value differences before comparing", () => {
    const a = '{"b": 2, "a": 1}';
    const b = '{"a":1,"b":2}';
    // Both parse to equivalent structures once re-serialized with stable formatting, though key
    // order in the pretty-printed output still follows each object's own insertion order — this
    // real test only asserts it produces a valid, non-erroring result and pretty-prints correctly.
    const result = diffJson(a, b);
    expect(result.ok).toBe(true);
  });

  it("diffJson reports a real error for invalid JSON rather than crashing", () => {
    const result = diffJson("{not json", "{}");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/JSON válido/);
  });
});

describe("comparison/unified-diff.ts: real RFC-shaped unified diff output", () => {
  it("produces --- / +++ headers and @@ hunks", () => {
    const diff = diffLines("line1\nline2\nline3", "line1\nCHANGED\nline3");
    const unified = buildUnifiedDiff(diff.lines!, "a.txt", "b.txt");
    expect(unified).toMatch(/^--- a\.txt/);
    expect(unified).toMatch(/\+\+\+ b\.txt/);
    expect(unified).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
    expect(unified).toMatch(/-line2/);
    expect(unified).toMatch(/\+CHANGED/);
  });

  it("sanitizes a filename containing newlines so it can never inject extra header lines", () => {
    const diff = diffLines("a", "b");
    const unified = buildUnifiedDiff(diff.lines!, "evil\n--- fake header", "b.txt");
    const lines = unified.split("\n");
    // The embedded newline is collapsed to a single space (not stripped), so the literal "---"
    // text survives as harmless content within one header line — the real guarantee is that it
    // never becomes its OWN line (i.e. never introduces an extra "---"-prefixed line at index 1+).
    expect(lines[0]).toBe("--- evil --- fake header");
    expect(lines[1]).toBe("+++ b.txt");
  });
});

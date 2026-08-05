import { describe, expect, it } from "vitest";
import { secureRandomInt, secureRandomBytes, secureShuffle } from "@/lib/public-tools/utilities/secure-random";
import { generatePasswords, passwordsToText } from "@/lib/public-tools/utilities/password-generator";
import { analyzePasswordStrength } from "@/lib/public-tools/utilities/password-strength";
import { generateUuidV4, generateUuidV7, validateUuid, NIL_UUID, MAX_UUID, uuidToCompact } from "@/lib/public-tools/utilities/uuid";
import { digestText, digestFile, hashesMatch, DIGEST_ALGORITHMS } from "@/lib/public-tools/utilities/crypto-digest";
import { UTILITY_LIMITS } from "@/lib/public-tools/utilities/limits";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// secure-random.ts — spec criteria 5/6: uses Web Crypto, never Math.random()
// ---------------------------------------------------------------------------
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("utilities/secure-random.ts", () => {
  it("source code never calls Math.random() outside of doc comments explaining why it's avoided", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/secure-random.ts", "utf8");
    expect(stripComments(source)).not.toMatch(/Math\.random/);
  });

  it("secureRandomInt only ever returns values in [0, exclusiveMax)", () => {
    for (let trial = 0; trial < 500; trial++) {
      const max = 1 + (trial % 37);
      const value = secureRandomInt(max);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(max);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("secureRandomInt(1) always returns 0 without touching the RNG", () => {
    expect(secureRandomInt(1)).toBe(0);
  });

  it("secureRandomInt produces a roughly uniform distribution (statistical sanity check, not exact)", () => {
    const counts = [0, 0, 0];
    const samples = 6000;
    for (let i = 0; i < samples; i++) counts[secureRandomInt(3)]++;
    // Each bucket should land within a generous ±40% of the expected 1/3 share — loose enough to never flake.
    for (const count of counts) {
      expect(count).toBeGreaterThan(samples / 3 - samples * 0.15);
      expect(count).toBeLessThan(samples / 3 + samples * 0.15);
    }
  });

  it("secureRandomBytes returns the requested length", () => {
    expect(secureRandomBytes(16).length).toBe(16);
    expect(secureRandomBytes(0).length).toBe(0);
  });

  it("secureRandomInt stays correct (and terminates) for bounds well beyond a single byte (0-255) — real bug found by Fase 46's picker tests: a fixed single-byte draw made the rejection threshold collapse to 0 for any exclusiveMax > 256, hanging forever", () => {
    for (const max of [257, 1000, 5000, 65536, 100000, 2 ** 32]) {
      const value = secureRandomInt(max);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(max);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("secureRandomInt rejects a bound too large to sample safely rather than silently misbehaving", () => {
    expect(() => secureRandomInt(2 ** 32 + 1)).toThrow();
  });

  it("secureShuffle is a permutation of the input (same multiset, order changes across many trials)", () => {
    const input = Array.from({ length: 10 }, (_, i) => i);
    const shuffled = secureShuffle(input);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input);

    let anyDifferent = false;
    for (let i = 0; i < 20; i++) {
      if (secureShuffle(input).join(",") !== input.join(",")) anyDifferent = true;
    }
    expect(anyDifferent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// password-generator.ts — spec sections 8, 37 (Generador de contraseñas)
// ---------------------------------------------------------------------------
describe("utilities/password-generator.ts", () => {
  it("generates a password of the exact requested length", () => {
    const result = generatePasswords({ length: 24, categories: ["uppercase", "lowercase", "numbers", "symbols"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: 1, pronounceable: false });
    expect(result.ok).toBe(true);
    expect(result.passwords[0].value.length).toBe(24);
  });

  it("guarantees at least one character from every selected category when length allows", () => {
    for (let trial = 0; trial < 50; trial++) {
      const result = generatePasswords({ length: 16, categories: ["uppercase", "lowercase", "numbers", "symbols"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: 1, pronounceable: false });
      const value = result.passwords[0].value;
      expect(/[A-Z]/.test(value)).toBe(true);
      expect(/[a-z]/.test(value)).toBe(true);
      expect(/[0-9]/.test(value)).toBe(true);
      expect(/[^A-Za-z0-9]/.test(value)).toBe(true);
    }
  });

  it("excludes ambiguous characters when requested", () => {
    for (let trial = 0; trial < 30; trial++) {
      const result = generatePasswords({ length: 40, categories: ["uppercase", "lowercase", "numbers"], excludeAmbiguous: true, avoidConsecutiveRepeats: false, customSymbols: null, count: 1, pronounceable: false });
      expect(result.passwords[0].value).not.toMatch(/[0Oo1lI|]/);
    }
  });

  it("avoids consecutive repeated characters when requested", () => {
    for (let trial = 0; trial < 30; trial++) {
      const result = generatePasswords({ length: 60, categories: ["lowercase"], excludeAmbiguous: false, avoidConsecutiveRepeats: true, customSymbols: null, count: 1, pronounceable: false });
      const value = result.passwords[0].value;
      for (let i = 1; i < value.length; i++) expect(value[i]).not.toBe(value[i - 1]);
    }
  });

  it("respects custom symbols instead of the default symbol set", () => {
    const result = generatePasswords({ length: 30, categories: ["symbols"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: "€¥", count: 1, pronounceable: false });
    expect(result.ok).toBe(true);
    expect([...result.passwords[0].value].every((c) => c === "€" || c === "¥")).toBe(true);
  });

  it("generates the requested count of passwords", () => {
    const result = generatePasswords({ length: 12, categories: ["lowercase", "numbers"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: 10, pronounceable: false });
    expect(result.passwords.length).toBe(10);
  });

  it("rejects a length outside the configured limits", () => {
    expect(generatePasswords({ length: UTILITY_LIMITS.password.minLength - 1, categories: ["lowercase"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: 1, pronounceable: false }).ok).toBe(false);
    expect(generatePasswords({ length: UTILITY_LIMITS.password.maxLength + 1, categories: ["lowercase"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: 1, pronounceable: false }).ok).toBe(false);
  });

  it("rejects a count outside the configured limits", () => {
    expect(generatePasswords({ length: 12, categories: ["lowercase"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: UTILITY_LIMITS.password.maxCount + 1, pronounceable: false }).ok).toBe(false);
  });

  it("rejects zero selected categories in random mode", () => {
    expect(generatePasswords({ length: 12, categories: [], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: 1, pronounceable: false }).ok).toBe(false);
  });

  it("rejects when categories outnumber the requested length (can't guarantee one of each)", () => {
    const result = generatePasswords({ length: 2, categories: ["uppercase", "lowercase", "numbers", "symbols"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: 1, pronounceable: false });
    expect(result.ok).toBe(false);
  });

  it("pronounceable mode still uses crypto randomness (never identical across many runs)", () => {
    const values = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const result = generatePasswords({ length: 12, categories: ["lowercase"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: 1, pronounceable: true });
      values.add(result.passwords[0].value);
    }
    expect(values.size).toBeGreaterThan(1);
  });

  it("passwordsToText joins one password per line", () => {
    const result = generatePasswords({ length: 8, categories: ["lowercase"], excludeAmbiguous: false, avoidConsecutiveRepeats: false, customSymbols: null, count: 3, pronounceable: false });
    expect(passwordsToText(result.passwords).split("\n").length).toBe(3);
  });

  it("never logs a generated password to the console (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/password-generator.ts", "utf8");
    expect(source).not.toMatch(/console\.(log|warn|error|info)/);
  });
});

// ---------------------------------------------------------------------------
// password-strength.ts — spec sections 10, 37
// ---------------------------------------------------------------------------
describe("utilities/password-strength.ts", () => {
  it("classifies an empty password as MUY_DÉBIL without throwing", () => {
    expect(analyzePasswordStrength("").label).toBe("MUY_DÉBIL");
  });

  it("classifies a very common short password as weak", () => {
    const result = analyzePasswordStrength("password");
    expect(["MUY_DÉBIL", "DÉBIL"]).toContain(result.label);
    expect(result.findings.some((f) => f.code === "common-word")).toBe(true);
  });

  it("detects a sequential run", () => {
    expect(analyzePasswordStrength("abcd1234EFGH").findings.some((f) => f.code === "sequential")).toBe(true);
  });

  it("detects a keyboard-adjacency pattern", () => {
    expect(analyzePasswordStrength("qwertyASDF12").findings.some((f) => f.code === "keyboard-pattern")).toBe(true);
  });

  it("detects a repeated block", () => {
    expect(analyzePasswordStrength("abcabcabcabc").findings.some((f) => f.code === "repeated-block")).toBe(true);
  });

  it("detects an included year", () => {
    expect(analyzePasswordStrength("MyPassword1990!").findings.some((f) => f.code === "date-pattern")).toBe(true);
  });

  it("detects a month name", () => {
    expect(analyzePasswordStrength("Diciembre2025$$").findings.some((f) => f.code === "month-name")).toBe(true);
  });

  it("classifies a long, high-variety, pattern-free password as strong", () => {
    const result = analyzePasswordStrength("qX7#mK9$pL2@wR5!vT8&");
    expect(["FUERTE", "MUY_FUERTE"]).toContain(result.label);
  });

  it("never returns a crackTimeEstimate framed as a guarantee — explanation text is always present alongside it", () => {
    const result = analyzePasswordStrength("Tr0ub4dor&3xyz");
    if (result.crackTimeEstimate) {
      expect(result.crackTimeExplanation).toMatch(/aproximación educativa/i);
    }
  });

  it("source never sends the password anywhere (no fetch/XMLHttpRequest) and never logs it", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/password-strength.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|console\.(log|warn|error|info)/);
  });
});

// ---------------------------------------------------------------------------
// uuid.ts — spec sections 12, 37 (v4 bits, v7 bits/timestamp, validation)
// ---------------------------------------------------------------------------
describe("utilities/uuid.ts", () => {
  const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("generateUuidV4 produces the correct shape, version nibble (4) and variant bits (10xx)", () => {
    for (let i = 0; i < 200; i++) {
      const uuid = generateUuidV4();
      expect(uuid).toMatch(UUID_SHAPE);
      expect(uuid[14]).toBe("4");
      const variantNibble = parseInt(uuid[19], 16);
      expect(variantNibble & 0b1100).toBe(0b1000);
    }
  });

  it("generateUuidV4 values are unique across a large batch (no collisions observed)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateUuidV4());
    expect(seen.size).toBe(2000);
  });

  it("generateUuidV7 encodes the correct version (7) and variant bits (10xx)", () => {
    const uuid = generateUuidV7(Date.now());
    expect(uuid).toMatch(UUID_SHAPE);
    expect(uuid[14]).toBe("7");
    const variantNibble = parseInt(uuid[19], 16);
    expect(variantNibble & 0b1100).toBe(0b1000);
  });

  it("generateUuidV7 recovers the exact input timestamp from its first 48 bits", () => {
    const ts = 1_753_776_000_000; // an arbitrary fixed ms timestamp
    const uuid = generateUuidV7(ts);
    const hex = uuid.replace(/-/g, "");
    const tsHex = hex.slice(0, 12);
    const recovered = parseInt(tsHex, 16);
    expect(recovered).toBe(ts);
  });

  it("generateUuidV7 UUIDs generated in increasing timestamp order sort lexicographically in that same order", () => {
    const a = generateUuidV7(1_700_000_000_000);
    const b = generateUuidV7(1_700_000_000_001);
    const c = generateUuidV7(1_700_000_001_000);
    const sorted = [c, a, b].sort();
    expect(sorted).toEqual([a, b, c]);
  });

  it("generateUuidV7 calls within the same millisecond still sort in generation order (monotonic counter)", () => {
    const ts = 1_800_000_000_000;
    const first = generateUuidV7(ts);
    const second = generateUuidV7(ts);
    const third = generateUuidV7(ts);
    expect([first, second, third].slice().sort()).toEqual([first, second, third]);
  });

  it("validateUuid recognizes NIL and MAX as special references, not random UUIDs", () => {
    expect(validateUuid(NIL_UUID)).toEqual({ valid: true, version: null, variant: "nil", normalized: NIL_UUID });
    expect(validateUuid(MAX_UUID)).toEqual({ valid: true, version: null, variant: "max", normalized: MAX_UUID });
  });

  it("validateUuid identifies version and RFC-9562 variant for a real generated v4", () => {
    const uuid = generateUuidV4();
    const result = validateUuid(uuid);
    expect(result.valid).toBe(true);
    expect(result.version).toBe(4);
    expect(result.variant).toBe("rfc9562");
  });

  it("validateUuid rejects a structurally invalid string", () => {
    expect(validateUuid("not-a-uuid").valid).toBe(false);
    expect(validateUuid("").valid).toBe(false);
    expect(validateUuid("12345678-1234-1234-1234-12345678901").valid).toBe(false); // one char short
  });

  it("uuidToCompact strips hyphens without altering the hex content", () => {
    const uuid = generateUuidV4();
    expect(uuidToCompact(uuid)).toBe(uuid.replace(/-/g, ""));
    expect(uuidToCompact(uuid).length).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// crypto-digest.ts — spec sections 13, 37 (validated against known NIST vectors)
// ---------------------------------------------------------------------------
describe("utilities/crypto-digest.ts", () => {
  it("SHA-256('abc') matches the standard published test vector", async () => {
    const result = await digestText("abc", "SHA-256");
    expect(result.hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("SHA-1('abc') matches the standard published test vector (compatibility-only algorithm)", async () => {
    const result = await digestText("abc", "SHA-1");
    expect(result.hex).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it("SHA-256('') matches the known empty-string vector", async () => {
    const result = await digestText("", "SHA-256");
    expect(result.hex).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("produces a hex digest of the correct length for every supported algorithm", async () => {
    const expectedLengths: Record<string, number> = { "SHA-1": 40, "SHA-256": 64, "SHA-384": 96, "SHA-512": 128 };
    for (const algorithm of DIGEST_ALGORITHMS) {
      const result = await digestText("cualquier texto de prueba", algorithm);
      expect(result.hex.length).toBe(expectedLengths[algorithm]);
      expect(result.hex).toMatch(/^[0-9a-f]+$/);
    }
  });

  it("hex and base64 outputs represent the exact same bytes", async () => {
    const result = await digestText("verificación de codificación", "SHA-256");
    const base64Bytes = Buffer.from(result.base64, "base64");
    expect(base64Bytes.toString("hex")).toBe(result.hex);
  });

  it("digestFile hashes a real File's full content and matches digestText on the same bytes", async () => {
    const content = "contenido de archivo de prueba para hash";
    const file = new File([content], "prueba.txt", { type: "text/plain" });
    const fromFile = await digestFile(file, "SHA-256");
    const fromText = await digestText(content, "SHA-256");
    expect(fromFile.hex).toBe(fromText.hex);
  });

  it("hashesMatch is case-insensitive and correctly rejects a differing hash", () => {
    expect(hashesMatch("ABCDEF", "abcdef")).toBe(true);
    expect(hashesMatch("abcdef", "abcdeg")).toBe(false);
    expect(hashesMatch("abc", "abcd")).toBe(false);
  });

  it("never sends text or file content to a server (source-level check: no fetch/XMLHttpRequest)", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/crypto-digest.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest/);
  });
});

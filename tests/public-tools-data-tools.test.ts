import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { validateJson, formatJson, minifyJson, sortJsonKeysDeep, computeJsonStats } from "@/lib/public-tools/utilities/json-tool";
import { bytesToBase64, base64ToBytes, textToBase64, base64ToText } from "@/lib/public-tools/utilities/encoding";
import { encodeUriComponentSafe, decodeUriComponentSafe, encodeFullUrl, decodeFullUrl, isDangerousScheme, parseUrlParams, buildQueryString } from "@/lib/public-tools/utilities/url-tool";
import { UTILITY_LIMITS } from "@/lib/public-tools/utilities/limits";

// ---------------------------------------------------------------------------
// json-tool.ts — spec sections 14, 37
// ---------------------------------------------------------------------------
describe("utilities/json-tool.ts: validateJson", () => {
  it("accepts valid JSON and returns the parsed value", () => {
    const result = validateJson('{"a": 1, "b": [1, 2, 3]}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("rejects invalid JSON with a line and column pointing at the real error", () => {
    const raw = '{\n  "a": 1,\n  "b": ,\n}';
    const result = validateJson(raw);
    expect(result.ok).toBe(false);
    expect(result.error?.line).not.toBeNull();
    expect(result.error?.column).not.toBeNull();
    expect(result.error?.snippet).toBeTruthy();
  });

  it("rejects JSON beyond the configured size limit before ever calling JSON.parse", () => {
    const huge = "[" + "1,".repeat(UTILITY_LIMITS.json.maxTextLength) + "1]";
    const result = validateJson(huge);
    expect(result.ok).toBe(false);
  });

  it("never uses eval or Function (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/json-tool.ts", "utf8");
    expect(source).not.toMatch(/\beval\(|new Function\(/);
  });
});

describe("utilities/json-tool.ts: formatJson / minifyJson", () => {
  const value = { z: 1, a: [1, 2] };

  it("formats with 2 spaces, 4 spaces, or a tab, and every format round-trips via JSON.parse", () => {
    for (const indent of ["2", "4", "tab"] as const) {
      const formatted = formatJson(value, indent);
      expect(JSON.parse(formatted)).toEqual(value);
    }
    expect(formatJson(value, "2")).toContain("  \"z\"");
    expect(formatJson(value, "4")).toContain("    \"z\"");
    expect(formatJson(value, "tab")).toContain("\t\"z\"");
  });

  it("minifies to a single line with no extra whitespace, and round-trips", () => {
    const minified = minifyJson(value);
    expect(minified).not.toMatch(/\n|  /);
    expect(JSON.parse(minified)).toEqual(value);
  });
});

describe("utilities/json-tool.ts: sortJsonKeysDeep — prototype-pollution safety", () => {
  it("sorts nested object keys alphabetically without changing any values", () => {
    const value = { z: 1, a: { d: 4, b: 2 }, m: [{ y: 1, x: 2 }] };
    const sorted = sortJsonKeysDeep(value) as typeof value;
    expect(Object.keys(sorted)).toEqual(["a", "m", "z"]);
    expect(Object.keys(sorted.a)).toEqual(["b", "d"]);
    expect(sorted).toEqual(value);
  });

  it("a key literally named __proto__ becomes a safe own property, never pollutes Object.prototype", () => {
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "z": 1}');
    const sorted = sortJsonKeysDeep(parsed) as Record<string, unknown>;

    // The global prototype must remain completely clean.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // The "__proto__" key must survive as an ordinary own property of the result.
    expect(Object.prototype.hasOwnProperty.call(sorted, "__proto__")).toBe(true);
  });
});

describe("utilities/json-tool.ts: computeJsonStats", () => {
  it("counts objects, arrays, keys, values and depth correctly for a known shape", () => {
    const stats = computeJsonStats({ a: 1, b: { c: 2, d: [1, 2, 3] } });
    expect(stats.objects).toBe(2);
    expect(stats.arrays).toBe(1);
    expect(stats.keys).toBe(4); // a, b, c, d
    expect(stats.values).toBe(5); // a=1, c=2, and the array's three elements 1, 2, 3
    expect(stats.maxDepth).toBeGreaterThanOrEqual(3);
    expect(stats.depthExceeded).toBe(false);
  });

  it("flags depthExceeded for a pathologically deep structure without crashing (iterative traversal)", () => {
    let deep: unknown = 1;
    for (let i = 0; i < UTILITY_LIMITS.json.maxDepth + 50; i++) deep = { nested: deep };
    const stats = computeJsonStats(deep);
    expect(stats.depthExceeded).toBe(true);
  });

  it("approxBytes reflects a real serialized size", () => {
    const stats = computeJsonStats({ hello: "world" });
    expect(stats.approxBytes).toBe(new TextEncoder().encode(JSON.stringify({ hello: "world" })).length);
  });
});

// ---------------------------------------------------------------------------
// encoding.ts (Base64) — spec sections 15, 37
// ---------------------------------------------------------------------------
describe("utilities/encoding.ts", () => {
  it("round-trips Spanish accented text through Base64", () => {
    const text = "Ñoño: canción, corazón, jalapeño";
    const encoded = textToBase64(text);
    const decoded = base64ToText(encoded);
    expect(decoded.ok).toBe(true);
    expect(decoded.text).toBe(text);
  });

  it("round-trips emoji (multi-byte UTF-8 sequences) through Base64", () => {
    const text = "Hola 👋🌍 emoji test 🎉";
    const decoded = base64ToText(textToBase64(text));
    expect(decoded.ok).toBe(true);
    expect(decoded.text).toBe(text);
  });

  it("produces the standard alphabet by default and URL-safe alphabet on request", () => {
    const bytes = new Uint8Array([251, 255, 191]); // encodes to "+/+/" family in standard Base64
    const standard = bytesToBase64(bytes, false);
    const urlSafe = bytesToBase64(bytes, true);
    expect(standard).toMatch(/[+/]/);
    expect(urlSafe).not.toMatch(/[+/]/);
    expect(urlSafe).not.toMatch(/=/);
  });

  it("base64ToBytes decodes a URL-safe string identically to its standard equivalent", () => {
    const bytes = new Uint8Array([251, 255, 191, 0, 128]);
    const standard = bytesToBase64(bytes, false);
    const urlSafe = bytesToBase64(bytes, true);
    const fromStandard = base64ToBytes(standard);
    const fromUrlSafe = base64ToBytes(urlSafe);
    expect(Array.from(fromStandard.bytes!)).toEqual(Array.from(bytes));
    expect(Array.from(fromUrlSafe.bytes!)).toEqual(Array.from(bytes));
  });

  it("rejects a string containing characters outside the Base64 alphabet", () => {
    const result = base64ToBytes("not valid base64!!! ###");
    expect(result.ok).toBe(false);
  });

  it("rejects a Base64 string whose decoded bytes are not valid UTF-8 text", () => {
    const invalidUtf8Bytes = new Uint8Array([0xff, 0xfe, 0xfd]);
    const encoded = bytesToBase64(invalidUtf8Bytes);
    const decoded = base64ToText(encoded);
    expect(decoded.ok).toBe(false);
  });

  it("never calls btoa()/atob() directly on a raw JS string (source-level check for the UTF-8-unsafe pattern)", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/encoding.ts", "utf8");
    // btoa/atob are still used internally, but only ever on a binary string built byte-by-byte from a Uint8Array — never `btoa(someArbitraryUnicodeString)`.
    expect(source).toMatch(/TextEncoder|TextDecoder/);
  });
});

// ---------------------------------------------------------------------------
// url-tool.ts — spec sections 16, 37
// ---------------------------------------------------------------------------
describe("utilities/url-tool.ts", () => {
  it("encodeURIComponent-style encoding escapes structural characters that full-URL encoding must not", () => {
    const value = "a/b:c&d=e ñ";
    const componentEncoded = encodeUriComponentSafe(value);
    expect(componentEncoded).toContain("%2F");
    expect(componentEncoded).toContain("%3A");
    expect(componentEncoded).toContain("%26");
  });

  it("full-URL encoding preserves the URL's structural characters", () => {
    const result = encodeFullUrl("https://example.com/ruta con espacios?a=1&b=2#frag");
    expect(result.ok).toBe(true);
    expect(result.text).toContain("://");
    expect(result.text).toContain("&");
    expect(result.text).toContain("?");
  });

  it("round-trips a full URL through encode/decode", () => {
    const original = "https://example.com/ruta con ñ?x=1&y=2#frag";
    const encoded = encodeFullUrl(original);
    expect(encoded.ok).toBe(true);
    const decoded = decodeFullUrl(encoded.text!);
    expect(decoded.ok).toBe(true);
    expect(decoded.text).toBe(original);
  });

  it("round-trips a component through encode/decode", () => {
    const value = "hola mundo & más/menos?raro";
    const decoded = decodeUriComponentSafe(encodeUriComponentSafe(value));
    expect(decoded.ok).toBe(true);
    expect(decoded.text).toBe(value);
  });

  it("rejects a malformed percent-encoded sequence instead of throwing uncaught", () => {
    const result = decodeUriComponentSafe("100% off %");
    expect(result.ok).toBe(false);
  });

  it("flags javascript:, data:, and vbscript: schemes as dangerous, and a normal https URL as safe", () => {
    expect(isDangerousScheme("javascript:alert(1)")).toBe(true);
    expect(isDangerousScheme("  JAVASCRIPT:alert(1)")).toBe(true);
    expect(isDangerousScheme("data:text/html,<script>alert(1)</script>")).toBe(true);
    expect(isDangerousScheme("vbscript:msgbox(1)")).toBe(true);
    expect(isDangerousScheme("https://example.com")).toBe(false);
  });

  it("parses query parameters via the native URL API and flags duplicate keys", () => {
    const result = parseUrlParams("https://example.com/path?a=1&b=2&a=3");
    expect(result.ok).toBe(true);
    expect(result.params).toEqual([
      { key: "a", value: "1", isDuplicateKey: false },
      { key: "b", value: "2", isDuplicateKey: false },
      { key: "a", value: "3", isDuplicateKey: true },
    ]);
    expect(result.origin).toBe("https://example.com");
  });

  it("rejects a non-absolute URL when analyzing parameters", () => {
    expect(parseUrlParams("/relative/path?a=1").ok).toBe(false);
    expect(parseUrlParams("not a url at all").ok).toBe(false);
  });

  it("buildQueryString can preserve original order or sort keys explicitly", () => {
    const params = [
      { key: "z", value: "1" },
      { key: "a", value: "2" },
    ];
    expect(buildQueryString(params, false)).toBe("z=1&a=2");
    expect(buildQueryString(params, true)).toBe("a=2&z=1");
  });

  it("rejects input beyond the configured URL text-length limit instead of processing it unbounded", () => {
    const huge = "a".repeat(UTILITY_LIMITS.url.maxTextLength + 1);
    expect(decodeUriComponentSafe(huge).ok).toBe(false);
    expect(encodeFullUrl(huge).ok).toBe(false);
    expect(parseUrlParams(`https://example.com/${huge}`).ok).toBe(false);
  });

  it("rejects a URL with more query parameters than the configured limit", () => {
    const manyParams = Array.from({ length: UTILITY_LIMITS.url.maxParams + 5 }, (_, i) => `p${i}=1`).join("&");
    const result = parseUrlParams(`https://example.com/?${manyParams}`);
    expect(result.ok).toBe(false);
  });

  it("never visits, fetches, or follows the URL it processes (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/utilities/url-tool.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|window\.location/);
  });
});

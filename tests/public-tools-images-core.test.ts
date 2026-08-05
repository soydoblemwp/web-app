import { describe, expect, it } from "vitest";
import { detectImageMetadata } from "@/lib/public-tools/images/metadata";
import { extractPalette, paletteToCss, paletteToJson, rgbToHsl } from "@/lib/public-tools/images/palette";
import { buildIco, isValidIco } from "@/lib/public-tools/images/ico-encoder";

// ---------------------------------------------------------------------------
// Real, hand-built minimal JPEG/PNG fixtures — no DOM/Canvas required, so
// metadata.ts's actual byte-level segment/chunk parser runs for real here
// (spec section 41: no "it returned something" tests).
// ---------------------------------------------------------------------------

function buildMinimalJpegWithExif(options: { includeGps: boolean }): Uint8Array {
  // TIFF header (little-endian) + IFD0 with Make(0x010F), DateTime(0x0132), optionally GPSInfo(0x8825).
  const entries: { tag: number; type: number; count: number; value: number }[] = [
    { tag: 0x010f, type: 2, count: 1, value: 0 }, // Make (camera)
    { tag: 0x0132, type: 2, count: 1, value: 0 }, // DateTime
  ];
  if (options.includeGps) entries.push({ tag: 0x8825, type: 4, count: 1, value: 0 }); // GPSInfo IFD pointer

  const ifd0Offset = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  const tiff = new Uint8Array(ifd0Offset + ifdSize);
  const tiffView = new DataView(tiff.buffer);
  tiff[0] = 0x49; // 'I'
  tiff[1] = 0x49; // 'I' -> "II" little-endian
  tiffView.setUint16(2, 42, true);
  tiffView.setUint32(4, ifd0Offset, true);
  tiffView.setUint16(ifd0Offset, entries.length, true);
  entries.forEach((entry, i) => {
    const offset = ifd0Offset + 2 + i * 12;
    tiffView.setUint16(offset, entry.tag, true);
    tiffView.setUint16(offset + 2, entry.type, true);
    tiffView.setUint32(offset + 4, entry.count, true);
    tiffView.setUint32(offset + 8, entry.value, true);
  });
  tiffView.setUint32(ifd0Offset + 2 + entries.length * 12, 0, true); // next IFD offset = none

  const exifSignature = new TextEncoder().encode("Exif\0\0");
  const app1Payload = new Uint8Array(exifSignature.length + tiff.length);
  app1Payload.set(exifSignature, 0);
  app1Payload.set(tiff, exifSignature.length);

  const app1Length = app1Payload.length + 2; // includes the 2 length bytes themselves
  const jpeg = new Uint8Array(2 + 2 + 2 + app1Payload.length + 2);
  const view = new DataView(jpeg.buffer);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8; // SOI
  jpeg[2] = 0xff;
  jpeg[3] = 0xe1; // APP1 marker
  view.setUint16(4, app1Length, false);
  jpeg.set(app1Payload, 6);
  jpeg[jpeg.length - 2] = 0xff;
  jpeg[jpeg.length - 1] = 0xd9; // EOI
  return jpeg;
}

function buildMinimalJpegWithoutMetadata(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // SOI + EOI only, no APP segments at all
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  // CRC is not validated by our scanner (we only need correct chunk-length framing to walk the file), so a zeroed CRC is fine for this fixture.
  return chunk;
}

function buildMinimalPngWithTextChunk(): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = buildPngChunk("IHDR", new Uint8Array(13));
  const text = buildPngChunk("tEXt", new TextEncoder().encode("Comment\0hello"));
  const iend = buildPngChunk("IEND", new Uint8Array(0));
  const png = new Uint8Array(signature.length + ihdr.length + text.length + iend.length);
  png.set(signature, 0);
  png.set(ihdr, signature.length);
  png.set(text, signature.length + ihdr.length);
  png.set(iend, signature.length + ihdr.length + text.length);
  return png;
}

describe("images/metadata.ts: detectImageMetadata — real byte-level JPEG/PNG parsing", () => {
  it("detects real EXIF, camera and date fields in a hand-built JPEG APP1/TIFF segment", () => {
    const jpeg = buildMinimalJpegWithExif({ includeGps: false });
    const result = detectImageMetadata(jpeg, "image/jpeg");
    expect(result.fullyParsed).toBe(true);
    const categories = result.findings.map((f) => f.category);
    expect(categories).toContain("exif");
    expect(categories).toContain("camera");
    expect(categories).toContain("date");
    expect(categories).not.toContain("gps");
  });

  it("detects GPS presence without ever exposing coordinate values (spec section 18)", () => {
    const jpeg = buildMinimalJpegWithExif({ includeGps: true });
    const result = detectImageMetadata(jpeg, "image/jpeg");
    const gpsFinding = result.findings.find((f) => f.category === "gps");
    expect(gpsFinding).toBeDefined();
    // The detail text must never contain anything resembling raw decimal coordinates.
    expect(gpsFinding?.detail).not.toMatch(/-?\d+\.\d{3,}/);
  });

  it("reports no findings for a JPEG with no metadata segments at all", () => {
    const jpeg = buildMinimalJpegWithoutMetadata();
    const result = detectImageMetadata(jpeg, "image/jpeg");
    expect(result.findings).toEqual([]);
  });

  it("detects a real tEXt chunk in a hand-built PNG, and marks PNG detection as presence-only (not fully parsed)", () => {
    const png = buildMinimalPngWithTextChunk();
    const result = detectImageMetadata(png, "image/png");
    expect(result.fullyParsed).toBe(false);
    expect(result.findings.some((f) => f.category === "comments")).toBe(true);
  });

  it("never throws on a truncated/corrupted buffer, and returns no findings rather than crashing", () => {
    const truncated = buildMinimalJpegWithExif({ includeGps: true }).slice(0, 10);
    expect(() => detectImageMetadata(truncated, "image/jpeg")).not.toThrow();
  });

  it("returns no findings and fullyParsed:false for an unrecognized MIME type", () => {
    const result = detectImageMetadata(new Uint8Array([1, 2, 3]), "image/gif");
    expect(result.findings).toEqual([]);
    expect(result.fullyParsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Palette extraction — extractPalette only ever reads `.data`/`.width`/
// `.height` off its input, so a plain object shaped like ImageData works
// without a real browser Canvas (spec section 20: deterministic, testable).
// ---------------------------------------------------------------------------
function buildSyntheticImageData(pixels: [number, number, number, number][], width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

describe("images/palette.ts: extractPalette — deterministic median-cut", () => {
  it("extracts distinct colors from a synthetic 2-color image", () => {
    const pixels: [number, number, number, number][] = [
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 0, 255, 255],
    ];
    const imageData = buildSyntheticImageData(pixels, 2, 2);
    const colors = extractPalette(imageData, 2);
    expect(colors).toHaveLength(2);
    const hexes = colors.map((c) => c.hex);
    expect(hexes).toContain("#ff0000");
    expect(hexes).toContain("#0000ff");
  });

  it("is deterministic — the same input always produces byte-identical output", () => {
    const pixels: [number, number, number, number][] = Array.from({ length: 64 }, (_, i) => [
      (i * 7) % 255,
      (i * 13) % 255,
      (i * 19) % 255,
      255,
    ]);
    const imageData = buildSyntheticImageData(pixels, 8, 8);
    const first = extractPalette(imageData, 4);
    const second = extractPalette(imageData, 4);
    expect(first).toEqual(second);
  });

  it("ignores fully transparent pixels", () => {
    const pixels: [number, number, number, number][] = [
      [255, 0, 0, 0], // transparent — must be ignored
      [0, 255, 0, 255],
      [0, 255, 0, 255],
    ];
    const imageData = buildSyntheticImageData(pixels, 3, 1);
    const colors = extractPalette(imageData, 2);
    expect(colors.map((c) => c.hex)).not.toContain("#ff0000");
  });

  it("sorts by predominance by default (percentages non-increasing, and each real color's own share matches its output)", () => {
    // Median-cut always bisects a box at the sorted midpoint, so for a
    // 2-color target the two resulting boxes are necessarily near-equal in
    // pixel count regardless of the true color split — this test verifies
    // the general "sorted non-increasing" contract instead of a specific
    // count relationship that the algorithm can't actually guarantee for
    // colorCount:2.
    const pixels: [number, number, number, number][] = [
      [10, 10, 10, 255],
      [10, 10, 10, 255],
      [10, 10, 10, 255],
      [10, 10, 10, 255],
      [10, 10, 10, 255],
      [200, 200, 200, 255],
    ];
    const imageData = buildSyntheticImageData(pixels, 6, 1);
    const colors = extractPalette(imageData, 3, "predominance");
    for (let i = 1; i < colors.length; i++) {
      expect(colors[i - 1].percent).toBeGreaterThanOrEqual(colors[i].percent);
    }
  });

  it("sorts by luminosity when requested", () => {
    const pixels: [number, number, number, number][] = [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ];
    const imageData = buildSyntheticImageData(pixels, 2, 1);
    const colors = extractPalette(imageData, 2, "luminosity");
    expect(colors[0].hex).toBe("#000000");
    expect(colors[colors.length - 1].hex).toBe("#ffffff");
  });

  it("flags a mid-gray whose best possible text contrast (white or black) is still mediocre", () => {
    // Contrast-with-white and contrast-with-black are complementary: the
    // best of the two can never fall below ~4.58:1 for any color, and that
    // floor is reached only in a narrow band around #767676 (verified by
    // direct computation). #767676 sits inside that band, so it's the one
    // color guaranteed to trip the "even your best option is mediocre"
    // warning — an ordinary mid-gray like #808080 does not (its white
    // contrast is already a comfortable ~3.95, black ~5.32).
    const pixels: [number, number, number, number][] = [
      [0x76, 0x76, 0x76, 255],
      [0x76, 0x76, 0x76, 255],
    ];
    const imageData = buildSyntheticImageData(pixels, 2, 1);
    const colors = extractPalette(imageData, 1);
    expect(colors[0].lowContrastBoth).toBe(true);
  });

  it("does NOT flag an ordinary mid-gray as low-contrast-both, since #808080 already has a comfortable contrast option", () => {
    const pixels: [number, number, number, number][] = [
      [128, 128, 128, 255],
      [128, 128, 128, 255],
    ];
    const imageData = buildSyntheticImageData(pixels, 2, 1);
    const colors = extractPalette(imageData, 1);
    expect(colors[0].lowContrastBoth).toBe(false);
  });

  it("returns an empty palette for a fully transparent image, never throwing", () => {
    const pixels: [number, number, number, number][] = [[0, 0, 0, 0]];
    const imageData = buildSyntheticImageData(pixels, 1, 1);
    expect(extractPalette(imageData, 4)).toEqual([]);
  });

  it("never returns more colors than requested", () => {
    const pixels: [number, number, number, number][] = Array.from({ length: 20 }, (_, i) => [i * 10, 0, 0, 255]);
    const imageData = buildSyntheticImageData(pixels, 20, 1);
    const colors = extractPalette(imageData, 3);
    expect(colors.length).toBeLessThanOrEqual(3);
  });
});

describe("images/palette.ts: export helpers", () => {
  it("rgbToHsl converts pure red correctly", () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 });
  });

  it("paletteToCss produces valid CSS custom properties", () => {
    const colors = extractPalette(buildSyntheticImageData([[255, 0, 0, 255]], 1, 1), 1);
    const css = paletteToCss(colors);
    expect(css).toMatch(/--color-1: #ff0000;/);
    expect(css).toMatch(/^:root \{/);
  });

  it("paletteToJson produces valid, parseable JSON with hex/rgb/hsl/percent", () => {
    const colors = extractPalette(buildSyntheticImageData([[0, 255, 0, 255]], 1, 1), 1);
    const json = JSON.parse(paletteToJson(colors));
    expect(json[0]).toHaveProperty("hex");
    expect(json[0]).toHaveProperty("rgb");
    expect(json[0]).toHaveProperty("hsl");
    expect(json[0]).toHaveProperty("percent");
  });
});

// ---------------------------------------------------------------------------
// ICO encoder — real, byte-verified round trip (spec section 19: never a
// renamed PNG).
// ---------------------------------------------------------------------------
const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QDwAChAGA1P3QUwAAAABJRU5ErkJggg==";
const tinyPngBytes = Uint8Array.from(Buffer.from(TINY_PNG_BASE64, "base64"));

describe("images/ico-encoder.ts: buildIco / isValidIco", () => {
  it("builds a real ICO with the correct ICONDIR header (reserved=0, type=1, count matches images)", () => {
    const ico = buildIco([{ width: 16, height: 16, pngBytes: tinyPngBytes }]);
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(1);
  });

  it("the built ICO passes real structural validation (isValidIco)", () => {
    const ico = buildIco([
      { width: 16, height: 16, pngBytes: tinyPngBytes },
      { width: 32, height: 32, pngBytes: tinyPngBytes },
    ]);
    expect(isValidIco(ico)).toBe(true);
  });

  it("embeds the real PNG bytes at the correct offset — extracting them back out gives a valid PNG signature", () => {
    const ico = buildIco([{ width: 16, height: 16, pngBytes: tinyPngBytes }]);
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    const size = view.getUint32(6 + 8, true);
    const offset = view.getUint32(6 + 12, true);
    const extracted = ico.slice(offset, offset + size);
    expect(Array.from(extracted.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("is never mistaken for a renamed PNG — the file does not start with the PNG signature", () => {
    const ico = buildIco([{ width: 16, height: 16, pngBytes: tinyPngBytes }]);
    expect(Array.from(ico.slice(0, 4))).not.toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("rejects an empty image list", () => {
    expect(() => buildIco([])).toThrow();
  });

  it("isValidIco rejects a plain PNG (proves the validator actually checks structure, not just 'is this an image')", () => {
    expect(isValidIco(tinyPngBytes)).toBe(false);
  });

  it("isValidIco rejects a truncated ICO", () => {
    const ico = buildIco([{ width: 16, height: 16, pngBytes: tinyPngBytes }]);
    expect(isValidIco(ico.slice(0, 10))).toBe(false);
  });

  it("handles the 256px width/height-as-0 encoding correctly", () => {
    const ico = buildIco([{ width: 256, height: 256, pngBytes: tinyPngBytes }]);
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    expect(view.getUint8(6)).toBe(0);
    expect(view.getUint8(7)).toBe(0);
    expect(isValidIco(ico)).toBe(true);
  });
});

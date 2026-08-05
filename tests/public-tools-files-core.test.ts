import { describe, expect, it } from "vitest";
import { sanitizeFilename, buildOutputFilename, buildPaddedFilename } from "@/lib/public-tools/files/filenames";
import { validateFileTypeAndExtension, findDuplicateFiles, validateFileCount, validateTotalBytes, validateImageDimensions } from "@/lib/public-tools/files/validation";
import { buildFileError } from "@/lib/public-tools/files/errors";
import { buildZip } from "@/lib/public-tools/files/zip";
import { unzipSync } from "fflate";
import { computePercent, CancellationToken, CancelledError } from "@/lib/public-tools/files/progress";
import { FILE_LIMITS } from "@/lib/public-tools/files/limits";
import { ObjectUrlRegistry } from "@/lib/public-tools/files/object-url";

// ---------------------------------------------------------------------------
// Filenames (spec section 30 — descarga segura)
// ---------------------------------------------------------------------------
describe("files/filenames.ts: sanitizeFilename", () => {
  it("strips path separators to prevent directory traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toMatch(/\.\.|\//);
  });

  it("strips control characters", () => {
    const withControl = `file${String.fromCharCode(0)}name.pdf`;
    expect(sanitizeFilename(withControl)).not.toMatch(/\x00/);
  });

  it("strips angle brackets, colons, quotes, pipes and glob characters", () => {
    const result = sanitizeFilename('file<>:"|?*.pdf');
    expect(result).not.toMatch(/[<>:"|?*]/);
  });

  it("renames a reserved Windows device name", () => {
    const result = sanitizeFilename("con.pdf");
    expect(result.toLowerCase()).not.toBe("con.pdf");
  });

  it("caps excessively long filenames", () => {
    const result = sanitizeFilename(`${"a".repeat(500)}.pdf`);
    expect(result.length).toBeLessThan(200);
  });

  it("falls back to a default name for an empty input", () => {
    expect(sanitizeFilename("")).toBeTruthy();
  });

  it("preserves a normal, safe filename unchanged", () => {
    expect(sanitizeFilename("documento-unido.pdf")).toBe("documento-unido.pdf");
  });

  it("buildOutputFilename joins base and extension safely", () => {
    expect(buildOutputFilename("mi documento", "pdf")).toBe("mi documento.pdf");
  });

  it("buildPaddedFilename zero-pads according to the total count", () => {
    expect(buildPaddedFilename("pagina", 1, 42, "png")).toBe("pagina-001.png");
    expect(buildPaddedFilename("pagina", 7, 5000, "png")).toBe("pagina-0007.png");
  });
});

// ---------------------------------------------------------------------------
// Validation (spec section 7, 29 — MIME, extensión, tamaño, duplicados)
// ---------------------------------------------------------------------------
function makeFile(name: string, type: string, size: number): File {
  const content = new Uint8Array(Math.max(0, size));
  return new File([content], name, { type });
}

describe("files/validation.ts", () => {
  it("accepts a PDF with matching MIME and extension", () => {
    const file = makeFile("documento.pdf", "application/pdf", 1000);
    expect(validateFileTypeAndExtension(file, ["application/pdf"]).ok).toBe(true);
  });

  it("rejects a file whose MIME type isn't in the accepted list", () => {
    const file = makeFile("documento.exe", "application/x-msdownload", 1000);
    const result = validateFileTypeAndExtension(file, ["application/pdf"]);
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe("invalid-type");
  });

  it("rejects a mismatched extension for an otherwise-accepted MIME (misleading double extension / MIME spoof)", () => {
    const file = makeFile("documento.exe", "application/pdf", 1000);
    const result = validateFileTypeAndExtension(file, ["application/pdf"]);
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe("invalid-extension");
  });

  it("rejects an empty file", () => {
    const file = makeFile("vacio.pdf", "application/pdf", 0);
    const result = validateFileTypeAndExtension(file, ["application/pdf"]);
    expect(result.ok).toBe(false);
    expect(result.error?.category).toBe("empty-file");
  });

  it("validateImageDimensions rejects an image beyond the pixel-per-side limit", () => {
    const result = validateImageDimensions(FILE_LIMITS.image.maxDimension + 1, 100);
    expect(result.ok).toBe(false);
  });

  it("validateImageDimensions rejects an image beyond the total-pixel limit even if each side is individually small", () => {
    const side = Math.ceil(Math.sqrt(FILE_LIMITS.image.maxTotalPixels)) + 100;
    const result = validateImageDimensions(side, side);
    expect(result.ok).toBe(false);
  });

  it("findDuplicateFiles detects same name+size pairs", () => {
    const files = [makeFile("a.pdf", "application/pdf", 100), makeFile("a.pdf", "application/pdf", 100), makeFile("b.pdf", "application/pdf", 200)];
    const duplicates = findDuplicateFiles(files);
    expect(duplicates.has(1)).toBe(true);
    expect(duplicates.has(0)).toBe(false);
    expect(duplicates.has(2)).toBe(false);
  });

  it("findDuplicateFiles does not flag files with the same name but different sizes", () => {
    const files = [makeFile("a.pdf", "application/pdf", 100), makeFile("a.pdf", "application/pdf", 200)];
    expect(findDuplicateFiles(files).size).toBe(0);
  });

  it("validateFileCount enforces the maximum", () => {
    expect(validateFileCount(5, 10).ok).toBe(true);
    expect(validateFileCount(11, 10).ok).toBe(false);
  });

  it("validateTotalBytes enforces the combined size limit", () => {
    expect(validateTotalBytes(500, 1000).ok).toBe(true);
    expect(validateTotalBytes(1500, 1000).ok).toBe(false);
  });
});

describe("files/errors.ts: buildFileError", () => {
  it("returns a human-readable message per category, never a raw stack trace", () => {
    const error = buildFileError("corrupted");
    expect(error.message).not.toMatch(/at \w+\.<anonymous>|node_modules/);
    expect(error.message.length).toBeGreaterThan(5);
  });

  it("allows a custom detail message while keeping the category", () => {
    const error = buildFileError("encrypted", "detalle personalizado");
    expect(error.category).toBe("encrypted");
    expect(error.message).toBe("detalle personalizado");
  });
});

// ---------------------------------------------------------------------------
// ZIP (spec sections 11, 14, 19, 34 — real archive, real re-open verification)
// ---------------------------------------------------------------------------
describe("files/zip.ts: buildZip — real archive creation, re-opened and verified with fflate", () => {
  it("builds a real ZIP that reopens with the exact entries and content", () => {
    const result = buildZip([
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "b.txt", data: new TextEncoder().encode("world") },
    ]);
    expect(result.ok).toBe(true);
    const reopened = unzipSync(result.bytes!);
    expect(Object.keys(reopened).sort()).toEqual(["a.txt", "b.txt"]);
    expect(new TextDecoder().decode(reopened["a.txt"])).toBe("hello");
    expect(new TextDecoder().decode(reopened["b.txt"])).toBe("world");
  });

  it("preserves exact binary content for non-text entries", () => {
    const binary = new Uint8Array([0, 1, 2, 255, 254, 253]);
    const result = buildZip([{ name: "data.bin", data: binary }]);
    const reopened = unzipSync(result.bytes!);
    expect(Array.from(reopened["data.bin"])).toEqual(Array.from(binary));
  });

  it("rejects an empty entry list", () => {
    expect(buildZip([]).ok).toBe(false);
  });

  it("rejects too many entries", () => {
    const entries = Array.from({ length: FILE_LIMITS.zip.maxEntries + 1 }, (_, i) => ({ name: `f${i}.txt`, data: new Uint8Array([1]) }));
    expect(buildZip(entries).ok).toBe(false);
  });

  it("rejects a combined size beyond the ZIP limit", () => {
    const big = new Uint8Array(FILE_LIMITS.zip.maxTotalBytes + 1);
    const result = buildZip([{ name: "big.bin", data: big }]);
    expect(result.ok).toBe(false);
  });

  it("preserves ordered, sequential filenames for a many-entry archive (pagina-001.png convention)", () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({ name: buildPaddedFilename("pagina", i + 1, 3, "png"), data: new Uint8Array([i]) }));
    const result = buildZip(entries);
    const reopened = unzipSync(result.bytes!);
    expect(Object.keys(reopened).sort()).toEqual(["pagina-001.png", "pagina-002.png", "pagina-003.png"]);
  });
});

// ---------------------------------------------------------------------------
// Progress / cancellation (spec sections 26, 27)
// ---------------------------------------------------------------------------
describe("files/progress.ts", () => {
  it("computePercent returns a clamped 0-100 value", () => {
    expect(computePercent(5, 10)).toBe(50);
    expect(computePercent(10, 10)).toBe(100);
    expect(computePercent(0, 10)).toBe(0);
  });

  it("computePercent returns null when total is not yet known", () => {
    expect(computePercent(5, 0)).toBeNull();
  });

  it("never reports 100% before the total is reached (spec section 26: 'no muestres 100% antes de que el archivo esté listo')", () => {
    expect(computePercent(9, 10)).toBeLessThan(100);
  });

  it("CancellationToken starts uncancelled and flips once", () => {
    const token = new CancellationToken();
    expect(token.cancelled).toBe(false);
    token.cancel();
    expect(token.cancelled).toBe(true);
  });

  it("CancellationToken.throwIfCancelled throws CancelledError only after cancel()", () => {
    const token = new CancellationToken();
    expect(() => token.throwIfCancelled()).not.toThrow();
    token.cancel();
    expect(() => token.throwIfCancelled()).toThrow(CancelledError);
  });
});

// ---------------------------------------------------------------------------
// Object URL cleanup (spec section 9)
// ---------------------------------------------------------------------------
describe("files/object-url.ts: ObjectUrlRegistry", () => {
  it("tracks created URLs and revokes exactly those on revokeAll", () => {
    const registry = new ObjectUrlRegistry();
    const revoked: string[] = [];
    const originalRevoke = URL.revokeObjectURL;
    const originalCreate = URL.createObjectURL;
    let counter = 0;
    URL.createObjectURL = () => `blob:fake-${counter++}`;
    URL.revokeObjectURL = (url: string) => revoked.push(url);

    const urlA = registry.create(new Blob(["a"]));
    const urlB = registry.create(new Blob(["b"]));
    expect(registry.size).toBe(2);
    registry.revokeAll();
    expect(revoked.sort()).toEqual([urlA, urlB].sort());
    expect(registry.size).toBe(0);

    URL.revokeObjectURL = originalRevoke;
    URL.createObjectURL = originalCreate;
  });

  it("revoke() only removes the specific URL given, not all tracked URLs", () => {
    const registry = new ObjectUrlRegistry();
    const originalRevoke = URL.revokeObjectURL;
    const originalCreate = URL.createObjectURL;
    let counter = 0;
    URL.createObjectURL = () => `blob:fake-${counter++}`;
    URL.revokeObjectURL = () => {};

    const urlA = registry.create(new Blob(["a"]));
    registry.create(new Blob(["b"]));
    registry.revoke(urlA);
    expect(registry.size).toBe(1);

    URL.revokeObjectURL = originalRevoke;
    URL.createObjectURL = originalCreate;
  });
});

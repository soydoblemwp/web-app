import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createPdfKit, drawLine, drawParagraph, ensureSpace, newPage, wrapText, drawRect, drawHorizontalRule, finalizePdf } from "@/lib/public-tools/documents/pdf-kit";
import { mmToPoints, pointsToMm, inchesToPoints, clampCustomSizeMm, PAGE_SIZES_PT, POINTS_PER_INCH } from "@/lib/public-tools/documents/measurements";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { escapeXml, buildSvgDocument } from "@/lib/public-tools/documents/svg-safe";
import { isValidEmail, isValidHttpUrl, isValidUrlOrBareDomain, findPlaceholders } from "@/lib/public-tools/documents/validation";
import { extractPdfDrawnText } from "./helpers/pdf-text";

describe("documents/measurements.ts", () => {
  it("converts mm/inches to points and back exactly", () => {
    expect(mmToPoints(25.4)).toBeCloseTo(POINTS_PER_INCH, 6);
    expect(pointsToMm(mmToPoints(100))).toBeCloseTo(100, 6);
    expect(inchesToPoints(1)).toBe(72);
  });

  it("PAGE_SIZES_PT.A4 matches the real ISO A4 dimensions in points", () => {
    const [w, h] = PAGE_SIZES_PT.A4;
    expect(w).toBeCloseTo(595.28, 0);
    expect(h).toBeCloseTo(841.89, 0);
  });

  it("clampCustomSizeMm keeps a custom label/card size within sane bounds", () => {
    const [w, h] = clampCustomSizeMm(5, 5, 10, 500);
    expect(pointsToMm(w)).toBeCloseTo(10, 6);
    expect(pointsToMm(h)).toBeCloseTo(10, 6);
  });
});

describe("documents/pdf-kit.ts: shared PDF drawing engine", () => {
  it("creates a real, reloadable PDF document with the requested page size", async () => {
    const ctx = await createPdfKit(PAGE_SIZES_PT.A4, 40);
    drawLine(ctx, "Hola mundo", { size: 12 });
    const bytes = await finalizePdf(ctx);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
    const page = reloaded.getPage(0);
    expect(page.getWidth()).toBeCloseTo(PAGE_SIZES_PT.A4[0], 1);
    expect(page.getHeight()).toBeCloseTo(PAGE_SIZES_PT.A4[1], 1);
  });

  it("actually draws the requested text into the PDF's content stream (real text extraction, not just a non-empty Blob)", async () => {
    const ctx = await createPdfKit(PAGE_SIZES_PT.LETTER, 40);
    drawLine(ctx, "TextoRealDePrueba789", { size: 12 });
    const bytes = await finalizePdf(ctx);
    const drawnText = extractPdfDrawnText(bytes);
    expect(drawnText).toContain("TextoRealDePrueba789");
  });

  it("wrapText breaks a long line at real word boundaries within the given width", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText("una dos tres cuatro cinco seis siete ocho nueve diez", font, 10, 60);
    expect(lines.length).toBeGreaterThan(1);
    // Every produced line must actually fit within maxWidth (the real invariant wrapText guarantees).
    for (const line of lines) expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(60 + 0.01);
    expect(lines.join(" ").replace(/\s+/g, " ")).toBe("una dos tres cuatro cinco seis siete ocho nueve diez");
  });

  it("ensureSpace starts a real new page when the cursor runs out of room", async () => {
    const ctx = await createPdfKit([100, 100], 10);
    const before = ctx.doc.getPageCount();
    ctx.y = 15; // barely any room left
    ensureSpace(ctx, 50);
    expect(ctx.doc.getPageCount()).toBe(before + 1);
    expect(ctx.y).toBeCloseTo(100 - 10, 5); // reset to the top margin of the new page
  });

  it("newPage always adds a real additional page to the document", async () => {
    const ctx = await createPdfKit(PAGE_SIZES_PT.A4, 40);
    newPage(ctx);
    newPage(ctx);
    const bytes = await finalizePdf(ctx);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(3);
  });

  it("drawParagraph wraps and draws every resulting line, advancing the cursor for each", async () => {
    const ctx = await createPdfKit(PAGE_SIZES_PT.A4, 40);
    const startY = ctx.y;
    drawParagraph(ctx, "una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce", { size: 10, maxWidth: 100 });
    expect(ctx.y).toBeLessThan(startY);
    const bytes = await finalizePdf(ctx);
    const drawnText = extractPdfDrawnText(bytes);
    expect(drawnText).toContain("catorce");
  });

  it("drawRect and drawHorizontalRule execute without throwing and advance the cursor for the rule", async () => {
    const ctx = await createPdfKit(PAGE_SIZES_PT.A4, 40);
    const startY = ctx.y;
    drawRect(ctx, ctx.margin, ctx.y - 20, 100, 20, { borderColor: [0.5, 0.5, 0.5], borderWidth: 1 });
    drawHorizontalRule(ctx, { gapAfter: 12 });
    expect(ctx.y).toBeLessThan(startY);
  });
});

describe("documents/json-schema.ts: versioned import/export envelope", () => {
  it("round-trips real data through build -> stringify -> parse -> equal data", () => {
    const data = { name: "Ana", items: [1, 2, 3] };
    const envelope = buildDocumentEnvelope("crear-curriculum-cv", data);
    const raw = JSON.stringify(envelope);
    const result = parseDocumentEnvelope<typeof data>(raw, "crear-curriculum-cv");
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(data);
  });

  it("rejects a JSON file that isn't a recognized document envelope", () => {
    const result = parseDocumentEnvelope(JSON.stringify({ foo: "bar" }), "crear-curriculum-cv");
    expect(result.ok).toBe(false);
  });

  it("rejects an envelope from a different tool", () => {
    const envelope = buildDocumentEnvelope("generador-carta-presentacion", { x: 1 });
    const result = parseDocumentEnvelope(JSON.stringify(envelope), "crear-curriculum-cv");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/otra herramienta/);
  });

  it("rejects an incompatible schema version", () => {
    const result = parseDocumentEnvelope(JSON.stringify({ schema: "public-tool-document", version: 2, tool: "crear-curriculum-cv", data: {} }), "crear-curriculum-cv");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid JSON without crashing", () => {
    const result = parseDocumentEnvelope("{not valid json", "crear-curriculum-cv");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/JSON válido/);
  });

  it("rejects a prototype-pollution payload (__proto__ key)", () => {
    const malicious = '{"schema":"public-tool-document","version":1,"tool":"crear-curriculum-cv","data":{"__proto__":{"polluted":true}}}';
    const result = parseDocumentEnvelope(malicious, "crear-curriculum-cv");
    expect(result.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects an excessively deeply nested payload", () => {
    let nested: unknown = { leaf: true };
    for (let i = 0; i < 20; i++) nested = { child: nested };
    const envelope = { schema: "public-tool-document", version: 1, tool: "crear-curriculum-cv", data: nested };
    const result = parseDocumentEnvelope(JSON.stringify(envelope), "crear-curriculum-cv");
    expect(result.ok).toBe(false);
  });
});

describe("documents/svg-safe.ts: escaped, download-only SVG builder", () => {
  it("escapes XML-special characters in visitor text nodes", () => {
    const escaped = escapeXml(`<script>alert("xss")</script> & 'quote'`);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).toContain("&amp;");
    expect(escaped).toContain("&quot;");
    expect(escaped).toContain("&apos;");
  });

  it("builds a well-formed, parseable SVG document with escaped text nodes", () => {
    const svg = buildSvgDocument(100, 50, [
      { kind: "rect", x: 0, y: 0, width: 100, height: 50, stroke: "#000" },
      { kind: "text", x: 5, y: 20, text: "<danger>", size: 10 },
    ]);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
    expect(svg).not.toContain("<danger>");
    expect(svg).toContain("&lt;danger&gt;");
    expect(svg).toMatch(/<\/svg>$/);
  });

  it("embeds a raw-trusted fragment (e.g. a library-generated QR/barcode SVG) unescaped, since it never comes from visitor text", () => {
    const svg = buildSvgDocument(50, 50, [{ kind: "raw-trusted", markup: "<rect width='10' height='10'/>" }]);
    expect(svg).toContain("<rect width='10' height='10'/>");
  });
});

describe("documents/validation.ts: shared field validators", () => {
  it("validates real email addresses and rejects malformed ones", () => {
    expect(isValidEmail("persona@example.com")).toBe(true);
    expect(isValidEmail("no-es-un-correo")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("validates http/https URLs and rejects other schemes", () => {
    expect(isValidHttpUrl("https://example.com")).toBe(true);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
  });

  it("accepts a bare domain without protocol as a valid site field", () => {
    expect(isValidUrlOrBareDomain("example.com")).toBe(true);
    expect(isValidUrlOrBareDomain("https://example.com")).toBe(true);
    expect(isValidUrlOrBareDomain("")).toBe(false);
  });

  it("finds unfilled template placeholders like [Nombre de la empresa]", () => {
    const found = findPlaceholders("Estimado/a [Nombre del destinatario], solicito el puesto de [Puesto].");
    expect(found).toEqual(["[Nombre del destinatario]", "[Puesto]"]);
    expect(findPlaceholders("Sin marcadores aquí.")).toEqual([]);
  });
});

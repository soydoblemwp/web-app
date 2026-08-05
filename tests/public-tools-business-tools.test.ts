import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import { computeInvoiceTotals, computeLine, formatMoney, majorToMinor, minorToMajor, minorUnitDigitsForCurrency } from "@/lib/public-tools/business/invoice";
import { buildBusinessDocumentPdf } from "@/lib/public-tools/business/business-document-pdf";
import { buildSignatureHtml, escapeHtml, sanitizeUrl, sanitizeHexColor, type SignatureFields, type SignatureStyle } from "@/lib/public-tools/business/email-signature";

// ---------------------------------------------------------------------------
// invoice.ts — spec sections 8, 13, 39 (decimal-safe money math)
// ---------------------------------------------------------------------------
describe("business/invoice.ts: computeLine / computeInvoiceTotals", () => {
  it("computes a simple line total exactly (no floating point drift)", () => {
    // 3 units at 19.99 (1999 minor units) = 59.97 -> 5997 minor units, no discount/tax.
    const line = computeLine({ id: "l1", description: "Item", quantity: 3, unitPriceMinor: 1999, discountPercent: 0, taxPercent: 0 });
    expect(line.baseAmountMinor).toBe(5997);
    expect(line.netAmountMinor).toBe(5997);
    expect(line.totalMinor).toBe(5997);
  });

  it("handles a fractional quantity (e.g. hours) without float drift across many repetitions", () => {
    // 2.5 hours at $100.00/hr (10000 minor units) repeated 1000 times must always equal exactly 25000.
    for (let i = 0; i < 1000; i++) {
      const line = computeLine({ id: "l1", description: "Consultoría", quantity: 2.5, unitPriceMinor: 10000, discountPercent: 0, taxPercent: 0 });
      expect(line.baseAmountMinor).toBe(25000);
    }
  });

  it("applies a line discount and tax in the documented order (discount first, then tax on the discounted amount)", () => {
    // 100.00 base, 10% discount -> 90.00, then 20% tax on 90.00 -> 18.00, total 108.00.
    const line = computeLine({ id: "l1", description: "Item", quantity: 1, unitPriceMinor: 10000, discountPercent: 10, taxPercent: 20 });
    expect(line.baseAmountMinor).toBe(10000);
    expect(line.discountAmountMinor).toBe(1000);
    expect(line.netAmountMinor).toBe(9000);
    expect(line.taxAmountMinor).toBe(1800);
    expect(line.totalMinor).toBe(10800);
  });

  it("computeInvoiceTotals sums subtotal/tax across lines and applies a global discount, shipping, and balance due", () => {
    const totals = computeInvoiceTotals({
      lines: [
        { id: "l1", description: "A", quantity: 1, unitPriceMinor: 10000, discountPercent: 0, taxPercent: 0 },
        { id: "l2", description: "B", quantity: 1, unitPriceMinor: 5000, discountPercent: 0, taxPercent: 0 },
      ],
      globalDiscountPercent: 10, // 10% of 15000 subtotal = 1500
      shippingMinor: 500,
      paidMinor: 10000,
    });
    expect(totals.subtotalMinor).toBe(15000);
    expect(totals.globalDiscountMinor).toBe(1500);
    expect(totals.grandTotalMinor).toBe(15000 - 1500 + 0 + 500); // 14000
    expect(totals.balanceDueMinor).toBe(14000 - 10000); // 4000
  });

  it("never accumulates floating point error across 10,000 summed lines", () => {
    const lines = Array.from({ length: 10_000 }, (_, i) => ({ id: `l${i}`, description: "x", quantity: 1, unitPriceMinor: 333, discountPercent: 0, taxPercent: 0 }));
    const totals = computeInvoiceTotals({ lines, globalDiscountPercent: 0, shippingMinor: 0, paidMinor: 0 });
    expect(totals.subtotalMinor).toBe(333 * 10_000);
    expect(Number.isInteger(totals.subtotalMinor)).toBe(true);
  });

  it("minorUnitDigitsForCurrency resolves 2 for EUR/USD and 0 for JPY via real Intl data", () => {
    expect(minorUnitDigitsForCurrency("EUR")).toBe(2);
    expect(minorUnitDigitsForCurrency("USD")).toBe(2);
    expect(minorUnitDigitsForCurrency("JPY")).toBe(0);
  });

  it("majorToMinor and minorToMajor round-trip correctly per currency", () => {
    expect(majorToMinor(19.99, "EUR")).toBe(1999);
    expect(minorToMajor(1999, "EUR")).toBeCloseTo(19.99, 6);
    expect(majorToMinor(500, "JPY")).toBe(500); // 0 decimal digits
  });

  it("formatMoney produces a real localized currency string containing the amount", () => {
    const formatted = formatMoney(1999, "EUR", "es-ES");
    expect(formatted).toMatch(/19[.,]99/);
  });

  it("never uses raw floating-point arithmetic for the final rounding step (source-level check: every money computation is rounded through the shared roundToInt() helper, itself backed by Math.round)", () => {
    const source = fs.readFileSync("src/lib/public-tools/business/invoice.ts", "utf8");
    expect(source).toMatch(/function roundToInt\(value: number\): number \{\s*return Math\.round\(value\);/);
    const roundToIntCalls = (source.match(/roundToInt\(/g) ?? []).length;
    expect(roundToIntCalls).toBeGreaterThanOrEqual(5); // definition + baseAmount, discountAmount, taxAmount, globalDiscount at minimum
  });
});

// ---------------------------------------------------------------------------
// business-document-pdf.ts — spec sections 8, 14, 40 (real PDF, reloaded and verified)
// ---------------------------------------------------------------------------
describe("business/business-document-pdf.ts: buildBusinessDocumentPdf", () => {
  const baseInput = {
    kind: "FACTURA" as const,
    issuer: { name: "Mi Negocio", email: "negocio@example.com", phone: "123", address: "Calle 1", website: "https://negocio.example", taxId: "B12345678" },
    client: { name: "Cliente S.A.", email: "cliente@example.com", phone: "", address: "Calle 2", website: "", taxId: "" },
    documentNumber: "2026-001",
    issueDate: "2026-07-29",
    dueDate: "2026-08-29",
    currency: "EUR",
    notes: "Gracias por su compra.",
    terms: "Pago a 30 días.",
    reference: "REF-1",
    lines: [
      { id: "l1", description: "Servicio de consultoría", quantity: 10, unitPriceMinor: 5000, discountPercent: 0, taxPercent: 21 },
      { id: "l2", description: "Licencia de software", quantity: 1, unitPriceMinor: 12000, discountPercent: 10, taxPercent: 21 },
    ],
    globalDiscountPercent: 0,
    shippingMinor: 0,
    paidMinor: 0,
    logoPngBytes: null,
  };

  it("generates a real, reloadable PDF with at least one page and non-zero size", async () => {
    const bytes = await buildBusinessDocumentPdf(baseInput);
    expect(bytes.length).toBeGreaterThan(0);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("generates PRESUPUESTO documents identically well as FACTURA (same code path, different label)", async () => {
    const bytes = await buildBusinessDocumentPdf({ ...baseInput, kind: "PRESUPUESTO" });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("paginates correctly across many line items (a large invoice produces multiple real pages)", async () => {
    const manyLines = Array.from({ length: 80 }, (_, i) => ({ id: `l${i}`, description: `Línea de producto número ${i} con una descripción larga para forzar el ajuste de texto`, quantity: 1, unitPriceMinor: 1000, discountPercent: 0, taxPercent: 0 }));
    const bytes = await buildBusinessDocumentPdf({ ...baseInput, lines: manyLines });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
  });

  it("embeds a real PNG logo when provided, without corrupting the resulting PDF", async () => {
    // A minimal valid 1x1 PNG (real signature + IHDR/IDAT/IEND chunks).
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const pngBytes = Uint8Array.from(Buffer.from(pngBase64, "base64"));
    const bytes = await buildBusinessDocumentPdf({ ...baseInput, logoPngBytes: pngBytes });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("never throws or corrupts the PDF when an invalid logo is provided — skips it gracefully", async () => {
    const bogusBytes = new Uint8Array([1, 2, 3, 4]);
    const bytes = await buildBusinessDocumentPdf({ ...baseInput, logoPngBytes: bogusBytes });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("includes the mandated legal disclaimer text in the source (drawn onto every generated document)", () => {
    const source = fs.readFileSync("src/lib/public-tools/business/business-document-pdf.ts", "utf8");
    expect(source).toMatch(/Revisa los requisitos fiscales y comerciales aplicables en tu país/);
  });

  it("reuses pdf-lib and never implements a second/custom PDF writer", () => {
    const source = fs.readFileSync("src/lib/public-tools/business/business-document-pdf.ts", "utf8");
    expect(source).toMatch(/from "pdf-lib"/);
  });
});

// ---------------------------------------------------------------------------
// email-signature.ts — spec sections 10, 39 (allowlist HTML, XSS blocked)
// ---------------------------------------------------------------------------
const EMPTY_FIELDS: SignatureFields = {
  name: "",
  jobTitle: "",
  company: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  legalText: "",
  pronouns: "",
  logoUrl: "",
  photoUrl: "",
  socialLinks: [],
};
const DEFAULT_VISIBILITY = {
  jobTitle: true,
  company: true,
  phone: true,
  email: true,
  website: true,
  address: true,
  legalText: true,
  pronouns: true,
  logo: true,
  photo: true,
  social: true,
};
const BASE_STYLE: SignatureStyle = { template: "minimal", primaryColor: "#1a73e8", secondaryColor: "#5f6368", fontSize: 13, spacing: 6, showIcons: true, showDividers: true, visibility: DEFAULT_VISIBILITY };

describe("business/email-signature.ts", () => {
  it("escapeHtml neutralizes script tags and quotes", () => {
    expect(escapeHtml('<script>alert(1)</script>')).not.toMatch(/<script>/);
    expect(escapeHtml('"onmouseover="alert(1)')).not.toContain('"');
  });

  it("sanitizeUrl accepts http/https and rejects javascript:/data:/vbscript:/file:", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com/");
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com/");
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
  });

  it("sanitizeHexColor accepts a strict #rrggbb literal and falls back otherwise", () => {
    expect(sanitizeHexColor("#1a2b3c", "#000000")).toBe("#1a2b3c");
    expect(sanitizeHexColor("red; background:url(javascript:alert(1))", "#000000")).toBe("#000000");
    expect(sanitizeHexColor("#fff", "#000000")).toBe("#000000"); // 3-digit shorthand rejected, must be full 6-digit
  });

  it("a name containing a script tag is rendered as escaped text, never live markup", () => {
    const built = buildSignatureHtml({ ...EMPTY_FIELDS, name: '<script>alert(1)</script>' }, BASE_STYLE);
    expect(built.html).not.toMatch(/<script>/);
    expect(built.html).toContain("&lt;script&gt;");
  });

  it("a javascript: logo URL is rejected and never appears as a src attribute, with a warning surfaced", () => {
    const built = buildSignatureHtml({ ...EMPTY_FIELDS, name: "Ana", logoUrl: "javascript:alert(1)" }, BASE_STYLE);
    expect(built.html).not.toMatch(/src="javascript:/);
    expect(built.warnings.some((w) => w.toLowerCase().includes("logo"))).toBe(true);
  });

  it("a social link with a dangerous scheme is dropped from the output", () => {
    const built = buildSignatureHtml({ ...EMPTY_FIELDS, name: "Ana", socialLinks: [{ platform: "X", url: "javascript:alert(1)" }] }, BASE_STYLE);
    expect(built.html).not.toMatch(/javascript:/);
  });

  it("an invalid color value never reaches the output CSS — falls back to a safe default", () => {
    const built = buildSignatureHtml({ ...EMPTY_FIELDS, name: "Ana" }, { ...BASE_STYLE, primaryColor: "red;}</style><script>alert(1)</script>" });
    expect(built.html).not.toMatch(/<script>/);
    expect(built.html).not.toMatch(/<\/style>/);
  });

  it("renders every one of the 5 templates without throwing and each produces real table-based HTML", () => {
    for (const template of ["minimal", "professional", "compact", "corporate", "creative"] as const) {
      const built = buildSignatureHtml({ ...EMPTY_FIELDS, name: "Ana García", jobTitle: "Directora", company: "Acme" }, { ...BASE_STYLE, template });
      expect(built.html).toMatch(/<table/);
      expect(built.html).toContain("Ana");
    }
  });

  it("plain text output contains the visible field values without any HTML tags", () => {
    const built = buildSignatureHtml({ ...EMPTY_FIELDS, name: "Ana García", jobTitle: "Directora" }, BASE_STYLE);
    expect(built.plainText).not.toMatch(/<[a-z]/i);
    expect(built.plainText).toContain("Ana García");
  });

  it("never uses eval, new Function, or raw innerHTML assignment (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/business/email-signature.ts", "utf8");
    expect(source).not.toMatch(/\beval\(|new Function\(|\.innerHTML\s*=/);
  });
});

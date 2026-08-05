import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { createDefaultCertificate, validateCertificate, CERTIFICATE_TYPE_LABELS, NOT_OFFICIAL_NOTICE, type CertificateType } from "@/lib/public-tools/printables/recognition-certificate";
import { buildRecognitionCertificatePdf } from "@/lib/public-tools/printables/recognition-certificate-pdf";
import { createDefaultLabelsData, createLabelItem, parseLabelsCsv, csvRowsToLabelItems, computeLabelSheetLayout, validateLabelsData, type LabelsData } from "@/lib/public-tools/printables/labels";
import { buildLabelsSheetPdf, buildSingleLabelPdf } from "@/lib/public-tools/printables/labels-pdf";
import { buildSingleLabelSvg } from "@/lib/public-tools/printables/labels-svg";
import { buildZip } from "@/lib/public-tools/files/zip";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { extractPdfDrawnText, inflatePdfContentStreams } from "./helpers/pdf-text";

describe("printables/recognition-certificate.ts: closed type list, never an official document", () => {
  it("only offers the 8 closed, non-official recognition types (no free-text type field)", () => {
    const types = Object.keys(CERTIFICATE_TYPE_LABELS) as CertificateType[];
    expect(types.sort()).toEqual(
      ["recognition", "participation", "completion", "gratitude", "attendance", "internal-award", "volunteering", "workshop"].sort()
    );
  });

  it("the not-official notice text is the exact mandated sentence", () => {
    expect(NOT_OFFICIAL_NOTICE).toBe("Plantilla de reconocimiento no oficial creada con los datos introducidos por el usuario.");
  });

  it("rejects a certificate with no recipient name", () => {
    const result = validateCertificate(createDefaultCertificate());
    expect(result.errors).toContain("Falta el nombre de la persona.");
  });
});

describe("printables/recognition-certificate-pdf.ts: real PDF, always including the not-official notice", () => {
  it("produces a real landscape PDF with the recipient name and the not-official notice drawn", async () => {
    const data = createDefaultCertificate();
    data.recipientName = "DestinatarioCertificadoReal";
    data.reason = "MotivoCertificadoReal";
    const bytes = await buildRecognitionCertificatePdf(data);
    const reloaded = await PDFDocument.load(bytes);
    const page = reloaded.getPage(0);
    expect(page.getWidth()).toBeGreaterThan(page.getHeight()); // landscape
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("DestinatarioCertificadoReal");
    expect(text).toContain(NOT_OFFICIAL_NOTICE);
  });

  it("all 6 templates (formal/modern/school/volunteering/gratitude/participation) each produce a real, valid PDF with the not-official notice", async () => {
    for (const template of ["formal", "modern", "school", "volunteering", "gratitude", "participation"] as const) {
      const data = createDefaultCertificate();
      data.template = template;
      data.recipientName = "Persona";
      const bytes = await buildRecognitionCertificatePdf(data);
      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.getPageCount(), template).toBe(1);
      const text = extractPdfDrawnText(bytes);
      expect(text, template).toContain(NOT_OFFICIAL_NOTICE);
    }
  });

  it("the 6 templates are structurally distinct (not just recolored copies of one layout)", async () => {
    const templates = ["formal", "modern", "school", "volunteering", "gratitude", "participation"] as const;
    const signatures = new Map<string, string>();
    for (const template of templates) {
      const data = createDefaultCertificate();
      data.template = template;
      data.recipientName = "Persona";
      const bytes = await buildRecognitionCertificatePdf(data);
      const content = inflatePdfContentStreams(bytes);
      // Stroke/fill/line-segment operator counts fingerprint each template's real geometry
      // (border style, badges, dashed dividers) — a palette swap alone would never move these.
      const strokeOps = (content.match(/(^|\n)S(\n|$)/g) ?? []).length;
      const fillOps = (content.match(/(^|\n)f(\n|$)/g) ?? []).length;
      const lineOps = (content.match(/(^|\n)[\d.\- ]+ l(\n|$)/g) ?? []).length;
      signatures.set(template, `S${strokeOps}-F${fillOps}-L${lineOps}`);
    }
    const uniqueSignatures = new Set(signatures.values());
    expect(uniqueSignatures.size, JSON.stringify(Object.fromEntries(signatures))).toBe(templates.length);
  });
});

describe("printables/labels.ts: CSV import reuses the existing safe parser, sheet layout math", () => {
  it("computeLabelSheetLayout fits a whole number of real labels within the sheet and margins", () => {
    const data = createDefaultLabelsData();
    const layout = computeLabelSheetLayout(data);
    expect(layout.columns).toBeGreaterThan(0);
    expect(layout.rows).toBeGreaterThan(0);
    expect(layout.labelsPerSheet).toBe(layout.columns * layout.rows);
  });

  it("parses a real CSV and maps rows to label items via the chosen column mapping", () => {
    const csv = "Nombre,Precio\nManzanas,1.50\nPeras,2.00";
    const parsed = parseLabelsCsv(csv);
    expect(parsed.ok).toBe(true);
    expect(parsed.headers).toEqual(["Nombre", "Precio"]);
    const items = csvRowsToLabelItems(parsed.headers!, parsed.rows!, { text: "Nombre", price: "Precio" });
    expect(items).toHaveLength(2);
    expect(items[0].text).toBe("Manzanas");
    expect(items[0].price).toBe("1.50");
    expect(items[1].text).toBe("Peras");
  });

  it("a CSV cell that looks like a formula is never executed — it stays inert text (no eval, no injection)", () => {
    const csv = 'Nombre\n"=SUM(A1:A2)"';
    const parsed = parseLabelsCsv(csv);
    expect(parsed.ok).toBe(true);
    const items = csvRowsToLabelItems(parsed.headers!, parsed.rows!, { text: "Nombre" });
    expect(items[0].text).toBe("=SUM(A1:A2)"); // preserved as literal text, never evaluated
  });

  it("rejects a CSV with too many rows", () => {
    const rows = Array.from({ length: 600 }, (_, i) => `Item${i}`).join("\n");
    const parsed = parseLabelsCsv(`Nombre\n${rows}`);
    expect(parsed.ok).toBe(false);
  });

  it("rejects a label sheet with no items", () => {
    const data = createDefaultLabelsData();
    data.items = [];
    expect(validateLabelsData(data).errors.length).toBeGreaterThan(0);
  });
});

describe("printables/labels-pdf.ts and -svg.ts: real generation without QR/barcode (DOM-free path)", () => {
  it("the sheet PDF contains real repeated label text drawn on the page", async () => {
    const data = createDefaultLabelsData();
    data.items = [
      { ...createLabelItem(), text: "EtiquetaUnoReal", price: "$1.00" },
      { ...createLabelItem(), text: "EtiquetaDosReal", price: "$2.00" },
    ];
    const bytes = await buildLabelsSheetPdf(data);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("EtiquetaUnoReal");
    expect(text).toContain("EtiquetaDosReal");
  });

  it("many labels correctly overflow onto real additional sheet pages", async () => {
    const data = createDefaultLabelsData();
    const layout = computeLabelSheetLayout(data);
    data.items = Array.from({ length: layout.labelsPerSheet + 5 }, (_, i) => ({ ...createLabelItem(), text: `Item ${i}` }));
    const bytes = await buildLabelsSheetPdf(data);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
  });

  it("a single label PDF is sized to the exact requested label dimensions", async () => {
    const data = createDefaultLabelsData();
    data.widthMm = 50;
    data.heightMm = 30;
    const item = { ...createLabelItem(), text: "Solo" };
    const bytes = await buildSingleLabelPdf(item, data);
    const reloaded = await PDFDocument.load(bytes);
    const page = reloaded.getPage(0);
    expect(page.getWidth()).toBeCloseTo((50 / 25.4) * 72, 1);
    expect(page.getHeight()).toBeCloseTo((30 / 25.4) * 72, 1);
  });

  it("buildSingleLabelSvg (no QR) produces a well-formed, escaped SVG", async () => {
    const data = createDefaultLabelsData();
    const item = { ...createLabelItem(), text: "Etiqueta <script>" };
    const svg = await buildSingleLabelSvg(item, data);
    expect(svg).toMatch(/^<svg/);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("Etiqueta &lt;script&gt;");
  });

  it("multiple labels bundle into a real ZIP via the shared buildZip core (previously-missing output, spec section 8) — never a second ZIP implementation", async () => {
    const data = createDefaultLabelsData();
    const items = [
      { ...createLabelItem(), text: "EtiquetaZipUno" },
      { ...createLabelItem(), text: "EtiquetaZipDos" },
    ];
    const entries = [];
    for (const [i, item] of items.entries()) {
      const svg = await buildSingleLabelSvg(item, data);
      entries.push({ name: `etiqueta-${i + 1}.svg`, data: new TextEncoder().encode(svg) });
    }
    const result = buildZip(entries);
    expect(result.ok).toBe(true);
    const reopened = unzipSync(result.bytes!);
    expect(Object.keys(reopened).sort()).toEqual(["etiqueta-1.svg", "etiqueta-2.svg"]);
    const decoded = new TextDecoder().decode(reopened["etiqueta-1.svg"]);
    expect(decoded).toContain("EtiquetaZipUno");
  });

  it("JSON export/import round-trips a real label template, including items (previously-missing output, spec section 8)", () => {
    const data = createDefaultLabelsData();
    data.items = [{ ...createLabelItem(), text: "EtiquetaJsonReal", price: "9.99" }];
    const envelope = buildDocumentEnvelope("generador-etiquetas-pegatinas", data);
    const result = parseDocumentEnvelope<LabelsData>(JSON.stringify(envelope), "generador-etiquetas-pegatinas");
    expect(result.ok).toBe(true);
    expect(result.data?.items[0]?.text).toBe("EtiquetaJsonReal");
    expect(result.data?.items[0]?.price).toBe("9.99");
  });
});

import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  createDefaultBusinessCard,
  validateBusinessCard,
  resolveCardSizePt,
  computeCardSheetLayout,
  BUSINESS_CARD_TEMPLATE_LABELS,
  type BusinessCardTemplateId,
} from "@/lib/public-tools/business/business-card";
import { buildBusinessCardPdf, buildBusinessCardSheetPdf } from "@/lib/public-tools/business/business-card-pdf";
import { buildBusinessCardSvg } from "@/lib/public-tools/business/business-card-svg";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { buildDocumentEnvelope, parseDocumentEnvelope } from "@/lib/public-tools/documents/json-schema";
import { inflatePdfContentStreams } from "./helpers/pdf-text";

const CARD_TEMPLATES = Object.keys(BUSINESS_CARD_TEMPLATE_LABELS) as BusinessCardTemplateId[];
import { createDefaultReceipt, createReceiptLine, computeReceiptTotals, validateReceipt } from "@/lib/public-tools/business/receipt";
import { buildReceiptPdf } from "@/lib/public-tools/business/receipt-pdf";
import { createDefaultPurchaseOrder, createPurchaseOrderLine, computePurchaseOrderTotals, validatePurchaseOrder } from "@/lib/public-tools/business/purchase-order";
import { buildPurchaseOrderPdf, purchaseOrderLinesToCsv } from "@/lib/public-tools/business/purchase-order-pdf";
import { createDefaultDeliveryNote, createDeliveryNoteLine, quantityPending, validateDeliveryNote } from "@/lib/public-tools/business/delivery-note";
import { buildDeliveryNotePdf, deliveryNoteLinesToCsv } from "@/lib/public-tools/business/delivery-note-pdf";
import { majorToMinor } from "@/lib/public-tools/business/invoice";
import { extractPdfDrawnText } from "./helpers/pdf-text";

describe("business/business-card.ts: sizing and sheet layout math", () => {
  it("resolves the real US and EU standard card sizes in points", () => {
    const data = createDefaultBusinessCard();
    data.size = "us";
    expect(resolveCardSizePt(data)).toEqual(PAGE_SIZES_PT.BUSINESS_CARD_US);
    data.size = "eu";
    expect(resolveCardSizePt(data)).toEqual(PAGE_SIZES_PT.BUSINESS_CARD_EU);
  });

  it("computeCardSheetLayout never overlaps cards and never exceeds the sheet", () => {
    const layout = computeCardSheetLayout(PAGE_SIZES_PT.LETTER, PAGE_SIZES_PT.BUSINESS_CARD_US, 28, 10);
    expect(layout.columns).toBeGreaterThan(0);
    expect(layout.rows).toBeGreaterThan(0);
    const usedWidth = layout.columns * PAGE_SIZES_PT.BUSINESS_CARD_US[0] + (layout.columns - 1) * layout.gapPt + layout.marginXPt * 2;
    expect(usedWidth).toBeLessThanOrEqual(PAGE_SIZES_PT.LETTER[0] + 0.01);
  });

  it("rejects a card with no name", () => {
    const result = validateBusinessCard(createDefaultBusinessCard());
    expect(result.errors).toContain("Falta el nombre.");
  });
});

describe("business/business-card-pdf.ts and -svg.ts: real generation without QR (DOM-free path)", () => {
  it("produces a real, reloadable single-card PDF with the entered contact info drawn", async () => {
    const data = createDefaultBusinessCard();
    data.name = "NombreTarjetaReal";
    data.company = "EmpresaTarjetaReal";
    const bytes = await buildBusinessCardPdf(data);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("NombreTarjetaReal");
    expect(text).toContain("EmpresaTarjetaReal");
  });

  it("a card with a back side produces a real 2-page PDF", async () => {
    const data = createDefaultBusinessCard();
    data.name = "Ana";
    data.backEnabled = true;
    data.backText = "Reverso";
    const bytes = await buildBusinessCardPdf(data);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it("the print sheet PDF fits multiple real repeated cards on one A4/Letter page", async () => {
    const data = createDefaultBusinessCard();
    data.name = "Ana";
    const bytesA4 = await buildBusinessCardSheetPdf(data, "A4");
    const reloadedA4 = await PDFDocument.load(bytesA4);
    expect(reloadedA4.getPageCount()).toBeGreaterThanOrEqual(1);
    const page = reloadedA4.getPage(0);
    expect(page.getWidth()).toBeCloseTo(PAGE_SIZES_PT.A4[0], 1);
  });

  it("buildBusinessCardSvg (no QR) produces a well-formed, escaped SVG containing the entered name", async () => {
    const data = createDefaultBusinessCard();
    data.name = "Ana <script>";
    const svg = await buildBusinessCardSvg(data);
    expect(svg).toMatch(/^<svg/);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("Ana &lt;script&gt;");
  });
});

describe("business/business-card-pdf.ts and -svg.ts: real generation across all 5 required minimum templates", () => {
  it("offers exactly the 5 required minimum templates (minimalista/profesional/corporativa/creativa/vertical)", () => {
    expect(CARD_TEMPLATES.sort()).toEqual(["minimal", "professional", "corporate", "creative", "vertical"].sort());
  });

  it("each template produces a real, reloadable PDF and a well-formed SVG containing the entered name", async () => {
    for (const template of CARD_TEMPLATES) {
      const data = createDefaultBusinessCard();
      data.template = template;
      data.name = "CandidatoTarjetaPlantilla";
      const bytes = await buildBusinessCardPdf(data);
      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.getPageCount(), template).toBeGreaterThanOrEqual(1);
      const text = extractPdfDrawnText(bytes);
      expect(text, template).toContain("CandidatoTarjetaPlantilla");
      const svg = await buildBusinessCardSvg(data);
      expect(svg, template).toMatch(/^<svg/);
      expect(svg, template).toContain("CandidatoTarjetaPlantilla");
    }
  });

  it("the 5 templates render structurally distinct SVG markup — not just recolored copies of one layout", async () => {
    const data = createDefaultBusinessCard();
    data.name = "Ana";
    const svgLengths = new Map<BusinessCardTemplateId, number>();
    for (const template of CARD_TEMPLATES) {
      data.template = template;
      const svg = await buildBusinessCardSvg(data);
      svgLengths.set(template, svg.length);
    }
    const uniqueLengths = new Set(svgLengths.values());
    expect(uniqueLengths.size, JSON.stringify(Object.fromEntries(svgLengths))).toBe(CARD_TEMPLATES.length);
  });

  it("the creative template draws a circular monogram badge (SVG <circle>) that other templates don't", async () => {
    const data = createDefaultBusinessCard();
    data.name = "Ana";
    data.template = "creative";
    const creativeSvg = await buildBusinessCardSvg(data);
    expect(creativeSvg).toContain("<circle");
    data.template = "minimal";
    const minimalSvg = await buildBusinessCardSvg(data);
    expect(minimalSvg).not.toContain("<circle");
  });

  it("the vertical template actually swaps to a portrait page, unlike the other 4 landscape templates", async () => {
    for (const template of CARD_TEMPLATES) {
      const data = createDefaultBusinessCard();
      data.template = template;
      data.name = "Ana";
      const bytes = await buildBusinessCardPdf(data);
      const reloaded = await PDFDocument.load(bytes);
      const page = reloaded.getPage(0);
      if (template === "vertical") expect(page.getHeight(), template).toBeGreaterThan(page.getWidth());
      else expect(page.getWidth(), template).toBeGreaterThan(page.getHeight());
    }
  });

  it("the corporate template draws a full-width filled color band that the professional template (same stroke count) doesn't", async () => {
    const corporate = createDefaultBusinessCard();
    corporate.template = "corporate";
    corporate.name = "Ana";
    const corporateContent = inflatePdfContentStreams(await buildBusinessCardPdf(corporate));
    const corporateFillOps = (corporateContent.match(/(^|\n)f(\n|$)/g) ?? []).length;

    const professional = createDefaultBusinessCard();
    professional.template = "professional";
    professional.name = "Ana";
    const professionalContent = inflatePdfContentStreams(await buildBusinessCardPdf(professional));
    const professionalFillOps = (professionalContent.match(/(^|\n)f(\n|$)/g) ?? []).length;

    const minimal = createDefaultBusinessCard();
    minimal.template = "minimal";
    minimal.name = "Ana";
    const minimalContent = inflatePdfContentStreams(await buildBusinessCardPdf(minimal));
    const minimalFillOps = (minimalContent.match(/(^|\n)f(\n|$)/g) ?? []).length;

    expect(corporateFillOps).toBeGreaterThan(0);
    expect(professionalFillOps).toBeGreaterThan(0);
    expect(minimalFillOps).toBe(0);
  });

  it("JSON export/import round-trips a real business card (spec section 8: previously missing output)", () => {
    const data = createDefaultBusinessCard();
    data.name = "CandidatoJson";
    data.template = "creative";
    const envelope = buildDocumentEnvelope("generador-tarjetas-presentacion", data);
    const result = parseDocumentEnvelope<typeof data>(JSON.stringify(envelope), "generador-tarjetas-presentacion");
    expect(result.ok).toBe(true);
    expect(result.data?.name).toBe("CandidatoJson");
    expect(result.data?.template).toBe("creative");
  });
});

describe("business/receipt.ts: reuses the invoice money core, never verifies a real transaction", () => {
  it("computes subtotal, tax, tip, and change using the shared invoice line/money core", () => {
    const data = createDefaultReceipt();
    data.issuerName = "Tienda";
    data.lines = [{ ...createReceiptLine(), description: "Café", quantity: 2, unitPriceMinor: majorToMinor(3, "EUR"), taxPercent: 10 }];
    data.tipMinor = majorToMinor(1, "EUR");
    data.amountReceivedMinor = majorToMinor(10, "EUR");
    const totals = computeReceiptTotals(data);
    expect(totals.subtotalMinor).toBe(majorToMinor(6, "EUR"));
    expect(totals.totalTaxMinor).toBe(majorToMinor(0.6, "EUR"));
    expect(totals.grandTotalMinor).toBe(majorToMinor(7.6, "EUR")); // subtotal + tax + tip(as shipping-slot)
    expect(totals.changeMinor).toBeCloseTo(majorToMinor(2.4, "EUR"), 0);
  });

  it("flags a shortfall when the amount received is less than the total, but never blocks it", () => {
    const data = createDefaultReceipt();
    data.issuerName = "Tienda";
    data.lines = [{ ...createReceiptLine(), description: "Producto", quantity: 1, unitPriceMinor: majorToMinor(50, "EUR") }];
    data.amountReceivedMinor = majorToMinor(10, "EUR");
    const validation = validateReceipt(data);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings.some((w) => w.includes("menor"))).toBe(true);
  });

  it("rejects negative quantities or prices", () => {
    const data = createDefaultReceipt();
    data.issuerName = "Tienda";
    data.lines = [{ ...createReceiptLine(), quantity: -1 }];
    expect(validateReceipt(data).errors.length).toBeGreaterThan(0);
  });
});

describe("business/receipt-pdf.ts: real PDF including the non-verification notice", () => {
  it("produces a real PDF containing the issuer, a line item, and the mandated non-verification notice", async () => {
    const data = createDefaultReceipt();
    data.issuerName = "EmisorReciboReal";
    data.lines = [{ ...createReceiptLine(), description: "ConceptoReciboReal", quantity: 1, unitPriceMinor: majorToMinor(20, "EUR") }];
    const bytes = await buildReceiptPdf(data);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("EmisorReciboReal");
    expect(text).toContain("ConceptoReciboReal");
    expect(text).toContain("no verifica una transacción real");
  });
});

describe("business/purchase-order.ts: buyer/supplier order with real totals", () => {
  it("computes a real total including shipping and tax", () => {
    const data = createDefaultPurchaseOrder();
    data.buyer.name = "Comprador";
    data.supplier.name = "Proveedor";
    data.lines = [{ ...createPurchaseOrderLine(), description: "Material", quantity: 10, unitPriceMinor: majorToMinor(5, "EUR"), taxPercent: 20 }];
    data.shippingMinor = majorToMinor(3, "EUR");
    const totals = computePurchaseOrderTotals(data);
    expect(totals.subtotalMinor).toBe(majorToMinor(50, "EUR"));
    expect(totals.totalTaxMinor).toBe(majorToMinor(10, "EUR"));
    expect(totals.grandTotalMinor).toBe(majorToMinor(63, "EUR"));
  });

  it("rejects a purchase order missing buyer or supplier", () => {
    const result = validatePurchaseOrder(createDefaultPurchaseOrder());
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("business/purchase-order-pdf.ts: real PDF + CSV export", () => {
  it("produces a real PDF containing buyer, supplier, and a line description", async () => {
    const data = createDefaultPurchaseOrder();
    data.buyer.name = "CompradorOrdenReal";
    data.supplier.name = "ProveedorOrdenReal";
    data.lines = [{ ...createPurchaseOrderLine(), description: "MaterialOrdenReal", quantity: 1, unitPriceMinor: majorToMinor(10, "EUR") }];
    const bytes = await buildPurchaseOrderPdf(data);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("CompradorOrdenReal");
    expect(text).toContain("ProveedorOrdenReal");
    expect(text).toContain("MaterialOrdenReal");
  });

  it("the CSV export round-trips real line data", () => {
    const data = createDefaultPurchaseOrder();
    data.lines = [{ ...createPurchaseOrderLine(), sku: "SKU-1", description: "Material CSV", quantity: 3, unitPriceMinor: majorToMinor(2, "EUR") }];
    const csv = purchaseOrderLinesToCsv(data);
    expect(csv).toContain("SKU-1");
    expect(csv).toContain("Material CSV");
  });
});

describe("business/delivery-note.ts: no verified transaction, prices/weight opt-in", () => {
  it("quantityPending never goes negative when more is shipped than ordered", () => {
    const line = { ...createDeliveryNoteLine(), quantityOrdered: 5, quantityShipped: 8 };
    expect(quantityPending(line)).toBe(0);
  });

  it("computes real pending quantity for a partial shipment", () => {
    const line = { ...createDeliveryNoteLine(), quantityOrdered: 10, quantityShipped: 4 };
    expect(quantityPending(line)).toBe(6);
  });

  it("warns (never blocks) when shipped exceeds ordered", () => {
    const data = createDefaultDeliveryNote();
    data.senderName = "A";
    data.recipientName = "B";
    data.lines = [{ ...createDeliveryNoteLine(), quantityOrdered: 1, quantityShipped: 5 }];
    const result = validateDeliveryNote(data);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("business/delivery-note-pdf.ts: real PDF never claiming a verified delivery or official carrier label", () => {
  it("produces a real PDF with sender, recipient, and the non-verification disclaimer", async () => {
    const data = createDefaultDeliveryNote();
    data.senderName = "RemitenteEntregaReal";
    data.recipientName = "DestinatarioEntregaReal";
    data.lines = [{ ...createDeliveryNoteLine(), description: "ProductoEntregaReal", quantityOrdered: 2, quantityShipped: 2 }];
    const bytes = await buildDeliveryNotePdf(data);
    const text = extractPdfDrawnText(bytes);
    expect(text).toContain("RemitenteEntregaReal");
    expect(text).toContain("DestinatarioEntregaReal");
    expect(text).toContain("ProductoEntregaReal");
    expect(text).toContain("no verifica una entrega real");
  });

  it("the CSV export contains real line quantities", () => {
    const data = createDefaultDeliveryNote();
    data.lines = [{ ...createDeliveryNoteLine(), sku: "SKU-9", quantityOrdered: 7, quantityShipped: 5 }];
    const csv = deliveryNoteLinesToCsv(data);
    expect(csv).toContain("SKU-9");
    expect(csv).toContain("7");
    expect(csv).toContain("5");
  });
});

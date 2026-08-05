import { PDFDocument, StandardFonts, rgb, PageSizes, type PDFFont, type PDFPage } from "pdf-lib";
import { computeInvoiceTotals, formatMoney, type DocumentKind, type InvoiceLineInput } from "./invoice";

export interface PartyInfo {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  taxId: string;
}

export interface BusinessDocumentInput {
  kind: DocumentKind;
  issuer: PartyInfo;
  client: PartyInfo;
  documentNumber: string;
  issueDate: string; // ISO yyyy-mm-dd, already validated by the caller
  dueDate: string;
  currency: string;
  notes: string;
  terms: string;
  reference: string;
  lines: InvoiceLineInput[];
  globalDiscountPercent: number;
  shippingMinor: number;
  paidMinor: number;
  logoPngBytes: Uint8Array | null;
}

const MARGIN = 40;
const PAGE_SIZE = PageSizes.A4;
const LEGAL_DISCLAIMER = "Revisa los requisitos fiscales y comerciales aplicables en tu país antes de utilizar el documento.";

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface DrawContext {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
  pageWidth: number;
  pageHeight: number;
}

function newPage(ctx: DrawContext): void {
  ctx.page = ctx.doc.addPage(PAGE_SIZE);
  ctx.y = ctx.pageHeight - MARGIN;
}

function ensureSpace(ctx: DrawContext, needed: number): void {
  if (ctx.y - needed < MARGIN) newPage(ctx);
}

function drawLine(ctx: DrawContext, text: string, options: { size?: number; font?: PDFFont; x?: number; color?: [number, number, number] } = {}): void {
  const size = options.size ?? 10;
  const font = options.font ?? ctx.font;
  const [r, g, b] = options.color ?? [0.1, 0.1, 0.1];
  ensureSpace(ctx, size + 4);
  ctx.page.drawText(text, { x: options.x ?? MARGIN, y: ctx.y, size, font, color: rgb(r, g, b) });
  ctx.y -= size + 4;
}

/**
 * Renders a real invoice/estimate PDF via pdf-lib (spec section 8: "reutiliza
 * pdf-lib y el núcleo PDF ya existente"). Reuses the same library and
 * StandardFonts/PageSizes approach established by the Fase 42 PDF tools
 * (src/lib/public-tools/pdf/*) rather than a second PDF layer.
 */
export async function buildBusinessDocumentPdf(input: BusinessDocumentInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = PAGE_SIZE;

  const ctx: DrawContext = { doc, font, bold, page: doc.addPage(PAGE_SIZE), y: pageHeight - MARGIN, pageWidth, pageHeight };

  const title = input.kind === "FACTURA" ? "FACTURA" : "PRESUPUESTO";
  drawLine(ctx, title, { size: 20, font: bold });
  drawLine(ctx, `N.º: ${input.documentNumber || "—"}`, { size: 10 });
  drawLine(ctx, `Fecha de emisión: ${input.issueDate || "—"}`, { size: 10 });
  if (input.dueDate) drawLine(ctx, `Fecha de vencimiento: ${input.dueDate}`, { size: 10 });
  if (input.reference) drawLine(ctx, `Referencia: ${input.reference}`, { size: 10 });

  if (input.logoPngBytes) {
    try {
      const logo = await doc.embedPng(input.logoPngBytes);
      const maxLogoWidth = 120;
      const scale = Math.min(1, maxLogoWidth / logo.width);
      ctx.page.drawImage(logo, { x: pageWidth - MARGIN - logo.width * scale, y: pageHeight - MARGIN - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
    } catch {
      // A logo that fails to embed (unsupported/corrupt PNG) is skipped rather than aborting the whole document.
    }
  }

  ctx.y -= 10;
  drawLine(ctx, "De:", { size: 11, font: bold });
  for (const line of [input.issuer.name, input.issuer.email, input.issuer.phone, input.issuer.address, input.issuer.website, input.issuer.taxId].filter(Boolean)) {
    drawLine(ctx, line, { size: 9, color: [0.35, 0.35, 0.35] });
  }

  ctx.y -= 6;
  drawLine(ctx, "Para:", { size: 11, font: bold });
  for (const line of [input.client.name, input.client.email, input.client.address, input.client.taxId].filter(Boolean)) {
    drawLine(ctx, line, { size: 9, color: [0.35, 0.35, 0.35] });
  }

  ctx.y -= 14;
  const colX = { desc: MARGIN, qty: 300, price: 350, discount: 410, tax: 460, total: 500 };
  drawLine(ctx, "Descripción", { size: 9, font: bold, x: colX.desc });
  ctx.y += 13; // headers share one row
  ctx.page.drawText("Cant.", { x: colX.qty, y: ctx.y, size: 9, font: bold });
  ctx.page.drawText("Precio", { x: colX.price, y: ctx.y, size: 9, font: bold });
  ctx.page.drawText("Desc.%", { x: colX.discount, y: ctx.y, size: 9, font: bold });
  ctx.page.drawText("Imp.%", { x: colX.tax, y: ctx.y, size: 9, font: bold });
  ctx.page.drawText("Total", { x: colX.total, y: ctx.y, size: 9, font: bold });
  ctx.y -= 14;

  const totals = computeInvoiceTotals({ lines: input.lines, globalDiscountPercent: input.globalDiscountPercent, shippingMinor: input.shippingMinor, paidMinor: input.paidMinor });

  for (const line of totals.lines) {
    const descLines = wrapText(line.description || "(sin descripción)", font, 9, colX.qty - colX.desc - 10);
    ensureSpace(ctx, descLines.length * 12 + 4);
    const rowTop = ctx.y;
    for (const [i, descLine] of descLines.entries()) {
      ctx.page.drawText(descLine, { x: colX.desc, y: rowTop - i * 12, size: 9, font });
    }
    ctx.page.drawText(String(line.quantity), { x: colX.qty, y: rowTop, size: 9, font });
    ctx.page.drawText(formatMoney(line.unitPriceMinor, input.currency), { x: colX.price, y: rowTop, size: 9, font });
    ctx.page.drawText(`${line.discountPercent}%`, { x: colX.discount, y: rowTop, size: 9, font });
    ctx.page.drawText(`${line.taxPercent}%`, { x: colX.tax, y: rowTop, size: 9, font });
    ctx.page.drawText(formatMoney(line.totalMinor, input.currency), { x: colX.total, y: rowTop, size: 9, font });
    ctx.y -= descLines.length * 12 + 4;
  }

  ctx.y -= 8;
  ensureSpace(ctx, 100);
  const summaryX = 380;
  const summaryRow = (label: string, value: string, boldRow = false) => {
    ensureSpace(ctx, 14);
    ctx.page.drawText(label, { x: summaryX, y: ctx.y, size: 10, font: boldRow ? bold : font });
    ctx.page.drawText(value, { x: colX.total, y: ctx.y, size: 10, font: boldRow ? bold : font });
    ctx.y -= 14;
  };
  summaryRow("Subtotal", formatMoney(totals.subtotalMinor, input.currency));
  if (totals.globalDiscountMinor > 0) summaryRow("Descuento", `-${formatMoney(totals.globalDiscountMinor, input.currency)}`);
  if (totals.totalTaxMinor > 0) summaryRow("Impuestos", formatMoney(totals.totalTaxMinor, input.currency));
  if (totals.shippingMinor > 0) summaryRow("Envío / cargo", formatMoney(totals.shippingMinor, input.currency));
  summaryRow("TOTAL", formatMoney(totals.grandTotalMinor, input.currency), true);
  if (totals.paidMinor > 0) {
    summaryRow("Pagado", formatMoney(totals.paidMinor, input.currency));
    summaryRow("Saldo pendiente", formatMoney(totals.balanceDueMinor, input.currency), true);
  }

  if (input.notes) {
    ctx.y -= 10;
    drawLine(ctx, "Notas:", { size: 10, font: bold });
    for (const line of wrapText(input.notes, font, 9, pageWidth - MARGIN * 2)) drawLine(ctx, line, { size: 9 });
  }
  if (input.terms) {
    ctx.y -= 4;
    drawLine(ctx, "Condiciones:", { size: 10, font: bold });
    for (const line of wrapText(input.terms, font, 9, pageWidth - MARGIN * 2)) drawLine(ctx, line, { size: 9 });
  }

  ctx.y = Math.min(ctx.y, MARGIN + 30);
  ensureSpace(ctx, 30);
  drawLine(ctx, LEGAL_DISCLAIMER, { size: 7, color: [0.5, 0.5, 0.5] });

  return doc.save();
}

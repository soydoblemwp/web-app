import { createPdfKit, drawLine, drawParagraph, ensureSpace, finalizePdf } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { buildCsv } from "@/lib/public-tools/csv-export";
import { computePurchaseOrderTotals, formatPurchaseOrderMoney, type PurchaseOrderData } from "./purchase-order";

const LEGAL_NOTICE = "Revisa las condiciones y requisitos comerciales aplicables antes de utilizar la orden.";

export async function buildPurchaseOrderPdf(data: PurchaseOrderData): Promise<Uint8Array> {
  const ctx = await createPdfKit(PAGE_SIZES_PT.A4, 40);
  const totals = computePurchaseOrderTotals(data);

  drawLine(ctx, "ORDEN DE COMPRA", { size: 18, font: ctx.bold });
  if (data.orderNumber) drawLine(ctx, `N.º: ${data.orderNumber}`, { size: 10 });
  if (data.date) drawLine(ctx, `Fecha: ${data.date}`, { size: 10 });
  if (data.requiredDate) drawLine(ctx, `Fecha requerida: ${data.requiredDate}`, { size: 10 });
  if (data.reference) drawLine(ctx, `Referencia: ${data.reference}`, { size: 10 });
  if (data.responsible) drawLine(ctx, `Responsable: ${data.responsible}`, { size: 10 });

  ctx.y -= 8;
  drawLine(ctx, "Comprador:", { size: 10.5, font: ctx.bold });
  for (const line of [data.buyer.name, data.buyer.address, data.buyer.contact].filter(Boolean)) drawLine(ctx, line, { size: 9, color: [0.35, 0.35, 0.35] });
  ctx.y -= 4;
  drawLine(ctx, "Proveedor:", { size: 10.5, font: ctx.bold });
  for (const line of [data.supplier.name, data.supplier.address, data.supplier.contact].filter(Boolean)) drawLine(ctx, line, { size: 9, color: [0.35, 0.35, 0.35] });

  if (data.billingAddress || data.shippingAddress) {
    ctx.y -= 4;
    if (data.billingAddress) drawLine(ctx, `Facturar a: ${data.billingAddress}`, { size: 9 });
    if (data.shippingAddress) drawLine(ctx, `Entregar en: ${data.shippingAddress}`, { size: 9 });
  }

  ctx.y -= 12;
  const colX = { sku: ctx.margin, desc: ctx.margin + 55, qty: 330, price: 380, tax: 440, total: 480 };
  ensureSpace(ctx, 16);
  ctx.page.drawText("SKU", { x: colX.sku, y: ctx.y, size: 8.5, font: ctx.bold });
  ctx.page.drawText("Descripción", { x: colX.desc, y: ctx.y, size: 8.5, font: ctx.bold });
  ctx.page.drawText("Cant.", { x: colX.qty, y: ctx.y, size: 8.5, font: ctx.bold });
  ctx.page.drawText("Precio", { x: colX.price, y: ctx.y, size: 8.5, font: ctx.bold });
  ctx.page.drawText("Imp.%", { x: colX.tax, y: ctx.y, size: 8.5, font: ctx.bold });
  ctx.page.drawText("Total", { x: colX.total, y: ctx.y, size: 8.5, font: ctx.bold });
  ctx.y -= 13;

  for (const line of totals.lines) {
    ensureSpace(ctx, 13);
    const original = data.lines.find((l) => l.id === line.id);
    ctx.page.drawText(original?.sku ?? "", { x: colX.sku, y: ctx.y, size: 8.5, font: ctx.font });
    ctx.page.drawText(line.description || "(sin descripción)", { x: colX.desc, y: ctx.y, size: 8.5, font: ctx.font });
    ctx.page.drawText(`${line.quantity} ${original?.unit ?? ""}`.trim(), { x: colX.qty, y: ctx.y, size: 8.5, font: ctx.font });
    ctx.page.drawText(formatPurchaseOrderMoney(line.unitPriceMinor, data), { x: colX.price, y: ctx.y, size: 8.5, font: ctx.font });
    ctx.page.drawText(`${line.taxPercent}%`, { x: colX.tax, y: ctx.y, size: 8.5, font: ctx.font });
    ctx.page.drawText(formatPurchaseOrderMoney(line.totalMinor, data), { x: colX.total, y: ctx.y, size: 8.5, font: ctx.font });
    ctx.y -= 13;
  }

  ctx.y -= 6;
  const summaryRow = (label: string, value: string, bold = false) => {
    ensureSpace(ctx, 14);
    ctx.page.drawText(label, { x: 390, y: ctx.y, size: 10, font: bold ? ctx.bold : ctx.font });
    ctx.page.drawText(value, { x: colX.total, y: ctx.y, size: 10, font: bold ? ctx.bold : ctx.font });
    ctx.y -= 14;
  };
  summaryRow("Subtotal", formatPurchaseOrderMoney(totals.subtotalMinor, data));
  if (totals.totalTaxMinor > 0) summaryRow("Impuestos", formatPurchaseOrderMoney(totals.totalTaxMinor, data));
  if (totals.shippingMinor > 0) summaryRow("Envío", formatPurchaseOrderMoney(totals.shippingMinor, data));
  summaryRow("TOTAL", formatPurchaseOrderMoney(totals.grandTotalMinor, data), true);

  if (data.terms) {
    ctx.y -= 8;
    drawLine(ctx, "Condiciones:", { size: 10, font: ctx.bold });
    drawParagraph(ctx, data.terms, { size: 9 });
  }
  if (data.notes) {
    ctx.y -= 4;
    drawLine(ctx, "Notas:", { size: 10, font: ctx.bold });
    drawParagraph(ctx, data.notes, { size: 9 });
  }

  ctx.y = Math.min(ctx.y - 10, ctx.margin + 22);
  ensureSpace(ctx, 22);
  drawParagraph(ctx, LEGAL_NOTICE, { size: 7, color: [0.5, 0.5, 0.5] });

  return finalizePdf(ctx);
}

export function purchaseOrderLinesToCsv(data: PurchaseOrderData): string {
  const totals = computePurchaseOrderTotals(data);
  return buildCsv(
    ["SKU", "Descripción", "Cantidad", "Unidad", "Precio", "Descuento %", "Impuesto %", "Total"],
    totals.lines.map((line) => {
      const original = data.lines.find((l) => l.id === line.id);
      return [original?.sku ?? "", line.description, String(line.quantity), original?.unit ?? "", formatPurchaseOrderMoney(line.unitPriceMinor, data), `${line.discountPercent}`, `${line.taxPercent}`, formatPurchaseOrderMoney(line.totalMinor, data)];
    })
  );
}

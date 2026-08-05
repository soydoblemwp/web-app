import { createPdfKit, drawLine, drawParagraph, ensureSpace, finalizePdf } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { computeReceiptTotals, formatReceiptMoney, RECEIPT_MODE_LABELS, type ReceiptData } from "./receipt";

const NOT_VERIFIED_NOTICE = "El documento refleja únicamente la información introducida por el usuario y no verifica una transacción real.";

export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const ctx = await createPdfKit(PAGE_SIZES_PT.A4, 40);
  const totals = computeReceiptTotals(data);

  drawLine(ctx, RECEIPT_MODE_LABELS[data.mode].toUpperCase(), { size: 18, font: ctx.bold });
  if (data.receiptNumber) drawLine(ctx, `N.º: ${data.receiptNumber}`, { size: 10 });
  if (data.date) drawLine(ctx, `Fecha: ${data.date}`, { size: 10 });
  if (data.paymentMethod) drawLine(ctx, `Método de pago: ${data.paymentMethod}`, { size: 10 });
  if (data.reference) drawLine(ctx, `Referencia: ${data.reference}`, { size: 10 });

  ctx.y -= 8;
  if (data.issuerName || data.issuerContact) {
    drawLine(ctx, "Emitido por:", { size: 10.5, font: ctx.bold });
    if (data.issuerName) drawLine(ctx, data.issuerName, { size: 9.5 });
    for (const line of data.issuerContact.split("\n").filter(Boolean)) drawLine(ctx, line, { size: 9, color: [0.4, 0.4, 0.4] });
    ctx.y -= 4;
  }
  if (data.receiverName || data.receiverContact) {
    drawLine(ctx, "Recibido de:", { size: 10.5, font: ctx.bold });
    if (data.receiverName) drawLine(ctx, data.receiverName, { size: 9.5 });
    for (const line of data.receiverContact.split("\n").filter(Boolean)) drawLine(ctx, line, { size: 9, color: [0.4, 0.4, 0.4] });
  }

  ctx.y -= 14;
  const colX = { desc: ctx.margin, qty: 300, price: 360, total: 470 };
  ensureSpace(ctx, 16);
  ctx.page.drawText("Concepto", { x: colX.desc, y: ctx.y, size: 9, font: ctx.bold });
  ctx.page.drawText("Cant.", { x: colX.qty, y: ctx.y, size: 9, font: ctx.bold });
  ctx.page.drawText("Precio", { x: colX.price, y: ctx.y, size: 9, font: ctx.bold });
  ctx.page.drawText("Total", { x: colX.total, y: ctx.y, size: 9, font: ctx.bold });
  ctx.y -= 14;

  for (const line of totals.lines) {
    ensureSpace(ctx, 14);
    ctx.page.drawText(line.description || "(sin descripción)", { x: colX.desc, y: ctx.y, size: 9, font: ctx.font });
    ctx.page.drawText(String(line.quantity), { x: colX.qty, y: ctx.y, size: 9, font: ctx.font });
    ctx.page.drawText(formatReceiptMoney(line.unitPriceMinor, data), { x: colX.price, y: ctx.y, size: 9, font: ctx.font });
    ctx.page.drawText(formatReceiptMoney(line.totalMinor, data), { x: colX.total, y: ctx.y, size: 9, font: ctx.font });
    ctx.y -= 14;
  }

  ctx.y -= 6;
  const summaryRow = (label: string, value: string, bold = false) => {
    ensureSpace(ctx, 14);
    ctx.page.drawText(label, { x: 380, y: ctx.y, size: 10, font: bold ? ctx.bold : ctx.font });
    ctx.page.drawText(value, { x: colX.total, y: ctx.y, size: 10, font: bold ? ctx.bold : ctx.font });
    ctx.y -= 14;
  };
  summaryRow("Subtotal", formatReceiptMoney(totals.subtotalMinor, data));
  if (totals.totalTaxMinor > 0) summaryRow("Impuestos", formatReceiptMoney(totals.totalTaxMinor, data));
  if (data.tipMinor > 0) summaryRow("Propina", formatReceiptMoney(data.tipMinor, data));
  summaryRow("TOTAL", formatReceiptMoney(totals.grandTotalMinor, data), true);
  if (data.amountReceivedMinor > 0) {
    summaryRow("Recibido", formatReceiptMoney(data.amountReceivedMinor, data));
    summaryRow(totals.changeMinor >= 0 ? "Cambio" : "Pendiente", formatReceiptMoney(Math.abs(totals.changeMinor), data), true);
  }

  if (data.notes) {
    ctx.y -= 8;
    drawLine(ctx, "Notas:", { size: 10, font: ctx.bold });
    drawParagraph(ctx, data.notes, { size: 9 });
  }

  if (data.mode === "donation") {
    ctx.y -= 6;
    drawParagraph(ctx, "Este recibo no constituye una declaración de deducibilidad fiscal.", { size: 8, color: [0.5, 0.3, 0.1] });
  }

  ctx.y = Math.min(ctx.y - 10, ctx.margin + 26);
  ensureSpace(ctx, 26);
  drawParagraph(ctx, NOT_VERIFIED_NOTICE, { size: 7, color: [0.5, 0.5, 0.5] });

  return finalizePdf(ctx);
}

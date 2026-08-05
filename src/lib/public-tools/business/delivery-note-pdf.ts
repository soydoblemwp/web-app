import { createPdfKit, drawLine, drawParagraph, ensureSpace, finalizePdf } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { buildCsv } from "@/lib/public-tools/csv-export";
import { DELIVERY_NOTE_MODE_LABELS, formatDeliveryNoteMoney, quantityPending, type DeliveryNoteData } from "./delivery-note";

/** No official carrier labels, tracking numbers, postage, or customs documentation are ever generated (spec section 21) — this is a plain informational document built entirely from visitor-entered fields. */
export async function buildDeliveryNotePdf(data: DeliveryNoteData): Promise<Uint8Array> {
  const ctx = await createPdfKit(PAGE_SIZES_PT.A4, 40);

  drawLine(ctx, DELIVERY_NOTE_MODE_LABELS[data.mode].toUpperCase(), { size: 18, font: ctx.bold });
  if (data.shipmentNumber) drawLine(ctx, `N.º de envío: ${data.shipmentNumber}`, { size: 10 });
  if (data.orderNumber) drawLine(ctx, `N.º de pedido: ${data.orderNumber}`, { size: 10 });
  if (data.date) drawLine(ctx, `Fecha: ${data.date}`, { size: 10 });
  if (data.carrier) drawLine(ctx, `Transportista: ${data.carrier}`, { size: 10 });
  if (data.reference) drawLine(ctx, `Referencia: ${data.reference}`, { size: 10 });
  drawLine(ctx, `Número de paquetes: ${data.packageCount}`, { size: 10 });

  ctx.y -= 8;
  drawLine(ctx, "De:", { size: 10.5, font: ctx.bold });
  for (const line of [data.senderName, data.senderAddress].filter(Boolean)) drawLine(ctx, line, { size: 9, color: [0.35, 0.35, 0.35] });
  ctx.y -= 4;
  drawLine(ctx, "Entregar a:", { size: 10.5, font: ctx.bold });
  for (const line of [data.recipientName, data.deliveryAddress].filter(Boolean)) drawLine(ctx, line, { size: 9, color: [0.35, 0.35, 0.35] });

  ctx.y -= 12;
  const colX = { sku: ctx.margin, desc: ctx.margin + 55, ordered: 290, shipped: 340, pending: 390, weight: 440, price: 480 };
  ensureSpace(ctx, 16);
  ctx.page.drawText("SKU", { x: colX.sku, y: ctx.y, size: 8, font: ctx.bold });
  ctx.page.drawText("Descripción", { x: colX.desc, y: ctx.y, size: 8, font: ctx.bold });
  ctx.page.drawText("Solic.", { x: colX.ordered, y: ctx.y, size: 8, font: ctx.bold });
  ctx.page.drawText("Enviado", { x: colX.shipped, y: ctx.y, size: 8, font: ctx.bold });
  ctx.page.drawText("Pend.", { x: colX.pending, y: ctx.y, size: 8, font: ctx.bold });
  if (data.showWeight) ctx.page.drawText("Peso", { x: colX.weight, y: ctx.y, size: 8, font: ctx.bold });
  if (data.showPrices) ctx.page.drawText("Precio", { x: colX.price, y: ctx.y, size: 8, font: ctx.bold });
  ctx.y -= 13;

  for (const line of data.lines) {
    ensureSpace(ctx, 13);
    ctx.page.drawText(line.sku, { x: colX.sku, y: ctx.y, size: 8, font: ctx.font });
    ctx.page.drawText(line.description || "(sin descripción)", { x: colX.desc, y: ctx.y, size: 8, font: ctx.font });
    ctx.page.drawText(`${line.quantityOrdered} ${line.unit}`.trim(), { x: colX.ordered, y: ctx.y, size: 8, font: ctx.font });
    ctx.page.drawText(String(line.quantityShipped), { x: colX.shipped, y: ctx.y, size: 8, font: ctx.font });
    ctx.page.drawText(String(quantityPending(line)), { x: colX.pending, y: ctx.y, size: 8, font: ctx.font });
    if (data.showWeight && line.weightKg !== null) ctx.page.drawText(`${line.weightKg} kg`, { x: colX.weight, y: ctx.y, size: 8, font: ctx.font });
    if (data.showPrices) ctx.page.drawText(formatDeliveryNoteMoney(line.unitPriceMinor * line.quantityShipped, data), { x: colX.price, y: ctx.y, size: 8, font: ctx.font });
    ctx.y -= 13;
  }

  if (data.notes) {
    ctx.y -= 10;
    drawLine(ctx, "Notas:", { size: 10, font: ctx.bold });
    drawParagraph(ctx, data.notes, { size: 9 });
  }

  ctx.y = Math.min(ctx.y - 10, ctx.margin + 22);
  ensureSpace(ctx, 22);
  drawParagraph(ctx, "Este documento no verifica una entrega real ni sustituye la documentación de transporte oficial.", { size: 7, color: [0.5, 0.5, 0.5] });

  return finalizePdf(ctx);
}

export function deliveryNoteLinesToCsv(data: DeliveryNoteData): string {
  const headers = ["SKU", "Descripción", "Cantidad solicitada", "Cantidad enviada", "Pendiente", "Unidad"];
  if (data.showWeight) headers.push("Peso (kg)");
  if (data.showPrices) headers.push("Precio");
  return buildCsv(
    headers,
    data.lines.map((line) => {
      const row = [line.sku, line.description, String(line.quantityOrdered), String(line.quantityShipped), String(quantityPending(line)), line.unit];
      if (data.showWeight) row.push(line.weightKg !== null ? String(line.weightKg) : "");
      if (data.showPrices) row.push(formatDeliveryNoteMoney(line.unitPriceMinor, data));
      return row;
    })
  );
}

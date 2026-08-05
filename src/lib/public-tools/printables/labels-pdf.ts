import { createPdfKit, drawTextAt, drawRect, embedImageAuto, finalizePdf } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT, mmToPoints } from "@/lib/public-tools/documents/measurements";
import { renderQrPngBytes } from "@/lib/public-tools/documents/qr-raster";
import { computeLabelSheetLayout, type LabelItem, type LabelsData } from "./labels";

async function drawLabel(ctx: Awaited<ReturnType<typeof createPdfKit>>, item: LabelItem, data: LabelsData, x: number, y: number, widthPt: number, heightPt: number, sequenceNumber: number | null): Promise<void> {
  if (data.showBorder) drawRect(ctx, x, y, widthPt, heightPt, { borderColor: [0.75, 0.75, 0.75], borderWidth: 0.5 });

  const padding = 4;
  let hasCode = false;
  let codeSize = 0;

  if (item.qrValue.trim()) {
    const bytes = await renderQrPngBytes(item.qrValue, 200);
    if (bytes) {
      const image = await embedImageAuto(ctx, bytes, "image/png");
      if (image) {
        codeSize = Math.min(heightPt - padding * 2, widthPt * 0.35);
        ctx.page.drawImage(image, { x: x + widthPt - padding - codeSize, y: y + (heightPt - codeSize) / 2, width: codeSize, height: codeSize });
        hasCode = true;
      }
    }
  } else if (item.barcodeValue.trim() && item.barcodeFormat) {
    try {
      const { renderBarcodeToPngBlob } = await import("@/lib/public-tools/barcodes/generation");
      const blob = await renderBarcodeToPngBlob(item.barcodeValue, { format: item.barcodeFormat, displayValue: false, width: 1.5, height: 40, margin: 0, lineColor: "#000000", background: "#ffffff" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const image = await embedImageAuto(ctx, bytes, "image/png");
      if (image) {
        const bw = Math.min(widthPt * 0.4, 60);
        const bh = Math.min(heightPt - padding * 2, bw * (image.height / image.width));
        ctx.page.drawImage(image, { x: x + widthPt - padding - bw, y: y + (heightPt - bh) / 2, width: bw, height: bh });
        hasCode = true;
      }
    } catch {
      // A barcode value that fails to render (e.g. invalid check digit) is skipped for this one label.
    }
  }

  const textWidth = widthPt - padding * 2 - (hasCode ? codeSize + padding : 0);
  let cursorY = y + heightPt - padding - data.fontSizePt;
  const label = sequenceNumber !== null ? `#${sequenceNumber} ${item.text}`.trim() : item.text;
  if (label) {
    drawTextAt(ctx, label.slice(0, Math.max(4, Math.floor(textWidth / (data.fontSizePt * 0.55)))), x + padding, cursorY, { size: data.fontSizePt, font: ctx.bold });
    cursorY -= data.fontSizePt + 2;
  }
  if (item.description) {
    drawTextAt(ctx, item.description.slice(0, Math.max(4, Math.floor(textWidth / (data.fontSizePt * 0.5)))), x + padding, cursorY, { size: data.fontSizePt - 1.5, color: [0.35, 0.35, 0.35] });
    cursorY -= data.fontSizePt;
  }
  if (item.sku) {
    drawTextAt(ctx, item.sku, x + padding, cursorY, { size: data.fontSizePt - 2, color: [0.5, 0.5, 0.5] });
    cursorY -= data.fontSizePt - 1;
  }
  if (item.price) {
    drawTextAt(ctx, item.price, x + padding, y + padding, { size: data.fontSizePt + 1, font: ctx.bold });
  }
}

export async function buildLabelsSheetPdf(data: LabelsData): Promise<Uint8Array> {
  const sheetSize = data.sheetSize === "A4" ? PAGE_SIZES_PT.A4 : PAGE_SIZES_PT.LETTER;
  const layout = computeLabelSheetLayout(data);
  const widthPt = mmToPoints(data.widthMm);
  const heightPt = mmToPoints(data.heightMm);
  const marginPt = mmToPoints(data.marginMm);
  const gapPt = mmToPoints(data.gapMm);

  const ctx = await createPdfKit(sheetSize, marginPt);
  let col = 0;
  let row = 0;

  for (const [index, item] of data.items.entries()) {
    if (row >= layout.rows) {
      ctx.page = ctx.doc.addPage(sheetSize);
      row = 0;
      col = 0;
    }
    const x = marginPt + col * (widthPt + gapPt);
    const yTop = sheetSize[1] - marginPt - row * (heightPt + gapPt);
    const y = yTop - heightPt;
    await drawLabel(ctx, item, data, x, y, widthPt, heightPt, data.sequentialNumbering ? data.sequenceStart + index : null);

    col++;
    if (col >= layout.columns) {
      col = 0;
      row++;
    }
  }

  return finalizePdf(ctx);
}

/** A single label rendered alone (for a one-off PNG/SVG download of just one design). */
export async function buildSingleLabelPdf(item: LabelItem, data: LabelsData): Promise<Uint8Array> {
  const widthPt = mmToPoints(data.widthMm);
  const heightPt = mmToPoints(data.heightMm);
  const ctx = await createPdfKit([widthPt, heightPt], 0);
  await drawLabel(ctx, item, data, 0, 0, widthPt, heightPt, null);
  return finalizePdf(ctx);
}

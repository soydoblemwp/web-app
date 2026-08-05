import { rgb } from "pdf-lib";
import { createPdfKit, drawTextAt, drawRect, embedImageAuto, finalizePdf, type PdfKitContext } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT, mmToPoints } from "@/lib/public-tools/documents/measurements";
import { hexToRgb } from "@/lib/public-tools/color-contrast";
import { renderQrPngBytes } from "@/lib/public-tools/documents/qr-raster";
import { resolveCardSizePt, computeCardSheetLayout, type BusinessCardData } from "./business-card";

function accent(hex: string): [number, number, number] {
  const t = hexToRgb(hex);
  return t ? [t[0] / 255, t[1] / 255, t[2] / 255] : [0.15, 0.39, 0.92];
}

async function embedQr(ctx: PdfKitContext, data: BusinessCardData) {
  if (!data.showQr || !data.qrValue.trim()) return null;
  const bytes = await renderQrPngBytes(data.qrValue, 200);
  return bytes ? embedImageAuto(ctx, bytes, "image/png") : null;
}

async function embedLogo(ctx: PdfKitContext, data: BusinessCardData) {
  if (!data.logoPngBytes || data.logoPngBytes.length === 0) return null;
  return embedImageAuto(ctx, new Uint8Array(data.logoPngBytes), "image/png");
}

/**
 * Five real, structurally distinct front-face layouts (spec correction: "no
 * presentes cinco variaciones cromáticas del mismo diseño") — each has its
 * own geometry, not just a recolored copy of another template.
 */
async function drawFront(ctx: PdfKitContext, data: BusinessCardData, x: number, y: number, width: number, height: number): Promise<void> {
  const [ar, ag, ab] = accent(data.accentColorHex);
  const padding = 12;
  const contactLines = [data.phone, data.email, data.website, data.address].filter(Boolean);
  const logo = await embedLogo(ctx, data);
  const qr = await embedQr(ctx, data);

  drawRect(ctx, x, y, width, height, { borderColor: [0.85, 0.85, 0.85], borderWidth: 0.75 });

  if (data.template === "minimal") {
    let cursorY = y + height - padding - 10;
    drawTextAt(ctx, data.name || "Nombre", x + padding, cursorY, { size: 12, font: ctx.bold, color: [ar, ag, ab] });
    cursorY -= 14;
    if (data.jobTitle) {
      drawTextAt(ctx, data.jobTitle, x + padding, cursorY, { size: 8.5, color: [0.4, 0.4, 0.4] });
      cursorY -= 11;
    }
    if (data.company) {
      drawTextAt(ctx, data.company, x + padding, cursorY, { size: 8.5, font: ctx.bold });
      cursorY -= 14;
    }
    for (const line of contactLines) {
      drawTextAt(ctx, line, x + padding, cursorY, { size: 7.5, color: [0.3, 0.3, 0.3] });
      cursorY -= 10;
    }
    if (logo) {
      const maxLogo = Math.min(22, height * 0.28);
      const scale = Math.min(1, maxLogo / Math.max(logo.width, logo.height));
      ctx.page.drawImage(logo, { x: x + width - padding - logo.width * scale, y: y + height - padding - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
    }
    if (qr) {
      const qrSize = Math.min(height - padding * 2, 40);
      ctx.page.drawImage(qr, { x: x + width - padding - qrSize, y: y + padding, width: qrSize, height: qrSize });
    }
    return;
  }

  if (data.template === "professional") {
    const barWidth = Math.min(6, width * 0.03);
    drawRect(ctx, x, y, barWidth, height, { color: [ar, ag, ab] });
    const textX = x + padding + barWidth;
    let cursorY = y + height - padding - 10;
    drawTextAt(ctx, data.name || "Nombre", textX, cursorY, { size: 12, font: ctx.bold });
    cursorY -= 14;
    if (data.jobTitle) {
      drawTextAt(ctx, data.jobTitle, textX, cursorY, { size: 8.5, color: [ar, ag, ab] });
      cursorY -= 11;
    }
    if (data.company) {
      drawTextAt(ctx, data.company, textX, cursorY, { size: 8.5, font: ctx.bold });
      cursorY -= 14;
    }
    for (const line of contactLines) {
      drawTextAt(ctx, line, textX, cursorY, { size: 7.5, color: [0.3, 0.3, 0.3] });
      cursorY -= 10;
    }
    if (logo) {
      const maxLogo = Math.min(22, height * 0.28);
      const scale = Math.min(1, maxLogo / Math.max(logo.width, logo.height));
      ctx.page.drawImage(logo, { x: x + width - padding - logo.width * scale, y: y + height - padding - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
    }
    if (qr) {
      const qrSize = Math.min(height - padding * 2, 40);
      ctx.page.drawImage(qr, { x: x + width - padding - qrSize, y: y + padding, width: qrSize, height: qrSize });
    }
    return;
  }

  if (data.template === "corporate") {
    const bandHeight = height * 0.42;
    drawRect(ctx, x, y + height - bandHeight, width, bandHeight, { color: [ar, ag, ab] });
    drawTextAt(ctx, data.name || "Nombre", x + padding, y + height - 16, { size: 11.5, font: ctx.bold, color: [1, 1, 1] });
    if (data.jobTitle) drawTextAt(ctx, data.jobTitle, x + padding, y + height - 29, { size: 8, color: [1, 1, 1] });
    if (logo) {
      const maxLogo = Math.min(20, bandHeight * 0.5);
      const scale = Math.min(1, maxLogo / Math.max(logo.width, logo.height));
      ctx.page.drawImage(logo, { x: x + width - padding - logo.width * scale, y: y + height - bandHeight / 2 - (logo.height * scale) / 2, width: logo.width * scale, height: logo.height * scale });
    }
    let cursorY = y + height - bandHeight - 14;
    if (data.company) {
      drawTextAt(ctx, data.company, x + padding, cursorY, { size: 8.5, font: ctx.bold });
      cursorY -= 13;
    }
    for (const line of contactLines) {
      drawTextAt(ctx, line, x + padding, cursorY, { size: 7.5, color: [0.3, 0.3, 0.3] });
      cursorY -= 10;
    }
    if (qr) {
      const qrSize = Math.min(bandHeight - 10, 36);
      ctx.page.drawImage(qr, { x: x + width - padding - qrSize, y: y + padding, width: qrSize, height: qrSize });
    }
    return;
  }

  if (data.template === "creative") {
    const badgeRadius = Math.min(height * 0.32, 24);
    const badgeCx = x + width - padding - badgeRadius;
    const badgeCy = y + height - padding - badgeRadius;
    ctx.page.drawCircle({ x: badgeCx, y: badgeCy, size: badgeRadius, color: rgb(ar, ag, ab) });
    const initial = (data.name || "?").trim().charAt(0).toLocaleUpperCase("es-ES");
    drawTextAt(ctx, initial, badgeCx, badgeCy - badgeRadius * 0.35, { size: badgeRadius, font: ctx.bold, color: [1, 1, 1], align: "center" });

    let cursorY = y + height * 0.4;
    drawTextAt(ctx, data.name || "Nombre", x + padding, cursorY, { size: 13, font: ctx.bold });
    cursorY -= 14;
    if (data.jobTitle || data.company) {
      drawTextAt(ctx, [data.jobTitle, data.company].filter(Boolean).join(" · "), x + padding, cursorY, { size: 8, color: [ar, ag, ab] });
      cursorY -= 13;
    }
    for (const line of contactLines) {
      drawTextAt(ctx, line, x + padding, cursorY, { size: 7.5, color: [0.3, 0.3, 0.3] });
      cursorY -= 10;
    }
    if (qr) {
      const qrSize = Math.min(height - padding * 2, 36);
      ctx.page.drawImage(qr, { x: x + padding, y: y + padding, width: qrSize, height: qrSize });
    }
    return;
  }

  // vertical: portrait orientation, everything centered horizontally.
  const centerX = x + width / 2;
  let cursorY = y + height - padding - 20;
  if (logo) {
    const maxLogo = Math.min(28, width * 0.4);
    const scale = Math.min(1, maxLogo / Math.max(logo.width, logo.height));
    ctx.page.drawImage(logo, { x: centerX - (logo.width * scale) / 2, y: cursorY - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
    cursorY -= logo.height * scale + 10;
  }
  drawTextAt(ctx, data.name || "Nombre", centerX, cursorY, { size: 12, font: ctx.bold, color: [ar, ag, ab], align: "center" });
  cursorY -= 14;
  if (data.jobTitle) {
    drawTextAt(ctx, data.jobTitle, centerX, cursorY, { size: 8, color: [0.4, 0.4, 0.4], align: "center" });
    cursorY -= 12;
  }
  if (data.company) {
    drawTextAt(ctx, data.company, centerX, cursorY, { size: 8.5, font: ctx.bold, align: "center" });
    cursorY -= 14;
  }
  cursorY -= 6;
  for (const line of contactLines) {
    drawTextAt(ctx, line, centerX, cursorY, { size: 7.5, color: [0.3, 0.3, 0.3], align: "center" });
    cursorY -= 10;
  }
  if (qr) {
    const qrSize = Math.min(width - padding * 2, 40);
    ctx.page.drawImage(qr, { x: centerX - qrSize / 2, y: y + padding, width: qrSize, height: qrSize });
  }
}

function drawBack(ctx: PdfKitContext, data: BusinessCardData, x: number, y: number, width: number, height: number): void {
  drawRect(ctx, x, y, width, height, { borderColor: [0.85, 0.85, 0.85], borderWidth: 0.75 });
  if (!data.backText) return;
  const lines = data.backText.split("\n").slice(0, 6);
  const lineHeight = Math.min(14, height / (lines.length + 1));
  let cursorY = y + height / 2 + (lines.length * lineHeight) / 2 - lineHeight;
  for (const line of lines) {
    drawTextAt(ctx, line, x + width / 2, cursorY, { size: 9, align: "center" });
    cursorY -= lineHeight;
  }
}

export async function buildBusinessCardPdf(data: BusinessCardData): Promise<Uint8Array> {
  const cardSize = resolveCardSizePt(data);
  const ctx = await createPdfKit(cardSize, 0);
  await drawFront(ctx, data, 0, 0, cardSize[0], cardSize[1]);
  if (data.backEnabled) {
    ctx.page = ctx.doc.addPage(cardSize);
    drawBack(ctx, data, 0, 0, cardSize[0], cardSize[1]);
  }
  return finalizePdf(ctx);
}

/** A full print sheet (with crop marks) of the same card repeated as many times as fits. */
export async function buildBusinessCardSheetPdf(data: BusinessCardData, sheetId: "A4" | "LETTER"): Promise<Uint8Array> {
  const cardSize = resolveCardSizePt(data);
  const sheetSize = sheetId === "A4" ? PAGE_SIZES_PT.A4 : PAGE_SIZES_PT.LETTER;
  const layout = computeCardSheetLayout(sheetSize, cardSize);
  const ctx = await createPdfKit(sheetSize, layout.marginXPt);

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.columns; col++) {
      const x = layout.marginXPt + col * (cardSize[0] + layout.gapPt);
      const yTop = sheetSize[1] - layout.marginYPt - row * (cardSize[1] + layout.gapPt);
      const y = yTop - cardSize[1];
      await drawFront(ctx, data, x, y, cardSize[0], cardSize[1]);
      // Crop marks at each corner — short lines just outside the card, not a full border, matching real print-shop conventions.
      const markLen = mmToPoints(3);
      for (const [cx, cy] of [
        [x, y],
        [x + cardSize[0], y],
        [x, y + cardSize[1]],
        [x + cardSize[0], y + cardSize[1]],
      ]) {
        ctx.page.drawLine({ start: { x: cx - markLen, y: cy }, end: { x: cx + markLen, y: cy }, thickness: 0.4, color: rgb(0.5, 0.5, 0.5) });
        ctx.page.drawLine({ start: { x: cx, y: cy - markLen }, end: { x: cx, y: cy + markLen }, thickness: 0.4, color: rgb(0.5, 0.5, 0.5) });
      }
    }
  }

  return finalizePdf(ctx);
}

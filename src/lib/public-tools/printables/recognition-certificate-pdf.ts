import { rgb } from "pdf-lib";
import { createPdfKit, drawTextAt, drawRect, embedImageAuto, finalizePdf, wrapText, type PdfKitContext } from "@/lib/public-tools/documents/pdf-kit";
import { PAGE_SIZES_PT } from "@/lib/public-tools/documents/measurements";
import { hexToRgb } from "@/lib/public-tools/color-contrast";
import { CERTIFICATE_TYPE_LABELS, NOT_OFFICIAL_NOTICE, type RecognitionCertificateData } from "./recognition-certificate";

function accent(hex: string): [number, number, number] {
  const t = hexToRgb(hex);
  return t ? [t[0] / 255, t[1] / 255, t[2] / 255] : [0.71, 0.32, 0.04];
}

function drawSigners(ctx: PdfKitContext, data: RecognitionCertificateData): void {
  const signers = data.signerNames.map((name, i) => ({ name, title: data.signerTitles[i] ?? "" })).filter((s) => s.name.trim());
  if (signers.length === 0) return;
  const spacing = (ctx.pageWidth - 160) / signers.length;
  signers.forEach((signer, i) => {
    const x = 80 + spacing * i + spacing / 2;
    ctx.page.drawLine({ start: { x: x - 60, y: 80 }, end: { x: x + 60, y: 80 }, thickness: 0.75, color: rgb(0.5, 0.5, 0.5) });
    drawTextAt(ctx, signer.name, x, 66, { size: 10, font: ctx.bold, align: "center" });
    if (signer.title) drawTextAt(ctx, signer.title, x, 54, { size: 8.5, color: [0.4, 0.4, 0.4], align: "center" });
  });
}

function drawReasonAndFooter(ctx: PdfKitContext, data: RecognitionCertificateData, centerX: number, reasonTop: number, footerY: number): void {
  if (data.reason) {
    const lines = wrapText(data.reason, ctx.font, 12, ctx.pageWidth - 180);
    let y = reasonTop;
    for (const line of lines.slice(0, 4)) {
      drawTextAt(ctx, line, centerX, y, { size: 12, align: "center" });
      y -= 16;
    }
  }
  if (data.organizationName || data.date || data.place) {
    const line = [data.organizationName, data.place, data.date].filter(Boolean).join("  ·  ");
    drawTextAt(ctx, line, centerX, footerY, { size: 10, color: [0.4, 0.4, 0.4], align: "center" });
  }
  if (data.internalNumber) drawTextAt(ctx, `N.º interno: ${data.internalNumber}`, 40, 30, { size: 7, color: [0.55, 0.55, 0.55] });
  drawTextAt(ctx, NOT_OFFICIAL_NOTICE, centerX, 30, { size: 7, color: [0.55, 0.55, 0.55], align: "center" });
}

async function drawLogo(ctx: PdfKitContext, data: RecognitionCertificateData, centerX: number, topY: number): Promise<void> {
  if (!data.logoPngBytes || data.logoPngBytes.length === 0) return;
  const logo = await embedImageAuto(ctx, new Uint8Array(data.logoPngBytes), "image/png");
  if (!logo) return;
  const size = 50;
  const scale = Math.min(1, size / Math.max(logo.width, logo.height));
  ctx.page.drawImage(logo, { x: centerX - (logo.width * scale) / 2, y: topY, width: logo.width * scale, height: logo.height * scale });
}

/**
 * Six genuinely distinct templates (spec correction: "no presentes seis
 * variaciones cromáticas del mismo diseño") — different border treatment,
 * header shape, and typography per template, never only a recolor. Never
 * includes official seals, government emblems, copied signatures, simulated
 * holograms, license numbers, or fake verification codes (spec section 27).
 */
export async function buildRecognitionCertificatePdf(data: RecognitionCertificateData): Promise<Uint8Array> {
  const useSerif = data.template === "formal";
  const ctx = await createPdfKit([PAGE_SIZES_PT.LETTER[1], PAGE_SIZES_PT.LETTER[0]], 40, useSerif ? "times" : "helvetica");
  const [ar, ag, ab] = accent(data.accentColorHex);
  const centerX = ctx.pageWidth / 2;
  const typeLabel = CERTIFICATE_TYPE_LABELS[data.certificateType].toUpperCase();

  switch (data.template) {
    case "formal": {
      drawRect(ctx, 20, 20, ctx.pageWidth - 40, ctx.pageHeight - 40, { borderColor: [ar, ag, ab], borderWidth: 3 });
      drawRect(ctx, 30, 30, ctx.pageWidth - 60, ctx.pageHeight - 60, { borderColor: [ar, ag, ab], borderWidth: 0.75 });
      await drawLogo(ctx, data, centerX, ctx.pageHeight - 90);
      drawTextAt(ctx, typeLabel, centerX, ctx.pageHeight - 110, { size: 11, color: [ar, ag, ab], align: "center" });
      drawTextAt(ctx, data.recognitionName, centerX, ctx.pageHeight - 145, { size: 26, font: ctx.bold, align: "center" });
      drawTextAt(ctx, "Se otorga a", centerX, ctx.pageHeight - 195, { size: 11, color: [0.4, 0.4, 0.4], align: "center" });
      drawTextAt(ctx, data.recipientName || "Nombre de la persona", centerX, ctx.pageHeight - 235, { size: 30, font: ctx.bold, align: "center", color: [ar, ag, ab] });
      drawReasonAndFooter(ctx, data, centerX, ctx.pageHeight - 270, 110);
      drawSigners(ctx, data);
      break;
    }

    case "modern": {
      drawRect(ctx, 20, 20, ctx.pageWidth - 40, ctx.pageHeight - 40, { borderColor: [0.8, 0.8, 0.8], borderWidth: 0.75 });
      ctx.page.drawLine({ start: { x: 20, y: ctx.pageHeight - 60 }, end: { x: ctx.pageWidth - 20, y: ctx.pageHeight - 60 }, thickness: 3, color: rgb(ar, ag, ab) });
      ctx.page.drawLine({ start: { x: 20, y: 60 }, end: { x: ctx.pageWidth - 20, y: 60 }, thickness: 3, color: rgb(ar, ag, ab) });
      await drawLogo(ctx, data, centerX, ctx.pageHeight - 110);
      drawTextAt(ctx, typeLabel, centerX, ctx.pageHeight - 128, { size: 10, color: [ar, ag, ab], align: "center" });
      drawTextAt(ctx, data.recognitionName, centerX, ctx.pageHeight - 160, { size: 24, font: ctx.bold, align: "center" });
      drawTextAt(ctx, data.recipientName || "Nombre de la persona", centerX, ctx.pageHeight - 210, { size: 28, font: ctx.bold, align: "center" });
      drawReasonAndFooter(ctx, data, centerX, ctx.pageHeight - 245, 90);
      drawSigners(ctx, data);
      break;
    }

    case "school": {
      const bandHeight = 90;
      drawRect(ctx, 0, ctx.pageHeight - bandHeight, ctx.pageWidth, bandHeight, { color: [ar, ag, ab] });
      drawTextAt(ctx, data.recognitionName, centerX, ctx.pageHeight - bandHeight / 2 - 6, { size: 24, font: ctx.bold, align: "center", color: [1, 1, 1] });
      drawTextAt(ctx, typeLabel, centerX, ctx.pageHeight - bandHeight / 2 + 16, { size: 9.5, align: "center", color: [1, 1, 1] });
      drawRect(ctx, 20, 20, ctx.pageWidth - 40, ctx.pageHeight - bandHeight - 40, { borderColor: [ar, ag, ab], borderWidth: 1.25 });
      drawTextAt(ctx, "¡Felicidades!", centerX, ctx.pageHeight - bandHeight - 40, { size: 13, color: [ar, ag, ab], align: "center" });
      drawTextAt(ctx, data.recipientName || "Nombre de la persona", centerX, ctx.pageHeight - bandHeight - 78, { size: 28, font: ctx.bold, align: "center" });
      drawReasonAndFooter(ctx, data, centerX, ctx.pageHeight - bandHeight - 110, 90);
      drawSigners(ctx, data);
      break;
    }

    case "volunteering": {
      drawRect(ctx, 20, 20, ctx.pageWidth - 40, ctx.pageHeight - 40, { borderColor: [ar, ag, ab], borderWidth: 1.25 });
      const badgeR = 34;
      const badgeCx = ctx.pageWidth - 70;
      const badgeCy = ctx.pageHeight - 70;
      ctx.page.drawCircle({ x: badgeCx, y: badgeCy, size: badgeR, color: rgb(ar, ag, ab) });
      ctx.page.drawCircle({ x: badgeCx, y: badgeCy, size: badgeR - 6, borderColor: rgb(1, 1, 1), borderWidth: 1.5 });
      // A plain vector dot, not a text glyph — pdf-lib's WinAnsi standard-font encoding can't represent "♥" and would crash here.
      ctx.page.drawCircle({ x: badgeCx, y: badgeCy, size: 7, color: rgb(1, 1, 1) });
      await drawLogo(ctx, data, centerX - 100, ctx.pageHeight - 95);
      drawTextAt(ctx, typeLabel, 60, ctx.pageHeight - 100, { size: 10, color: [ar, ag, ab] });
      drawTextAt(ctx, data.recognitionName, 60, ctx.pageHeight - 130, { size: 22, font: ctx.bold });
      drawTextAt(ctx, "Se otorga a", centerX, ctx.pageHeight - 180, { size: 11, color: [0.4, 0.4, 0.4], align: "center" });
      drawTextAt(ctx, data.recipientName || "Nombre de la persona", centerX, ctx.pageHeight - 218, { size: 28, font: ctx.bold, align: "center", color: [ar, ag, ab] });
      drawReasonAndFooter(ctx, data, centerX, ctx.pageHeight - 252, 100);
      drawSigners(ctx, data);
      break;
    }

    case "gratitude": {
      // No border box at all — deliberately understated, generous whitespace.
      drawTextAt(ctx, typeLabel, centerX, ctx.pageHeight - 120, { size: 10, color: [0.5, 0.5, 0.5], align: "center" });
      drawTextAt(ctx, "Gracias", centerX, ctx.pageHeight - 175, { size: 40, font: ctx.bold, align: "center", color: [ar, ag, ab] });
      drawTextAt(ctx, data.recognitionName, centerX, ctx.pageHeight - 205, { size: 13, align: "center", color: [0.4, 0.4, 0.4] });
      drawTextAt(ctx, data.recipientName || "Nombre de la persona", centerX, ctx.pageHeight - 255, { size: 24, font: ctx.bold, align: "center" });
      drawReasonAndFooter(ctx, data, centerX, ctx.pageHeight - 290, 90);
      drawSigners(ctx, data);
      break;
    }

    case "participation": {
      drawRect(ctx, 20, 20, ctx.pageWidth - 40, ctx.pageHeight - 40, { borderColor: [ar, ag, ab], borderWidth: 1.25 });
      const stubX = ctx.pageWidth - 150;
      const dashCount = 24;
      for (let i = 0; i < dashCount; i++) {
        const segY = 30 + ((ctx.pageHeight - 60) / dashCount) * i;
        ctx.page.drawLine({ start: { x: stubX, y: segY }, end: { x: stubX, y: segY + (ctx.pageHeight - 60) / dashCount / 2 }, thickness: 1, color: rgb(ar, ag, ab) });
      }
      const mainCenterX = (20 + stubX) / 2;
      drawTextAt(ctx, typeLabel, mainCenterX, ctx.pageHeight - 105, { size: 10, color: [ar, ag, ab], align: "center" });
      drawTextAt(ctx, data.recognitionName, mainCenterX, ctx.pageHeight - 135, { size: 22, font: ctx.bold, align: "center" });
      drawTextAt(ctx, data.recipientName || "Nombre de la persona", mainCenterX, ctx.pageHeight - 185, { size: 26, font: ctx.bold, align: "center", color: [ar, ag, ab] });
      if (data.reason) {
        const lines = wrapText(data.reason, ctx.font, 11, stubX - 60);
        let y = ctx.pageHeight - 220;
        for (const line of lines.slice(0, 3)) {
          drawTextAt(ctx, line, mainCenterX, y, { size: 11, align: "center" });
          y -= 15;
        }
      }
      if (data.organizationName || data.date) drawTextAt(ctx, [data.organizationName, data.date].filter(Boolean).join(" · "), mainCenterX, 90, { size: 9.5, color: [0.4, 0.4, 0.4], align: "center" });
      drawTextAt(ctx, data.recognitionName, stubX + (ctx.pageWidth - 20 - stubX) / 2, ctx.pageHeight - 120, { size: 9, font: ctx.bold, align: "center" });
      drawTextAt(ctx, data.recipientName || "—", stubX + (ctx.pageWidth - 20 - stubX) / 2, ctx.pageHeight - 145, { size: 9, align: "center" });
      if (data.date) drawTextAt(ctx, data.date, stubX + (ctx.pageWidth - 20 - stubX) / 2, ctx.pageHeight - 165, { size: 8, color: [0.4, 0.4, 0.4], align: "center" });
      drawTextAt(ctx, NOT_OFFICIAL_NOTICE, mainCenterX, 30, { size: 7, color: [0.55, 0.55, 0.55], align: "center" });
      if (data.internalNumber) drawTextAt(ctx, `N.º interno: ${data.internalNumber}`, 40, 30, { size: 7, color: [0.55, 0.55, 0.55] });
      break;
    }
  }

  return finalizePdf(ctx);
}

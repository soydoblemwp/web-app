import { buildSvgDocument, type SvgNode } from "@/lib/public-tools/documents/svg-safe";
import { resolveCardSizePt, type BusinessCardData } from "./business-card";

async function qrFragment(data: BusinessCardData, size: number): Promise<SvgNode | null> {
  if (!data.showQr || !data.qrValue.trim()) return null;
  try {
    const { default: QRCode } = await import("qrcode");
    const qrSvg: string = await QRCode.toString(data.qrValue, { type: "svg", margin: 0, width: 200 });
    const inner = qrSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    return { kind: "raw-trusted", markup: `<svg width="${size}" height="${size}" viewBox="0 0 200 200">${inner}</svg>` };
  } catch {
    return null; // A QR that fails to render is skipped — the rest of the card is still valid.
  }
}

/**
 * Single-card SVG export — download-only (never injected into the DOM), so
 * every visitor string goes through `svg-safe.ts`'s XML escaping. The QR
 * fragment is generated entirely by the `qrcode` library (trusted output),
 * never raw visitor text. SVG's coordinate system is top-down (y increases
 * downward), the opposite of pdf-lib's bottom-up space that
 * `business-card-pdf.ts` uses — every y here starts small (near the top)
 * and grows going down the card, deliberately not copy-pasted from the PDF
 * builder's cursor math (a real inverted-layout bug from the first Fase 47
 * pass, found and fixed during this correction).
 */
export async function buildBusinessCardSvg(data: BusinessCardData): Promise<string> {
  const [width, height] = resolveCardSizePt(data);
  const padding = 12;
  const contactLines = [data.phone, data.email, data.website, data.address].filter(Boolean);
  const nodes: SvgNode[] = [{ kind: "rect", x: 0.5, y: 0.5, width: width - 1, height: height - 1, stroke: "#d9d9d9", strokeWidth: 1 }];

  if (data.template === "corporate") {
    const bandHeight = height * 0.42;
    nodes.push({ kind: "rect", x: 0, y: 0, width, height: bandHeight, fill: data.accentColorHex });
    nodes.push({ kind: "text", x: padding, y: bandHeight - 18, text: data.name || "Nombre", size: 11.5, bold: true, color: "#ffffff" });
    if (data.jobTitle) nodes.push({ kind: "text", x: padding, y: bandHeight - 6, text: data.jobTitle, size: 8, color: "#ffffff" });
    let y = bandHeight + 14;
    if (data.company) {
      nodes.push({ kind: "text", x: padding, y, text: data.company, size: 8.5, bold: true });
      y += 13;
    }
    for (const line of contactLines) {
      nodes.push({ kind: "text", x: padding, y, text: line, size: 7.5, color: "#4d4d4d" });
      y += 10;
    }
  } else if (data.template === "creative") {
    const radius = Math.min(height * 0.32, 24);
    const cx = width - padding - radius;
    const cy = padding + radius;
    nodes.push({ kind: "circle", cx, cy, r: radius, fill: data.accentColorHex });
    const initial = (data.name || "?").trim().charAt(0).toLocaleUpperCase("es-ES");
    nodes.push({ kind: "text", x: cx, y: cy + radius * 0.35, text: initial, size: radius, bold: true, color: "#ffffff", anchor: "middle" });
    let y = height * 0.62;
    nodes.push({ kind: "text", x: padding, y, text: data.name || "Nombre", size: 13, bold: true });
    y += 14;
    if (data.jobTitle || data.company) {
      nodes.push({ kind: "text", x: padding, y, text: [data.jobTitle, data.company].filter(Boolean).join(" · "), size: 8, color: data.accentColorHex });
      y += 13;
    }
    for (const line of contactLines) {
      nodes.push({ kind: "text", x: padding, y, text: line, size: 7.5, color: "#4d4d4d" });
      y += 10;
    }
  } else if (data.template === "vertical") {
    const centerX = width / 2;
    let y = padding + 20;
    nodes.push({ kind: "text", x: centerX, y, text: data.name || "Nombre", size: 12, bold: true, color: data.accentColorHex, anchor: "middle" });
    y += 14;
    if (data.jobTitle) {
      nodes.push({ kind: "text", x: centerX, y, text: data.jobTitle, size: 8, color: "#666666", anchor: "middle" });
      y += 12;
    }
    if (data.company) {
      nodes.push({ kind: "text", x: centerX, y, text: data.company, size: 8.5, bold: true, anchor: "middle" });
      y += 14;
    }
    y += 6;
    for (const line of contactLines) {
      nodes.push({ kind: "text", x: centerX, y, text: line, size: 7.5, color: "#4d4d4d", anchor: "middle" });
      y += 10;
    }
  } else {
    // minimal and professional: a left accent bar is the only structural difference between the two.
    const barWidth = data.template === "professional" ? Math.min(6, width * 0.03) : 0;
    if (barWidth > 0) nodes.push({ kind: "rect", x: 0, y: 0, width: barWidth, height, fill: data.accentColorHex });
    const textX = padding + barWidth;
    let y = padding + 10;
    nodes.push({ kind: "text", x: textX, y, text: data.name || "Nombre", size: 12, bold: true, color: data.template === "minimal" ? data.accentColorHex : undefined });
    y += 14;
    if (data.jobTitle) {
      nodes.push({ kind: "text", x: textX, y, text: data.jobTitle, size: 8.5, color: data.template === "professional" ? data.accentColorHex : "#666666" });
      y += 11;
    }
    if (data.company) {
      nodes.push({ kind: "text", x: textX, y, text: data.company, size: 8.5, bold: true });
      y += 14;
    }
    for (const line of contactLines) {
      nodes.push({ kind: "text", x: textX, y, text: line, size: 7.5, color: "#4d4d4d" });
      y += 10;
    }
  }

  const qrSize = Math.min(height - padding * 2, data.template === "vertical" ? width - padding * 2 : 40);
  const qr = await qrFragment(data, qrSize);
  if (qr && qr.kind === "raw-trusted") {
    qr.x = data.template === "vertical" ? width / 2 - qrSize / 2 : width - padding - qrSize;
    qr.y = height - padding - qrSize;
    nodes.push(qr);
  }

  return buildSvgDocument(width, height, nodes);
}

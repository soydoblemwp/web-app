import { buildSvgDocument, type SvgNode } from "@/lib/public-tools/documents/svg-safe";
import { mmToPoints } from "@/lib/public-tools/documents/measurements";
import type { LabelItem, LabelsData } from "./labels";

/** Single-label SVG export — download-only, escaped visitor text, QR fragment from the trusted `qrcode` library output only (same safety pattern as `business-card-svg.ts`). */
export async function buildSingleLabelSvg(item: LabelItem, data: LabelsData): Promise<string> {
  const width = mmToPoints(data.widthMm);
  const height = mmToPoints(data.heightMm);
  const nodes: SvgNode[] = [];
  if (data.showBorder) nodes.push({ kind: "rect", x: 0.5, y: 0.5, width: width - 1, height: height - 1, stroke: "#bfbfbf", strokeWidth: 1 });

  const padding = 4;
  let cursorY = height - padding - data.fontSizePt;
  if (item.text) {
    nodes.push({ kind: "text", x: padding, y: cursorY, text: item.text, size: data.fontSizePt, bold: true });
    cursorY -= data.fontSizePt + 2;
  }
  if (item.description) {
    nodes.push({ kind: "text", x: padding, y: cursorY, text: item.description, size: data.fontSizePt - 1.5, color: "#595959" });
    cursorY -= data.fontSizePt;
  }
  if (item.sku) {
    nodes.push({ kind: "text", x: padding, y: cursorY, text: item.sku, size: data.fontSizePt - 2, color: "#808080" });
  }
  if (item.price) {
    nodes.push({ kind: "text", x: padding, y: padding + data.fontSizePt, text: item.price, size: data.fontSizePt + 1, bold: true });
  }

  if (item.qrValue.trim()) {
    try {
      const { default: QRCode } = await import("qrcode");
      const qrSvg: string = await QRCode.toString(item.qrValue, { type: "svg", margin: 0, width: 200 });
      const inner = qrSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
      const qrSize = Math.min(height - padding * 2, width * 0.35);
      nodes.push({ kind: "raw-trusted", markup: `<svg width="${qrSize}" height="${qrSize}" viewBox="0 0 200 200">${inner}</svg>`, x: width - padding - qrSize, y: padding });
    } catch {
      // A QR that fails to render is skipped — the rest of the label is still valid.
    }
  }

  return buildSvgDocument(width, height, nodes);
}

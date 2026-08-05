import { StandardFonts, rgb, degrees } from "pdf-lib";
import { loadPdfDocument } from "./load";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";

export type WatermarkPosition = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "diagonal";

export const WATERMARK_PRESETS = ["CONFIDENCIAL", "BORRADOR", "COPIA", "NO DISTRIBUIR"] as const;

export interface WatermarkOptions {
  text: string;
  pages: "all" | number[];
  position: WatermarkPosition;
  rotationDegrees: number;
  fontSize: number;
  opacity: number;
  color: { r: number; g: number; b: number };
  repeat: boolean;
  marginPt: number;
}

export interface WatermarkResult {
  ok: boolean;
  error?: FileErrorResult;
  bytes?: Uint8Array;
}

const CONTROL_CHARS_PATTERN = new RegExp(`[\\x00-\\x1f\\x7f]`, "g");
const MAX_WATERMARK_TEXT_LENGTH = 80;

/** Only ever draws the text as literal PDF glyphs via pdf-lib's drawText — there is no HTML/JS execution path here to sanitize against, but control characters and an excessive length are still stripped defensively. */
function sanitizeWatermarkText(raw: string): string {
  return raw.replace(CONTROL_CHARS_PATTERN, "").slice(0, MAX_WATERMARK_TEXT_LENGTH).trim();
}

function positionFor(position: WatermarkPosition, pageWidth: number, pageHeight: number, textWidth: number, textHeight: number, margin: number): { x: number; y: number } {
  switch (position) {
    case "top-left":
      return { x: margin, y: pageHeight - margin - textHeight };
    case "top-right":
      return { x: pageWidth - margin - textWidth, y: pageHeight - margin - textHeight };
    case "bottom-left":
      return { x: margin, y: margin };
    case "bottom-right":
      return { x: pageWidth - margin - textWidth, y: margin };
    case "center":
    case "diagonal":
    default:
      return { x: (pageWidth - textWidth) / 2, y: (pageHeight - textHeight) / 2 };
  }
}

/**
 * Draws a text-only watermark on the requested pages (spec section 15).
 * Never accepts HTML/JS or a remote font URL — only a plain string drawn
 * with pdf-lib's built-in Helvetica, embedded once per document.
 */
export async function applyWatermark(bytes: Uint8Array, options: WatermarkOptions): Promise<WatermarkResult> {
  const text = sanitizeWatermarkText(options.text);
  if (!text) return { ok: false, error: buildFileError("limit-exceeded", "Escribe el texto de la marca de agua.") };

  const loadResult = await loadPdfDocument(bytes);
  if (!loadResult.ok || !loadResult.document) return { ok: false, error: loadResult.error };
  const document = loadResult.document;
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const pages = document.getPages();
  const targetIndices = options.pages === "all" ? pages.map((_, i) => i) : options.pages;

  for (const index of targetIndices) {
    if (index < 0 || index >= pages.length) continue;
    const page = pages[index];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize);
    const rotation = options.position === "diagonal" ? Math.atan2(pageHeight, pageWidth) * (180 / Math.PI) : options.rotationDegrees;

    const drawOnePlacement = (x: number, y: number) => {
      page.drawText(text, {
        x,
        y,
        size: options.fontSize,
        font,
        color: rgb(options.color.r, options.color.g, options.color.b),
        opacity: options.opacity,
        rotate: degrees(rotation),
      });
    };

    if (!options.repeat) {
      const { x, y } = positionFor(options.position, pageWidth, pageHeight, textWidth, textHeight, options.marginPt);
      drawOnePlacement(x, y);
    } else {
      const stepX = textWidth + options.marginPt * 3;
      const stepY = textHeight + options.marginPt * 3;
      for (let y = options.marginPt; y < pageHeight; y += stepY) {
        for (let x = options.marginPt; x < pageWidth; x += stepX) {
          drawOnePlacement(x, y);
        }
      }
    }
  }

  const outputBytes = await document.save();
  return { ok: true, bytes: outputBytes };
}

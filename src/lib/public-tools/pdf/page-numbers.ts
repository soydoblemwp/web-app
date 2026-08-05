import { StandardFonts, rgb } from "pdf-lib";
import { loadPdfDocument } from "./load";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";

export type PageNumberPosition = "bottom-center" | "bottom-left" | "bottom-right" | "top-center" | "top-left" | "top-right";
export type PageNumberFormat = "number" | "pagina-number" | "number-de-total" | "pagina-number-de-total";

export interface PageNumberOptions {
  position: PageNumberPosition;
  startNumber: number;
  prefix?: string;
  suffix?: string;
  format: PageNumberFormat;
  fontSize: number;
  color: { r: number; g: number; b: number };
  marginPt: number;
  excludeCover: boolean;
  excludeLastPage: boolean;
}

export interface PageNumberResult {
  ok: boolean;
  error?: FileErrorResult;
  bytes?: Uint8Array;
}

function formatLabel(format: PageNumberFormat, number: number, total: number): string {
  switch (format) {
    case "number":
      return String(number);
    case "pagina-number":
      return `Página ${number}`;
    case "number-de-total":
      return `${number} de ${total}`;
    case "pagina-number-de-total":
      return `Página ${number} de ${total}`;
  }
}

function positionFor(position: PageNumberPosition, pageWidth: number, pageHeight: number, textWidth: number, margin: number): { x: number; y: number } {
  const bottomY = margin;
  const topY = pageHeight - margin - 10;
  switch (position) {
    case "bottom-left":
      return { x: margin, y: bottomY };
    case "bottom-right":
      return { x: pageWidth - margin - textWidth, y: bottomY };
    case "top-left":
      return { x: margin, y: topY };
    case "top-right":
      return { x: pageWidth - margin - textWidth, y: topY };
    case "top-center":
      return { x: (pageWidth - textWidth) / 2, y: topY };
    case "bottom-center":
    default:
      return { x: (pageWidth - textWidth) / 2, y: bottomY };
  }
}

/**
 * Numbers pages without touching anything else about the document (spec
 * section 16: "no modifiques el orden ni contenido del PDF salvo la
 * numeración solicitada"). Cover/last-page exclusion simply skips drawing on
 * those indices — the counting sequence itself still advances normally
 * across the whole document so numbers stay consistent with a physically
 * printed copy.
 */
export async function applyPageNumbers(bytes: Uint8Array, options: PageNumberOptions): Promise<PageNumberResult> {
  if (!Number.isFinite(options.startNumber) || options.startNumber < 0) {
    return { ok: false, error: buildFileError("limit-exceeded", "El número inicial debe ser 0 o mayor.") };
  }
  if (options.fontSize <= 0 || options.fontSize > 72) {
    return { ok: false, error: buildFileError("limit-exceeded", "El tamaño de fuente debe estar entre 1 y 72.") };
  }

  const loadResult = await loadPdfDocument(bytes);
  if (!loadResult.ok || !loadResult.document) return { ok: false, error: loadResult.error };
  const document = loadResult.document;
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  const total = pages.length;

  pages.forEach((page, index) => {
    if (options.excludeCover && index === 0) return;
    if (options.excludeLastPage && index === total - 1) return;

    const number = options.startNumber + index;
    const label = `${options.prefix ?? ""}${formatLabel(options.format, number, total)}${options.suffix ?? ""}`.slice(0, 60);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const textWidth = font.widthOfTextAtSize(label, options.fontSize);
    const { x, y } = positionFor(options.position, pageWidth, pageHeight, textWidth, options.marginPt);

    page.drawText(label, { x, y, size: options.fontSize, font, color: rgb(options.color.r, options.color.g, options.color.b) });
  });

  const outputBytes = await document.save();
  return { ok: true, bytes: outputBytes };
}

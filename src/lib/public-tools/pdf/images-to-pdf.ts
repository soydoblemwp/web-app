import { PDFDocument, type PDFImage } from "pdf-lib";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";

export type PdfPageSizeOption = "auto" | "a4" | "letter" | "legal";
export type ImageFitMode = "contain" | "cover" | "actual";
export type PdfOrientation = "portrait" | "landscape" | "auto";

/** Already browser-decoded, embeddable image bytes — WebP is converted to PNG via Canvas by the caller before reaching this core (pdf-lib cannot embed WebP directly), so this pure function stays DOM-free and testable in Node. */
export interface EmbeddableImageInput {
  bytes: Uint8Array;
  format: "jpg" | "png";
  width: number;
  height: number;
}

export interface ImagesToPdfOptions {
  pageSize: PdfPageSizeOption;
  orientation: PdfOrientation;
  marginPt: number;
  fit: ImageFitMode;
}

export interface ImagesToPdfResult {
  ok: boolean;
  error?: FileErrorResult;
  bytes?: Uint8Array;
  pageCount?: number;
}

const A4_PT: [number, number] = [595.28, 841.89];
const LETTER_PT: [number, number] = [612, 792];
const LEGAL_PT: [number, number] = [612, 1008];

function pageSizeFor(option: PdfPageSizeOption, imageWidth: number, imageHeight: number, orientation: PdfOrientation): [number, number] {
  if (option === "auto") return [imageWidth, imageHeight];

  const base = option === "a4" ? A4_PT : option === "letter" ? LETTER_PT : LEGAL_PT;
  const isImageLandscape = imageWidth > imageHeight;
  const wantsLandscape = orientation === "landscape" || (orientation === "auto" && isImageLandscape);
  return wantsLandscape ? [Math.max(base[0], base[1]), Math.min(base[0], base[1])] : [Math.min(base[0], base[1]), Math.max(base[0], base[1])];
}

/**
 * Builds one PDF with exactly one image per page (spec section 13). Never
 * distorts an image's aspect ratio — "contain"/"cover" both scale
 * uniformly; only the crop/letterboxing differs. Never claims to preserve
 * transparency: a PNG's alpha channel is composited onto the page's white
 * background here, matching what pdf-lib's `drawImage` actually does (PDF
 * pages have no alpha channel of their own).
 */
export async function buildPdfFromImages(images: EmbeddableImageInput[], options: ImagesToPdfOptions): Promise<ImagesToPdfResult> {
  if (images.length === 0) return { ok: false, error: buildFileError("limit-exceeded", "Añade al menos una imagen.") };

  const doc = await PDFDocument.create();

  for (const image of images) {
    const embedded: PDFImage = image.format === "jpg" ? await doc.embedJpg(image.bytes) : await doc.embedPng(image.bytes);

    const [pageWidth, pageHeight] = pageSizeFor(options.pageSize, image.width, image.height, options.orientation);
    const page = doc.addPage([pageWidth, pageHeight]);

    const margin = Math.max(0, options.marginPt);
    const availableWidth = Math.max(1, pageWidth - margin * 2);
    const availableHeight = Math.max(1, pageHeight - margin * 2);

    let drawWidth: number;
    let drawHeight: number;

    if (options.fit === "actual") {
      drawWidth = image.width;
      drawHeight = image.height;
    } else {
      const scaleContain = Math.min(availableWidth / image.width, availableHeight / image.height);
      const scaleCover = Math.max(availableWidth / image.width, availableHeight / image.height);
      const scale = options.fit === "cover" ? scaleCover : scaleContain;
      drawWidth = image.width * scale;
      drawHeight = image.height * scale;
    }

    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;
    page.drawImage(embedded, { x, y, width: drawWidth, height: drawHeight });
  }

  const bytes = await doc.save();
  return { ok: true, bytes, pageCount: images.length };
}

export function pdfPageSizeLabel(option: PdfPageSizeOption): string {
  return { auto: "Automático (tamaño de la imagen)", a4: "A4", letter: "Carta", legal: "Legal" }[option];
}

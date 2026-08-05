import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import type { PageSizePt } from "./measurements";

/**
 * Shared, generic "build a PDF page by page" engine (spec section 8-9: "no
 * existe un núcleo genérico de construcción de PDF — créalo una vez, no lo
 * dupliques en cada herramienta"). Generalizes the flowing-text-document
 * pattern that `business/business-document-pdf.ts` established for
 * invoices/estimates (Fase 42) so every Fase 47 document tool (resume, cover
 * letter, receipt, purchase order, delivery note, planner, checklist,
 * agenda/minutes) shares one wrapping/pagination/font implementation instead
 * of each reinventing it. Free-form tools (business card, calendar,
 * certificate, labels) use the same low-level primitives (`drawRect`,
 * `drawTextAt`, `drawHorizontalRule`) without the auto-flow helpers.
 */

export type FontFamily = "helvetica" | "times";

export interface PdfKitContext {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  pageSize: PageSizePt;
}

const FONT_MAP: Record<FontFamily, { regular: StandardFonts; bold: StandardFonts }> = {
  helvetica: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold },
  times: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold },
};

export async function createPdfKit(pageSize: PageSizePt, margin = 40, fontFamily: FontFamily = "helvetica"): Promise<PdfKitContext> {
  const doc = await PDFDocument.create();
  const fonts = FONT_MAP[fontFamily];
  const font = await doc.embedFont(fonts.regular);
  const bold = await doc.embedFont(fonts.bold);
  const [pageWidth, pageHeight] = pageSize;
  const page = doc.addPage(pageSize);
  return { doc, font, bold, page, y: pageHeight - margin, pageWidth, pageHeight, margin, pageSize };
}

export function newPage(ctx: PdfKitContext): void {
  ctx.page = ctx.doc.addPage(ctx.pageSize);
  ctx.y = ctx.pageHeight - ctx.margin;
}

/** Starts a fresh page only if there isn't enough vertical room left — the core anti-overflow guard every flowing tool relies on. */
export function ensureSpace(ctx: PdfKitContext, needed: number): void {
  if (ctx.y - needed < ctx.margin) newPage(ctx);
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export type RgbColor = [number, number, number];

interface DrawLineOptions {
  size?: number;
  font?: PDFFont;
  x?: number;
  color?: RgbColor;
}

/** Draws one line of text at the current cursor and advances it — the single-line building block every flowing document uses. */
export function drawLine(ctx: PdfKitContext, text: string, options: DrawLineOptions = {}): void {
  const size = options.size ?? 10;
  const font = options.font ?? ctx.font;
  const [r, g, b] = options.color ?? [0.1, 0.1, 0.1];
  ensureSpace(ctx, size + 4);
  ctx.page.drawText(text, { x: options.x ?? ctx.margin, y: ctx.y, size, font, color: rgb(r, g, b) });
  ctx.y -= size + 4;
}

interface DrawParagraphOptions extends DrawLineOptions {
  maxWidth?: number;
  lineGap?: number;
}

/** Wraps `text` to fit `maxWidth` (defaults to the full text column) and draws every resulting line, advancing the cursor for each. */
export function drawParagraph(ctx: PdfKitContext, text: string, options: DrawParagraphOptions = {}): void {
  const size = options.size ?? 10;
  const font = options.font ?? ctx.font;
  const maxWidth = options.maxWidth ?? ctx.pageWidth - ctx.margin * 2;
  for (const line of wrapText(text, font, size, maxWidth)) {
    drawLine(ctx, line, { ...options, size, font });
  }
}

export function drawHorizontalRule(ctx: PdfKitContext, options: { color?: RgbColor; thickness?: number; gapAfter?: number } = {}): void {
  const [r, g, b] = options.color ?? [0.75, 0.75, 0.75];
  const thickness = options.thickness ?? 0.75;
  ensureSpace(ctx, thickness + (options.gapAfter ?? 8));
  ctx.page.drawLine({ start: { x: ctx.margin, y: ctx.y }, end: { x: ctx.pageWidth - ctx.margin, y: ctx.y }, thickness, color: rgb(r, g, b) });
  ctx.y -= options.gapAfter ?? 8;
}

/** Absolute-position primitive (no cursor tracking) for free-form layouts — cards, calendars, certificates, label sheets. */
export function drawTextAt(ctx: PdfKitContext, text: string, x: number, y: number, options: DrawLineOptions & { align?: "left" | "center" | "right" } = {}): void {
  const size = options.size ?? 10;
  const font = options.font ?? ctx.font;
  const [r, g, b] = options.color ?? [0.1, 0.1, 0.1];
  let drawX = x;
  if (options.align === "center") drawX = x - font.widthOfTextAtSize(text, size) / 2;
  else if (options.align === "right") drawX = x - font.widthOfTextAtSize(text, size);
  ctx.page.drawText(text, { x: drawX, y, size, font, color: rgb(r, g, b) });
}

export function drawRect(ctx: PdfKitContext, x: number, y: number, width: number, height: number, options: { color?: RgbColor; borderColor?: RgbColor; borderWidth?: number } = {}): void {
  ctx.page.drawRectangle({
    x,
    y,
    width,
    height,
    color: options.color ? rgb(...options.color) : undefined,
    borderColor: options.borderColor ? rgb(...options.borderColor) : undefined,
    borderWidth: options.borderColor ? (options.borderWidth ?? 1) : undefined,
  });
}

/** Embeds a logo/photo image, silently skipping it if the bytes are corrupt/unsupported rather than aborting the whole document (matches the existing invoice tool's behavior). */
export async function embedImageAuto(ctx: PdfKitContext, bytes: Uint8Array, mimeType: string): Promise<PDFImage | null> {
  try {
    if (mimeType === "image/png") return await ctx.doc.embedPng(bytes);
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") return await ctx.doc.embedJpg(bytes);
    return await ctx.doc.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function finalizePdf(ctx: PdfKitContext): Promise<Uint8Array> {
  return ctx.doc.save();
}

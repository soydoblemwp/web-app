import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";
import { FILE_LIMITS } from "@/lib/public-tools/files/limits";

/**
 * pdfjs-dist is only ever imported by this module, and this module is only
 * ever reached via a dynamic `import()` from the two tools that actually
 * render PDF pages as images (PDF a imágenes, and Organizar PDF's
 * thumbnails) — spec section 36: never part of the initial bundle for
 * `/herramientas` or any unrelated tool. The worker URL is resolved via
 * `new URL(..., import.meta.url)`, the standard bundler-safe pattern so
 * Turbopack/webpack emit the worker as its own chunk instead of inlining it.
 */
let workerConfigured = false;
function ensureWorkerConfigured(): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  workerConfigured = true;
}

export interface LoadPdfForRenderResult {
  ok: boolean;
  error?: FileErrorResult;
  document?: PDFDocumentProxy;
  pageCount?: number;
}

export async function loadPdfForRendering(bytes: Uint8Array): Promise<LoadPdfForRenderResult> {
  ensureWorkerConfigured();
  if (bytes.byteLength === 0) return { ok: false, error: buildFileError("empty-file") };

  try {
    const document = await pdfjsLib.getDocument({ data: bytes }).promise;
    if (document.numPages > FILE_LIMITS.pdf.maxTotalPages) {
      return { ok: false, error: buildFileError("limit-exceeded", `El documento supera el límite de ${FILE_LIMITS.pdf.maxTotalPages} páginas.`) };
    }
    return { ok: true, document, pageCount: document.numPages };
  } catch (err) {
    if (err instanceof pdfjsLib.PasswordException) {
      return { ok: false, error: buildFileError("encrypted") };
    }
    return { ok: false, error: buildFileError("corrupted") };
  }
}

const MAX_RENDER_SCALE = 4;

/** Renders one PDF page onto a caller-supplied canvas at the given scale (1 = 72 DPI). Scale is clamped so a visitor can never request an unbounded-resolution render that would freeze the tab. */
export async function renderPdfPageToCanvas(document: PDFDocumentProxy, pageNumber: number, scale: number, canvas: HTMLCanvasElement): Promise<void> {
  const page = await document.getPage(pageNumber);
  const clampedScale = Math.min(Math.max(scale, 0.1), MAX_RENDER_SCALE);
  const viewport = page.getViewport({ scale: clampedScale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas-context");
  const renderTask = page.render({ canvas, canvasContext: ctx, viewport });
  await renderTask.promise;
}

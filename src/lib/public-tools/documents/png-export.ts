import { loadPdfForRendering, renderPdfPageToCanvas } from "@/lib/public-tools/pdf/render";
import { canvasToBlob } from "@/lib/public-tools/files/image-io";

/**
 * PNG export for every Fase 47 document tool is deliberately NOT a second,
 * independent Canvas-drawing implementation — it rasterizes the exact same
 * PDF bytes already built by `pdf-kit.ts`/the tool's own PDF builder, reusing
 * the existing `pdfjs-dist` renderer from the Fase 42 "PDF a imágenes" tool
 * (`pdf/render.ts`). This guarantees the PDF and PNG outputs are always
 * visually identical and avoids maintaining layout logic twice per tool.
 */
export async function renderPdfPageToPngBlob(pdfBytes: Uint8Array, pageNumber: number, scale: number): Promise<Blob> {
  const loaded = await loadPdfForRendering(pdfBytes);
  if (!loaded.ok || !loaded.document) {
    throw new Error(loaded.error?.message ?? "No se pudo preparar el PDF para exportarlo como PNG.");
  }
  const canvas = document.createElement("canvas");
  await renderPdfPageToCanvas(loaded.document, pageNumber, scale, canvas);
  return canvasToBlob(canvas, "image/png");
}

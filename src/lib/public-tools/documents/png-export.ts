import { canvasToBlob } from "@/lib/public-tools/files/image-io";

/**
 * PNG export for every Fase 47 document tool is deliberately NOT a second,
 * independent Canvas-drawing implementation — it rasterizes the exact same
 * PDF bytes already built by `pdf-kit.ts`/the tool's own PDF builder, reusing
 * the existing `pdfjs-dist` renderer from the Fase 42 "PDF a imágenes" tool
 * (`pdf/render.ts`). This guarantees the PDF and PNG outputs are always
 * visually identical and avoids maintaining layout logic twice per tool.
 *
 * `pdf/render.ts` is imported lazily (dynamic `import()`), matching the
 * pattern its own doc comment requires and the one "PDF a imágenes"/
 * "Organizar PDF" already use — a static top-level import here previously
 * pulled `pdfjs-dist` (a browser-only library that references `DOMMatrix`)
 * into every tool that calls this function, including ones with no PDF
 * preview at all (currículum, tarjetas, etiquetas, calendarios, planificador,
 * certificados). Those tools' `"use client"` components are still eligible
 * for server-side prerendering of their `/herramientas/[slug]` page unless
 * explicitly opted out, so evaluating `pdfjs-dist` at module scope broke
 * static generation in an environment where it resolved to a Node-unsafe
 * code path — a lazy import means it only ever loads inside the browser,
 * at the moment a visitor actually triggers a PNG export.
 */
export async function renderPdfPageToPngBlob(pdfBytes: Uint8Array, pageNumber: number, scale: number): Promise<Blob> {
  const { loadPdfForRendering, renderPdfPageToCanvas } = await import("@/lib/public-tools/pdf/render");
  const loaded = await loadPdfForRendering(pdfBytes);
  if (!loaded.ok || !loaded.document) {
    throw new Error(loaded.error?.message ?? "No se pudo preparar el PDF para exportarlo como PNG.");
  }
  const canvas = document.createElement("canvas");
  await renderPdfPageToCanvas(loaded.document, pageNumber, scale, canvas);
  return canvasToBlob(canvas, "image/png");
}

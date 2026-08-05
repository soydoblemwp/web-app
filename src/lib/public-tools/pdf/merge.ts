import { PDFDocument } from "pdf-lib";
import { loadPdfDocument } from "./load";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";
import { FILE_LIMITS } from "@/lib/public-tools/files/limits";

export interface MergeInput {
  name: string;
  bytes: Uint8Array;
}

export interface MergeResult {
  ok: boolean;
  error?: FileErrorResult;
  bytes?: Uint8Array;
  totalPages?: number;
}

/**
 * Merges PDFs strictly in the order given (spec section 10: "el resultado
 * debe respetar exactamente el orden elegido") — never re-sorts by name or
 * size. Never mutates any of the source documents; only ever reads pages
 * out of them into a brand-new PDFDocument.
 */
export async function mergePdfs(inputs: MergeInput[]): Promise<MergeResult> {
  if (inputs.length < 2) return { ok: false, error: buildFileError("limit-exceeded", "Selecciona al menos 2 archivos PDF para unir.") };
  if (inputs.length > FILE_LIMITS.pdf.maxFilesToMerge) {
    return { ok: false, error: buildFileError("too-many-files", `Puedes unir como máximo ${FILE_LIMITS.pdf.maxFilesToMerge} archivos a la vez.`) };
  }

  const totalBytes = inputs.reduce((sum, i) => sum + i.bytes.byteLength, 0);
  if (totalBytes > FILE_LIMITS.pdf.maxTotalBytes) {
    return { ok: false, error: buildFileError("limit-exceeded", `El tamaño combinado supera el límite de ${Math.round(FILE_LIMITS.pdf.maxTotalBytes / (1024 * 1024))} MB.`) };
  }

  const merged = await PDFDocument.create();
  let totalPages = 0;

  for (const input of inputs) {
    const loadResult = await loadPdfDocument(input.bytes, input.name);
    if (!loadResult.ok || !loadResult.document) return { ok: false, error: loadResult.error };

    totalPages += loadResult.document.getPageCount();
    if (totalPages > FILE_LIMITS.pdf.maxTotalPages) {
      return { ok: false, error: buildFileError("limit-exceeded", `El resultado superaría el límite de ${FILE_LIMITS.pdf.maxTotalPages} páginas.`) };
    }

    const indices = loadResult.document.getPageCount() > 0 ? Array.from({ length: loadResult.document.getPageCount() }, (_, i) => i) : [];
    const copiedPages = await merged.copyPages(loadResult.document, indices);
    for (const page of copiedPages) merged.addPage(page);
  }

  const bytes = await merged.save();
  return { ok: true, bytes, totalPages };
}

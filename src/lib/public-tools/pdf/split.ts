import { PDFDocument } from "pdf-lib";
import { loadPdfDocument } from "./load";
import { parsePageRange, invertPageSelection } from "./ranges";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";

export type SplitMode = "range" | "individual-pages" | "each-page" | "every-n-pages" | "multiple-ranges" | "remove-pages";

export interface SplitOptions {
  mode: SplitMode;
  rangeInput?: string;
  n?: number;
  multipleRanges?: string[];
  keepDuplicates?: boolean;
}

export interface SplitOutputFile {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

export interface SplitResult {
  ok: boolean;
  error?: FileErrorResult;
  files?: SplitOutputFile[];
  duplicatesRemoved?: number;
}

async function extractPagesToNewPdf(source: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, indices);
  for (const page of copied) output.addPage(page);
  return output.save();
}

/**
 * All Dividir PDF modes (spec section 11) go through this one function —
 * "extraer rango"/"páginas individuales" share the same range parser,
 * "cada página" and "cada N páginas" are just pre-computed range lists, and
 * "eliminar páginas y conservar el resto" reuses `invertPageSelection`.
 */
export async function splitPdf(bytes: Uint8Array, options: SplitOptions): Promise<SplitResult> {
  const loadResult = await loadPdfDocument(bytes);
  if (!loadResult.ok || !loadResult.document) return { ok: false, error: loadResult.error };
  const source = loadResult.document;
  const pageCount = source.getPageCount();

  if (options.mode === "range" || options.mode === "individual-pages") {
    const parsed = parsePageRange(options.rangeInput ?? "", pageCount, { keepDuplicates: options.keepDuplicates });
    if (!parsed.ok || !parsed.indices) return { ok: false, error: buildFileError("limit-exceeded", parsed.error) };
    const outputBytes = await extractPagesToNewPdf(source, parsed.indices);
    return { ok: true, files: [{ name: "documento-extraido.pdf", bytes: outputBytes, pageCount: parsed.indices.length }], duplicatesRemoved: parsed.duplicatesRemoved };
  }

  if (options.mode === "remove-pages") {
    const parsed = parsePageRange(options.rangeInput ?? "", pageCount);
    if (!parsed.ok || !parsed.indices) return { ok: false, error: buildFileError("limit-exceeded", parsed.error) };
    const kept = invertPageSelection(parsed.indices, pageCount);
    if (kept.length === 0) return { ok: false, error: buildFileError("limit-exceeded", "No quedarían páginas tras eliminar el rango indicado.") };
    const outputBytes = await extractPagesToNewPdf(source, kept);
    return { ok: true, files: [{ name: "documento-sin-paginas-eliminadas.pdf", bytes: outputBytes, pageCount: kept.length }] };
  }

  if (options.mode === "each-page") {
    const files: SplitOutputFile[] = [];
    for (let i = 0; i < pageCount; i++) {
      const outputBytes = await extractPagesToNewPdf(source, [i]);
      files.push({ name: `pagina-${String(i + 1).padStart(String(pageCount).length, "0")}.pdf`, bytes: outputBytes, pageCount: 1 });
    }
    return { ok: true, files };
  }

  if (options.mode === "every-n-pages") {
    const n = options.n && options.n > 0 ? Math.floor(options.n) : 1;
    const files: SplitOutputFile[] = [];
    let groupIndex = 1;
    for (let start = 0; start < pageCount; start += n) {
      const indices = Array.from({ length: Math.min(n, pageCount - start) }, (_, i) => start + i);
      const outputBytes = await extractPagesToNewPdf(source, indices);
      files.push({ name: `documento-parte-${String(groupIndex).padStart(2, "0")}.pdf`, bytes: outputBytes, pageCount: indices.length });
      groupIndex++;
    }
    return { ok: true, files };
  }

  if (options.mode === "multiple-ranges") {
    const rangeStrings = options.multipleRanges ?? [];
    if (rangeStrings.length === 0) return { ok: false, error: buildFileError("limit-exceeded", "Añade al menos un rango.") };
    const files: SplitOutputFile[] = [];
    for (let i = 0; i < rangeStrings.length; i++) {
      const parsed = parsePageRange(rangeStrings[i], pageCount, { keepDuplicates: options.keepDuplicates });
      if (!parsed.ok || !parsed.indices) return { ok: false, error: buildFileError("limit-exceeded", `Rango ${i + 1}: ${parsed.error}`) };
      const outputBytes = await extractPagesToNewPdf(source, parsed.indices);
      files.push({ name: `documento-rango-${i + 1}.pdf`, bytes: outputBytes, pageCount: parsed.indices.length });
    }
    return { ok: true, files };
  }

  return { ok: false, error: buildFileError("unsupported", "Modo de división no reconocido.") };
}

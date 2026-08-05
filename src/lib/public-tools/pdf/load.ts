import { PDFDocument, EncryptedPDFError } from "pdf-lib";
import { buildFileError, type FileErrorResult } from "@/lib/public-tools/files/errors";
import { FILE_LIMITS } from "@/lib/public-tools/files/limits";

export interface LoadPdfResult {
  ok: boolean;
  error?: FileErrorResult;
  document?: PDFDocument;
  pageCount?: number;
}

/**
 * Shared PDF-loading core (spec section 8) — every PDF tool goes through
 * this single function, which never attempts to bypass encryption
 * (`ignoreEncryption` stays false) and distinguishes an encrypted document
 * from a genuinely corrupted/invalid one instead of a single generic error.
 */
export async function loadPdfDocument(bytes: Uint8Array, filename?: string): Promise<LoadPdfResult> {
  if (bytes.byteLength === 0) {
    return { ok: false, error: buildFileError("empty-file", filename ? `"${filename}" está vacío.` : undefined) };
  }
  if (bytes.byteLength > FILE_LIMITS.pdf.maxFileBytes) {
    return {
      ok: false,
      error: buildFileError("too-large", `${filename ? `"${filename}" supera` : "El PDF supera"} el límite de ${Math.round(FILE_LIMITS.pdf.maxFileBytes / (1024 * 1024))} MB.`),
    };
  }

  // A real PDF always starts with the "%PDF-" magic bytes — catches an
  // obviously-mislabeled file before handing it to pdf-lib's parser.
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== "%PDF-") {
    return { ok: false, error: buildFileError("invalid-type", filename ? `"${filename}" no es un archivo PDF válido.` : "El archivo no es un PDF válido.") };
  }

  try {
    const document = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: false });
    const pageCount = document.getPageCount();
    if (pageCount === 0) {
      return { ok: false, error: buildFileError("corrupted", filename ? `"${filename}" no tiene páginas.` : "El PDF no tiene páginas.") };
    }
    if (pageCount > FILE_LIMITS.pdf.maxTotalPages) {
      return { ok: false, error: buildFileError("limit-exceeded", `El documento supera el límite de ${FILE_LIMITS.pdf.maxTotalPages} páginas.`) };
    }
    return { ok: true, document, pageCount };
  } catch (err) {
    if (err instanceof EncryptedPDFError) {
      return { ok: false, error: buildFileError("encrypted", filename ? `"${filename}" está protegido con contraseña.` : undefined) };
    }
    return { ok: false, error: buildFileError("corrupted", filename ? `No se pudo leer "${filename}". Puede estar dañado.` : undefined) };
  }
}

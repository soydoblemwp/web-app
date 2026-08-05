import { buildFileError, type FileErrorResult } from "./errors";
import { ACCEPTED_IMAGE_MIMES, ACCEPTED_PDF_MIME, FILE_LIMITS } from "./limits";

export interface FileValidationResult {
  ok: boolean;
  error?: FileErrorResult;
}

const EXTENSION_BY_MIME: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

function getExtension(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

/** Cross-checks the browser-reported MIME type against the file's extension — catches an obviously mismatched/misleading extension (spec section 29 "MIME engañoso", section 37). */
export function validateFileTypeAndExtension(file: File, acceptedMimes: readonly string[]): FileValidationResult {
  if (file.size === 0) return { ok: false, error: buildFileError("empty-file") };
  if (!acceptedMimes.includes(file.type)) {
    return { ok: false, error: buildFileError("invalid-type", `Formato no admitido: ${file.type || "desconocido"}.`) };
  }
  const extension = getExtension(file.name);
  const validExtensions = EXTENSION_BY_MIME[file.type] ?? [];
  if (extension && !validExtensions.includes(extension)) {
    return { ok: false, error: buildFileError("invalid-extension", `La extensión ".${extension}" no coincide con el tipo detectado (${file.type}).`) };
  }
  return { ok: true };
}

export function validatePdfFile(file: File): FileValidationResult {
  const typeResult = validateFileTypeAndExtension(file, [ACCEPTED_PDF_MIME]);
  if (!typeResult.ok) return typeResult;
  if (file.size > FILE_LIMITS.pdf.maxFileBytes) {
    return { ok: false, error: buildFileError("too-large", `El PDF supera el límite de ${Math.round(FILE_LIMITS.pdf.maxFileBytes / (1024 * 1024))} MB.`) };
  }
  return { ok: true };
}

export function validateImageFile(file: File): FileValidationResult {
  const typeResult = validateFileTypeAndExtension(file, ACCEPTED_IMAGE_MIMES);
  if (!typeResult.ok) return typeResult;
  if (file.size > FILE_LIMITS.image.maxFileBytes) {
    return { ok: false, error: buildFileError("too-large", `La imagen supera el límite de ${Math.round(FILE_LIMITS.image.maxFileBytes / (1024 * 1024))} MB.`) };
  }
  return { ok: true };
}

export function validateImageDimensions(width: number, height: number): FileValidationResult {
  if (width > FILE_LIMITS.image.maxDimension || height > FILE_LIMITS.image.maxDimension) {
    return { ok: false, error: buildFileError("limit-exceeded", `La imagen supera el límite de ${FILE_LIMITS.image.maxDimension}px por lado.`) };
  }
  if (width * height > FILE_LIMITS.image.maxTotalPixels) {
    return { ok: false, error: buildFileError("limit-exceeded", "La imagen supera el límite de píxeles totales admitido.") };
  }
  return { ok: true };
}

/** Deterministic duplicate detection by (name, size) pair — cheap, no hashing needed for a same-session file list. */
export function findDuplicateFiles(files: File[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicateIndexes = new Set<number>();
  files.forEach((file, index) => {
    const key = `${file.name}:${file.size}`;
    if (seen.has(key)) duplicateIndexes.add(index);
    else seen.set(key, index);
  });
  return duplicateIndexes;
}

export function validateFileCount(count: number, max: number): FileValidationResult {
  if (count > max) return { ok: false, error: buildFileError("too-many-files", `Selecciona como máximo ${max} archivos.`) };
  return { ok: true };
}

export function validateTotalBytes(totalBytes: number, maxBytes: number): FileValidationResult {
  if (totalBytes > maxBytes) {
    return { ok: false, error: buildFileError("limit-exceeded", `El tamaño combinado supera el límite de ${Math.round(maxBytes / (1024 * 1024))} MB.`) };
  }
  return { ok: true };
}

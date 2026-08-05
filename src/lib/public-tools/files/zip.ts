import { zipSync, type Zippable } from "fflate";
import { FILE_LIMITS } from "./limits";
import { buildFileError, type FileErrorResult } from "./errors";

export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

export interface BuildZipResult {
  ok: boolean;
  error?: FileErrorResult;
  bytes?: Uint8Array;
}

/**
 * Builds a real ZIP archive (store-level, deterministic) from in-memory
 * entries using `fflate` — chosen deliberately over `jszip` for its much
 * smaller footprint (spec section 11: "una biblioteca pequeña y enfocada").
 * Never touches disk or network; the whole archive is built in memory and
 * handed back for a direct download.
 */
export function buildZip(entries: ZipEntryInput[]): BuildZipResult {
  if (entries.length === 0) return { ok: false, error: buildFileError("limit-exceeded", "No hay archivos para incluir en el ZIP.") };
  if (entries.length > FILE_LIMITS.zip.maxEntries) {
    return { ok: false, error: buildFileError("too-many-files", `El ZIP admite como máximo ${FILE_LIMITS.zip.maxEntries} archivos.`) };
  }
  const totalBytes = entries.reduce((sum, e) => sum + e.data.byteLength, 0);
  if (totalBytes > FILE_LIMITS.zip.maxTotalBytes) {
    return { ok: false, error: buildFileError("limit-exceeded", "El contenido combinado supera el límite del ZIP.") };
  }

  const zippable: Zippable = {};
  for (const entry of entries) zippable[entry.name] = entry.data;

  const bytes = zipSync(zippable, { level: 6 });
  return { ok: true, bytes };
}

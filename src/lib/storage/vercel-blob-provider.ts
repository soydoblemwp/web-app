import "server-only";
import type { StorageProvider } from "@/lib/storage/types";

const NOT_CONFIGURED_MESSAGE =
  "Vercel Blob no está configurado (falta BLOB_READ_WRITE_TOKEN). Esta fase deja la abstracción lista — conéctalo en una fase futura.";

/**
 * Not wired to the real @vercel/blob SDK on purpose: without a real token
 * there is nothing to call, and installing an SDK that can only ever throw
 * here would be dead weight (see Fase 29 spec: "no conectes un proveedor
 * externo real si requiere credenciales"). isConfigured flips to true, and
 * this becomes the preferred provider (see getStorageProvider()), the
 * moment BLOB_READ_WRITE_TOKEN is set and the real client is wired in.
 */
export const vercelBlobStorageProvider: StorageProvider = {
  id: "vercel-blob",
  get isConfigured() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  },
  async upload() {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  },
  async delete() {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  },
  async download() {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  },
};

import "server-only";
import type { StorageProvider } from "@/lib/storage/types";

const NOT_CONFIGURED_MESSAGE =
  "El almacenamiento S3 compatible no está configurado (faltan S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY). Esta fase deja la abstracción lista — conéctalo en una fase futura.";

function hasS3Credentials(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
  );
}

/** Same "not configured" contract as vercelBlobStorageProvider — see that file's comment. */
export const s3CompatibleStorageProvider: StorageProvider = {
  id: "s3-compatible",
  get isConfigured() {
    return hasS3Credentials();
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

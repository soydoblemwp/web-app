import "server-only";
import type { StorageProvider } from "@/lib/storage/types";
import { vercelBlobStorageProvider } from "@/lib/storage/vercel-blob-provider";
import { s3CompatibleStorageProvider } from "@/lib/storage/s3-compatible-provider";
import { localDevStorageProvider } from "@/lib/storage/local-dev-provider";

export type { StorageProvider, UploadFileInput, StoredFileRef } from "@/lib/storage/types";

/** Prefers a real, configured provider; always falls back to the local-dev provider so uploads never silently fail for lack of credentials. */
export function getStorageProvider(): StorageProvider {
  if (vercelBlobStorageProvider.isConfigured) return vercelBlobStorageProvider;
  if (s3CompatibleStorageProvider.isConfigured) return s3CompatibleStorageProvider;
  return localDevStorageProvider;
}

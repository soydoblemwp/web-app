export interface UploadFileInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface StoredFileRef {
  storageKey: string;
  url: string;
}

/**
 * Single storage abstraction every upload path goes through — never a
 * provider-specific call scattered in actions. Fase 29 ships a working
 * local-dev implementation plus "not configured" stubs for Vercel Blob and
 * an S3-compatible provider, ready to become real once credentials exist —
 * see src/lib/storage/index.ts's getStorageProvider() for the selection
 * order.
 */
export interface StorageProvider {
  readonly id: "local-dev" | "vercel-blob" | "s3-compatible";
  readonly isConfigured: boolean;
  upload(projectId: string, file: UploadFileInput): Promise<StoredFileRef>;
  delete(storageKey: string): Promise<void>;
  /** Reads a previously uploaded file back into memory — used by the Knowledge Base's EXTRACT stage (src/server/services/knowledge-processing.ts) so document text extraction can run as its own deferred, retryable stage instead of only at upload time, without ever duplicating the file itself (Fase 32). */
  download(storageKey: string): Promise<Buffer>;
}

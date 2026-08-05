import "server-only";
import { writeFile, mkdir, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StorageProvider, UploadFileInput } from "@/lib/storage/types";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

function safeExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

/**
 * The only storage provider that always works with zero configuration —
 * writes under public/uploads so Next.js serves it directly. Explicitly a
 * DEV convenience, never presented as production storage (see
 * getStorageProvider() in src/lib/storage/index.ts, which always prefers a
 * real provider once one is configured).
 */
export const localDevStorageProvider: StorageProvider = {
  id: "local-dev",
  isConfigured: true,

  async upload(projectId: string, file: UploadFileInput) {
    const key = `${projectId}/${randomUUID()}${safeExtension(file.filename)}`;
    const destPath = path.join(UPLOAD_ROOT, key);
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, file.buffer);
    return { storageKey: key, url: `/uploads/${key}` };
  },

  async delete(storageKey: string) {
    const destPath = path.join(UPLOAD_ROOT, storageKey);
    await unlink(destPath).catch(() => {
      // Already gone — deleting is idempotent.
    });
  },

  async download(storageKey: string) {
    return readFile(path.join(UPLOAD_ROOT, storageKey));
  },
};

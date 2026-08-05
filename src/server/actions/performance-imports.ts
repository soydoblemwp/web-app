"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { createImportSchema, configureImportSchema } from "@/lib/validation/performance";
import { PERFORMANCE_LIMITS } from "@/lib/performance/limits";
import {
  createImport,
  previewImport,
  configureImportMapping,
  driveImportToCompletion,
  cancelImport,
  listImports,
  getImportDetail,
} from "@/server/services/performance-imports";
import type { PerformanceErrorCode } from "@/lib/performance/types";

export interface ImportActionResult {
  id?: string;
  errorCode?: PerformanceErrorCode;
  errorMessage?: string;
}

export async function createImportAction(projectId: string, input: unknown): Promise<ImportActionResult> {
  const parsed = createImportSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createImport(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  return { id: result.id };
}

/** Uploads a CSV/JSON file as a real FileAsset and registers it as a new PerformanceImport (spec section 12 step 1) — no separate ad-hoc upload path, reuses the project's existing storage provider. */
export async function uploadPerformanceImportFileAction(projectId: string, formData: FormData): Promise<ImportActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");

  const file = formData.get("file");
  if (!(file instanceof File)) return { errorMessage: "No se recibió ningún archivo." };

  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
  const isJson = file.name.toLowerCase().endsWith(".json") || file.type === "application/json";
  if (!isCsv && !isJson) return { errorMessage: "Solo se admiten archivos .csv o .json." };

  const kind = isCsv ? "CSV" : "JSON";
  const maxBytes = isCsv ? PERFORMANCE_LIMITS.MAX_CSV_BYTES : PERFORMANCE_LIMITS.MAX_JSON_BYTES;
  if (file.size > maxBytes) return { errorMessage: `El archivo supera el máximo permitido (${Math.round(maxBytes / 1024 / 1024)} MB).` };

  const buffer = Buffer.from(await file.arrayBuffer());
  const provider = getStorageProvider();
  const stored = await provider.upload(projectId, { buffer, filename: file.name, mimeType: file.type || (isCsv ? "text/csv" : "application/json") });

  const fileAsset = await prisma.fileAsset.create({
    data: {
      projectId,
      ownerId: user.id,
      kind: "DOCUMENT",
      originalName: file.name,
      displayName: file.name,
      storageKey: stored.storageKey,
      url: stored.url,
      mimeType: file.type || (isCsv ? "text/csv" : "application/json"),
      sizeBytes: buffer.byteLength,
      processingStatus: "READY",
    },
  });

  const result = await createImport(projectId, user.id, { kind, fileAssetId: fileAsset.id });
  if ("error" in result) {
    await prisma.fileAsset.delete({ where: { id: fileAsset.id } }).catch(() => {});
    return { errorCode: result.code, errorMessage: result.error };
  }
  revalidatePath(`/dashboard/${projectId}/performance/imports`);
  return { id: result.id };
}

/** Registers a new PerformanceImport from pasted JSON text — spec section 13's "archivo o texto pegado" alternative. */
export async function createJsonTextImportAction(projectId: string, rawText: string): Promise<ImportActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createImport(projectId, user.id, { kind: "JSON", rawText });
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance/imports`);
  return { id: result.id };
}

export async function previewImportAction(projectId: string, importId: string, limit?: number) {
  await requireProjectAccess(projectId, "VIEWER");
  const result = await previewImport(projectId, importId, limit);
  return result;
}

export async function configureImportMappingAction(projectId: string, input: unknown): Promise<ImportActionResult & { status?: string }> {
  const parsed = configureImportSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  await requireProjectAccess(projectId, "EDITOR");
  const configured = await configureImportMapping(projectId, parsed.data.importId, parsed.data);
  if ("error" in configured) return { errorCode: configured.code, errorMessage: configured.error };

  const driven = await driveImportToCompletion(parsed.data.importId);
  revalidatePath(`/dashboard/${projectId}/performance/imports`);
  revalidatePath(`/dashboard/${projectId}/performance/imports/${parsed.data.importId}`);
  return { id: parsed.data.importId, status: driven.status };
}

/** Resumes a stuck/partial import (e.g. after a crashed batch) — safe to call repeatedly, never reprocesses already-imported rows. */
export async function continueImportAction(projectId: string, importId: string): Promise<ImportActionResult & { status?: string }> {
  await requireProjectAccess(projectId, "EDITOR");
  const owned = await getImportDetail(projectId, importId);
  if (!owned) return { errorMessage: "Importación no encontrada." };
  const driven = await driveImportToCompletion(importId);
  revalidatePath(`/dashboard/${projectId}/performance/imports`);
  revalidatePath(`/dashboard/${projectId}/performance/imports/${importId}`);
  return { id: importId, status: driven.status };
}

export async function cancelImportAction(projectId: string, importId: string): Promise<ImportActionResult> {
  await requireProjectAccess(projectId, "EDITOR");
  const result = await cancelImport(projectId, importId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePath(`/dashboard/${projectId}/performance/imports`);
  return { id: result.id };
}

export async function listImportsAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return listImports(projectId);
}

export async function getImportDetailAction(projectId: string, importId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getImportDetail(projectId, importId);
}

import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getStorageProvider } from "@/lib/storage";
import { parseCsv, detectDelimiter } from "@/lib/performance/csv";
import { validateJsonStructure, resolveImportRecordsArray, getValueAtPath, isPlainRecord } from "@/lib/performance/json-import";
import { parseLooseNumber, parseDateWithFormat, type DateFormatHint } from "@/lib/performance/parsing";
import { PERFORMANCE_LIMITS, exceedsCsvSizeLimit, exceedsJsonSizeLimit, exceedsImportRowLimit } from "@/lib/performance/limits";
import { performanceError, type PerformanceActionError } from "@/lib/performance/types";
import { findMetricDefinition } from "@/lib/performance/metrics-catalog";
import { createMetricRecordCore } from "@/server/services/performance-metric-records";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { CreateImportInput, ConfigureImportInput } from "@/lib/validation/performance";

/**
 * Persistent, resumable CSV/JSON import processing (spec sections 12-15/45
 * -47). Never a single long-lived HTTP request for a large file: creation,
 * configuration, and each processing step are separate, idempotent calls
 * that a cron/dev-driver/UI "process next batch" action can invoke
 * repeatedly. Real, safe CSV/JSON parsing only — no eval, no formula
 * execution, no prototype pollution.
 */

interface MappingField {
  sourceColumn: string;
  targetField: "measuredAt" | "periodStart" | "periodEnd" | "resourceId" | "platform" | "externalReference" | "metricKey" | "value" | "currency" | "ignore";
  metricKey?: string;
}

interface ImportConfig {
  delimiter?: string;
  dateFormat?: DateFormatHint;
  containerPath?: string;
  duplicatePolicy?: "SKIP" | "REPLACE" | "MERGE_SUM" | "KEEP_BOTH";
  defaultGranularity?: string;
}

async function getOwnedImport(projectId: string, importId: string) {
  const row = await prisma.performanceImport.findUnique({ where: { id: importId } });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export async function createImport(projectId: string, userId: string, input: CreateImportInput): Promise<{ id: string } | PerformanceActionError> {
  const activeImports = await prisma.performanceImport.count({ where: { projectId, status: { in: ["MAPPING", "VALIDATING", "READY", "IMPORTING"] } } });
  if (activeImports >= PERFORMANCE_LIMITS.MAX_CONCURRENT_IMPORTS_PER_PROJECT) {
    return performanceError("IMPORT_PROCESSING_CONFLICT", "Ya hay demasiadas importaciones en curso en este proyecto. Espera a que terminen o cancélalas antes de crear otra.");
  }

  if (input.kind === "CSV") {
    if (!input.fileAssetId) return performanceError("IMPORT_FILE_INVALID", "Selecciona un archivo CSV.");
    const fileAsset = await prisma.fileAsset.findUnique({ where: { id: input.fileAssetId } });
    if (!fileAsset || fileAsset.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
    if (exceedsCsvSizeLimit(fileAsset.sizeBytes)) return performanceError("IMPORT_FILE_INVALID", `El archivo supera el tamaño máximo permitido (${Math.round(PERFORMANCE_LIMITS.MAX_CSV_BYTES / 1024 / 1024)} MB).`);
  } else {
    if (!input.fileAssetId && !input.rawText) return performanceError("IMPORT_FILE_INVALID", "Selecciona un archivo o pega el JSON.");
    if (input.rawText && exceedsJsonSizeLimit(Buffer.byteLength(input.rawText, "utf8"))) {
      return performanceError("IMPORT_FILE_INVALID", `El JSON pegado supera el tamaño máximo permitido (${Math.round(PERFORMANCE_LIMITS.MAX_JSON_BYTES / 1024 / 1024)} MB).`);
    }
    if (input.fileAssetId) {
      const fileAsset = await prisma.fileAsset.findUnique({ where: { id: input.fileAssetId } });
      if (!fileAsset || fileAsset.projectId !== projectId) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
      if (exceedsJsonSizeLimit(fileAsset.sizeBytes)) return performanceError("IMPORT_FILE_INVALID", "El archivo JSON supera el tamaño máximo permitido.");
    }
  }

  const created = await prisma.performanceImport.create({
    data: {
      projectId,
      createdById: userId,
      kind: input.kind,
      status: "DRAFT",
      stage: "REGISTERED",
      fileAssetId: input.fileAssetId ?? null,
      rawText: input.kind === "JSON" ? (input.rawText ?? null) : null,
      platform: input.platform ?? null,
      resourceType: input.resourceType ?? null,
    },
  });
  return { id: created.id };
}

async function readImportSourceText(row: NonNullable<Awaited<ReturnType<typeof getOwnedImport>>>): Promise<string | null> {
  if (row.rawText) return row.rawText;
  if (!row.fileAssetId) return null;
  const fileAsset = await prisma.fileAsset.findUnique({ where: { id: row.fileAssetId } });
  if (!fileAsset) return null;
  const buffer = await getStorageProvider().download(fileAsset.storageKey);
  return buffer.toString("utf8");
}

export interface ImportPreview {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  detectedDelimiter?: string;
}

/** Read-only preview for the wizard — parses fresh, never persists anything (spec section 12 steps 1-3). */
export async function previewImport(projectId: string, importId: string, limit = 20): Promise<ImportPreview | PerformanceActionError> {
  const row = await getOwnedImport(projectId, importId);
  if (!row) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  const text = await readImportSourceText(row);
  if (!text) return performanceError("IMPORT_FILE_INVALID");

  if (row.kind === "CSV") {
    const delimiter = detectDelimiter(text);
    const { headers, rows } = parseCsv(text, delimiter);
    const sampleRows = rows.slice(0, limit).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
    return { headers, sampleRows, detectedDelimiter: delimiter };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return performanceError("IMPORT_FILE_INVALID", "El JSON no es válido.");
  }
  const validation = validateJsonStructure(parsed, PERFORMANCE_LIMITS.MAX_JSON_DEPTH, PERFORMANCE_LIMITS.MAX_JSON_STRING_LENGTH);
  if (!validation.valid) return performanceError("IMPORT_FILE_INVALID", validation.error);

  const records = resolveImportRecordsArray(parsed) ?? (isPlainRecord(parsed) ? [parsed] : null);
  if (!records) return performanceError("IMPORT_FILE_INVALID", "No se encontró un arreglo de registros en la raíz. Indica la propiedad contenedora en el siguiente paso.");
  const sample = records.slice(0, limit).filter(isPlainRecord);
  const headers = sample.length > 0 ? Object.keys(sample[0]) : [];
  return { headers, sampleRows: sample };
}

export async function configureImportMapping(projectId: string, importId: string, input: ConfigureImportInput): Promise<{ id: string } | PerformanceActionError> {
  const row = await getOwnedImport(projectId, importId);
  if (!row) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  if (!["DRAFT", "MAPPING", "FAILED", "CANCELLED"].includes(row.status)) return performanceError("IMPORT_PROCESSING_CONFLICT", "Esta importación ya está en curso o finalizada.");

  const hasValueMapping = input.mapping.some((m) => m.targetField === "value" && m.metricKey);
  if (!hasValueMapping) return performanceError("IMPORT_MAPPING_INVALID", "Mapea al menos una columna a un valor de métrica.");

  await prisma.performanceImport.update({
    where: { id: importId },
    data: {
      platform: input.platform ?? row.platform,
      resourceType: input.resourceType ?? row.resourceType,
      mapping: input.mapping as unknown as Prisma.InputJsonValue,
      config: { delimiter: input.delimiter, dateFormat: input.dateFormat, containerPath: input.containerPath, duplicatePolicy: input.duplicatePolicy, defaultGranularity: input.defaultGranularity } as unknown as Prisma.InputJsonValue,
      status: "MAPPING",
      stage: "REGISTERED",
    },
  });
  return { id: importId };
}

interface ExtractedFields {
  measuredAt?: Date;
  periodStart?: Date;
  periodEnd?: Date;
  resourceId?: string;
  platform?: string;
  externalReference?: string;
  currency?: string;
  values: { metricKey: string; value: number }[];
  errors: string[];
}

function extractRowFields(row: Record<string, unknown>, mapping: MappingField[], dateFormat: DateFormatHint, isJsonPath: boolean): ExtractedFields {
  const result: ExtractedFields = { values: [], errors: [] };
  for (const field of mapping) {
    if (field.targetField === "ignore" || field.targetField === "metricKey") continue;
    const raw = isJsonPath ? getValueAtPath(row, field.sourceColumn) : row[field.sourceColumn];
    if (raw === undefined || raw === null || raw === "") continue;
    const rawString = String(raw);

    switch (field.targetField) {
      case "measuredAt": {
        const date = parseDateWithFormat(rawString, dateFormat);
        if (!date) result.errors.push(`Fecha de medición no válida: "${rawString}".`);
        else result.measuredAt = date;
        break;
      }
      case "periodStart": {
        const date = parseDateWithFormat(rawString, dateFormat);
        if (!date) result.errors.push(`Inicio de periodo no válido: "${rawString}".`);
        else result.periodStart = date;
        break;
      }
      case "periodEnd": {
        const date = parseDateWithFormat(rawString, dateFormat);
        if (!date) result.errors.push(`Fin de periodo no válido: "${rawString}".`);
        else result.periodEnd = date;
        break;
      }
      case "resourceId":
        result.resourceId = rawString;
        break;
      case "platform":
        result.platform = rawString;
        break;
      case "externalReference":
        result.externalReference = rawString;
        break;
      case "currency":
        result.currency = rawString.toUpperCase().slice(0, 3);
        break;
      case "value": {
        if (!field.metricKey) break;
        const value = typeof raw === "number" ? raw : parseLooseNumber(rawString);
        if (value === null) result.errors.push(`Valor no numérico para "${field.metricKey}": "${rawString}".`);
        else result.values.push({ metricKey: field.metricKey, value });
        break;
      }
    }
  }
  return result;
}

async function failImportEarly(importId: string, projectId: string, createdById: string, kind: string, message: string): Promise<void> {
  await prisma.performanceImport.update({ where: { id: importId }, data: { status: "FAILED", completedAt: new Date(), errorSummary: [message] as unknown as Prisma.InputJsonValue, lockedAt: null, lockedBy: null, lockExpiresAt: null } });
  await publishAutomationEvent({
    projectId,
    eventKey: "PERFORMANCE_IMPORT_FAILED",
    resourceId: importId,
    actorId: createdById,
    payload: { id: importId, kind },
    idempotencyKey: `PERFORMANCE_IMPORT_FAILED:${importId}`,
  });
}

/** Parses the whole file and creates one PerformanceImportRow per record (PENDING) — a real, persisted, bounded batch of work; never re-parses the file again afterward. */
async function stageParseAndCreateRows(importId: string): Promise<void> {
  const row = await prisma.performanceImport.findUnique({ where: { id: importId } });
  if (!row) return;
  const text = await readImportSourceText(row);
  if (!text) {
    await failImportEarly(importId, row.projectId, row.createdById, row.kind, "No se pudo leer el archivo o texto de la importación.");
    return;
  }

  const config = (row.config as ImportConfig | null) ?? {};
  let rawRecords: Record<string, unknown>[] = [];

  if (row.kind === "CSV") {
    const delimiter = config.delimiter ?? detectDelimiter(text);
    const { headers, rows } = parseCsv(text, delimiter);
    rawRecords = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      await failImportEarly(importId, row.projectId, row.createdById, row.kind, "El JSON no es válido.");
      return;
    }
    const validation = validateJsonStructure(parsed, PERFORMANCE_LIMITS.MAX_JSON_DEPTH, PERFORMANCE_LIMITS.MAX_JSON_STRING_LENGTH);
    if (!validation.valid) {
      await failImportEarly(importId, row.projectId, row.createdById, row.kind, validation.error ?? "El JSON no es válido.");
      return;
    }
    const records = resolveImportRecordsArray(parsed, config.containerPath) ?? (isPlainRecord(parsed) ? [parsed] : null);
    rawRecords = (records ?? []).filter(isPlainRecord);
  }

  if (exceedsImportRowLimit(rawRecords.length)) {
    await failImportEarly(importId, row.projectId, row.createdById, row.kind, `El archivo tiene ${rawRecords.length} filas, más del máximo permitido (${PERFORMANCE_LIMITS.MAX_IMPORT_ROWS}).`);
    return;
  }
  if (rawRecords.length === 0) {
    await failImportEarly(importId, row.projectId, row.createdById, row.kind, "No se encontraron filas para importar.");
    return;
  }

  const mapping = (row.mapping as unknown as MappingField[] | null) ?? [];
  const isJsonPath = row.kind === "JSON";
  const dateFormat = config.dateFormat;

  const seenKeys = new Set<string>();
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  const rowsToCreate = rawRecords.map((record, index) => {
    const extracted = extractRowFields(record, mapping, dateFormat, isJsonPath);
    const measuredAt = extracted.measuredAt ?? extracted.periodStart;
    const periodStart = extracted.periodStart ?? measuredAt;
    const periodEnd = extracted.periodEnd ?? measuredAt;

    let status: "VALID" | "INVALID" | "DUPLICATE" = "VALID";
    let errorMessage: string | null = null;

    if (!measuredAt || !periodStart || !periodEnd) {
      status = "INVALID";
      errorMessage = "Falta la fecha de medición o de periodo.";
    } else if (extracted.values.length === 0) {
      status = "INVALID";
      errorMessage = extracted.errors[0] ?? "No se encontró ningún valor de métrica válido en esta fila.";
    } else if (extracted.errors.length > 0) {
      status = "INVALID";
      errorMessage = extracted.errors[0];
    } else {
      const dedupeKey = `${measuredAt.toISOString()}::${periodStart.toISOString()}::${periodEnd.toISOString()}::${extracted.resourceId ?? ""}::${extracted.platform ?? ""}::${extracted.values.map((v) => v.metricKey).sort().join(",")}`;
      if (seenKeys.has(dedupeKey)) {
        status = "DUPLICATE";
        errorMessage = "Fila duplicada dentro del mismo archivo.";
      }
      seenKeys.add(dedupeKey);
    }

    if (status === "VALID") validCount++;
    else if (status === "DUPLICATE") duplicateCount++;
    else invalidCount++;

    return {
      importId,
      rowIndex: index,
      rawData: { record, extracted: { ...extracted, measuredAt: measuredAt?.toISOString(), periodStart: periodStart?.toISOString(), periodEnd: periodEnd?.toISOString() } } as unknown as Prisma.InputJsonValue,
      status,
      errorMessage,
    };
  });

  await prisma.performanceImportRow.createMany({ data: rowsToCreate });
  await prisma.performanceImport.update({
    where: { id: importId },
    data: { totalRows: rawRecords.length, validRows: validCount, invalidRows: invalidCount, duplicateRows: duplicateCount, status: "IMPORTING", stage: "IMPORTING", lockedAt: null, lockedBy: null, lockExpiresAt: null },
  });
}

/** Processes one bounded batch of VALID, not-yet-imported rows — returns how many VALID rows are still left unprocessed (0 means this import's IMPORTING phase is done). */
async function stageImportBatch(importId: string): Promise<number> {
  const importRow = await prisma.performanceImport.findUnique({ where: { id: importId } });
  if (!importRow) return 0;
  const config = (importRow.config as ImportConfig | null) ?? {};
  const duplicatePolicy = config.duplicatePolicy ?? "SKIP";
  const granularity = config.defaultGranularity ?? "DAY";

  const batch = await prisma.performanceImportRow.findMany({
    where: { importId, status: "VALID", metricRecordId: null },
    take: PERFORMANCE_LIMITS.IMPORT_BATCH_SIZE,
    orderBy: { rowIndex: "asc" },
  });

  let importedCount = 0;
  let skippedCount = 0;

  for (const row of batch) {
    const data = row.rawData as unknown as { extracted: { measuredAt?: string; periodStart?: string; periodEnd?: string; resourceId?: string; platform?: string; externalReference?: string; currency?: string; values: { metricKey: string; value: number }[] } };
    const { extracted } = data;
    if (!extracted.measuredAt || !extracted.periodStart || !extracted.periodEnd || extracted.values.length === 0) {
      await prisma.performanceImportRow.update({ where: { id: row.id }, data: { status: "INVALID", errorMessage: "Los datos de la fila ya no son válidos." } });
      skippedCount++;
      continue;
    }

    let resolvedResourceRefs: Record<string, string> = {};
    if (extracted.resourceId && importRow.resourceType && importRow.resourceType !== "PROJECT" && importRow.resourceType !== "PLATFORM") {
      const matched = await matchResource(importRow.projectId, importRow.resourceType, extracted.resourceId);
      if (!matched) {
        await prisma.performanceImportRow.update({ where: { id: row.id }, data: { status: "INVALID", errorMessage: `No se encontró el recurso "${extracted.resourceId}" en este proyecto.` } });
        skippedCount++;
        continue;
      }
      resolvedResourceRefs = matched;
    }

    let firstMetricRecordId: string | null = null;
    for (const metricValue of extracted.values) {
      const def = findMetricDefinition(metricValue.metricKey);
      const result = await createMetricRecordCore({
        projectId: importRow.projectId,
        createdById: importRow.createdById,
        source: importRow.kind === "CSV" ? "CSV_IMPORT" : "JSON_IMPORT",
        method: importRow.kind === "CSV" ? "csv_import" : "json_import",
        metricKey: metricValue.metricKey,
        resourceType: importRow.resourceType ?? "PROJECT",
        ...resolvedResourceRefs,
        platform: extracted.platform ?? importRow.platform ?? null,
        value: metricValue.value,
        unit: def?.unit ?? "COUNT",
        currency: extracted.currency ?? null,
        measuredAt: new Date(extracted.measuredAt),
        periodStart: new Date(extracted.periodStart),
        periodEnd: new Date(extracted.periodEnd),
        granularity,
        externalReference: extracted.externalReference ?? null,
        importId,
        duplicatePolicy,
      });
      if ("id" in result && !firstMetricRecordId) firstMetricRecordId = result.id;
    }

    await prisma.performanceImportRow.update({ where: { id: row.id }, data: { status: "IMPORTED", metricRecordId: firstMetricRecordId } });
    importedCount++;
  }

  await prisma.performanceImport.update({ where: { id: importId }, data: { importedRows: { increment: importedCount }, skippedRows: { increment: skippedCount } } });

  const stillRemaining = await prisma.performanceImportRow.count({ where: { importId, status: "VALID", metricRecordId: null } });
  return stillRemaining;
}

async function matchResource(projectId: string, resourceType: string, resourceId: string): Promise<Record<string, string> | null> {
  if (resourceType === "CONTENT_ITEM") {
    const row = await prisma.contentItem.findUnique({ where: { id: resourceId }, select: { projectId: true } });
    return row && row.projectId === projectId ? { contentItemId: resourceId } : null;
  }
  if (resourceType === "CAMPAIGN") {
    const row = await prisma.campaign.findUnique({ where: { id: resourceId }, select: { projectId: true } });
    return row && row.projectId === projectId ? { campaignId: resourceId } : null;
  }
  if (resourceType === "CAMPAIGN_CONTENT_PIECE") {
    const row = await prisma.campaignContentPiece.findUnique({ where: { id: resourceId }, select: { campaign: { select: { projectId: true } } } });
    return row && row.campaign.projectId === projectId ? { campaignContentPieceId: resourceId } : null;
  }
  if (resourceType === "SOCIAL_POST") {
    const row = await prisma.socialPost.findUnique({ where: { id: resourceId }, select: { projectId: true } });
    return row && row.projectId === projectId ? { socialPostId: resourceId } : null;
  }
  return null;
}

async function finalizeImport(importId: string): Promise<void> {
  const row = await prisma.performanceImport.findUnique({ where: { id: importId } });
  if (!row) return;
  const finalStatus = row.invalidRows === 0 && row.duplicateRows === 0 ? "COMPLETED" : row.importedRows > 0 ? "PARTIALLY_COMPLETED" : "FAILED";
  await prisma.performanceImport.update({
    where: { id: importId },
    data: { status: finalStatus, stage: "FINALIZING", completedAt: new Date(), lockedAt: null, lockedBy: null, lockExpiresAt: null },
  });
  await publishAutomationEvent({
    projectId: row.projectId,
    eventKey: finalStatus === "FAILED" ? "PERFORMANCE_IMPORT_FAILED" : "PERFORMANCE_IMPORT_COMPLETED",
    resourceId: importId,
    actorId: row.createdById,
    payload: { id: importId, kind: row.kind, status: finalStatus, importedRows: row.importedRows },
    idempotencyKey: `${finalStatus === "FAILED" ? "PERFORMANCE_IMPORT_FAILED" : "PERFORMANCE_IMPORT_COMPLETED"}:${importId}`,
  });
}

/**
 * Advances an import by exactly one persisted, resumable unit of work
 * (spec section 45) — safe to call repeatedly from a cron batch, the dev
 * driver, or the UI's "process now" action. Claims the import atomically
 * (expected status + null lock) so two concurrent callers never process
 * the same import twice (spec section 47). Never marks a lock-expiry as an
 * automatic success — reconcileStaleImportLocks below only releases the
 * lock so the NEXT call can retry the same unit of work.
 */
export async function processImportStep(importId: string): Promise<{ done: boolean; status: string }> {
  const row = await prisma.performanceImport.findUnique({ where: { id: importId } });
  if (!row) return { done: true, status: "NOT_FOUND" };
  if (["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED", "ARCHIVED"].includes(row.status)) return { done: true, status: row.status };

  const token = randomUUID();
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + PERFORMANCE_LIMITS.LOCK_DURATION_MS);

  if (row.status === "MAPPING" || row.status === "READY") {
    const claim = await prisma.performanceImport.updateMany({ where: { id: importId, status: row.status, lockedAt: null }, data: { executionToken: token, lockedAt: now, lockedBy: token, lockExpiresAt, startedAt: row.startedAt ?? now, attempts: { increment: 1 } } });
    if (claim.count === 0) return { done: false, status: "LOCK_CONFLICT" };
    await stageParseAndCreateRows(importId);
    return { done: false, status: "IMPORTING" };
  }

  if (row.status === "IMPORTING") {
    const claim = await prisma.performanceImport.updateMany({ where: { id: importId, status: "IMPORTING", lockedAt: null }, data: { lockedAt: now, lockedBy: token, lockExpiresAt } });
    if (claim.count === 0) return { done: false, status: "LOCK_CONFLICT" };
    const remaining = await stageImportBatch(importId);
    if (remaining > 0) {
      await prisma.performanceImport.update({ where: { id: importId }, data: { lockedAt: null, lockedBy: null, lockExpiresAt: null } });
      return { done: false, status: "IMPORTING" };
    }
    await finalizeImport(importId);
    const finalRow = await prisma.performanceImport.findUnique({ where: { id: importId } });
    return { done: true, status: finalRow?.status ?? "COMPLETED" };
  }

  return { done: true, status: row.status };
}

/** Drives an import all the way to a terminal state within one call — bounded iteration count so a pathological loop can never hang a request; used by the UI right after configuring the mapping for small/medium files. */
export async function driveImportToCompletion(importId: string, maxSteps = 200): Promise<{ done: boolean; status: string }> {
  let result = { done: false, status: "PENDING" };
  for (let i = 0; i < maxSteps; i++) {
    result = await processImportStep(importId);
    if (result.done) break;
  }
  return result;
}

/** Finds imports needing processing across ALL projects and advances each by one step — the batch entry point for cron/dev-driver (spec section 45: "puede reutilizar Automation Center para procesamiento programado"). */
export async function processPendingImports(limit = PERFORMANCE_LIMITS.MAX_REPORTS_PER_BATCH): Promise<{ processed: number }> {
  const pending = await prisma.performanceImport.findMany({
    where: { status: { in: ["MAPPING", "READY", "IMPORTING"] }, lockedAt: null },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });
  let processed = 0;
  for (const row of pending) {
    await processImportStep(row.id);
    processed++;
  }
  return { processed };
}

/** Releases imports stuck locked past their lock expiry (a crashed/killed batch) — never auto-resolves them to success (spec section 47). */
export async function reconcileStaleImportLocks(): Promise<number> {
  const result = await prisma.performanceImport.updateMany({
    where: { lockExpiresAt: { lt: new Date() } },
    data: { lockedAt: null, lockedBy: null, lockExpiresAt: null },
  });
  return result.count;
}

export async function cancelImport(projectId: string, importId: string): Promise<{ id: string } | PerformanceActionError> {
  const row = await getOwnedImport(projectId, importId);
  if (!row) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  if (["COMPLETED", "PARTIALLY_COMPLETED"].includes(row.status)) return performanceError("IMPORT_PROCESSING_CONFLICT", "Esta importación ya finalizó.");
  await prisma.performanceImport.update({ where: { id: importId }, data: { status: "CANCELLED", completedAt: new Date(), lockedAt: null, lockedBy: null, lockExpiresAt: null } });
  return { id: importId };
}

export async function listImports(projectId: string, limit = 50) {
  return prisma.performanceImport.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: limit });
}

export async function getImportDetail(projectId: string, importId: string) {
  const row = await prisma.performanceImport.findUnique({
    where: { id: importId },
    include: { rows: { orderBy: { rowIndex: "asc" }, take: 200 }, fileAsset: { select: { id: true, originalName: true, url: true } }, createdBy: { select: { id: true, name: true, email: true } } },
  });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

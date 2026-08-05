import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { performanceError, type PerformanceActionError } from "@/lib/performance/types";
import { computeMetricIdempotencyKey } from "@/lib/performance/idempotency";
import { findMetricDefinition, isCustomMetricKey } from "@/lib/performance/metrics-catalog";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { ManualMetricEntryInput } from "@/lib/validation/performance";

export type MetricRecordResult = { id: string; overlapWithId?: string } | PerformanceActionError;

/** Validates that whichever specific resource FK the caller supplied actually belongs to this project — never trusts a client-supplied ID (spec section 48). Returns the resolved FK set or null when the reference is invalid/cross-project. */
async function resolveOwnedResource(
  projectId: string,
  resourceType: string,
  refs: { contentItemId?: string; campaignId?: string; campaignContentPieceId?: string; socialPostId?: string }
): Promise<Record<string, string | null> | null> {
  if (resourceType === "PROJECT" || resourceType === "PLATFORM") return {};

  if (resourceType === "CONTENT_ITEM" && refs.contentItemId) {
    const row = await prisma.contentItem.findUnique({ where: { id: refs.contentItemId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return null;
    return { contentItemId: refs.contentItemId };
  }
  if (resourceType === "CAMPAIGN" && refs.campaignId) {
    const row = await prisma.campaign.findUnique({ where: { id: refs.campaignId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return null;
    return { campaignId: refs.campaignId };
  }
  if (resourceType === "CAMPAIGN_CONTENT_PIECE" && refs.campaignContentPieceId) {
    const row = await prisma.campaignContentPiece.findUnique({ where: { id: refs.campaignContentPieceId }, select: { campaign: { select: { projectId: true } } } });
    if (!row || row.campaign.projectId !== projectId) return null;
    return { campaignContentPieceId: refs.campaignContentPieceId };
  }
  if (resourceType === "SOCIAL_POST" && refs.socialPostId) {
    const row = await prisma.socialPost.findUnique({ where: { id: refs.socialPostId }, select: { projectId: true } });
    if (!row || row.projectId !== projectId) return null;
    return { socialPostId: refs.socialPostId };
  }
  return null;
}

async function validateMetricCompatibility(metricKey: string, resourceType: string, projectId: string): Promise<PerformanceActionError | null> {
  if (isCustomMetricKey(metricKey)) {
    const custom = await prisma.performanceMetricDefinition.findUnique({ where: { projectId_key: { projectId, key: metricKey } } });
    if (!custom || custom.isArchived) return performanceError("METRIC_DEFINITION_NOT_FOUND");
    if (!custom.compatibleResourceTypes.includes(resourceType as never)) return performanceError("METRIC_INCOMPATIBLE");
    return null;
  }
  const def = findMetricDefinition(metricKey);
  if (!def) return performanceError("METRIC_DEFINITION_NOT_FOUND");
  if (!def.compatibleResourceTypes.includes(resourceType as never)) return performanceError("METRIC_INCOMPATIBLE");
  return null;
}

interface CreateMetricRecordCore {
  projectId: string;
  createdById: string;
  source: "MANUAL" | "CSV_IMPORT" | "JSON_IMPORT" | "INTERNAL" | "CALCULATED" | "EXTERNAL_PROVIDER" | "ESTIMATED";
  method: string;
  metricKey: string;
  resourceType: string;
  resourceId?: string | null;
  contentItemId?: string | null;
  contentVersionId?: string | null;
  campaignId?: string | null;
  campaignContentPieceId?: string | null;
  socialPostId?: string | null;
  experimentVariantId?: string | null;
  platform?: string | null;
  value: number;
  unit: string;
  currency?: string | null;
  measuredAt: Date;
  periodStart: Date;
  periodEnd: Date;
  granularity: string;
  provider?: string | null;
  externalReference?: string | null;
  notes?: string | null;
  evidenceFileAssetId?: string | null;
  importId?: string | null;
  duplicatePolicy?: "SKIP" | "REPLACE" | "MERGE_SUM" | "KEEP_BOTH";
}

/**
 * The SINGLE place a PerformanceMetricRecord is ever created — manual entry
 * and CSV/JSON import rows both funnel through this exact function (spec
 * sections 11-15), so duplicate-policy handling and idempotency are never
 * duplicated logic. Enforces the DB-level unique idempotencyKey constraint
 * rather than solely a prior SELECT (spec section 46).
 */
export async function createMetricRecordCore(input: CreateMetricRecordCore): Promise<MetricRecordResult> {
  const idempotencyKey = computeMetricIdempotencyKey({
    projectId: input.projectId,
    resourceType: input.resourceType as never,
    resourceId: input.resourceId ?? input.contentItemId ?? input.campaignId ?? input.campaignContentPieceId ?? input.socialPostId ?? input.experimentVariantId ?? null,
    platform: input.platform ?? null,
    metricKey: input.metricKey,
    measuredAt: input.measuredAt,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    externalReference: input.externalReference ?? null,
    source: input.source as never,
  });

  const existing = await prisma.performanceMetricRecord.findUnique({ where: { idempotencyKey } });

  if (!existing) {
    const created = await prisma.performanceMetricRecord.create({
      data: {
        projectId: input.projectId,
        createdById: input.createdById,
        source: input.source as never,
        method: input.method,
        metricKey: input.metricKey,
        resourceType: input.resourceType as never,
        resourceId: input.resourceId ?? null,
        contentItemId: input.contentItemId ?? null,
        contentVersionId: input.contentVersionId ?? null,
        campaignId: input.campaignId ?? null,
        campaignContentPieceId: input.campaignContentPieceId ?? null,
        socialPostId: input.socialPostId ?? null,
        experimentVariantId: input.experimentVariantId ?? null,
        platform: input.platform ?? null,
        value: input.value,
        unit: input.unit as never,
        currency: input.currency ?? null,
        measuredAt: input.measuredAt,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        granularity: input.granularity as never,
        provider: input.provider ?? null,
        externalReference: input.externalReference ?? null,
        notes: input.notes ?? null,
        evidenceFileAssetId: input.evidenceFileAssetId ?? null,
        importId: input.importId ?? null,
        idempotencyKey,
      },
    });
    await prisma.performanceMetricRevision.create({ data: { metricRecordId: created.id, changedById: input.createdById, action: "CREATED", newValue: input.value } });
    await publishAutomationEvent({
      projectId: input.projectId,
      eventKey: "PERFORMANCE_METRIC_CREATED",
      resourceId: created.id,
      actorId: input.createdById,
      payload: { id: created.id, metricKey: input.metricKey, resourceType: input.resourceType, source: input.source, value: input.value },
      idempotencyKey: `PERFORMANCE_METRIC_CREATED:${created.id}`,
    });
    return { id: created.id };
  }

  // A record with this exact stable key already exists — apply the requested duplicate policy (spec section 15).
  const policy = input.duplicatePolicy ?? "SKIP";

  if (policy === "SKIP") {
    return { id: existing.id };
  }

  if (policy === "REPLACE") {
    await prisma.$transaction([
      prisma.performanceMetricRecord.update({ where: { id: existing.id }, data: { value: input.value, notes: input.notes ?? existing.notes, evidenceFileAssetId: input.evidenceFileAssetId ?? existing.evidenceFileAssetId } }),
      prisma.performanceMetricRevision.create({ data: { metricRecordId: existing.id, changedById: input.createdById, action: "REPLACED", previousValue: existing.value, newValue: input.value } }),
    ]);
    return { id: existing.id };
  }

  if (policy === "MERGE_SUM") {
    const def = isCustomMetricKey(input.metricKey) ? null : findMetricDefinition(input.metricKey);
    if (def && !def.supportsCumulative) return performanceError("METRIC_INCOMPATIBLE", "Esta métrica no es acumulable — no se puede fusionar con MERGE_SUM.");
    const newValue = Number(existing.value) + input.value;
    await prisma.$transaction([
      prisma.performanceMetricRecord.update({ where: { id: existing.id }, data: { value: newValue } }),
      prisma.performanceMetricRevision.create({ data: { metricRecordId: existing.id, changedById: input.createdById, action: "MERGED", previousValue: existing.value, newValue } }),
    ]);
    return { id: existing.id };
  }

  // KEEP_BOTH — persists a second, genuinely distinct record (disambiguated idempotency key) and marks both as having an overlapping measurement (spec section 15).
  const disambiguatedKey = `${idempotencyKey}::keep-both::${randomUUID()}`;
  const overlapNote = `Medición superpuesta con el registro ${existing.id} para el mismo recurso/periodo/plataforma/métrica.`;
  const created = await prisma.performanceMetricRecord.create({
    data: {
      projectId: input.projectId,
      createdById: input.createdById,
      source: input.source as never,
      method: input.method,
      metricKey: input.metricKey,
      resourceType: input.resourceType as never,
      resourceId: input.resourceId ?? null,
      contentItemId: input.contentItemId ?? null,
      contentVersionId: input.contentVersionId ?? null,
      campaignId: input.campaignId ?? null,
      campaignContentPieceId: input.campaignContentPieceId ?? null,
      socialPostId: input.socialPostId ?? null,
      experimentVariantId: input.experimentVariantId ?? null,
      platform: input.platform ?? null,
      value: input.value,
      unit: input.unit as never,
      currency: input.currency ?? null,
      measuredAt: input.measuredAt,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      granularity: input.granularity as never,
      provider: input.provider ?? null,
      externalReference: input.externalReference ?? null,
      notes: [input.notes, overlapNote].filter(Boolean).join(" — "),
      evidenceFileAssetId: input.evidenceFileAssetId ?? null,
      importId: input.importId ?? null,
      idempotencyKey: disambiguatedKey,
    },
  });
  await prisma.$transaction([
    prisma.performanceMetricRevision.create({ data: { metricRecordId: created.id, changedById: input.createdById, action: "CREATED", newValue: input.value } }),
    prisma.performanceMetricRecord.update({ where: { id: existing.id }, data: { notes: [existing.notes, `Medición superpuesta con el registro ${created.id}.`].filter(Boolean).join(" — ") } }),
  ]);
  return { id: created.id, overlapWithId: existing.id };
}

export async function createManualMetricEntry(projectId: string, userId: string, input: ManualMetricEntryInput): Promise<MetricRecordResult> {
  const measuredAt = new Date(input.measuredAt);
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  if (measuredAt.getTime() > Date.now()) return performanceError("METRIC_PERIOD_INVALID", "La fecha de medición no puede ser futura.");
  if (periodEnd.getTime() < periodStart.getTime()) return performanceError("METRIC_PERIOD_INVALID", "El fin del periodo no puede ser anterior al inicio.");
  if (!Number.isFinite(input.value)) return performanceError("METRIC_VALUE_INVALID");

  const resolved = await resolveOwnedResource(projectId, input.resourceType, input);
  if (resolved === null) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");

  const compatibility = await validateMetricCompatibility(input.metricKey, input.resourceType, projectId);
  if (compatibility) return compatibility;

  const def = isCustomMetricKey(input.metricKey) ? null : findMetricDefinition(input.metricKey);
  const customDef = isCustomMetricKey(input.metricKey) ? await prisma.performanceMetricDefinition.findUnique({ where: { projectId_key: { projectId, key: input.metricKey } } }) : null;
  const unit = def?.unit ?? customDef?.unit ?? "COUNT";

  return createMetricRecordCore({
    projectId,
    createdById: userId,
    source: "MANUAL",
    method: "manual_form",
    metricKey: input.metricKey,
    resourceType: input.resourceType,
    ...resolved,
    platform: input.platform ?? null,
    value: input.value,
    unit,
    currency: input.currency ?? null,
    measuredAt,
    periodStart,
    periodEnd,
    granularity: input.granularity,
    externalReference: input.externalReference ?? null,
    notes: input.notes ?? null,
    evidenceFileAssetId: input.evidenceFileAssetId ?? null,
    duplicatePolicy: input.duplicatePolicy,
  });
}

async function getOwnedMetricRecord(projectId: string, metricRecordId: string) {
  const record = await prisma.performanceMetricRecord.findUnique({ where: { id: metricRecordId } });
  if (!record || record.projectId !== projectId) return null;
  return record;
}

export async function updateMetricRecordValue(projectId: string, userId: string, metricRecordId: string, newValue: number, reason?: string): Promise<PerformanceActionError | { id: string }> {
  if (!Number.isFinite(newValue)) return performanceError("METRIC_VALUE_INVALID");
  const record = await getOwnedMetricRecord(projectId, metricRecordId);
  if (!record) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  if (record.source !== "MANUAL") return performanceError("METRIC_INVALID", "Solo se pueden editar mediciones registradas manualmente.");

  await prisma.$transaction([
    prisma.performanceMetricRecord.update({ where: { id: metricRecordId }, data: { value: newValue } }),
    prisma.performanceMetricRevision.create({ data: { metricRecordId, changedById: userId, action: "UPDATED", previousValue: record.value, newValue, reason: reason ?? null } }),
  ]);
  await publishAutomationEvent({
    projectId,
    eventKey: "PERFORMANCE_METRIC_UPDATED",
    resourceId: metricRecordId,
    actorId: userId,
    payload: { id: metricRecordId, metricKey: record.metricKey, value: newValue },
    idempotencyKey: `PERFORMANCE_METRIC_UPDATED:${metricRecordId}:${newValue}:${Date.now()}`,
  });
  return { id: metricRecordId };
}

/** "Eliminar de forma segura" (spec section 11) — archives, never a hard DELETE, so the revision audit trail (spec section 43) is never destroyed along with the row it documents. */
export async function archiveMetricRecord(projectId: string, userId: string, metricRecordId: string): Promise<PerformanceActionError | { id: string }> {
  const record = await getOwnedMetricRecord(projectId, metricRecordId);
  if (!record) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  await prisma.$transaction([
    prisma.performanceMetricRecord.update({ where: { id: metricRecordId }, data: { isArchived: true } }),
    prisma.performanceMetricRevision.create({ data: { metricRecordId, changedById: userId, action: "DELETED", previousValue: record.value } }),
  ]);
  return { id: metricRecordId };
}

export async function duplicateMetricRecord(projectId: string, userId: string, metricRecordId: string): Promise<MetricRecordResult> {
  const record = await getOwnedMetricRecord(projectId, metricRecordId);
  if (!record) return performanceError("PERFORMANCE_RESOURCE_NOT_FOUND");
  return createMetricRecordCore({
    projectId,
    createdById: userId,
    source: record.source as never,
    method: record.method,
    metricKey: record.metricKey,
    resourceType: record.resourceType as never,
    resourceId: record.resourceId,
    contentItemId: record.contentItemId,
    contentVersionId: record.contentVersionId,
    campaignId: record.campaignId,
    campaignContentPieceId: record.campaignContentPieceId,
    socialPostId: record.socialPostId,
    experimentVariantId: record.experimentVariantId,
    platform: record.platform,
    value: Number(record.value),
    unit: record.unit,
    currency: record.currency,
    measuredAt: new Date(),
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    granularity: record.granularity,
    provider: record.provider,
    notes: record.notes ? `${record.notes} (duplicado)` : "Duplicado",
    duplicatePolicy: "KEEP_BOTH",
  });
}

export interface MetricRecordFilters {
  resourceType?: string;
  contentItemId?: string;
  campaignId?: string;
  campaignContentPieceId?: string;
  socialPostId?: string;
  metricKey?: string;
  source?: string;
  platform?: string;
  measuredFrom?: Date;
  measuredTo?: Date;
  includeArchived?: boolean;
  limit?: number;
}

export async function listMetricRecords(projectId: string, filters: MetricRecordFilters = {}) {
  return prisma.performanceMetricRecord.findMany({
    where: {
      projectId,
      ...(filters.resourceType ? { resourceType: filters.resourceType as never } : {}),
      ...(filters.contentItemId ? { contentItemId: filters.contentItemId } : {}),
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.campaignContentPieceId ? { campaignContentPieceId: filters.campaignContentPieceId } : {}),
      ...(filters.socialPostId ? { socialPostId: filters.socialPostId } : {}),
      ...(filters.metricKey ? { metricKey: filters.metricKey } : {}),
      ...(filters.source ? { source: filters.source as never } : {}),
      ...(filters.platform ? { platform: filters.platform } : {}),
      ...(filters.measuredFrom || filters.measuredTo ? { measuredAt: { gte: filters.measuredFrom, lte: filters.measuredTo } } : {}),
      isArchived: filters.includeArchived ? undefined : false,
    },
    orderBy: { measuredAt: "desc" },
    take: filters.limit ?? 200,
  });
}

export async function getMetricRecordDetail(projectId: string, metricRecordId: string) {
  const record = await prisma.performanceMetricRecord.findUnique({
    where: { id: metricRecordId },
    include: { revisions: { orderBy: { createdAt: "asc" } }, createdBy: { select: { id: true, name: true, email: true } }, evidenceFileAsset: { select: { id: true, url: true, originalName: true } } },
  });
  if (!record || record.projectId !== projectId) return null;
  return record;
}

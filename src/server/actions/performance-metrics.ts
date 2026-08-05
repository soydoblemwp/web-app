"use server";

import { revalidatePath } from "next/cache";
import { requireProjectAccess } from "@/lib/permissions";
import { manualMetricEntrySchema, updateMetricRecordSchema, createMetricDefinitionSchema } from "@/lib/validation/performance";
import {
  createManualMetricEntry,
  updateMetricRecordValue,
  archiveMetricRecord,
  duplicateMetricRecord,
  listMetricRecords,
  getMetricRecordDetail,
  type MetricRecordFilters,
} from "@/server/services/performance-metric-records";
import { prisma } from "@/lib/db/prisma";
import type { PerformanceErrorCode } from "@/lib/performance/types";

function revalidatePerformance(projectId: string) {
  revalidatePath(`/dashboard/${projectId}/performance`);
}

export interface MetricActionResult {
  id?: string;
  errorCode?: PerformanceErrorCode;
  errorMessage?: string;
}

export async function createManualMetricEntryAction(projectId: string, input: unknown): Promise<MetricActionResult> {
  const parsed = manualMetricEntrySchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await createManualMetricEntry(projectId, user.id, parsed.data);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePerformance(projectId);
  return { id: result.id };
}

export async function updateMetricRecordAction(projectId: string, input: unknown): Promise<MetricActionResult> {
  const parsed = updateMetricRecordSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await updateMetricRecordValue(projectId, user.id, parsed.data.metricRecordId, parsed.data.value, parsed.data.reason || undefined);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePerformance(projectId);
  return { id: result.id };
}

export async function archiveMetricRecordAction(projectId: string, metricRecordId: string): Promise<MetricActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await archiveMetricRecord(projectId, user.id, metricRecordId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePerformance(projectId);
  return { id: result.id };
}

export async function duplicateMetricRecordAction(projectId: string, metricRecordId: string): Promise<MetricActionResult> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  const result = await duplicateMetricRecord(projectId, user.id, metricRecordId);
  if ("error" in result) return { errorCode: result.code, errorMessage: result.error };
  revalidatePerformance(projectId);
  return { id: result.id };
}

export async function listMetricRecordsAction(projectId: string, filters: MetricRecordFilters = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return listMetricRecords(projectId, filters);
}

export async function getMetricRecordDetailAction(projectId: string, metricRecordId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return getMetricRecordDetail(projectId, metricRecordId);
}

export async function createMetricDefinitionAction(projectId: string, input: unknown): Promise<MetricActionResult> {
  const parsed = createMetricDefinitionSchema.safeParse(input);
  if (!parsed.success) return { errorMessage: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const user = await requireProjectAccess(projectId, "EDITOR");
  const existing = await prisma.performanceMetricDefinition.findUnique({ where: { projectId_key: { projectId, key: parsed.data.key } } });
  if (existing) return { errorCode: "METRIC_DUPLICATE", errorMessage: "Ya existe una métrica personalizada con esa clave." };

  const created = await prisma.performanceMetricDefinition.create({
    data: {
      projectId,
      createdById: user.id,
      key: parsed.data.key,
      name: parsed.data.name,
      description: parsed.data.description || null,
      category: parsed.data.category,
      unit: parsed.data.unit,
      direction: parsed.data.direction,
      aggregation: parsed.data.aggregation,
      compatibleResourceTypes: parsed.data.compatibleResourceTypes,
      compatiblePlatforms: parsed.data.compatiblePlatforms,
      supportsCumulative: parsed.data.supportsCumulative,
      supportsAverage: parsed.data.supportsAverage,
      supportsPercentage: parsed.data.supportsPercentage,
      supportsComparison: parsed.data.supportsComparison,
      requiresNumeratorDenominator: parsed.data.requiresNumeratorDenominator,
      expectedMin: parsed.data.expectedMin ?? null,
      expectedMax: parsed.data.expectedMax ?? null,
    },
  });
  revalidatePerformance(projectId);
  return { id: created.id };
}

export async function listCustomMetricDefinitionsAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return prisma.performanceMetricDefinition.findMany({ where: { projectId, isArchived: false }, orderBy: { createdAt: "desc" } });
}

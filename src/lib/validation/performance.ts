import { z } from "zod";
import {
  PERFORMANCE_RESOURCE_TYPES,
  PERFORMANCE_METRIC_UNITS,
  PERFORMANCE_METRIC_CATEGORIES,
  PERFORMANCE_METRIC_DIRECTIONS,
  PERFORMANCE_METRIC_AGGREGATIONS,
  PERFORMANCE_PERIOD_GRANULARITIES,
  PERFORMANCE_DUPLICATE_POLICIES,
  PERFORMANCE_GOAL_TYPES,
  PERFORMANCE_BENCHMARK_SOURCES,
  PERFORMANCE_EXPERIMENT_TYPES,
  PERFORMANCE_RECOMMENDATION_STATUSES,
  PERFORMANCE_RECOMMENDATION_ACTION_TYPES,
  PERFORMANCE_ANOMALY_STATUSES,
  PERFORMANCE_REPORT_TYPES,
} from "@/lib/performance/types";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha no válida.");

export const manualMetricEntrySchema = z.object({
  resourceType: z.enum(PERFORMANCE_RESOURCE_TYPES),
  contentItemId: z.string().cuid().optional(),
  campaignId: z.string().cuid().optional(),
  campaignContentPieceId: z.string().cuid().optional(),
  socialPostId: z.string().cuid().optional(),
  platform: z.string().trim().max(60).optional(),
  metricKey: z.string().trim().min(1).max(120),
  value: z.number().finite(),
  currency: z.string().trim().length(3).optional(),
  measuredAt: isoDate,
  periodStart: isoDate,
  periodEnd: isoDate,
  granularity: z.enum(PERFORMANCE_PERIOD_GRANULARITIES).default("DAY"),
  provider: z.string().trim().max(80).optional(),
  externalReference: z.string().trim().max(200).optional(),
  notes: optionalText(2000),
  evidenceFileAssetId: z.string().cuid().optional(),
  duplicatePolicy: z.enum(PERFORMANCE_DUPLICATE_POLICIES).default("SKIP"),
});
export type ManualMetricEntryInput = z.infer<typeof manualMetricEntrySchema>;

export const updateMetricRecordSchema = z.object({
  metricRecordId: z.string().cuid(),
  value: z.number().finite(),
  reason: optionalText(1000),
});
export type UpdateMetricRecordInput = z.infer<typeof updateMetricRecordSchema>;

export const createMetricDefinitionSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^custom\.[a-z0-9_]+$/, 'La clave debe tener el formato "custom.mi_metrica".'),
  name: z.string().trim().min(1).max(120),
  description: optionalText(1000),
  category: z.enum(PERFORMANCE_METRIC_CATEGORIES).default("CUSTOM"),
  unit: z.enum(PERFORMANCE_METRIC_UNITS),
  direction: z.enum(PERFORMANCE_METRIC_DIRECTIONS).default("HIGHER_IS_BETTER"),
  aggregation: z.enum(PERFORMANCE_METRIC_AGGREGATIONS).default("SUM"),
  compatibleResourceTypes: z.array(z.enum(PERFORMANCE_RESOURCE_TYPES)).min(1),
  compatiblePlatforms: z.array(z.string().trim().max(60)).default([]),
  supportsCumulative: z.boolean().default(true),
  supportsAverage: z.boolean().default(true),
  supportsPercentage: z.boolean().default(false),
  supportsComparison: z.boolean().default(true),
  requiresNumeratorDenominator: z.boolean().default(false),
  expectedMin: z.number().finite().optional(),
  expectedMax: z.number().finite().optional(),
});
export type CreateMetricDefinitionInput = z.infer<typeof createMetricDefinitionSchema>;

export const createImportSchema = z.object({
  kind: z.enum(["CSV", "JSON"]),
  fileAssetId: z.string().cuid().optional(),
  rawText: z.string().max(5_000_000).optional(),
  platform: z.string().trim().max(60).optional(),
  resourceType: z.enum(PERFORMANCE_RESOURCE_TYPES).optional(),
});
export type CreateImportInput = z.infer<typeof createImportSchema>;

export const importMappingFieldSchema = z.object({
  sourceColumn: z.string().trim().min(1).max(200),
  targetField: z.enum(["measuredAt", "periodStart", "periodEnd", "resourceId", "platform", "externalReference", "metricKey", "value", "currency", "ignore"]),
  metricKey: z.string().trim().max(120).optional(),
});

export const configureImportSchema = z.object({
  importId: z.string().cuid(),
  platform: z.string().trim().max(60).optional(),
  resourceType: z.enum(PERFORMANCE_RESOURCE_TYPES).optional(),
  mapping: z.array(importMappingFieldSchema).min(1),
  delimiter: z.string().max(3).optional(),
  dateFormat: z.string().max(40).optional(),
  containerPath: z.string().max(200).optional(),
  duplicatePolicy: z.enum(PERFORMANCE_DUPLICATE_POLICIES).default("SKIP"),
  defaultGranularity: z.enum(PERFORMANCE_PERIOD_GRANULARITIES).default("DAY"),
});
export type ConfigureImportInput = z.infer<typeof configureImportSchema>;

export const createGoalSchema = z.object({
  resourceType: z.enum(PERFORMANCE_RESOURCE_TYPES),
  campaignId: z.string().cuid().optional(),
  contentItemId: z.string().cuid().optional(),
  platform: z.string().trim().max(60).optional(),
  metricKey: z.string().trim().min(1).max(120),
  type: z.enum(PERFORMANCE_GOAL_TYPES),
  targetValue: z.number().finite().optional(),
  targetMin: z.number().finite().optional(),
  targetMax: z.number().finite().optional(),
  periodStart: isoDate,
  periodEnd: isoDate,
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const createBenchmarkSchema = z.object({
  metricKey: z.string().trim().min(1).max(120),
  source: z.enum(PERFORMANCE_BENCHMARK_SOURCES),
  campaignId: z.string().cuid().optional(),
  label: z.string().trim().max(120).optional(),
  value: z.number().finite(),
});
export type CreateBenchmarkInput = z.infer<typeof createBenchmarkSchema>;

export const createExperimentSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  hypothesis: z.string().trim().min(1, "La hipótesis es obligatoria.").max(2000),
  objective: optionalText(500),
  type: z.enum(PERFORMANCE_EXPERIMENT_TYPES),
  primaryMetricKey: z.string().trim().min(1).max(120),
  secondaryMetricKeys: z.array(z.string().trim().max(120)).max(10).default([]),
  resourceType: z.enum(PERFORMANCE_RESOURCE_TYPES),
  contentItemId: z.string().cuid().optional(),
  campaignId: z.string().cuid().optional(),
  platform: z.string().trim().max(60).optional(),
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
  expectedSampleSize: z.number().int().positive().optional(),
  completionCriteria: optionalText(1000),
});
export type CreateExperimentInput = z.infer<typeof createExperimentSchema>;

export const createVariantSchema = z.object({
  experimentId: z.string().cuid(),
  label: z.string().trim().min(1).max(100),
  isControl: z.boolean().default(false),
  contentVersionId: z.string().cuid().optional(),
  socialPostId: z.string().cuid().optional(),
  text: optionalText(20000),
  /** Set only when this variant's text came from a confirmed AI Agent suggestion (spec section 21) — the UI must have already shown a preview and required explicit confirmation before calling this. */
  createdByAgentRunId: z.string().cuid().optional(),
  agentKeyUsed: z.string().trim().max(100).optional(),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const decideExperimentWinnerSchema = z.object({
  experimentId: z.string().cuid(),
  winnerVariantId: z.string().cuid().optional(),
  conclusion: z.string().trim().min(1).max(4000),
});
export type DecideExperimentWinnerInput = z.infer<typeof decideExperimentWinnerSchema>;

export const decideRecommendationSchema = z.object({
  recommendationId: z.string().cuid(),
  status: z.enum(PERFORMANCE_RECOMMENDATION_STATUSES),
});
export type DecideRecommendationInput = z.infer<typeof decideRecommendationSchema>;

export const createRecommendationActionSchema = z.object({
  recommendationId: z.string().cuid(),
  actionType: z.enum(PERFORMANCE_RECOMMENDATION_ACTION_TYPES),
  parameters: z.record(z.string(), z.unknown()).optional(),
});
export type CreateRecommendationActionInput = z.infer<typeof createRecommendationActionSchema>;

export const decideAnomalySchema = z.object({
  anomalyId: z.string().cuid(),
  status: z.enum(PERFORMANCE_ANOMALY_STATUSES),
});
export type DecideAnomalyInput = z.infer<typeof decideAnomalySchema>;

export const createReportSchema = z.object({
  type: z.enum(PERFORMANCE_REPORT_TYPES),
  title: z.string().trim().min(1).max(200),
  periodStart: isoDate,
  periodEnd: isoDate,
  campaignId: z.string().cuid().optional(),
  contentItemId: z.string().cuid().optional(),
  experimentId: z.string().cuid().optional(),
  platform: z.string().trim().max(60).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

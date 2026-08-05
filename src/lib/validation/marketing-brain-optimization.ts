import { z } from "zod";
import { PERFORMANCE_CONTEXT_MODES, MB_CONTEXT_RESOURCE_TYPES } from "@/lib/marketing-brain/performance-context-types";
import { MB_OPTIMIZATION_LIMITS } from "@/lib/marketing-brain/optimization-limits";
import { PERFORMANCE_RESOURCE_TYPES } from "@/lib/performance/types";

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha no válida.");
const idArray = (max: number) => z.array(z.string().cuid()).max(max).default([]);

export const performanceContextSelectionSchema = z
  .object({
    mode: z.enum(PERFORMANCE_CONTEXT_MODES),
    periodStart: isoDate.optional(),
    periodEnd: isoDate.optional(),
    compareToPreviousPeriod: z.boolean().default(false),
    resourceType: z.enum(MB_CONTEXT_RESOURCE_TYPES).optional(),
    resourceIds: idArray(MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_RESOURCES),
    metricKeys: z.array(z.string().trim().min(1).max(120)).max(MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_METRICS).default([]),
    goalIds: idArray(MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_GOALS),
    benchmarkIds: idArray(MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_BENCHMARKS),
    experimentIds: idArray(MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_EXPERIMENTS),
    recommendationIds: idArray(MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_RECOMMENDATIONS),
    reportIds: idArray(MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_REPORTS),
  })
  .refine((v) => v.mode === "NONE" || (!!v.periodStart && !!v.periodEnd), { message: "Selecciona un periodo antes de continuar.", path: ["periodStart"] })
  .refine((v) => !v.periodStart || !v.periodEnd || new Date(v.periodEnd) > new Date(v.periodStart), { message: "La fecha final debe ser posterior a la fecha inicial.", path: ["periodEnd"] })
  .refine((v) => {
    if (!v.periodStart || !v.periodEnd) return true;
    const days = (new Date(v.periodEnd).getTime() - new Date(v.periodStart).getTime()) / 86_400_000;
    return days > 0 && days <= MB_OPTIMIZATION_LIMITS.MAX_PERIOD_DAYS;
  }, { message: `El periodo no puede superar ${MB_OPTIMIZATION_LIMITS.MAX_PERIOD_DAYS} días.`, path: ["periodEnd"] });

export type PerformanceContextSelectionParsed = z.infer<typeof performanceContextSelectionSchema>;

export const createOptimizationSessionSchema = z.object({
  idempotencyKey: z.string().trim().min(10).max(100),
  campaignId: z.string().cuid().nullable().optional(),
  createdByAgentRunId: z.string().cuid().optional(),
});

export const updateSessionSelectionSchema = z.object({
  sessionId: z.string().cuid(),
  selection: performanceContextSelectionSchema,
});

export const decideOptimizationSessionSchema = z.object({
  sessionId: z.string().cuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(2000).optional(),
  selectedScenarioKind: z.enum(["CONSERVATIVE", "BALANCED", "EXPANSIVE"]).optional(),
});

export const convertScenarioActionSchema = z.object({
  scenarioActionId: z.string().cuid(),
  actionType: z.enum(["CAMPAIGN_CONTENT_PIECE", "CONTENT_ITEM", "SOCIAL_POST", "AGENT_RUN", "KNOWLEDGE_QUERY", "TASK"]),
  parameters: z.object({ platform: z.string().trim().max(60).optional(), question: z.string().trim().max(2000).optional() }).optional(),
});
export type ConvertScenarioActionInput = z.infer<typeof convertScenarioActionSchema>;

export const createMeasurementPlanSchema = z.object({
  sessionId: z.string().cuid(),
  primaryMetricKey: z.string().trim().min(1).max(120),
  secondaryMetricKeys: z.array(z.string().trim().max(120)).max(MB_OPTIMIZATION_LIMITS.MAX_SECONDARY_METRICS_PER_PLAN).default([]),
  resourceType: z.enum(PERFORMANCE_RESOURCE_TYPES),
  contentItemId: z.string().cuid().optional(),
  campaignId: z.string().cuid().optional(),
  socialPostId: z.string().cuid().optional(),
  goalId: z.string().cuid().optional(),
  trackingStart: isoDate,
  trackingEnd: isoDate,
  comparisonPeriodStart: isoDate.optional(),
  comparisonPeriodEnd: isoDate.optional(),
}).refine((v) => new Date(v.trackingEnd) > new Date(v.trackingStart), { message: "La fecha final de seguimiento debe ser posterior a la inicial.", path: ["trackingEnd"] });
export type CreateMeasurementPlanInput = z.infer<typeof createMeasurementPlanSchema>;

export const generateMeasurementReviewSchema = z.object({
  planId: z.string().cuid(),
});

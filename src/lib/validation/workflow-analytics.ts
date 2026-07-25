import { z } from "zod";
import { ANALYTICS_PERIOD_PRESETS } from "@/lib/ai-workflows/analytics-time";
import { WORKFLOW_STEP_TYPES } from "@/lib/ai-workflows/engine";

const MAX_CUSTOM_RANGE_DAYS = 366;
const MAX_CUSTOM_RANGE_MS = MAX_CUSTOM_RANGE_DAYS * 24 * 60 * 60 * 1000;

export const WORKFLOW_RUN_STATUS_VALUES = [
  "PENDING",
  "VALIDATING",
  "RUNNING",
  "INTERRUPTED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export const EXECUTION_MODE_VALUES = ["PUBLISHED", "DRAFT_TEST", "RETRY_ORIGINAL_SNAPSHOT", "RETRY_CURRENT_VERSION", "NEW"] as const;

/** A malformed id can never do anything unsafe (Prisma always parameterizes and simply returns no rows), so this only needs to reject the pathological cases — empty or absurdly long — not enforce an exact id format. */
const idSchema = z.string().trim().min(1).max(64);

export const periodSchema = z.union([
  z.object({ preset: z.enum(ANALYTICS_PERIOD_PRESETS) }),
  z
    .object({ from: z.coerce.date(), to: z.coerce.date() })
    .refine((v) => v.from.getTime() <= v.to.getTime(), { message: "El rango de fechas es inválido: la fecha inicial es posterior a la final." })
    .refine((v) => v.to.getTime() - v.from.getTime() <= MAX_CUSTOM_RANGE_MS, {
      message: `El rango de fechas no puede superar ${MAX_CUSTOM_RANGE_DAYS} días.`,
    }),
]);
export type PeriodSchemaInput = z.infer<typeof periodSchema>;

export const analyticsFiltersSchema = z.object({
  workflowId: idSchema.optional(),
  version: z.coerce.number().int().positive().max(1_000_000).optional(),
  status: z.enum(WORKFLOW_RUN_STATUS_VALUES).optional(),
  executionMode: z.enum(EXECUTION_MODE_VALUES).optional(),
  toolSlug: z.string().trim().min(1).max(120).optional(),
  stepType: z.enum(WORKFLOW_STEP_TYPES as [string, ...string[]]).optional(),
  favoritesOnly: z.coerce.boolean().optional(),
  activeOnly: z.coerce.boolean().optional(),
});
export type AnalyticsFiltersInput = z.infer<typeof analyticsFiltersSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const EXPORT_TYPES = ["workflows_summary", "runs", "version_metrics", "step_metrics", "errors"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export const exportParamsSchema = z.object({
  type: z.enum(EXPORT_TYPES),
  // Deliberately required (not .optional()) — an export without a bounded period is exactly the "sin período obligatorio" case the spec forbids.
  period: periodSchema,
  filters: analyticsFiltersSchema.optional(),
});
export type ExportParamsInput = z.infer<typeof exportParamsSchema>;

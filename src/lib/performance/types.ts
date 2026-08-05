/**
 * Shared, framework-free types for AI Performance Intelligence &
 * Optimization Center (Fase 34). Mirrors the Prisma enum value lists in
 * prisma/schema.prisma exactly (kept as plain string unions here so pure lib
 * functions never need to import the generated Prisma client) — same
 * convention as src/lib/automations/types.ts and src/lib/knowledge/types.ts.
 */

/** Where a metric value actually came from (spec section 2) — the UI must always show this, never presenting one origin as another. */
export const PERFORMANCE_METRIC_ORIGINS = ["INTERNAL", "MANUAL", "CSV_IMPORT", "JSON_IMPORT", "EXTERNAL_PROVIDER", "CALCULATED", "ESTIMATED"] as const;
export type PerformanceMetricOrigin = (typeof PERFORMANCE_METRIC_ORIGINS)[number];

export const PERFORMANCE_RESOURCE_TYPES = ["CONTENT_ITEM", "CONTENT_VERSION", "CAMPAIGN", "CAMPAIGN_CONTENT_PIECE", "SOCIAL_POST", "EXPERIMENT_VARIANT", "PLATFORM", "PROJECT"] as const;
export type PerformanceResourceType = (typeof PERFORMANCE_RESOURCE_TYPES)[number];

export const PERFORMANCE_METRIC_CATEGORIES = ["CONTENT", "CAMPAIGN", "SOCIAL", "AUTOMATION", "KNOWLEDGE", "CUSTOM", "ANALYTICS"] as const;
export type PerformanceMetricCategory = (typeof PERFORMANCE_METRIC_CATEGORIES)[number];

export const PERFORMANCE_METRIC_UNITS = ["COUNT", "PERCENTAGE", "SECONDS", "CURRENCY", "RATIO", "SCORE", "TEXT"] as const;
export type PerformanceMetricUnit = (typeof PERFORMANCE_METRIC_UNITS)[number];

export const PERFORMANCE_METRIC_DIRECTIONS = ["HIGHER_IS_BETTER", "LOWER_IS_BETTER", "NEUTRAL"] as const;
export type PerformanceMetricDirection = (typeof PERFORMANCE_METRIC_DIRECTIONS)[number];

export const PERFORMANCE_METRIC_AGGREGATIONS = ["SUM", "AVERAGE", "MEDIAN", "MAX", "MIN", "LAST", "RATE"] as const;
export type PerformanceMetricAggregation = (typeof PERFORMANCE_METRIC_AGGREGATIONS)[number];

/** Spec section 10's exact period list. */
export const PERFORMANCE_PERIOD_GRANULARITIES = ["DAY", "WEEK", "MONTH", "QUARTER", "YEAR", "CAMPAIGN", "EXPERIMENT", "PUBLICATION", "CUSTOM_RANGE"] as const;
export type PerformancePeriodGranularity = (typeof PERFORMANCE_PERIOD_GRANULARITIES)[number];

export const PERFORMANCE_DUPLICATE_POLICIES = ["SKIP", "REPLACE", "MERGE_SUM", "KEEP_BOTH"] as const;
export type PerformanceDuplicatePolicy = (typeof PERFORMANCE_DUPLICATE_POLICIES)[number];

export const PERFORMANCE_GOAL_TYPES = ["MINIMUM", "MAXIMUM", "RANGE", "GROWTH", "MAINTAIN", "CUSTOM"] as const;
export type PerformanceGoalType = (typeof PERFORMANCE_GOAL_TYPES)[number];

export const PERFORMANCE_GOAL_STATUSES = ["ACTIVE", "REACHED", "MISSED", "EXPIRED", "ARCHIVED"] as const;
export type PerformanceGoalStatus = (typeof PERFORMANCE_GOAL_STATUSES)[number];

export const PERFORMANCE_BENCHMARK_SOURCES = ["INTERNAL_AVERAGE", "INTERNAL_MEDIAN", "BEST_HISTORICAL", "PREVIOUS_PERIOD", "PREVIOUS_CAMPAIGN", "MANUAL_VALUE"] as const;
export type PerformanceBenchmarkSource = (typeof PERFORMANCE_BENCHMARK_SOURCES)[number];

export const PERFORMANCE_EXPERIMENT_TYPES = ["TITLE", "HOOK", "CTA", "DESCRIPTION", "FORMAT", "LENGTH", "TONE", "PUBLISHING_TIME", "PLATFORM_ADAPTATION", "CONTENT_VERSION", "CUSTOM"] as const;
export type PerformanceExperimentType = (typeof PERFORMANCE_EXPERIMENT_TYPES)[number];

export const PERFORMANCE_EXPERIMENT_STATUSES = ["DRAFT", "READY", "RUNNING", "PAUSED", "COMPLETED", "INCONCLUSIVE", "CANCELLED", "ARCHIVED"] as const;
export type PerformanceExperimentStatus = (typeof PERFORMANCE_EXPERIMENT_STATUSES)[number];

export const PERFORMANCE_RECOMMENDATION_CATEGORIES = ["CONTENT", "CAMPAIGN", "SOCIAL", "AUTOMATION", "KNOWLEDGE", "EXPERIMENT", "DATA_QUALITY"] as const;
export type PerformanceRecommendationCategory = (typeof PERFORMANCE_RECOMMENDATION_CATEGORIES)[number];

export const PERFORMANCE_RECOMMENDATION_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type PerformanceRecommendationPriority = (typeof PERFORMANCE_RECOMMENDATION_PRIORITIES)[number];

export const PERFORMANCE_RECOMMENDATION_STATUSES = ["NEW", "REVIEWING", "ACCEPTED", "REJECTED", "APPLIED", "DISMISSED", "EXPIRED", "ARCHIVED"] as const;
export type PerformanceRecommendationStatus = (typeof PERFORMANCE_RECOMMENDATION_STATUSES)[number];

export const PERFORMANCE_RECOMMENDATION_ACTION_TYPES = [
  "INTERNAL_TASK",
  "AGENT_RUN",
  "AGENT_TEAM_RUN",
  "WORKFLOW_RUN",
  "WORKFLOW_AUTOMATION",
  "EXPERIMENT",
  "CONTENT_VERSION",
  "CAMPAIGN_CONTENT_PIECE",
  "SOCIAL_POST",
  "CONTENT_UPDATE",
  "KNOWLEDGE_QUERY",
] as const;
export type PerformanceRecommendationActionType = (typeof PERFORMANCE_RECOMMENDATION_ACTION_TYPES)[number];

export const PERFORMANCE_ANOMALY_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type PerformanceAnomalySeverity = (typeof PERFORMANCE_ANOMALY_SEVERITIES)[number];

export const PERFORMANCE_ANOMALY_METHODS = ["STDDEV", "IQR", "PERCENT_CHANGE", "MISSING_DATA", "ACTIVITY_DROP", "ACTIVITY_SPIKE"] as const;
export type PerformanceAnomalyMethod = (typeof PERFORMANCE_ANOMALY_METHODS)[number];

export const PERFORMANCE_ANOMALY_STATUSES = ["OPEN", "REVIEWING", "CONFIRMED", "DISMISSED", "RESOLVED", "ARCHIVED"] as const;
export type PerformanceAnomalyStatus = (typeof PERFORMANCE_ANOMALY_STATUSES)[number];

export const PERFORMANCE_REPORT_TYPES = ["WEEKLY", "MONTHLY", "CAMPAIGN", "CONTENT", "PLATFORM", "EXPERIMENT", "CUSTOM"] as const;
export type PerformanceReportType = (typeof PERFORMANCE_REPORT_TYPES)[number];

export const PERFORMANCE_DATA_QUALITY_LEVELS = ["EXCELLENT", "GOOD", "LIMITED", "POOR", "INSUFFICIENT"] as const;
export type PerformanceDataQualityLevel = (typeof PERFORMANCE_DATA_QUALITY_LEVELS)[number];

export const PERFORMANCE_TREND_DIRECTIONS = ["RISING", "FALLING", "STABLE", "VOLATILE", "INSUFFICIENT_DATA"] as const;
export type PerformanceTrendDirection = (typeof PERFORMANCE_TREND_DIRECTIONS)[number];

/**
 * Functional, typed error codes (spec section 49). Every service function
 * that can fail returns one of these, never a raw thrown error or a stack
 * trace.
 */
export const PERFORMANCE_ERROR_CODES = [
  "PERFORMANCE_RESOURCE_NOT_FOUND",
  "METRIC_DEFINITION_NOT_FOUND",
  "METRIC_INVALID",
  "METRIC_DUPLICATE",
  "METRIC_INCOMPATIBLE",
  "METRIC_PERIOD_INVALID",
  "METRIC_VALUE_INVALID",
  "IMPORT_FILE_INVALID",
  "IMPORT_MAPPING_INVALID",
  "IMPORT_ROW_INVALID",
  "IMPORT_CONFLICT",
  "IMPORT_PROCESSING_CONFLICT",
  "INSUFFICIENT_DATA",
  "DATA_QUALITY_TOO_LOW",
  "COMPARISON_INCOMPATIBLE",
  "EXPERIMENT_INVALID",
  "EXPERIMENT_NOT_READY",
  "EXPERIMENT_INSUFFICIENT_SAMPLE",
  "EXPERIMENT_ALREADY_COMPLETED",
  "RECOMMENDATION_NOT_FOUND",
  "RECOMMENDATION_ALREADY_APPLIED",
  "ANOMALY_NOT_FOUND",
  "REPORT_GENERATION_FAILED",
  "LOCK_CONFLICT",
  "PERMISSION_DENIED",
  "INTERNAL_SAFE_ERROR",
] as const;
export type PerformanceErrorCode = (typeof PERFORMANCE_ERROR_CODES)[number];

export const PERFORMANCE_ERROR_MESSAGES: Record<PerformanceErrorCode, string> = {
  PERFORMANCE_RESOURCE_NOT_FOUND: "No se encontró el recurso indicado.",
  METRIC_DEFINITION_NOT_FOUND: "No se encontró la definición de esa métrica.",
  METRIC_INVALID: "Los datos de la métrica no son válidos.",
  METRIC_DUPLICATE: "Ya existe una medición equivalente para este recurso, plataforma y periodo.",
  METRIC_INCOMPATIBLE: "Esta métrica no es compatible con el recurso o la plataforma indicados.",
  METRIC_PERIOD_INVALID: "El periodo indicado no es válido.",
  METRIC_VALUE_INVALID: "El valor de la métrica no es válido.",
  IMPORT_FILE_INVALID: "El archivo no es válido o no se pudo leer.",
  IMPORT_MAPPING_INVALID: "El mapeo de columnas o propiedades no es válido.",
  IMPORT_ROW_INVALID: "Una o más filas no son válidas.",
  IMPORT_CONFLICT: "Se detectó un conflicto con datos ya importados.",
  IMPORT_PROCESSING_CONFLICT: "Esta importación ya está siendo procesada en otra solicitud.",
  INSUFFICIENT_DATA: "No hay datos suficientes para esta operación.",
  DATA_QUALITY_TOO_LOW: "La calidad de los datos disponibles es demasiado baja para esta conclusión.",
  COMPARISON_INCOMPATIBLE: "Los elementos seleccionados no son comparables entre sí.",
  EXPERIMENT_INVALID: "Los datos del experimento no son válidos.",
  EXPERIMENT_NOT_READY: "El experimento no está listo para esta acción.",
  EXPERIMENT_INSUFFICIENT_SAMPLE: "La muestra del experimento es insuficiente para concluir.",
  EXPERIMENT_ALREADY_COMPLETED: "Este experimento ya fue completado.",
  RECOMMENDATION_NOT_FOUND: "No se encontró la recomendación indicada.",
  RECOMMENDATION_ALREADY_APPLIED: "Esta recomendación ya fue aplicada.",
  ANOMALY_NOT_FOUND: "No se encontró la anomalía indicada.",
  REPORT_GENERATION_FAILED: "No se pudo generar el informe.",
  LOCK_CONFLICT: "Este recurso ya está siendo procesado en otra solicitud.",
  PERMISSION_DENIED: "No tienes permiso para realizar esta acción.",
  INTERNAL_SAFE_ERROR: "Ocurrió un error inesperado. Intenta de nuevo.",
} as const;

export interface PerformanceActionError {
  error: string;
  code: PerformanceErrorCode;
}

export function performanceError(code: PerformanceErrorCode, overrideMessage?: string): PerformanceActionError {
  return { error: overrideMessage ?? PERFORMANCE_ERROR_MESSAGES[code], code };
}

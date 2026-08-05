/**
 * Shared, framework-free types for AI Automation Center (Fase 33). Mirrors
 * the Prisma enum value lists in prisma/schema.prisma exactly (kept as
 * plain string unions here so pure lib functions never need to import the
 * generated Prisma client) — same convention as src/lib/agents/types.ts and
 * src/lib/knowledge/types.ts.
 */

export const WORKFLOW_AUTOMATION_TRIGGER_TYPES = [
  "MANUAL",
  "SCHEDULE_ONCE",
  "SCHEDULE_RECURRING",
  "INTERNAL_EVENT",
  "WEBHOOK",
  "WORKFLOW_COMPLETED",
  "AGENT_RUN_COMPLETED",
  "MARKETING_BRAIN_COMPLETED",
  "KNOWLEDGE_SOURCE_READY",
  "CONTENT_STATUS_CHANGED",
  "CAMPAIGN_DATE_REACHED",
  "SOCIAL_POST_STATUS_CHANGED",
] as const;
export type WorkflowAutomationTriggerType = (typeof WORKFLOW_AUTOMATION_TRIGGER_TYPES)[number];

/** Trigger types resolved by matching a published WorkflowAutomationEvent (spec section 8/14) — as opposed to the time-based (SCHEDULE_*, CAMPAIGN_DATE_REACHED), MANUAL, or WEBHOOK triggers, which the scheduler/webhook endpoint resolve directly. */
export const EVENT_BACKED_TRIGGER_TYPES: WorkflowAutomationTriggerType[] = [
  "INTERNAL_EVENT",
  "WORKFLOW_COMPLETED",
  "AGENT_RUN_COMPLETED",
  "MARKETING_BRAIN_COMPLETED",
  "KNOWLEDGE_SOURCE_READY",
  "CONTENT_STATUS_CHANGED",
  "SOCIAL_POST_STATUS_CHANGED",
];

export const WORKFLOW_AUTOMATION_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED", "ERROR"] as const;
export type WorkflowAutomationStatusValue = (typeof WORKFLOW_AUTOMATION_STATUSES)[number];

export const WORKFLOW_AUTOMATION_RUN_STATUSES = [
  "QUEUED",
  "WAITING_FOR_SCHEDULE",
  "WAITING_FOR_CONDITION",
  "WAITING_FOR_APPROVAL",
  "RUNNING",
  "RETRY_SCHEDULED",
  "PARTIALLY_COMPLETED",
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "SKIPPED",
  "ARCHIVED",
] as const;
export type WorkflowAutomationRunStatusValue = (typeof WORKFLOW_AUTOMATION_RUN_STATUSES)[number];

export function isTerminalAutomationRunStatus(status: string): boolean {
  return ["PARTIALLY_COMPLETED", "COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "SKIPPED", "ARCHIVED"].includes(status);
}

export const WORKFLOW_AUTOMATION_ERROR_POLICIES = ["STOP", "RETRY", "CONTINUE", "WAIT_FOR_REVIEW"] as const;
export type WorkflowAutomationErrorPolicy = (typeof WORKFLOW_AUTOMATION_ERROR_POLICIES)[number];

export const WORKFLOW_AUTOMATION_APPROVAL_STATUSES = ["PENDING", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "EXPIRED", "CANCELLED"] as const;
export type WorkflowAutomationApprovalStatusValue = (typeof WORKFLOW_AUTOMATION_APPROVAL_STATUSES)[number];

export const WORKFLOW_AUTOMATION_WAIT_KINDS = ["DURATION", "UNTIL_DATE", "APPROVAL", "EVENT", "CONDITION"] as const;
export type WorkflowAutomationWaitKind = (typeof WORKFLOW_AUTOMATION_WAIT_KINDS)[number];

/** Uppercase to match this schema's Prisma enum convention (spec's own prose lists these in lowercase — "equals; not_equals; contains..." — but every other enum in this project is uppercase; see WorkflowAutomationConditionOperator in prisma/schema.prisma). The UI labels these back to their natural-language form (src/components/automations/condition-labels.ts). */
export const WORKFLOW_AUTOMATION_CONDITION_OPERATORS = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "NOT_CONTAINS",
  "STARTS_WITH",
  "ENDS_WITH",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
  "IN",
  "NOT_IN",
  "CHANGED_FROM",
  "CHANGED_TO",
  "EXISTS",
  "NOT_EXISTS",
] as const;
export type WorkflowAutomationConditionOperator = (typeof WORKFLOW_AUTOMATION_CONDITION_OPERATORS)[number];

export const WORKFLOW_AUTOMATION_CONDITION_GROUP_OPERATORS = ["AND", "OR"] as const;
export type WorkflowAutomationConditionGroupOperator = (typeof WORKFLOW_AUTOMATION_CONDITION_GROUP_OPERATORS)[number];

/**
 * Functional, typed error codes (spec section 49). Every service function
 * that can fail returns one of these, never a raw thrown error or a stack
 * trace.
 */
export const WORKFLOW_AUTOMATION_ERROR_CODES = [
  "AUTOMATION_NOT_FOUND",
  "AUTOMATION_INACTIVE",
  "WORKFLOW_NOT_READY",
  "TRIGGER_INVALID",
  "SCHEDULE_INVALID",
  "SCHEDULE_IN_PAST",
  "CONDITION_INVALID",
  "CONDITION_NOT_MATCHED",
  "INPUT_MAPPING_INVALID",
  "INPUT_REQUIRED",
  "WEBHOOK_INVALID",
  "WEBHOOK_SIGNATURE_INVALID",
  "WEBHOOK_REPLAY_DETECTED",
  "WEBHOOK_RATE_LIMITED",
  "EVENT_INVALID",
  "EVENT_ALREADY_PROCESSED",
  "AUTOMATION_ALREADY_RUNNING",
  "AUTOMATION_LOOP_DETECTED",
  "APPROVAL_REQUIRED",
  "APPROVAL_EXPIRED",
  "WAIT_TIMEOUT",
  "EXECUTION_TIMEOUT",
  "RETRY_EXHAUSTED",
  "LOCK_CONFLICT",
  "CRON_NOT_CONFIGURED",
  "PERMISSION_DENIED",
  "INTERNAL_SAFE_ERROR",
] as const;
export type WorkflowAutomationErrorCode = (typeof WORKFLOW_AUTOMATION_ERROR_CODES)[number];

export const WORKFLOW_AUTOMATION_ERROR_MESSAGES: Record<WorkflowAutomationErrorCode, string> = {
  AUTOMATION_NOT_FOUND: "No se encontró la automatización indicada.",
  AUTOMATION_INACTIVE: "Esta automatización no está activa.",
  WORKFLOW_NOT_READY: "El workflow de esta automatización no tiene ninguna versión publicada lista para ejecutar.",
  TRIGGER_INVALID: "La configuración del disparador no es válida.",
  SCHEDULE_INVALID: "La programación no es válida.",
  SCHEDULE_IN_PAST: "La fecha programada ya pasó.",
  CONDITION_INVALID: "Una de las condiciones no es válida.",
  CONDITION_NOT_MATCHED: "El evento no cumplió las condiciones configuradas.",
  INPUT_MAPPING_INVALID: "Uno de los mapeos de entrada no es válido.",
  INPUT_REQUIRED: "Faltan entradas obligatorias del workflow.",
  WEBHOOK_INVALID: "La solicitud de webhook no es válida.",
  WEBHOOK_SIGNATURE_INVALID: "La firma del webhook no es válida.",
  WEBHOOK_REPLAY_DETECTED: "Esta entrega de webhook ya fue procesada (posible repetición).",
  WEBHOOK_RATE_LIMITED: "Se alcanzó el límite de solicitudes para este webhook.",
  EVENT_INVALID: "El evento interno no es válido.",
  EVENT_ALREADY_PROCESSED: "Este evento ya fue procesado.",
  AUTOMATION_ALREADY_RUNNING: "Ya existe una ejecución activa para esta activación.",
  AUTOMATION_LOOP_DETECTED: "Se detectó un posible bucle de automatizaciones — no se ejecutó.",
  APPROVAL_REQUIRED: "Esta ejecución requiere aprobación antes de continuar.",
  APPROVAL_EXPIRED: "La aprobación requerida expiró.",
  WAIT_TIMEOUT: "Se superó el tiempo máximo de espera.",
  EXECUTION_TIMEOUT: "Se superó el tiempo máximo de ejecución.",
  RETRY_EXHAUSTED: "Se agotaron los reintentos permitidos.",
  LOCK_CONFLICT: "Esta ejecución ya está siendo procesada en otra solicitud.",
  CRON_NOT_CONFIGURED: "La ejecución automática por cron no está configurada en este entorno.",
  PERMISSION_DENIED: "No tienes permiso para realizar esta acción.",
  INTERNAL_SAFE_ERROR: "Ocurrió un error inesperado. Intenta de nuevo.",
};

export interface WorkflowAutomationActionError {
  error: string;
  code: WorkflowAutomationErrorCode;
}

export function automationError(code: WorkflowAutomationErrorCode, overrideMessage?: string): WorkflowAutomationActionError {
  return { error: overrideMessage ?? WORKFLOW_AUTOMATION_ERROR_MESSAGES[code], code };
}

/** Categorization used to decide RETRY eligibility (spec section 21) — distinct from the richer error-code union above. */
export type WorkflowAutomationErrorCategory =
  | "VALIDATION"
  | "PERMISSION"
  | "RESOURCE_DELETED"
  | "CONDITION"
  | "APPROVAL_REJECTED"
  | "CONFIGURATION"
  | "AI_TRANSIENT"
  | "CONFLICT_TRANSIENT"
  | "STORAGE_TRANSIENT"
  | "INTERNAL_SAFE";

/** Never automatically retried — spec section 21's explicit list. */
const NON_RETRYABLE_CATEGORIES: WorkflowAutomationErrorCategory[] = ["VALIDATION", "PERMISSION", "RESOURCE_DELETED", "CONDITION", "APPROVAL_REJECTED", "CONFIGURATION"];

export function isRetryableErrorCategory(category: WorkflowAutomationErrorCategory): boolean {
  return !NON_RETRYABLE_CATEGORIES.includes(category);
}

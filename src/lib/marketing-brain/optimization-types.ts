/** Typed functional error codes for the Marketing Brain optimization loop (Fase 35) — the UI converts these to clear messages, never raw Prisma internals. */
export const MB_OPTIMIZATION_ERROR_CODES = [
  "SESSION_NOT_FOUND",
  "SESSION_NOT_EDITABLE",
  "SESSION_ALREADY_DECIDED",
  "SELECTION_INVALID",
  "CONTEXT_INSUFFICIENT_DATA",
  "GENERATION_IN_PROGRESS",
  "GENERATION_TOKEN_INVALID",
  "SCENARIO_NOT_FOUND",
  "SCENARIO_ACTION_NOT_FOUND",
  "SCENARIO_ACTION_ALREADY_CONVERTED",
  "PLAN_NOT_FOUND",
  "PLAN_NOT_ACTIVE",
  "RESOURCE_NOT_FOUND",
  "PERMISSION_DENIED",
  "LOCK_CONFLICT",
  "INTERNAL_SAFE_ERROR",
] as const;
export type MbOptimizationErrorCode = (typeof MB_OPTIMIZATION_ERROR_CODES)[number];

export const MB_OPTIMIZATION_ERROR_MESSAGES: Record<MbOptimizationErrorCode, string> = {
  SESSION_NOT_FOUND: "No se encontró la sesión de optimización.",
  SESSION_NOT_EDITABLE: "Esta sesión ya no se puede editar en su estado actual.",
  SESSION_ALREADY_DECIDED: "Esta sesión ya fue aprobada o rechazada.",
  SELECTION_INVALID: "La selección de contexto no es válida.",
  CONTEXT_INSUFFICIENT_DATA: "No hay suficientes datos para generar un contexto útil con esta selección.",
  GENERATION_IN_PROGRESS: "Ya hay una generación en curso para esta sesión.",
  GENERATION_TOKEN_INVALID: "Este intento de generación ya no es válido (la sesión avanzó desde entonces).",
  SCENARIO_NOT_FOUND: "No se encontró el escenario.",
  SCENARIO_ACTION_NOT_FOUND: "No se encontró la acción del escenario.",
  SCENARIO_ACTION_ALREADY_CONVERTED: "Esta acción ya fue convertida en un recurso.",
  PLAN_NOT_FOUND: "No se encontró el plan de seguimiento.",
  PLAN_NOT_ACTIVE: "Este plan de seguimiento ya no está activo.",
  RESOURCE_NOT_FOUND: "El recurso solicitado no existe en este proyecto.",
  PERMISSION_DENIED: "No tienes permiso para esta acción.",
  LOCK_CONFLICT: "Otra operación está en curso sobre este mismo recurso — inténtalo de nuevo.",
  INTERNAL_SAFE_ERROR: "Ocurrió un error interno al procesar la solicitud.",
};

export interface MbOptimizationActionError {
  error: string;
  code: MbOptimizationErrorCode;
}

export function mbOptimizationError(code: MbOptimizationErrorCode, overrideMessage?: string): MbOptimizationActionError {
  return { error: overrideMessage ?? MB_OPTIMIZATION_ERROR_MESSAGES[code], code };
}

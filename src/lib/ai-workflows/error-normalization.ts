/**
 * Stable, safe classification of a workflow run/step's free-text error or
 * interruption message into one of a small, fixed set of codes — so
 * analytics can group "what's failing" without re-parsing or displaying raw
 * text, and without a fragile exact-string match. Pure and dependency-free;
 * applied wherever an errorMessage/interruptionReason is persisted (see
 * src/server/actions/workflow-execution.ts) and reused verbatim by the
 * analytics service for error-frequency grouping — never a second
 * classifier.
 */

export type NormalizedErrorCode =
  | "tool_not_found"
  | "missing_variable"
  | "quota_exceeded"
  | "invalid_transition"
  | "lease_expired"
  | "resource_not_found"
  | "limit_exceeded"
  | "duration_exceeded"
  | "engine_error"
  | "cancelled"
  | "network_interruption"
  | "unknown";

export const NORMALIZED_ERROR_CODES: NormalizedErrorCode[] = [
  "tool_not_found",
  "missing_variable",
  "quota_exceeded",
  "invalid_transition",
  "lease_expired",
  "resource_not_found",
  "limit_exceeded",
  "duration_exceeded",
  "engine_error",
  "cancelled",
  "network_interruption",
  "unknown",
];

/** Short, safe-to-display label per code — never the raw underlying message. */
export const NORMALIZED_ERROR_LABELS: Record<NormalizedErrorCode, string> = {
  tool_not_found: "Herramienta de AI Center no encontrada",
  missing_variable: "Faltan variables o campos requeridos",
  quota_exceeded: "Cuota de IA superada",
  invalid_transition: "El workflow cambió durante la ejecución",
  lease_expired: "Se perdió el control de la ejecución",
  resource_not_found: "Recurso no disponible (prompt, template o brand kit)",
  limit_exceeded: "Se superó un límite de tamaño de la ejecución",
  duration_exceeded: "Se superó el tiempo máximo de ejecución",
  engine_error: "Error del motor de generación",
  cancelled: "Ejecución cancelada",
  network_interruption: "Se perdió la conexión durante la ejecución",
  unknown: "Error no clasificado",
};

// Order matters — first match wins, most specific patterns first. Every
// pattern here matches an ACTUAL substring this codebase produces (see
// resolveStepForExecution / buildResourcesForStep / workflow-execution.ts),
// never a bare generic word that could over-match unrelated text.
const RULES: Array<{ code: NormalizedErrorCode; pattern: RegExp }> = [
  { code: "tool_not_found", pattern: /ya no existe en el registro de AI Center/ },
  { code: "missing_variable", pattern: /Faltan valores para (las variables|los campos)/ },
  {
    code: "lease_expired",
    pattern: /se interrumpió|control de esta ejecución expiró|control activo de esta ejecución|perdió la conexión con el navegador/,
  },
  {
    code: "invalid_transition",
    pattern: /workflow cambió desde que se inició|snapshot de esta ejecución no coincide|no está listo para ejecutarse|intento ya no es válido/,
  },
  { code: "duration_exceeded", pattern: /tiempo máximo permitido/ },
  { code: "limit_exceeded", pattern: /supera el máximo de/ },
  {
    code: "resource_not_found",
    pattern: /no existe o no te pertenece|ya no está disponible|pertenece a otro proyecto|^Falta (el|la) (prompt|AI Template|Brand Kit)|no tienes ningún[ao] predeterminad[ao]/,
  },
  { code: "quota_exceeded", pattern: /cuota/i },
  { code: "cancelled", pattern: /cancel[oóaeó]|se canceló/i },
  { code: "network_interruption", pattern: /failed to fetch|network error|error de red/i },
  { code: "engine_error", pattern: /generación no produjo ningún resultado|generación falló|Tipo de paso desconocido/ },
];

export function normalizeWorkflowError(message: string | null | undefined): NormalizedErrorCode {
  if (!message) return "unknown";
  for (const rule of RULES) {
    if (rule.pattern.test(message)) return rule.code;
  }
  return "unknown";
}

export function normalizedErrorLabel(code: string | null | undefined): string {
  if (code && (NORMALIZED_ERROR_CODES as string[]).includes(code)) {
    return NORMALIZED_ERROR_LABELS[code as NormalizedErrorCode];
  }
  return NORMALIZED_ERROR_LABELS.unknown;
}

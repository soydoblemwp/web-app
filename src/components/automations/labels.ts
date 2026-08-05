export const AUTOMATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  ARCHIVED: "Archivada",
  ERROR: "Con error",
};

export const AUTOMATION_STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = {
  DRAFT: "outline",
  ACTIVE: "secondary",
  PAUSED: "outline",
  ARCHIVED: "outline",
  ERROR: "destructive",
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  QUEUED: "En cola",
  WAITING_FOR_SCHEDULE: "Esperando programación",
  WAITING_FOR_CONDITION: "Esperando condición",
  WAITING_FOR_APPROVAL: "Esperando aprobación",
  RUNNING: "En progreso",
  RETRY_SCHEDULED: "Reintento programado",
  PARTIALLY_COMPLETED: "Parcialmente completado",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  TIMED_OUT: "Tiempo agotado",
  CANCELLED: "Cancelado",
  SKIPPED: "Omitido",
  ARCHIVED: "Archivado",
};

export const RUN_STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = {
  QUEUED: "outline",
  WAITING_FOR_SCHEDULE: "outline",
  WAITING_FOR_CONDITION: "outline",
  WAITING_FOR_APPROVAL: "secondary",
  RUNNING: "secondary",
  RETRY_SCHEDULED: "secondary",
  PARTIALLY_COMPLETED: "destructive",
  COMPLETED: "secondary",
  FAILED: "destructive",
  TIMED_OUT: "destructive",
  CANCELLED: "outline",
  SKIPPED: "outline",
  ARCHIVED: "outline",
};

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  SCHEDULE_ONCE: "Programación única",
  SCHEDULE_RECURRING: "Programación recurrente",
  INTERNAL_EVENT: "Evento interno",
  WEBHOOK: "Webhook entrante",
  WORKFLOW_COMPLETED: "Workflow completado",
  AGENT_RUN_COMPLETED: "Ejecución de agente completada",
  MARKETING_BRAIN_COMPLETED: "Marketing Brain completado",
  KNOWLEDGE_SOURCE_READY: "Fuente de Knowledge Base lista",
  CONTENT_STATUS_CHANGED: "Estado de contenido cambiado",
  CAMPAIGN_DATE_REACHED: "Fecha de campaña alcanzada",
  SOCIAL_POST_STATUS_CHANGED: "Estado de publicación cambiado",
};

export const CONDITION_OPERATOR_LABELS: Record<string, string> = {
  EQUALS: "es igual a",
  NOT_EQUALS: "no es igual a",
  CONTAINS: "contiene",
  NOT_CONTAINS: "no contiene",
  STARTS_WITH: "empieza con",
  ENDS_WITH: "termina con",
  GREATER_THAN: "es mayor que",
  GREATER_THAN_OR_EQUAL: "es mayor o igual que",
  LESS_THAN: "es menor que",
  LESS_THAN_OR_EQUAL: "es menor o igual que",
  IS_EMPTY: "está vacío",
  IS_NOT_EMPTY: "no está vacío",
  IN: "está en la lista",
  NOT_IN: "no está en la lista",
  CHANGED_FROM: "cambió desde",
  CHANGED_TO: "cambió a",
  EXISTS: "existe",
  NOT_EXISTS: "no existe",
};

export const ERROR_POLICY_LABELS: Record<string, string> = {
  STOP: "Detener al fallar",
  RETRY: "Reintentar automáticamente",
  CONTINUE: "Continuar (marcar parcial)",
  WAIT_FOR_REVIEW: "Esperar revisión manual",
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  CHANGES_REQUESTED: "Cambios solicitados",
  REJECTED: "Rechazada",
  EXPIRED: "Expirada",
  CANCELLED: "Cancelada",
};

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

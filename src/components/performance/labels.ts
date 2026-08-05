export const METRIC_ORIGIN_LABELS: Record<string, string> = {
  INTERNAL: "Interno",
  MANUAL: "Manual",
  CSV_IMPORT: "Importado (CSV)",
  JSON_IMPORT: "Importado (JSON)",
  EXTERNAL_PROVIDER: "Proveedor externo",
  CALCULATED: "Calculado",
  ESTIMATED: "Estimado",
};

export const METRIC_ORIGIN_TONE: Record<string, "outline" | "secondary" | "destructive"> = {
  INTERNAL: "outline",
  MANUAL: "secondary",
  CSV_IMPORT: "secondary",
  JSON_IMPORT: "secondary",
  EXTERNAL_PROVIDER: "secondary",
  CALCULATED: "outline",
  ESTIMATED: "destructive",
};

export const DATA_QUALITY_LABELS: Record<string, string> = {
  EXCELLENT: "Excelente",
  GOOD: "Buena",
  LIMITED: "Limitada",
  POOR: "Pobre",
  INSUFFICIENT: "Insuficiente",
};

export const DATA_QUALITY_TONE: Record<string, "outline" | "secondary" | "destructive"> = {
  EXCELLENT: "secondary",
  GOOD: "secondary",
  LIMITED: "outline",
  POOR: "destructive",
  INSUFFICIENT: "destructive",
};

export const TREND_LABELS: Record<string, string> = {
  RISING: "Subiendo",
  FALLING: "Bajando",
  STABLE: "Estable",
  VOLATILE: "Volátil",
  INSUFFICIENT_DATA: "Datos insuficientes",
};

export const RECOMMENDATION_STATUS_LABELS: Record<string, string> = {
  NEW: "Nueva",
  REVIEWING: "En revisión",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  APPLIED: "Aplicada",
  DISMISSED: "Descartada",
  EXPIRED: "Expirada",
  ARCHIVED: "Archivada",
};

export const RECOMMENDATION_STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = {
  NEW: "secondary",
  REVIEWING: "outline",
  ACCEPTED: "secondary",
  REJECTED: "destructive",
  APPLIED: "secondary",
  DISMISSED: "outline",
  EXPIRED: "outline",
  ARCHIVED: "outline",
};

export const PRIORITY_LABELS: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica" };
export const PRIORITY_TONE: Record<string, "outline" | "secondary" | "destructive"> = { LOW: "outline", MEDIUM: "outline", HIGH: "secondary", CRITICAL: "destructive" };

export const ANOMALY_SEVERITY_LABELS: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica" };
export const ANOMALY_STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierta",
  REVIEWING: "En revisión",
  CONFIRMED: "Confirmada",
  DISMISSED: "Descartada",
  RESOLVED: "Resuelta",
  ARCHIVED: "Archivada",
};

export const EXPERIMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  READY: "Listo",
  RUNNING: "En curso",
  PAUSED: "Pausado",
  COMPLETED: "Completado",
  INCONCLUSIVE: "Inconcluso",
  CANCELLED: "Cancelado",
  ARCHIVED: "Archivado",
};

export const EXPERIMENT_STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = {
  DRAFT: "outline",
  READY: "outline",
  RUNNING: "secondary",
  PAUSED: "outline",
  COMPLETED: "secondary",
  INCONCLUSIVE: "destructive",
  CANCELLED: "outline",
  ARCHIVED: "outline",
};

export const IMPORT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  MAPPING: "Configurando mapeo",
  VALIDATING: "Validando",
  READY: "Listo",
  IMPORTING: "Importando",
  PARTIALLY_COMPLETED: "Parcialmente completado",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
  ARCHIVED: "Archivado",
};

export const IMPORT_STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = {
  DRAFT: "outline",
  MAPPING: "outline",
  VALIDATING: "secondary",
  READY: "outline",
  IMPORTING: "secondary",
  PARTIALLY_COMPLETED: "destructive",
  COMPLETED: "secondary",
  FAILED: "destructive",
  CANCELLED: "outline",
  ARCHIVED: "outline",
};

export const GOAL_STATUS_LABELS: Record<string, string> = { ACTIVE: "Activo", REACHED: "Alcanzado", MISSED: "No alcanzado", EXPIRED: "Expirado", ARCHIVED: "Archivado" };

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleDateString("es-ES", { dateStyle: "medium" });
}

export function formatMetricValue(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
  if (unit === "PERCENTAGE") return `${rounded}%`;
  if (unit === "CURRENCY") return rounded.toLocaleString("es-ES");
  if (unit === "SECONDS") return `${rounded}s`;
  return rounded.toLocaleString("es-ES");
}

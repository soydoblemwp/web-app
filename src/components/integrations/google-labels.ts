/**
 * Central label/tone maps for the Google Integrations Hub (Fase 39 spec
 * section 4: "No comuniques el estado únicamente mediante colores") — every
 * badge pairs a tone with a real, readable Spanish label.
 */

export const GOOGLE_CONNECTION_STATUS_LABELS: Record<string, string> = {
  NOT_CONFIGURED: "No configurado",
  AVAILABLE: "Disponible para conectar",
  CONNECTING: "Conectando…",
  CONNECTED: "Conectado",
  SYNCING: "Sincronizando",
  PAUSED: "Pausado",
  REAUTH_REQUIRED: "Requiere reconexión",
  ERROR: "Error",
  DISCONNECTED: "Desconectado",
};

export const GOOGLE_CONNECTION_STATUS_TONE: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  NOT_CONFIGURED: "outline",
  AVAILABLE: "outline",
  CONNECTING: "secondary",
  CONNECTED: "secondary",
  SYNCING: "secondary",
  PAUSED: "outline",
  REAUTH_REQUIRED: "destructive",
  ERROR: "destructive",
  DISCONNECTED: "outline",
};

export const GOOGLE_SYNC_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  RUNNING: "En curso",
  COMPLETED: "Completada",
  PARTIAL: "Parcial",
  FAILED: "Fallida",
  CANCELLED: "Cancelada",
};

export const GOOGLE_SYNC_STATUS_TONE: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  PENDING: "outline",
  RUNNING: "secondary",
  COMPLETED: "secondary",
  PARTIAL: "outline",
  FAILED: "destructive",
  CANCELLED: "outline",
};

export const GOOGLE_RESOURCE_TYPE_LABELS: Record<string, string> = {
  GA4_PROPERTY: "Google Analytics 4",
  SEARCH_CONSOLE_SITE: "Google Search Console",
};

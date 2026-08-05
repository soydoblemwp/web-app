/** Spanish labels + badge tones (never color-only, spec section 34) for the Customer Support Center — same pattern as src/components/integrations/google-labels.ts. */

export const FAQ_STATUS_LABELS: Record<string, string> = { DRAFT: "Borrador", PUBLISHED: "Publicada", ARCHIVED: "Archivada" };
export const FAQ_STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = { DRAFT: "outline", PUBLISHED: "secondary", ARCHIVED: "destructive" };

export const KNOWLEDGE_STATUS_LABELS: Record<string, string> = { DRAFT: "Borrador", APPROVED: "Aprobada", OUTDATED: "Desactualizada", ARCHIVED: "Archivada" };
export const KNOWLEDGE_STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = { DRAFT: "outline", APPROVED: "secondary", OUTDATED: "destructive", ARCHIVED: "destructive" };

export const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
  INTERNAL_PAGE: "Pagina interna",
  DOCUMENTATION: "Documentacion",
  KNOWLEDGE_BASE_PUBLIC: "Knowledge Base publica",
  TOOL_DESCRIPTION: "Descripcion de herramienta",
  HELP_PUBLIC: "Ayuda publica",
  MANUAL: "Manual",
};

export const CONVERSATION_STATUS_LABELS: Record<string, string> = { ACTIVE: "Activa", RESOLVED: "Resuelta", ESCALATED: "Escalada", CLOSED: "Cerrada" };
export const CONVERSATION_STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = { ACTIVE: "outline", RESOLVED: "secondary", ESCALATED: "destructive", CLOSED: "outline" };

export const RESPONSE_TYPE_LABELS: Record<string, string> = { FAQ: "FAQ", KNOWLEDGE: "Conocimiento", AI_ASSISTED: "IA local", FALLBACK: "Sin respuesta" };
export const EVIDENCE_LABELS: Record<string, string> = { HIGH: "Alta", MEDIUM: "Media", LOW: "Baja", NONE: "Ninguna" };
export const EVIDENCE_TONE: Record<string, "outline" | "secondary" | "destructive"> = { HIGH: "secondary", MEDIUM: "outline", LOW: "outline", NONE: "destructive" };

export const HANDOFF_STATUS_LABELS: Record<string, string> = { OPEN: "Abierta", IN_REVIEW: "En revision", RESOLVED: "Resuelta", CLOSED: "Cerrada" };
export const HANDOFF_STATUS_TONE: Record<string, "outline" | "secondary" | "destructive"> = { OPEN: "destructive", IN_REVIEW: "outline", RESOLVED: "secondary", CLOSED: "outline" };
export const HANDOFF_PRIORITY_LABELS: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente" };

export const TONE_LABELS: Record<string, string> = { NEUTRAL: "Neutral", FRIENDLY: "Amigable", FORMAL: "Formal", CONCISE: "Conciso" };
export const APPEARANCE_THEME_LABELS: Record<string, string> = { DEFAULT: "Predeterminado", MINIMAL: "Minimalista", BOLD: "Destacado" };

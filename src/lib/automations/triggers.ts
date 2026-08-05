import type { WorkflowAutomationTriggerType } from "@/lib/automations/types";
import { validateRecurrenceConfig, type RecurrenceConfig } from "@/lib/automations/recurrence";
import { isScheduleIntervalTooShort } from "@/lib/automations/limits";

/**
 * The central, typed trigger catalog (spec section 4) — every trigger type
 * this phase actually wires up, never one "declared available" without a
 * real connection. See src/server/services/automation-scheduler.ts (time
 * triggers), automation-events.ts (event-backed triggers), and
 * automation-webhooks.ts (WEBHOOK) for where each is actually resolved.
 */

export interface TriggerTypeDefinition {
  type: WorkflowAutomationTriggerType;
  label: string;
  description: string;
  category: "manual" | "schedule" | "event" | "webhook";
}

export const TRIGGER_TYPE_DEFINITIONS: TriggerTypeDefinition[] = [
  { type: "MANUAL", label: "Manual", description: "Se ejecuta solo cuando alguien lo hace manualmente.", category: "manual" },
  { type: "SCHEDULE_ONCE", label: "Programación única", description: "Se ejecuta una sola vez en una fecha y hora concretas.", category: "schedule" },
  { type: "SCHEDULE_RECURRING", label: "Programación recurrente", description: "Se ejecuta según una recurrencia configurada (cada hora, diaria, semanal, mensual...).", category: "schedule" },
  { type: "INTERNAL_EVENT", label: "Evento interno", description: "Se ejecuta cuando ocurre un evento interno del proyecto.", category: "event" },
  { type: "WEBHOOK", label: "Webhook entrante", description: "Se ejecuta al recibir una solicitud POST firmada en un endpoint único.", category: "webhook" },
  { type: "WORKFLOW_COMPLETED", label: "Workflow completado", description: "Se ejecuta cuando otra ejecución de AI Workflows termina.", category: "event" },
  { type: "AGENT_RUN_COMPLETED", label: "Ejecución de agente completada", description: "Se ejecuta cuando una ejecución de AI Agent Studio termina.", category: "event" },
  { type: "MARKETING_BRAIN_COMPLETED", label: "Marketing Brain completado", description: "Se ejecuta cuando una ejecución de Marketing Brain termina.", category: "event" },
  { type: "KNOWLEDGE_SOURCE_READY", label: "Fuente de Knowledge Base lista", description: "Se ejecuta cuando una fuente termina de procesarse.", category: "event" },
  { type: "CONTENT_STATUS_CHANGED", label: "Estado de contenido cambiado", description: "Se ejecuta cuando el estado editorial de un ContentItem cambia.", category: "event" },
  { type: "CAMPAIGN_DATE_REACHED", label: "Fecha de campaña alcanzada", description: "Se ejecuta cuando la fecha de inicio o fin de una campaña se alcanza (evaluado por el scheduler).", category: "schedule" },
  { type: "SOCIAL_POST_STATUS_CHANGED", label: "Estado de publicación cambiado", description: "Se ejecuta cuando el estado de un SocialPost cambia.", category: "event" },
];

export function findTriggerTypeDefinition(type: string): TriggerTypeDefinition | undefined {
  return TRIGGER_TYPE_DEFINITIONS.find((t) => t.type === type);
}

export interface ScheduleOnceConfig {
  /** Local wall-clock date+time as entered by the user, kept alongside the computed UTC instant for honest re-display (spec section 6). */
  localDate: string; // YYYY-MM-DD
  localTime: string; // HH:mm
  timezone: string;
  scheduledAtUtc: string; // ISO instant, computed server-side from the two fields above
}

export interface EventTriggerConfig {
  eventKey: string;
}

export interface WorkflowCompletedTriggerConfig {
  sourceWorkflowId?: string | null;
  outcomeFilter: "COMPLETED" | "FAILED" | "ANY";
}

export interface AgentRunCompletedTriggerConfig {
  sourceAgentRef?: string | null;
  outcomeFilter: "COMPLETED" | "FAILED" | "ANY";
}

export interface MarketingBrainCompletedTriggerConfig {
  outcomeFilter: "COMPLETED" | "PARTIALLY_COMPLETED" | "ANY";
}

export interface KnowledgeSourceReadyTriggerConfig {
  statusFilter: "READY" | "PARTIALLY_READY" | "NEEDS_OCR" | "FAILED" | "ANY";
  collectionId?: string | null;
}

export interface StatusChangedTriggerConfig {
  fromStatus?: string | null;
  toStatus?: string | null;
}

export interface CampaignDateReachedTriggerConfig {
  which: "START" | "END";
  campaignId?: string | null;
}

export interface TriggerValidationResult {
  valid: boolean;
  error?: string;
}

/** Validates a trigger's `config` JSON against its declared type — the one place every trigger type's shape is actually enforced, never trusted as free-form JSON from the client. */
export function validateTriggerConfig(type: WorkflowAutomationTriggerType, config: unknown): TriggerValidationResult {
  if (type === "MANUAL" || type === "WEBHOOK") return { valid: true };

  if (type === "SCHEDULE_ONCE") {
    const c = config as Partial<ScheduleOnceConfig> | null;
    if (!c || !c.localDate || !c.localTime || !c.timezone) return { valid: false, error: "Faltan datos de la programación única." };
    return { valid: true };
  }

  if (type === "SCHEDULE_RECURRING") {
    const c = config as Partial<RecurrenceConfig> | null;
    if (!c || !c.kind || !c.timezone || !c.startDate) return { valid: false, error: "Faltan datos de la recurrencia." };
    if (c.kind === "HOURLY" && isScheduleIntervalTooShort(60)) return { valid: false, error: "La frecuencia mínima permitida no está disponible en este entorno." };
    return validateRecurrenceConfig(c as RecurrenceConfig);
  }

  if (type === "INTERNAL_EVENT") {
    const c = config as Partial<EventTriggerConfig> | null;
    if (!c?.eventKey) return { valid: false, error: "Selecciona un evento interno." };
    return { valid: true };
  }

  if (type === "WORKFLOW_COMPLETED" || type === "AGENT_RUN_COMPLETED" || type === "MARKETING_BRAIN_COMPLETED" || type === "KNOWLEDGE_SOURCE_READY") {
    return { valid: true };
  }

  if (type === "CONTENT_STATUS_CHANGED" || type === "SOCIAL_POST_STATUS_CHANGED") {
    return { valid: true };
  }

  if (type === "CAMPAIGN_DATE_REACHED") {
    const c = config as Partial<CampaignDateReachedTriggerConfig> | null;
    if (!c?.which) return { valid: false, error: "Indica si se activa al inicio o al final de la campaña." };
    return { valid: true };
  }

  return { valid: false, error: "Tipo de disparador desconocido." };
}

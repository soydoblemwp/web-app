import { z } from "zod";
import { GOOGLE_INTEGRATION_LIMITS } from "@/lib/integrations/google-limits";

/** Zod schemas for the Google Integrations Hub (Fase 39 spec section 34) — bounded, never trusts client-supplied resource/date shapes without validation. */

const isoDate = () =>
  z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Fecha no válida.");

export const selectedResourceSchema = z.object({
  type: z.enum(["GA4_PROPERTY", "SEARCH_CONSOLE_SITE"]),
  externalId: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(300),
  accountName: z.string().trim().max(300).nullable().optional(),
  permissionLevel: z.string().trim().max(100).nullable().optional(),
});

export const saveSelectedResourcesSchema = z.object({
  resources: z.array(selectedResourceSchema).max(GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES),
  initialPeriodDays: z.number().int().min(1).max(GOOGLE_INTEGRATION_LIMITS.MAX_INITIAL_PERIOD_DAYS).default(GOOGLE_INTEGRATION_LIMITS.DEFAULT_INITIAL_PERIOD_DAYS),
});
export type SaveSelectedResourcesInput = z.infer<typeof saveSelectedResourcesSchema>;

export const triggerManualSyncSchema = z.object({
  resourceIds: z.array(z.string().cuid()).min(1).max(GOOGLE_INTEGRATION_LIMITS.MAX_SELECTED_RESOURCES),
});
export type TriggerManualSyncInput = z.infer<typeof triggerManualSyncSchema>;

export const resyncRangeSchema = z
  .object({
    resourceId: z.string().cuid(),
    startDate: isoDate(),
    endDate: isoDate(),
  })
  .refine((v) => new Date(v.startDate).getTime() <= new Date(v.endDate).getTime(), { message: "La fecha de inicio debe ser anterior o igual a la fecha final.", path: ["startDate"] })
  .refine((v) => (new Date(v.endDate).getTime() - new Date(v.startDate).getTime()) / 86_400_000 <= GOOGLE_INTEGRATION_LIMITS.MAX_RESYNC_PERIOD_DAYS, {
    message: `El rango de resincronización no puede superar ${GOOGLE_INTEGRATION_LIMITS.MAX_RESYNC_PERIOD_DAYS} días.`,
    path: ["endDate"],
  });
export type ResyncRangeInput = z.infer<typeof resyncRangeSchema>;

export const toggleResourceActiveSchema = z.object({
  resourceId: z.string().cuid(),
  active: z.boolean(),
});

export const setGooglePausedSchema = z.object({ paused: z.boolean() });

export const syncHistoryFilterSchema = z.object({
  provider: z.enum(["ga4", "gsc"]).optional(),
  resourceId: z.string().cuid().optional(),
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]).optional(),
  manualOnly: z.boolean().optional(),
  cursor: z.string().cuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type SyncHistoryFilterInput = z.infer<typeof syncHistoryFilterSchema>;

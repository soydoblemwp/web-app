import { z } from "zod";
import { MB_OPTIMIZATION_LIMITS } from "@/lib/marketing-brain/optimization-limits";

/**
 * Mode-dependent input validation for the Performance Strategist agent
 * (Fase 36 spec section 7) — the generic AgentInputFieldSpec-driven schema
 * (buildInputZodSchema) only checks shape (string/number/cuid); this is the
 * real, mode-aware validation the capability's handler runs server-side
 * before touching any service. Every ID here is still re-validated for
 * project ownership in the handler — a cuid shape is not proof of anything.
 */
export const PERFORMANCE_STRATEGIST_MODES = ["ANALYZE", "PREPARE_STRATEGY", "REVIEW_EXISTING", "PREPARE_MEASUREMENT", "PREPARE_REVIEW"] as const;
export type PerformanceStrategistMode = (typeof PERFORMANCE_STRATEGIST_MODES)[number];

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const agentPerformanceStrategistInputSchema = z
  .object({
    mode: z.enum(PERFORMANCE_STRATEGIST_MODES),
    contextMode: z.enum(["RECOMMENDED", "MANUAL"]).optional(),
    campaignId: z.string().cuid().optional(),
    contentItemId: z.string().cuid().optional(),
    socialPostId: z.string().cuid().optional(),
    optimizationSessionId: z.string().cuid().optional(),
    periodDays: z.number().int().positive().max(MB_OPTIMIZATION_LIMITS.MAX_PERIOD_DAYS).optional(),
    metricKeys: z.array(z.string().trim().max(120)).max(MB_OPTIMIZATION_LIMITS.MAX_CONTEXT_METRICS).optional(),
    objective: optionalText(1000),
    constraintsNote: optionalText(1000),
    budget: z.number().nonnegative().finite().optional(),
    currency: z.string().trim().max(3).optional(),
    brandProfileId: z.string().cuid().optional(),
  })
  .refine((v) => v.mode !== "REVIEW_EXISTING" || Boolean(v.optimizationSessionId), { message: "Selecciona una sesión de optimización existente para revisar.", path: ["optimizationSessionId"] })
  .refine((v) => v.mode !== "PREPARE_MEASUREMENT" || Boolean(v.optimizationSessionId), { message: "Selecciona la sesión aprobada para preparar su medición.", path: ["optimizationSessionId"] })
  .refine((v) => v.mode !== "PREPARE_REVIEW" || Boolean(v.optimizationSessionId), { message: "Selecciona la sesión con un plan de medición activo.", path: ["optimizationSessionId"] });

export type AgentPerformanceStrategistInput = z.infer<typeof agentPerformanceStrategistInputSchema>;

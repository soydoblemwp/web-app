import { z } from "zod";
import type { AgentInputFieldSpec } from "@/lib/agents/types";
import { AGENT_FIELD_OPTION_LIMITS, MULTISELECT_MAX_SELECTIONS } from "@/lib/agents/governance-limits";

/**
 * Builds ONE zod schema from an agent's declared input field specs — the
 * single source of truth for both the dynamic form (client) and the server
 * action's validation (spec section 6: "no guardes los formularios
 * manualmente duplicados para cada agente. Valida todas las entradas en
 * cliente y servidor."). Resource-reference fields (content_item, campaign,
 * etc.) are only validated for SHAPE here (a cuid) — ownership/membership/
 * state checks happen server-side in src/server/services/agent-context.ts,
 * since a pure function can't touch the database.
 */
export function buildInputZodSchema(fields: AgentInputFieldSpec[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let base: z.ZodTypeAny;
    switch (f.type) {
      case "short_text":
        base = z.string().trim().max(f.maxLength ?? 300);
        break;
      case "long_text":
        base = z.string().trim().max(f.maxLength ?? 8000);
        break;
      case "number":
        base = z.number();
        break;
      case "boolean":
        base = z.boolean();
        break;
      case "date":
        base = z.string().trim().max(40);
        break;
      case "url":
        base = z.string().trim().url();
        break;
      case "select":
        base = z.string().trim().max(100);
        break;
      case "multiselect":
        base = z.array(z.string().trim().max(100)).max(MULTISELECT_MAX_SELECTIONS);
        break;
      case "brand_profile":
      case "content_item":
      case "campaign":
      case "campaign_piece":
      case "social_post":
      case "file_asset":
      case "project_member":
      case "marketing_brain_session":
        base = z.string().cuid();
        break;
      default:
        base = z.string();
    }
    shape[f.key] = f.required ? base : base.optional().nullable();
  }
  return z.object(shape);
}

const AGENT_INPUT_FIELD_TYPE_VALUES = [
  "short_text",
  "long_text",
  "number",
  "select",
  "multiselect",
  "boolean",
  "date",
  "url",
  "brand_profile",
  "content_item",
  "campaign",
  "campaign_piece",
  "social_post",
  "file_asset",
  "project_member",
  "marketing_brain_session",
] as const;

/**
 * Fase 37 spec section 21 fix: a single flat `options` ceiling (Fase 36 had
 * raised it from 30 to 80 for EVERY field type) is replaced with a per-type
 * ceiling — a plain `select` dropdown never legitimately needs more than 40
 * options, while `multiselect` can host a real catalog (e.g. Performance
 * Center's 56 metrics) up to `AGENT_FIELD_OPTION_LIMITS.multiselect`. This
 * never regresses an existing valid agent: every prior config had at most
 * 80 options, which still fits comfortably under the new multiselect
 * ceiling; only a `select` with more than 40 options (never a realistic,
 * intentionally-built one) would now be rejected.
 */
export const agentInputFieldSpecSchema = z
  .object({
    key: z.string().trim().min(1).max(60),
    label: z.string().trim().min(1).max(200),
    type: z.enum(AGENT_INPUT_FIELD_TYPE_VALUES),
    required: z.boolean(),
    helpText: z.string().trim().max(400).optional(),
    options: z.array(z.object({ value: z.string().trim().max(100), label: z.string().trim().max(200) })).max(AGENT_FIELD_OPTION_LIMITS.multiselect).optional(),
    maxLength: z.number().int().positive().max(50_000).optional(),
  })
  .superRefine((field, ctx) => {
    if (!field.options) return;
    const limit = field.type === "select" ? AGENT_FIELD_OPTION_LIMITS.select : field.type === "multiselect" ? AGENT_FIELD_OPTION_LIMITS.multiselect : 0;
    if (field.options.length > limit) {
      ctx.addIssue({ code: "custom", path: ["options"], message: `El campo "${field.key}" (${field.type}) admite como máximo ${limit} opciones.` });
    }
  });
export const agentInputSchemaArray = z.array(agentInputFieldSpecSchema).max(30);

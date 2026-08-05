import type { GovernanceRiskLevelValue } from "@/lib/agents/governance-types";

/**
 * Central, stable risk classification (Fase 37 spec section 7) — never
 * inferred from an agent's display name or a text match at runtime. Every
 * official agent's risk is fixed here; custom agents get a safe,
 * server-controlled default that can never self-declare a lower risk than
 * its real capabilities allow (spec section 20: "no puede declarar
 * arbitrariamente que su riesgo es READ_ONLY").
 *
 * Why every non-Performance-Strategist agent (official or custom) is
 * DRAFT_WRITE: this codebase's agent-orchestrator.ts only ever persists a
 * step's structured `output` as JSON on AiAgentRunStep — it never
 * auto-creates or mutates a real ContentItem/Campaign/SocialPost as part of
 * completing a step. Materializing that output into a real resource always
 * requires a SEPARATE, already-authorized, explicit action
 * (src/server/actions/agent-results.ts's "save as X" family), which sits
 * outside the governed run lifecycle — a real, documented limitation (see
 * final report), not an oversight.
 */

const PERFORMANCE_STRATEGIST_MODE_RISK: Record<string, GovernanceRiskLevelValue> = {
  ANALYZE: "READ_ONLY",
  PREPARE_STRATEGY: "DRAFT_WRITE",
  REVIEW_EXISTING: "DRAFT_WRITE",
  PREPARE_MEASUREMENT: "DRAFT_WRITE",
  PREPARE_REVIEW: "DRAFT_WRITE",
};

/**
 * customer-support-agent (Fase 40) is always READ_ONLY, unconditionally —
 * never user/config-settable (spec section 7: "el riesgo no puede ser
 * modificado por el usuario"). It only ever reads PUBLISHED FAQs and
 * APPROVED knowledge sources and writes a conversation transcript row
 * (never a real content/campaign/social resource), which is a strictly
 * narrower capability than the DRAFT_WRITE default every other agent gets.
 */
const CUSTOMER_SUPPORT_AGENT_KEY = "customer-support-agent";

/** Pure — never touches a database. `mode` is only meaningful for agents that declare a "mode"-shaped input (today: only performance-strategist); every other agentRef ignores it. */
export function classifyAgentModeRisk(agentRef: string, mode: string | null): GovernanceRiskLevelValue {
  if (agentRef === "performance-strategist" && mode && PERFORMANCE_STRATEGIST_MODE_RISK[mode]) {
    return PERFORMANCE_STRATEGIST_MODE_RISK[mode];
  }
  if (agentRef === CUSTOMER_SUPPORT_AGENT_KEY) {
    return "READ_ONLY";
  }
  // Every other official/custom agent: the run itself only ever produces a DRAFT step output, never an
  // automatic mutation of a real resource — DRAFT_WRITE is the honest, safe default (see file-level note).
  return "DRAFT_WRITE";
}

export function describeRiskLevel(risk: GovernanceRiskLevelValue): string {
  switch (risk) {
    case "READ_ONLY":
      return "Solo lectura — no crea ni modifica ningún recurso.";
    case "DRAFT_WRITE":
      return "Crea contenido en borrador — nunca publica ni aprueba automáticamente.";
    case "INTERNAL_MUTATION":
      return "Modifica o archiva un recurso interno existente.";
    case "EXTERNAL_SIDE_EFFECT":
      return "Efecto externo (publicar, programar, enviar, activar) — actualmente ningún agente de este proyecto realiza esto automáticamente.";
    default:
      return risk;
  }
}

import { RISK_RANK } from "@/lib/agents/governance-types";
import type { EffectiveLimits } from "@/lib/agents/governance-types";

/**
 * Deterministic detection of SENSITIVE policy changes (Fase 38 spec section
 * 23) — pure, no I/O, no AI. Compares the currently ACTIVE policy's limits
 * against a DRAFT about to be activated. A non-empty result means the
 * activation must go through human approval (see
 * agent-governance-change-approval.ts) before `activatePolicyVersion` will
 * actually flip the draft to ACTIVE.
 */

export interface SensitiveChangeEntry {
  code: string;
  label: string;
}

export interface ComparableLimits extends Pick<EffectiveLimits, "maxRiskLevel" | "requireApprovalAtOrAboveRisk" | "maxConcurrentRunsPerProject" | "maxConcurrentRunsPerAgent" | "unknownAgentBehavior" | "onBudgetExhausted"> {
  maxRunsPerDay: number | null;
  maxRunsPerMonth: number | null;
  disabledAgentRefs: string[];
}

export function detectSensitiveChanges(previous: ComparableLimits | null, next: ComparableLimits): SensitiveChangeEntry[] {
  const changes: SensitiveChangeEntry[] = [];
  if (!previous) return changes; // The very first policy a project ever activates has nothing to compare against.

  if (RISK_RANK[next.maxRiskLevel] > RISK_RANK[previous.maxRiskLevel]) {
    changes.push({ code: "RISK_CEILING_RAISED", label: `El riesgo máximo permitido sube de "${previous.maxRiskLevel}" a "${next.maxRiskLevel}".` });
  }

  const nowEnabled = previous.disabledAgentRefs.filter((ref) => !next.disabledAgentRefs.includes(ref));
  if (nowEnabled.length > 0) {
    changes.push({ code: "AGENT_RE_ENABLED", label: `Se habilitan ${nowEnabled.length} agente(s) que antes estaban deshabilitados: ${nowEnabled.join(", ")}.` });
  }

  if (previous.requireApprovalAtOrAboveRisk && !next.requireApprovalAtOrAboveRisk) {
    changes.push({ code: "APPROVAL_REQUIREMENT_REMOVED", label: "Se elimina el requisito de aprobación por nivel de riesgo." });
  } else if (previous.requireApprovalAtOrAboveRisk && next.requireApprovalAtOrAboveRisk && RISK_RANK[next.requireApprovalAtOrAboveRisk] > RISK_RANK[previous.requireApprovalAtOrAboveRisk]) {
    changes.push({ code: "APPROVAL_THRESHOLD_RAISED", label: `El umbral de aprobación por riesgo sube de "${previous.requireApprovalAtOrAboveRisk}" a "${next.requireApprovalAtOrAboveRisk}".` });
  }

  if ((previous.maxRunsPerDay ?? Infinity) < (next.maxRunsPerDay ?? Infinity)) {
    changes.push({ code: "DAILY_QUOTA_INCREASED", label: `La cuota diaria sube de ${previous.maxRunsPerDay ?? "sin límite"} a ${next.maxRunsPerDay ?? "sin límite"}.` });
  }
  if ((previous.maxRunsPerMonth ?? Infinity) < (next.maxRunsPerMonth ?? Infinity)) {
    changes.push({ code: "MONTHLY_QUOTA_INCREASED", label: `La cuota mensual sube de ${previous.maxRunsPerMonth ?? "sin límite"} a ${next.maxRunsPerMonth ?? "sin límite"}.` });
  }
  if (next.maxConcurrentRunsPerProject > previous.maxConcurrentRunsPerProject) {
    changes.push({ code: "PROJECT_CONCURRENCY_INCREASED", label: `La concurrencia del proyecto sube de ${previous.maxConcurrentRunsPerProject} a ${next.maxConcurrentRunsPerProject}.` });
  }
  if (next.maxConcurrentRunsPerAgent > previous.maxConcurrentRunsPerAgent) {
    changes.push({ code: "AGENT_CONCURRENCY_INCREASED", label: `La concurrencia por agente sube de ${previous.maxConcurrentRunsPerAgent} a ${next.maxConcurrentRunsPerAgent}.` });
  }

  if (previous.unknownAgentBehavior !== "ALLOW_DEFAULT" && next.unknownAgentBehavior === "ALLOW_DEFAULT") {
    changes.push({ code: "UNKNOWN_AGENT_GUARD_DISABLED", label: "Se desactiva el control de 'agentes desconocidos' (vuelve a ALLOW_DEFAULT)." });
  }
  if (previous.onBudgetExhausted === "DENY" && next.onBudgetExhausted === "REQUIRE_APPROVAL") {
    changes.push({ code: "BUDGET_EXHAUSTED_BEHAVIOR_RELAXED", label: "El comportamiento ante presupuesto agotado pasa de DENY a REQUIRE_APPROVAL." });
  }

  return changes;
}

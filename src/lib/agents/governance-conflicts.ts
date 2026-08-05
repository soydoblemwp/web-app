import { RISK_RANK, ARCHITECTURAL_RISK_CEILING } from "@/lib/agents/governance-types";
import type { GovernanceRiskLevelValue } from "@/lib/agents/governance-types";

/**
 * Deterministic conflict detector for a Policy Studio draft (Fase 38 spec
 * section 12) — pure, no I/O, no AI. Operates on the exact same shape
 * `createPolicyVersionSchema` validates (see src/lib/validation/
 * agent-governance.ts), never a second parallel draft representation.
 * ERROR-severity conflicts must block activation; WARNING/INFO are
 * informational and never silently hidden.
 */

export type ConflictSeverity = "ERROR" | "WARNING" | "INFO";

export interface ConflictEntry {
  severity: ConflictSeverity;
  code: string;
  message: string;
  /** Rule index within `rules[]`, when the conflict is scoped to a specific rule; omitted for base-policy-level conflicts. */
  ruleIndex?: number;
}

export interface DraftRuleLike {
  scope: "AGENT" | "MODE";
  agentRef: string;
  mode?: string;
  enabled?: boolean | null;
  riskOverride?: GovernanceRiskLevelValue | null;
  requireApproval?: boolean | null;
  maxRunsPerDay?: number | null;
  maxConcurrent?: number | null;
  maxRetries?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
}

export interface DraftPolicyLike {
  maxRiskLevel: GovernanceRiskLevelValue;
  requireApprovalAtOrAboveRisk?: GovernanceRiskLevelValue | null;
  maxRunsPerDay?: number | null;
  maxConcurrentRunsPerProject: number;
  disabledAgentRefs: string[];
  rules: DraftRuleLike[];
}

function ruleKey(r: DraftRuleLike): string {
  return `${r.scope}:${r.agentRef}:${r.scope === "MODE" ? (r.mode ?? "") : ""}`;
}

export function detectPolicyConflicts(draft: DraftPolicyLike): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];

  // Exact duplicate (scope, agentRef, mode) rows — the DB's own @@unique constraint would reject this
  // at save time (P2002), but the editor should catch it before the round-trip.
  const seen = new Map<string, number>();
  draft.rules.forEach((rule, index) => {
    const key = ruleKey(rule);
    if (seen.has(key)) {
      conflicts.push({ severity: "ERROR", code: "DUPLICATE_RULE", message: `Ya existe otra regla para el mismo alcance (${rule.scope}, agente "${rule.agentRef}"${rule.scope === "MODE" ? `, modo "${rule.mode}"` : ""}).`, ruleIndex: index });
    } else {
      seen.set(key, index);
    }
  });

  draft.rules.forEach((rule, index) => {
    // MODE rule requires a real mode value.
    if (rule.scope === "MODE" && !rule.mode) {
      conflicts.push({ severity: "ERROR", code: "MODE_RULE_MISSING_MODE", message: "Una regla de modo necesita un valor de modo real.", ruleIndex: index });
    }

    // riskOverride can never exceed the hard architectural ceiling — no policy can raise it.
    if (rule.riskOverride && RISK_RANK[rule.riskOverride] > RISK_RANK[ARCHITECTURAL_RISK_CEILING]) {
      conflicts.push({ severity: "ERROR", code: "RISK_OVERRIDE_EXCEEDS_CEILING", message: `El riesgo "${rule.riskOverride}" supera el techo arquitectónico ("${ARCHITECTURAL_RISK_CEILING}") — ninguna política puede autorizarlo.`, ruleIndex: index });
    }

    // Agent explicitly enabled by a rule while the base policy's deny-list still lists it — the
    // deny-list wins per precedence step 7, so the rule would never actually take effect.
    if (rule.enabled === true && draft.disabledAgentRefs.includes(rule.agentRef)) {
      conflicts.push({ severity: "WARNING", code: "RULE_SHADOWED_BY_DENY_LIST", message: `La regla habilita "${rule.agentRef}", pero sigue en la lista de agentes deshabilitados de la política — la lista de deshabilitados tiene prioridad y la regla no tendrá efecto.`, ruleIndex: index });
    }

    // A MODE rule that expects to be reachable (requireApproval or enabled:true) while the AGENT-scope
    // rule for the same agent disables it outright — the mode will never be evaluated.
    if (rule.scope === "MODE") {
      const parentAgentRule = draft.rules.find((r) => r.scope === "AGENT" && r.agentRef === rule.agentRef);
      if (parentAgentRule?.enabled === false && rule.enabled !== true) {
        conflicts.push({ severity: "WARNING", code: "MODE_UNREACHABLE_PARENT_DISABLED", message: `El modo "${rule.mode}" de "${rule.agentRef}" nunca se evaluará porque la regla del agente lo deshabilita — fija "enabled: true" en la regla de modo si quieres una excepción.`, ruleIndex: index });
      }
    }

    // Agent-level daily quota override higher than the base policy's own value — not necessarily wrong, but worth a flag.
    if (rule.maxRunsPerDay != null && draft.maxRunsPerDay != null && rule.maxRunsPerDay > draft.maxRunsPerDay) {
      conflicts.push({ severity: "WARNING", code: "AGENT_QUOTA_ABOVE_BASE", message: `La cuota diaria de "${rule.agentRef}" (${rule.maxRunsPerDay}) es mayor que la cuota base del proyecto (${draft.maxRunsPerDay}).`, ruleIndex: index });
    }

    // Per-agent concurrency override higher than the project-wide ceiling — the project ceiling is
    // checked FIRST in the engine (step 13), so the agent override could never actually be reached.
    if (rule.maxConcurrent != null && rule.maxConcurrent > draft.maxConcurrentRunsPerProject) {
      conflicts.push({ severity: "WARNING", code: "AGENT_CONCURRENCY_ABOVE_PROJECT", message: `La concurrencia de "${rule.agentRef}" (${rule.maxConcurrent}) supera el máximo del proyecto (${draft.maxConcurrentRunsPerProject}) — el límite del proyecto se aplicará primero.`, ruleIndex: index });
    }

    // Invalid or already-elapsed validity window.
    if (rule.startsAt && rule.expiresAt) {
      const start = new Date(rule.startsAt).getTime();
      const end = new Date(rule.expiresAt).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && start >= end) {
        conflicts.push({ severity: "ERROR", code: "INVALID_VALIDITY_WINDOW", message: "La fecha de inicio de la regla debe ser anterior a su fecha de expiración.", ruleIndex: index });
      }
    }
    if (rule.expiresAt) {
      const end = new Date(rule.expiresAt).getTime();
      if (!Number.isNaN(end) && end <= Date.now()) {
        conflicts.push({ severity: "WARNING", code: "RULE_ALREADY_EXPIRED", message: "Esta regla ya expiró — nunca se aplicará mientras la fecha de expiración quede en el pasado.", ruleIndex: index });
      }
    }
  });

  // requireApprovalAtOrAboveRisk set higher than maxRiskLevel can ever reach — the approval-by-risk
  // trigger would be unreachable.
  if (draft.requireApprovalAtOrAboveRisk && RISK_RANK[draft.requireApprovalAtOrAboveRisk] > RISK_RANK[draft.maxRiskLevel]) {
    conflicts.push({ severity: "WARNING", code: "UNREACHABLE_RISK_APPROVAL", message: `"Requiere aprobación desde riesgo" (${draft.requireApprovalAtOrAboveRisk}) nunca se alcanzará porque el riesgo máximo permitido es "${draft.maxRiskLevel}".` });
  }

  return conflicts;
}

export function hasBlockingConflicts(conflicts: ConflictEntry[]): boolean {
  return conflicts.some((c) => c.severity === "ERROR");
}

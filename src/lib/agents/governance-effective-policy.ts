import { ARCHITECTURAL_RISK_CEILING, RISK_RANK } from "@/lib/agents/governance-types";
import type { EffectiveLimits, GovernanceRiskLevelValue, GovernanceFieldOrigin } from "@/lib/agents/governance-types";
import { resolveOverride } from "@/lib/agents/governance-resolve";

/**
 * Effective-policy resolution for Policy Studio's matrix and rule editor
 * (Fase 38 spec section 7) — every field below is resolved through the
 * EXACT SAME `resolveOverride()` primitive `governance-engine.ts` itself
 * uses, so the UI can never show a value the engine wouldn't actually
 * apply. This file never computes a final ALLOW/DENY/REQUIRE_APPROVAL
 * decision on its own — decisions always come from calling the real
 * `evaluatePolicy()` (see agent-governance-matrix.ts for the bulk case).
 */

export interface RuleLike {
  enabled: boolean | null;
  riskOverride: GovernanceRiskLevelValue | null;
  requireApproval: boolean | null;
  maxRunsPerDay: number | null;
  maxConcurrent: number | null;
  maxRetries: number | null;
}

export interface EffectiveFieldEntry<T> {
  value: T;
  origin: GovernanceFieldOrigin;
  locked: boolean;
}

export interface EffectivePolicyView {
  enabled: EffectiveFieldEntry<boolean>;
  maxRiskLevel: EffectiveFieldEntry<GovernanceRiskLevelValue>;
  requireApproval: EffectiveFieldEntry<boolean>;
  maxRunsPerDay: EffectiveFieldEntry<number | null>;
  maxConcurrent: EffectiveFieldEntry<number>;
  maxRetries: EffectiveFieldEntry<number>;
  disabledByDenyList: boolean;
}

/**
 * Resolves the effective policy for one (agentRef, mode) combination — the
 * same precedence order as engine steps 7-15: deny-list beats every rule;
 * MODE-scope beats AGENT-scope beats the base policy value.
 */
export function resolveEffectivePolicy(params: {
  disabledAgentRefs: string[];
  agentRef: string;
  base: EffectiveLimits;
  matchedAgentRule: RuleLike | null;
  matchedModeRule: RuleLike | null;
}): EffectivePolicyView {
  const { disabledAgentRefs, agentRef, base, matchedAgentRule, matchedModeRule } = params;
  const disabledByDenyList = disabledAgentRefs.includes(agentRef);

  const enabledResolved = resolveOverride(matchedModeRule?.enabled, matchedAgentRule?.enabled, true);
  const riskResolved = resolveOverride(matchedModeRule?.riskOverride, matchedAgentRule?.riskOverride, base.maxRiskLevel);
  const requireApprovalResolved = resolveOverride(matchedModeRule?.requireApproval, matchedAgentRule?.requireApproval, base.requireApproval);
  const maxRunsPerDayResolved = resolveOverride(matchedModeRule?.maxRunsPerDay, matchedAgentRule?.maxRunsPerDay, base.maxRunsPerDay);
  const maxConcurrentResolved = resolveOverride(matchedModeRule?.maxConcurrent, matchedAgentRule?.maxConcurrent, base.maxConcurrentRunsPerAgent);
  const maxRetriesResolved = resolveOverride(matchedModeRule?.maxRetries, matchedAgentRule?.maxRetries, base.maxRetries);

  return {
    enabled: { value: disabledByDenyList ? false : enabledResolved.value, origin: disabledByDenyList ? "BASE_POLICY" : enabledResolved.origin, locked: disabledByDenyList },
    maxRiskLevel: { value: riskResolved.value, origin: riskResolved.origin, locked: false },
    requireApproval: { value: requireApprovalResolved.value, origin: requireApprovalResolved.origin, locked: false },
    maxRunsPerDay: { value: maxRunsPerDayResolved.value, origin: maxRunsPerDayResolved.origin, locked: false },
    maxConcurrent: { value: maxConcurrentResolved.value, origin: maxConcurrentResolved.origin, locked: false },
    maxRetries: { value: maxRetriesResolved.value, origin: maxRetriesResolved.origin, locked: false },
    disabledByDenyList,
  };
}

/** Whether a given risk level is even selectable in the editor — the architectural ceiling is never configurable (spec section 10). */
export function isRiskLevelSelectable(risk: GovernanceRiskLevelValue): boolean {
  return RISK_RANK[risk] <= RISK_RANK[ARCHITECTURAL_RISK_CEILING];
}

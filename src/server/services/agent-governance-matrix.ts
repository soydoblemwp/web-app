import "server-only";
import { evaluatePolicy } from "@/lib/agents/governance-engine";
import { classifyAgentModeRisk } from "@/lib/agents/governance-risk";
import { resolveEffectivePolicy } from "@/lib/agents/governance-effective-policy";
import { listAgentDefinitions } from "@/lib/agents/registry";
import { listCustomAgents } from "@/server/services/agent-catalog";
import { getActivePolicy, getPolicyById, getMatchedRules, DEFAULT_POLICY_LIMITS } from "@/server/services/agent-governance-policy";
import { getGovernanceState } from "@/server/services/agent-governance-state";
import { countActiveRunsForProject, countActiveRunsForAgent, countRunsToday, countRunsThisMonth } from "@/server/services/agent-governance-concurrency";
import { getBudgetSnapshots } from "@/server/services/agent-governance-budget";
import { GOVERNANCE_LIMITS } from "@/lib/agents/governance-limits";
import type { GovernanceOperationType } from "@/lib/agents/governance-types";

/**
 * Agent x mode matrix + mass simulation (Fase 38 spec sections 6, 18) — the
 * "decision" column for every cell always comes from a real call to the
 * SAME `evaluatePolicy()` engine (never a hand-rolled approximation); the
 * "effective field" columns come from `resolveEffectivePolicy()`, which
 * shares the exact same override-resolution primitive as the engine (spec
 * section 7). Never creates a run, never consumes budget/concurrency,
 * never emits a run lifecycle event — pure reads plus pure computation.
 */

export interface MatrixCell {
  agentRef: string;
  agentLabel: string;
  isCustom: boolean;
  mode: string | null;
  riskLevel: string;
  decision: string;
  code: string;
  reason: string;
  requireApproval: boolean;
  effective: {
    enabled: { value: boolean; origin: string; locked: boolean };
    maxRiskLevel: { value: string; origin: string; locked: boolean };
    requireApproval: { value: boolean; origin: string; locked: boolean };
    maxRunsPerDay: { value: number | null; origin: string; locked: boolean };
    maxConcurrent: { value: number; origin: string; locked: boolean };
    maxRetries: { value: number; origin: string; locked: boolean };
  };
  hasExplicitRule: boolean;
}

/** Every (agentRef, mode) combination the project could actually run — official + custom agents, with modes only for agents that declare a real "mode" select field (currently only performance-strategist). */
export async function buildAgentModeCatalog(projectId: string): Promise<{ agentRef: string; agentLabel: string; isCustom: boolean; modes: string[] }[]> {
  const official = listAgentDefinitions()
    .filter((a) => a.active)
    .map((a) => {
      const modeField = a.requiredInputs.find((f) => f.key === "mode" && f.type === "select") ?? a.optionalInputs.find((f) => f.key === "mode" && f.type === "select");
      return { agentRef: a.key, agentLabel: a.name, isCustom: false, modes: (modeField?.options ?? []).map((o) => o.value) };
    });
  const custom = await listCustomAgents(projectId);
  const customEntries = custom.map((a) => ({ agentRef: a.id, agentLabel: a.name, isCustom: true, modes: [] as string[] }));
  return [...official, ...customEntries];
}

export async function runMassSimulation(projectId: string, policyId: string | null | undefined, agentRefFilter: string[], operationType: GovernanceOperationType): Promise<{ error: string } | { cells: MatrixCell[]; truncated: boolean }> {
  const policy = policyId ? await getPolicyById(projectId, policyId) : await getActivePolicy(projectId);
  if (policyId && !policy) return { error: "Política no encontrada." };
  const limits = policy?.limits ?? DEFAULT_POLICY_LIMITS;

  const state = await getGovernanceState(projectId);
  const catalog = await buildAgentModeCatalog(projectId);
  const filtered = agentRefFilter.length > 0 ? catalog.filter((a) => agentRefFilter.includes(a.agentRef)) : catalog;

  const cellsToCompute: { agentRef: string; agentLabel: string; isCustom: boolean; mode: string | null }[] = [];
  for (const agent of filtered) {
    if (agent.modes.length === 0) {
      cellsToCompute.push({ agentRef: agent.agentRef, agentLabel: agent.agentLabel, isCustom: agent.isCustom, mode: null });
    } else {
      for (const mode of agent.modes) cellsToCompute.push({ agentRef: agent.agentRef, agentLabel: agent.agentLabel, isCustom: agent.isCustom, mode });
    }
  }

  const truncated = cellsToCompute.length > GOVERNANCE_LIMITS.MAX_MASS_SIMULATION_CELLS;
  const bounded = truncated ? cellsToCompute.slice(0, GOVERNANCE_LIMITS.MAX_MASS_SIMULATION_CELLS) : cellsToCompute;

  const [concurrentForProject, runsThisMonth] = await Promise.all([countActiveRunsForProject(projectId), countRunsThisMonth(projectId)]);

  const cells: MatrixCell[] = [];
  for (const cell of bounded) {
    const matched = policy ? await getMatchedRules(policy.id, cell.agentRef, cell.mode) : { agentRule: null, modeRule: null };
    const riskLevel = classifyAgentModeRisk(cell.agentRef, cell.mode);
    const [concurrentForAgent, runsToday, budgets] = await Promise.all([
      countActiveRunsForAgent(projectId, cell.agentRef),
      countRunsToday(projectId, cell.agentRef),
      getBudgetSnapshots(projectId, "PROJECT", "", limits),
    ]);

    const result = evaluatePolicy({
      projectId,
      userId: "matrix-simulation",
      hasProjectAccess: true,
      agentRef: cell.agentRef,
      agentIsOfficial: !cell.isCustom,
      mode: cell.mode,
      operationType,
      riskLevel,
      contextChars: 0,
      expectedOutputChars: 0,
      retryCount: 0,
      concurrentRunsForProject: concurrentForProject,
      concurrentRunsForAgent: concurrentForAgent,
      runsTodayForProject: runsToday,
      runsThisMonthForProject: runsThisMonth,
      emergencyStopEnabled: state.emergencyStopEnabled,
      projectPaused: state.projectPaused,
      agentPaused: state.pausedAgentRefs.includes(cell.agentRef),
      policy,
      matchedAgentRule: matched.agentRule,
      matchedModeRule: matched.modeRule,
      budgets,
      preApprovedRequestId: null,
    });

    const effective = resolveEffectivePolicy({ disabledAgentRefs: policy?.disabledAgentRefs ?? [], agentRef: cell.agentRef, base: limits, matchedAgentRule: matched.agentRule, matchedModeRule: matched.modeRule });

    cells.push({
      agentRef: cell.agentRef,
      agentLabel: cell.agentLabel,
      isCustom: cell.isCustom,
      mode: cell.mode,
      riskLevel,
      decision: result.decision,
      code: result.code,
      reason: result.reason,
      requireApproval: result.requireApproval,
      effective,
      hasExplicitRule: matched.agentRule !== null || matched.modeRule !== null,
    });
  }

  return { cells, truncated };
}

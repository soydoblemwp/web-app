import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { evaluatePolicy } from "@/lib/agents/governance-engine";
import type { GovernanceOperationType, GovernanceRiskLevelValue, PolicyEvaluationResult } from "@/lib/agents/governance-types";
import { getActivePolicy, getPolicyById, getMatchedRules, DEFAULT_POLICY_LIMITS } from "@/server/services/agent-governance-policy";
import { getGovernanceState } from "@/server/services/agent-governance-state";
import { countActiveRunsForProject, countActiveRunsForAgent, countRunsToday, countRunsThisMonth } from "@/server/services/agent-governance-concurrency";
import { getBudgetSnapshots, emitBudgetAlertsIfNeeded } from "@/server/services/agent-governance-budget";
import { publishAutomationEvent } from "@/server/services/automation-events";
import { logGovernanceAction } from "@/server/services/agent-governance-audit";
import { notifyGovernanceRunDenied } from "@/server/services/agent-governance-notifications";
import { listActiveRollouts, recordShadowEvaluation } from "@/server/services/agent-governance-rollout";
import { isInLimitedRolloutScope } from "@/lib/agents/governance-rollout-scope";

/**
 * The single real integration point between the pure `evaluatePolicy()`
 * engine and the database (Fase 37 spec section 18) — every governed
 * lifecycle entry point (create run, prepare step, retry, resume, complete
 * an important write) calls `evaluateRunGovernance` through this file, NEVER
 * the pure engine directly and NEVER a second, parallel decision path.
 */
export interface EvaluateRunGovernanceParams {
  projectId: string;
  userId: string;
  hasProjectAccess: boolean;
  agentRef: string;
  mode: string | null;
  operationType: GovernanceOperationType;
  riskLevel: GovernanceRiskLevelValue;
  contextChars?: number;
  expectedOutputChars?: number;
  retryCount?: number;
  preApprovedRequestId?: string | null;
}

export async function evaluateRunGovernance(params: EvaluateRunGovernanceParams): Promise<PolicyEvaluationResult> {
  const activePolicy = await getActivePolicy(params.projectId);
  const state = await getGovernanceState(params.projectId);

  // Fase 38 spec section 19: a LIMITED-stage rollout whose scope matches this exact
  // agentRef/mode/user becomes the REAL governing policy for THIS call — deterministic,
  // never per-request randomness (see governance-rollout-scope.ts). Every other request
  // keeps using the currently ACTIVE policy exactly as Fase 37 did.
  const rollouts = await listActiveRollouts(params.projectId);
  const limitedRollout = rollouts.find(
    (r) => r.stage === "LIMITED" && isInLimitedRolloutScope({ policyId: r.policyId, scopeAgentRefs: r.scopeAgentRefs, scopeModes: r.scopeModes, percentage: r.percentage }, params.agentRef, params.mode, params.userId)
  );
  const governingPolicy = limitedRollout ? await getPolicyById(params.projectId, limitedRollout.policyId) : activePolicy;

  const matched = governingPolicy ? await getMatchedRules(governingPolicy.id, params.agentRef, params.mode) : { agentRule: null, modeRule: null };
  const limits = governingPolicy?.limits ?? DEFAULT_POLICY_LIMITS;

  // A matched AGENT/MODE rule's own maxRunsPerDay overrides the project-wide daily quota field
  // (spec section 9 example: "limitar research-agent a 5 ejecuciones diarias") — when that override
  // is present, the count that must be compared against it is the AGENT's own daily run count, never
  // the whole project's, or the override would be checked against the wrong population.
  const dailyQuotaIsAgentScoped = (matched.modeRule?.maxRunsPerDay ?? matched.agentRule?.maxRunsPerDay) != null;

  const [concurrentForProject, concurrentForAgent, runsToday, runsThisMonth, budgets] = await Promise.all([
    countActiveRunsForProject(params.projectId),
    countActiveRunsForAgent(params.projectId, params.agentRef),
    countRunsToday(params.projectId, dailyQuotaIsAgentScoped ? params.agentRef : null),
    countRunsThisMonth(params.projectId),
    getBudgetSnapshots(params.projectId, "PROJECT", "", limits),
  ]);

  const commonSignals = {
    hasProjectAccess: params.hasProjectAccess,
    agentRef: params.agentRef,
    agentIsOfficial: true as const,
    mode: params.mode,
    operationType: params.operationType,
    riskLevel: params.riskLevel,
    contextChars: params.contextChars ?? 0,
    expectedOutputChars: params.expectedOutputChars ?? 0,
    retryCount: params.retryCount ?? 0,
    concurrentRunsForProject: concurrentForProject,
    concurrentRunsForAgent: concurrentForAgent,
    runsTodayForProject: runsToday,
    runsThisMonthForProject: runsThisMonth,
    emergencyStopEnabled: state.emergencyStopEnabled,
    projectPaused: state.projectPaused,
    agentPaused: state.pausedAgentRefs.includes(params.agentRef),
  };

  const result = evaluatePolicy({
    projectId: params.projectId,
    userId: params.userId,
    ...commonSignals,
    policy: governingPolicy,
    matchedAgentRule: matched.agentRule,
    matchedModeRule: matched.modeRule,
    budgets,
    preApprovedRequestId: params.preApprovedRequestId ?? null,
  });

  await emitBudgetAlertsIfNeeded(params.projectId, budgets);
  await publishAutomationEvent({
    projectId: params.projectId,
    eventKey: result.decision === "DENY" ? "ai_agent_governance.run_denied" : result.decision === "ALLOW" ? "ai_agent_governance.run_allowed" : "ai_agent_governance.approval_requested",
    actorId: params.userId,
    payload: result.decision === "DENY" ? { agentRef: params.agentRef, code: result.code } : { agentRef: params.agentRef, riskLevel: result.riskLevel },
    idempotencyKey: `ai_agent_governance.decision:${params.projectId}:${params.agentRef}:${params.operationType}:${params.userId}:${Date.now()}`,
  }).catch(() => null);

  if (result.decision === "DENY") {
    await notifyGovernanceRunDenied(params.projectId, params.userId, params.agentRef, result.reason).catch(() => null);
  }

  // Fase 38 spec section 20: SHADOW evaluations run in parallel, purely for comparison — they
  // NEVER change `result`, never consume budget/concurrency a second time, never emit a run
  // event, never block. Skips the rollout that was already used as the REAL governing policy
  // above (a LIMITED policy comparing against itself would be meaningless).
  const shadowRollouts = rollouts.filter((r) => r.stage === "SHADOW" && r.policyId !== governingPolicy?.id);
  for (const shadow of shadowRollouts) {
    const shadowPolicy = await getPolicyById(params.projectId, shadow.policyId);
    if (!shadowPolicy) continue;
    const shadowMatched = await getMatchedRules(shadowPolicy.id, params.agentRef, params.mode);
    const shadowBudgets = await getBudgetSnapshots(params.projectId, "PROJECT", "", shadowPolicy.limits);
    const shadowResult = evaluatePolicy({
      projectId: params.projectId,
      userId: params.userId,
      ...commonSignals,
      policy: shadowPolicy,
      matchedAgentRule: shadowMatched.agentRule,
      matchedModeRule: shadowMatched.modeRule,
      budgets: shadowBudgets,
      preApprovedRequestId: null,
    });
    await recordShadowEvaluation({
      rolloutId: shadow.id,
      projectId: params.projectId,
      agentRef: params.agentRef,
      mode: params.mode,
      activeDecision: result.decision,
      shadowDecision: shadowResult.decision,
      activeCode: result.code,
      shadowCode: shadowResult.code,
    }).catch(() => null);
  }

  return result;
}

/**
 * Persists the immutable per-run decision snapshot (spec section 17) —
 * called exactly once, right after a run is actually created from an ALLOW
 * (or a just-approved) decision. Never called again for that run; later
 * lifecycle checks (retry/resume/complete-write) re-evaluate in real time
 * but never overwrite this row.
 */
export async function recordRunGovernanceSnapshot(runId: string, projectId: string, result: PolicyEvaluationResult, approvalId?: string | null) {
  await prisma.aiAgentRunGovernanceSnapshot.create({
    data: {
      runId,
      projectId,
      decision: result.decision,
      code: result.code,
      reason: result.reason,
      policyId: result.policyId,
      policyVersion: result.policyVersion,
      riskLevel: result.riskLevel,
      rulesEvaluated: result.rulesEvaluated as unknown as Prisma.InputJsonValue,
      effectiveLimits: result.effectiveLimits as unknown as Prisma.InputJsonValue,
      budgetSnapshot: result.budgetSnapshot as unknown as Prisma.InputJsonValue,
      concurrencyObserved: result.concurrencyObserved,
      approvalId: approvalId ?? null,
    },
  });
}

/** Real-time re-check for a lifecycle point on an EXISTING run (retry/resume/complete-write) — logs the outcome to the audit trail but never mutates the run's original snapshot. */
export async function enforceGovernanceOrThrow(params: EvaluateRunGovernanceParams & { runId: string }): Promise<PolicyEvaluationResult> {
  const result = await evaluateRunGovernance(params);
  await logGovernanceAction(params.projectId, params.userId, `ai_agent_governance.${params.operationType.toLowerCase()}_evaluated`, "AiAgentRun", params.runId, { decision: result.decision, code: result.code });
  if (result.decision !== "ALLOW") {
    const err = new Error(result.reason) as Error & { governance?: PolicyEvaluationResult };
    err.governance = result;
    throw err;
  }
  return result;
}

import "server-only";
import { prisma } from "@/lib/db/prisma";
import { evaluatePolicy } from "@/lib/agents/governance-engine";
import type { BudgetDimensionSnapshot, GovernanceRiskLevelValue } from "@/lib/agents/governance-types";
import { getPolicyById, getMatchedRules } from "@/server/services/agent-governance-policy";
import { publishAutomationEvent } from "@/server/services/automation-events";
import type { ImpactAnalysisInput } from "@/lib/validation/agent-governance";

/**
 * Impact analysis (Fase 38 spec section 16) — runs the REAL deterministic
 * `evaluatePolicy()` engine against a DRAFT policy's rules, using each
 * historical run's REAL recorded signals (risk level, concurrency observed,
 * budget usage at the time). Never uses AI. Never mutates a run or its
 * immutable governance snapshot — every historical decision stays exactly
 * as it was recorded (spec section 17: "nunca recalcules... para mostrar el
 * historial"); this only ever produces a SEPARATE, clearly-labeled
 * hypothetical comparison.
 *
 * Known, documented approximation (spec section 16 only requires historical
 * vs hypothetical decision + a real difference, not perfect replay): the
 * immutable snapshot does not persist `mode` or per-agent concurrency
 * separately from the project-wide `concurrencyObserved`, so the
 * reconstructed context reuses `concurrencyObserved` for both dimensions
 * and best-effort recovers `mode` from the run's stored input only for
 * agents that declare one (currently only performance-strategist).
 */

export interface ImpactRunDiff {
  runId: string;
  agentRef: string;
  mode: string | null;
  historicalDecision: string;
  hypotheticalDecision: string;
  historicalCode: string;
  hypotheticalCode: string;
  changed: boolean;
}

export interface ImpactAnalysisResult {
  policyId: string;
  runsAnalyzed: number;
  truncated: boolean;
  agentsAffected: string[];
  modesAffected: string[];
  transitions: {
    allowToDeny: number;
    allowToRequireApproval: number;
    denyToAllow: number;
    requireApprovalToAllow: number;
    other: number;
    unchanged: number;
  };
  sample: ImpactRunDiff[];
}

function budgetsForDraft(stored: unknown, draftLimits: { maxSteps: number | null; maxDurationSeconds: number | null; maxContextChars: number | null; maxOutputChars: number | null }): BudgetDimensionSnapshot[] {
  const rows = Array.isArray(stored) ? (stored as BudgetDimensionSnapshot[]) : [];
  const draftLimitByMetric: Record<string, number | null> = {
    AI_STEPS: draftLimits.maxSteps,
    EXECUTION_SECONDS: draftLimits.maxDurationSeconds,
    CONTEXT_CHARS: draftLimits.maxContextChars,
    OUTPUT_CHARS: draftLimits.maxOutputChars,
  };
  return rows.map((row) => {
    const limit = row.metric in draftLimitByMetric ? draftLimitByMetric[row.metric] : row.limit;
    return { ...row, limit, available: limit === null ? null : Math.max(0, limit - (row.reserved + row.consumed)) };
  });
}

export async function analyzePolicyImpact(projectId: string, input: ImpactAnalysisInput): Promise<ImpactAnalysisResult | { error: string }> {
  const draft = await getPolicyById(projectId, input.policyId);
  if (!draft) return { error: "Política no encontrada." };

  const where: Record<string, unknown> = { projectId };
  if (input.dateFrom || input.dateTo) {
    where.evaluatedAt = {
      ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
      ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
    };
  }

  const rows = await prisma.aiAgentRunGovernanceSnapshot.findMany({
    where: where as never,
    orderBy: { evaluatedAt: "desc" },
    take: input.maxRuns + 1,
    include: { run: { select: { officialAgentKey: true, customAgentId: true, teamId: true, approvedInput: true, input: true } } },
  });

  const truncated = rows.length > input.maxRuns;
  const page = truncated ? rows.slice(0, input.maxRuns) : rows;

  const agentsAffected = new Set<string>();
  const modesAffected = new Set<string>();
  const sample: ImpactRunDiff[] = [];
  const transitions = { allowToDeny: 0, allowToRequireApproval: 0, denyToAllow: 0, requireApprovalToAllow: 0, other: 0, unchanged: 0 };

  for (const row of page) {
    const agentRef = row.run.officialAgentKey ?? row.run.customAgentId ?? row.run.teamId ?? "";
    if (input.agentRef && agentRef !== input.agentRef) continue;

    let mode: string | null = null;
    if (agentRef === "performance-strategist") {
      const values = (row.run.approvedInput ?? row.run.input) as unknown as { values?: { mode?: string } } | null;
      mode = values?.values?.mode ?? null;
    }

    const matched = await getMatchedRules(draft.id, agentRef, mode);
    const budgets = budgetsForDraft(row.budgetSnapshot, draft.limits);

    const hypothetical = evaluatePolicy({
      projectId,
      userId: "impact-analysis",
      hasProjectAccess: true,
      agentRef,
      agentIsOfficial: true,
      mode,
      operationType: "CREATE_RUN",
      riskLevel: row.riskLevel as GovernanceRiskLevelValue,
      contextChars: 0,
      expectedOutputChars: 0,
      retryCount: 0,
      concurrentRunsForProject: row.concurrencyObserved,
      concurrentRunsForAgent: row.concurrencyObserved,
      runsTodayForProject: 0,
      runsThisMonthForProject: 0,
      emergencyStopEnabled: false,
      projectPaused: false,
      agentPaused: false,
      policy: draft,
      matchedAgentRule: matched.agentRule,
      matchedModeRule: matched.modeRule,
      budgets,
      preApprovedRequestId: null,
    });

    const changed = hypothetical.decision !== row.decision;
    agentsAffected.add(agentRef);
    if (mode) modesAffected.add(mode);

    if (changed) {
      if (row.decision === "ALLOW" && hypothetical.decision === "DENY") transitions.allowToDeny++;
      else if (row.decision === "ALLOW" && hypothetical.decision === "REQUIRE_APPROVAL") transitions.allowToRequireApproval++;
      else if (row.decision === "DENY" && hypothetical.decision === "ALLOW") transitions.denyToAllow++;
      else if (row.decision === "REQUIRE_APPROVAL" && hypothetical.decision === "ALLOW") transitions.requireApprovalToAllow++;
      else transitions.other++;
    } else {
      transitions.unchanged++;
    }

    if (sample.length < 50) {
      sample.push({ runId: row.runId, agentRef, mode, historicalDecision: row.decision, hypotheticalDecision: hypothetical.decision, historicalCode: row.code, hypotheticalCode: hypothetical.code, changed });
    }
  }

  const result: ImpactAnalysisResult = {
    policyId: input.policyId,
    runsAnalyzed: page.length,
    truncated,
    agentsAffected: Array.from(agentsAffected),
    modesAffected: Array.from(modesAffected),
    transitions,
    sample,
  };

  await publishAutomationEvent({
    projectId,
    eventKey: "ai_agent_governance.impact_analysis_completed",
    resourceId: input.policyId,
    payload: { policyId: input.policyId, runsAnalyzed: result.runsAnalyzed, decisionChanges: result.transitions.allowToDeny + result.transitions.allowToRequireApproval + result.transitions.denyToAllow + result.transitions.requireApprovalToAllow + result.transitions.other },
    idempotencyKey: `ai_agent_governance.impact_analysis_completed:${input.policyId}:${Date.now()}`,
  }).catch(() => null);

  return result;
}

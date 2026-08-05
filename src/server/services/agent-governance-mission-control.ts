import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { RunFilterInput } from "@/lib/validation/agent-governance";
import { getActivePolicy, DEFAULT_POLICY_LIMITS } from "@/server/services/agent-governance-policy";
import { getGovernanceState } from "@/server/services/agent-governance-state";
import { getBudgetSnapshots } from "@/server/services/agent-governance-budget";
import { countActiveRunsForProject } from "@/server/services/agent-governance-concurrency";

/**
 * Read-only aggregation for Mission Control (Fase 37 spec section 23) — every
 * number here comes from a real query, never a placeholder/simulated value.
 * Empty states (no active policy, no runs, no denials) are real absences,
 * not zeroed-out mock data.
 */
export async function getMissionControlOverview(projectId: string) {
  const [policy, state, concurrency, recentRuns, pendingApprovals, recentSnapshots] = await Promise.all([
    getActivePolicy(projectId),
    getGovernanceState(projectId),
    countActiveRunsForProject(projectId),
    prisma.aiAgentRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, officialAgentKey: true, customAgentId: true, teamId: true, createdAt: true, completedAt: true },
    }),
    prisma.aiAgentGovernanceApproval.findMany({
      where: { projectId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { requestedBy: { select: { id: true, name: true, email: true } } },
    }),
    prisma.aiAgentRunGovernanceSnapshot.findMany({
      where: { projectId },
      orderBy: { evaluatedAt: "desc" },
      take: 20,
      select: { id: true, runId: true, decision: true, code: true, reason: true, riskLevel: true, evaluatedAt: true },
    }),
  ]);

  const limits = policy?.limits ?? DEFAULT_POLICY_LIMITS;
  const budgets = await getBudgetSnapshots(projectId, "PROJECT", "", limits);

  const [statusCounts, deniedCount, requireApprovalCount, failureByAgent] = await Promise.all([
    prisma.aiAgentRun.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } }),
    prisma.aiAgentRunGovernanceSnapshot.count({ where: { projectId, decision: "DENY" } }),
    prisma.aiAgentRunGovernanceSnapshot.count({ where: { projectId, decision: "REQUIRE_APPROVAL" } }),
    prisma.aiAgentRun.groupBy({ by: ["officialAgentKey", "customAgentId"], where: { projectId, status: "FAILED" }, _count: { _all: true } }),
  ]);

  return {
    policy: policy ? { id: policy.id, version: policy.version, limits: policy.limits } : null,
    state: {
      projectPaused: state.projectPaused,
      emergencyStopEnabled: state.emergencyStopEnabled,
      pausedAgentRefs: state.pausedAgentRefs,
    },
    concurrency: { active: concurrency, maxProject: limits.maxConcurrentRunsPerProject },
    statusCounts: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
    deniedCount,
    requireApprovalCount,
    recentRuns: recentRuns.map((r) => ({ id: r.id, status: r.status, agentRef: r.officialAgentKey ?? r.customAgentId ?? r.teamId ?? "", createdAt: r.createdAt, completedAt: r.completedAt })),
    pendingApprovals: pendingApprovals.map((a) => ({ id: a.id, agentRef: a.agentRef, mode: a.mode, riskLevel: a.riskLevel, requestedBy: a.requestedBy, createdAt: a.createdAt, expiresAt: a.expiresAt })),
    recentDecisions: recentSnapshots,
    budgets,
    agentsWithMostFailures: failureByAgent
      .map((f) => ({ agentRef: f.officialAgentKey ?? f.customAgentId ?? "", failures: f._count._all }))
      .filter((f) => f.agentRef)
      .sort((a, b) => b.failures - a.failures)
      .slice(0, 5),
  };
}

/** Paginated, filtered run list joined with its governance decision snapshot (spec section 24) — cursor-based, never a full unpaginated history load. */
export async function listGovernedRuns(projectId: string, filter: RunFilterInput) {
  const where: Record<string, unknown> = { projectId };
  if (filter.status) where.status = filter.status;
  if (filter.agentRef) where.OR = [{ officialAgentKey: filter.agentRef }, { customAgentId: filter.agentRef }, { teamId: filter.agentRef }];
  if (filter.createdById) where.createdById = filter.createdById;
  if (filter.dateFrom || filter.dateTo) {
    where.createdAt = {
      ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
      ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
    };
  }
  if (filter.decision || filter.riskLevel) {
    where.governanceSnapshot = {
      ...(filter.decision ? { decision: filter.decision } : {}),
      ...(filter.riskLevel ? { riskLevel: filter.riskLevel } : {}),
    };
  }

  const rows = await prisma.aiAgentRun.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: { governanceSnapshot: true, createdBy: { select: { id: true, name: true, email: true } } },
  });

  const hasMore = rows.length > filter.limit;
  const page = hasMore ? rows.slice(0, filter.limit) : rows;
  return { runs: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

export async function getRunGovernanceDetail(projectId: string, runId: string) {
  const run = await prisma.aiAgentRun.findUnique({
    where: { id: runId },
    include: {
      governanceSnapshot: { include: { policy: true, approval: { include: { requestedBy: { select: { id: true, name: true, email: true } }, decidedBy: { select: { id: true, name: true, email: true } } } } } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!run || run.projectId !== projectId) return null;
  return run;
}

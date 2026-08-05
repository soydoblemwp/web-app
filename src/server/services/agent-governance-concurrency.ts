import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Real concurrency counting (Fase 37 spec section 15) — counts only
 * non-terminal `AiAgentRun` rows. `READY` (confirmed input, about to start)
 * and `WAITING_FOR_APPROVAL` (mid-run, blocked on a Fase-31 per-step
 * approval) both occupy a real concurrency slot exactly like `RUNNING`;
 * `DRAFT` is excluded — it represents an unconfirmed form a user may be
 * editing, not a committed execution, matching `createDraftRun`'s own
 * DRAFT→READY transition in agent-orchestrator.ts. `COMPLETED`,
 * `PARTIALLY_COMPLETED`, `FAILED`, `CANCELLED`, and `ARCHIVED` are all
 * terminal and never counted.
 */
const ACTIVE_RUN_STATUSES = ["READY", "RUNNING", "WAITING_FOR_APPROVAL"] as const;

/**
 * `AiAgentRun` has no single `agentRef` column — it targets exactly one of
 * `officialAgentKey` / `customAgentId` / `teamId` (app-enforced). Governance
 * treats whichever one is set as the run's `agentRef` identity, matching how
 * `AiAgentPolicyRule.agentRef` is keyed for overrides.
 */
function agentRefFilter(agentRef: string) {
  return { OR: [{ officialAgentKey: agentRef }, { customAgentId: agentRef }, { teamId: agentRef }] };
}

export async function countActiveRunsForProject(projectId: string): Promise<number> {
  return prisma.aiAgentRun.count({ where: { projectId, status: { in: [...ACTIVE_RUN_STATUSES] } } });
}

export async function countActiveRunsForAgent(projectId: string, agentRef: string): Promise<number> {
  return prisma.aiAgentRun.count({ where: { projectId, status: { in: [...ACTIVE_RUN_STATUSES] }, ...agentRefFilter(agentRef) } });
}

export async function countRunsToday(projectId: string, agentRef: string | null, now: Date = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return prisma.aiAgentRun.count({ where: { projectId, ...(agentRef ? agentRefFilter(agentRef) : {}), createdAt: { gte: start } } });
}

export async function countRunsThisMonth(projectId: string, now: Date = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return prisma.aiAgentRun.count({ where: { projectId, createdAt: { gte: start } } });
}

import "server-only";
import { prisma } from "@/lib/db/prisma";

const HISTORY_LIMIT = 10;

/** Every real execution of `workflowId` this user has ever run, most recent first — never another user's runs. */
export async function listWorkflowRunsForWorkflow(workflowId: string, userId: string) {
  return prisma.workflowRun.findMany({
    where: { workflowId, userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
}

/** Full detail of one run, ownership-checked — "not mine" and "doesn't exist" both resolve to null, same shape as every other getXForUser in this app. */
export async function getWorkflowRunForUser(runId: string, userId: string) {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
  if (!run || run.userId !== userId) return null;
  return run;
}

/** How many of this user's TOP-LEVEL runs are currently active (not yet terminal — includes INTERRUPTED, which is still an outstanding, resumable run occupying a slot) — the concurrency limit check reads this directly. Deliberately excludes SubWorkflow (child) runs: a single user-initiated execution nested several "workflow" steps deep can legitimately have multiple descendant WorkflowRun rows RUNNING at once (one per active nesting level), and that internal implementation detail must never eat into — or be confused with — the user's own concurrent-EXECUTIONS quota. */
export async function countActiveWorkflowRunsForUser(userId: string) {
  return prisma.workflowRun.count({
    where: { userId, parentRunId: null, status: { in: ["PENDING", "VALIDATING", "RUNNING", "INTERRUPTED"] } },
  });
}

export interface RunNavigationInfo {
  runId: string;
  workflowId: string;
  workflowName: string;
  /** The run + workflow one level up the SubWorkflow chain, when this run WAS a child — null for a top-level, user-initiated run. */
  parent: { runId: string; workflowId: string; workflowName: string; stepOutputVariable: string } | null;
  /** Every child run THIS run's own "workflow" steps spawned, most recent step first. */
  children: { runId: string; workflowId: string; workflowName: string; status: string; stepOutputVariable: string }[];
}

/**
 * Workspace/analytics navigation between a run and its SubWorkflow
 * parent/children — lets a result screen jump straight to "workflow padre",
 * "workflow hijo", "ejecución padre", "ejecución hijo" without the caller
 * re-deriving the chain itself. Ownership-checked once, at the root lookup;
 * children are found via the indexed parentRunId (never a JSON scan).
 */
export async function getRunNavigationInfo(runId: string, userId: string): Promise<RunNavigationInfo | null> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      userId: true,
      workflowId: true,
      workflow: { select: { name: true } },
      parentStepRun: {
        select: {
          outputVariable: true,
          workflowRun: { select: { id: true, workflowId: true, workflow: { select: { name: true } } } },
        },
      },
    },
  });
  if (!run || run.userId !== userId) return null;

  const children = await prisma.workflowRun.findMany({
    where: { parentRunId: runId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      workflowId: true,
      status: true,
      workflow: { select: { name: true } },
      parentStepRun: { select: { outputVariable: true } },
    },
  });

  return {
    runId: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflow.name,
    parent: run.parentStepRun
      ? {
          runId: run.parentStepRun.workflowRun.id,
          workflowId: run.parentStepRun.workflowRun.workflowId,
          workflowName: run.parentStepRun.workflowRun.workflow.name,
          stepOutputVariable: run.parentStepRun.outputVariable,
        }
      : null,
    children: children.map((c) => ({
      runId: c.id,
      workflowId: c.workflowId,
      workflowName: c.workflow.name,
      status: c.status,
      stepOutputVariable: c.parentStepRun?.outputVariable ?? "",
    })),
  };
}

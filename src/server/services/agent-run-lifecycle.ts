import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { AiAgentRun, AiAgentRunStep } from "@/generated/prisma/client";
import { canCompleteRun, shouldBePartiallyCompleted } from "@/lib/agents/state-machine";
import type { AiAgentErrorCategoryValue } from "@/lib/agents/types";
import { publishAutomationEvent } from "@/server/services/automation-events";

/**
 * Shared AI Agent run finalization/failure helpers — extracted out of
 * agent-orchestrator.ts so a capability-specific handler (e.g.
 * agent-performance-strategist.ts, Fase 36) can reuse the SAME run
 * lifecycle/state-machine/event-publishing logic without a circular import
 * between the generic orchestrator and the capability's own module. Never a
 * second implementation of "how a run finishes/fails" — this is the one.
 */

export function agentRefOf(run: AiAgentRun): string {
  return run.officialAgentKey ?? run.customAgentId ?? run.teamId ?? "unknown";
}

export async function refreshProgress(runId: string) {
  const steps = await prisma.aiAgentRunStep.findMany({ where: { runId } });
  const resolved = steps.filter((s) => ["COMPLETED", "SKIPPED", "FAILED", "CANCELLED"].includes(s.status)).length;
  const percent = steps.length === 0 ? 0 : Math.round((resolved / steps.length) * 100);
  await prisma.aiAgentRun.update({ where: { id: runId }, data: { progressPercent: percent } });
  return steps;
}

function readItemFailureCount(step: AiAgentRunStep): number {
  const output = step.output as { itemFailures?: unknown[] } | null;
  return output?.itemFailures?.length ?? 0;
}

export async function finalizeIfAllStepsResolved(run: AiAgentRun) {
  const steps = await refreshProgress(run.id);
  const allResolved = steps.every((s) => !["PENDING", "RUNNING", "WAITING_FOR_APPROVAL"].includes(s.status));
  if (!allResolved) return null;

  const failedCounts = steps.map((s) => readItemFailureCount(s));
  const finalStatus = canCompleteRun(steps.map((s) => s.status))
    ? shouldBePartiallyCompleted(failedCounts)
      ? "PARTIALLY_COMPLETED"
      : "COMPLETED"
    : "FAILED";

  const result = { finishedSteps: steps.filter((s) => s.status === "COMPLETED").map((s) => ({ order: s.order, agentRef: s.agentRef, output: s.output })) };
  await prisma.aiAgentRun.update({ where: { id: run.id }, data: { status: finalStatus, completedAt: new Date(), result: result as unknown as Prisma.InputJsonValue } });

  if (finalStatus === "COMPLETED" || finalStatus === "PARTIALLY_COMPLETED") {
    await publishAutomationEvent({
      projectId: run.projectId,
      eventKey: "agent_run.completed",
      resourceId: run.id,
      payload: { id: run.id, agentRef: agentRefOf(run), outputType: "structured", status: finalStatus },
      idempotencyKey: `agent_run.completed:${run.id}`,
    });
  } else {
    await publishAutomationEvent({
      projectId: run.projectId,
      eventKey: "agent_run.failed",
      resourceId: run.id,
      payload: { id: run.id, agentRef: agentRefOf(run), status: finalStatus },
      idempotencyKey: `agent_run.failed:${run.id}`,
    });
  }
  return finalStatus;
}

export async function failRunAndSkipRemaining(run: AiAgentRun, failedStepId: string, message: string, category: AiAgentErrorCategoryValue) {
  await prisma.$transaction([
    prisma.aiAgentRunStep.update({ where: { id: failedStepId }, data: { status: "FAILED", errorMessage: message, errorCategory: category, completedAt: new Date() } }),
    prisma.aiAgentRunStep.updateMany({ where: { runId: run.id, status: "PENDING" }, data: { status: "SKIPPED" } }),
    prisma.aiAgentRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), lastErrorMessage: message, lastErrorCategory: category } }),
  ]);
  await publishAutomationEvent({
    projectId: run.projectId,
    eventKey: "agent_run.failed",
    resourceId: run.id,
    payload: { id: run.id, agentRef: agentRefOf(run), status: "FAILED" },
    idempotencyKey: `agent_run.failed:${run.id}`,
  });
  await refreshProgress(run.id);
}

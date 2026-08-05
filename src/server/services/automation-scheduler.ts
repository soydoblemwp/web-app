import "server-only";
import { prisma } from "@/lib/db/prisma";
import { computeNextOccurrence, type RecurrenceConfig } from "@/lib/automations/recurrence";
import type { CampaignDateReachedTriggerConfig } from "@/lib/automations/triggers";
import { WORKFLOW_AUTOMATION_LIMITS } from "@/lib/automations/limits";
import { activateAutomation } from "@/server/services/automation-orchestrator";
import { startAutomationRun, advanceAutomationRun } from "@/server/services/automation-workflow-bridge";
import { notifyAutomationEvent } from "@/server/services/automation-notifications";

/**
 * The persistent scheduling engine (spec section 24) — the ONE place time
 * passing turns into real AutomationRuns. Runs via the protected cron
 * endpoint, the dev driver, or a direct service call; never depends on a
 * browser tab or setTimeout. Vercel Cron (when configured) only ever
 * invokes this same processor — it holds no scheduling logic of its own.
 */

export interface ScheduleBatchResult {
  claimed: number;
  runsCreated: number;
}

function dayKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function processDueSchedules(limit = WORKFLOW_AUTOMATION_LIMITS.MAX_SCHEDULES_PER_BATCH): Promise<ScheduleBatchResult> {
  const now = new Date();
  const result: ScheduleBatchResult = { claimed: 0, runsCreated: 0 };

  const dueTriggers = await prisma.workflowAutomationTrigger.findMany({
    where: { status: "ACTIVE", type: { in: ["SCHEDULE_ONCE", "SCHEDULE_RECURRING"] }, nextFiredAt: { lte: now } },
    include: { automation: true },
    take: limit,
  });

  for (const trigger of dueTriggers) {
    if (trigger.automation.status !== "ACTIVE" || !trigger.nextFiredAt) continue;

    const claim = await prisma.workflowAutomationTrigger.updateMany({
      where: { id: trigger.id, nextFiredAt: trigger.nextFiredAt },
      data: { nextFiredAt: null },
    });
    if (claim.count === 0) continue;
    result.claimed++;

    const scheduledAt = trigger.nextFiredAt;
    let skip = false;
    // The anchor used to compute the FOLLOWING occurrence — normally the fired date itself, but a rescheduled occurrence resumes the series from its original date, never permanently drifting the whole recurrence (spec section 26/34).
    let nextOccurrenceAnchor = scheduledAt;

    if (trigger.type === "SCHEDULE_RECURRING") {
      const skipException = await prisma.workflowAutomationScheduleException.findUnique({
        where: { automationId_occurrenceAt: { automationId: trigger.automationId, occurrenceAt: scheduledAt } },
      });
      if (skipException?.action === "SKIP") skip = true;

      const rescheduleException = await prisma.workflowAutomationScheduleException.findFirst({
        where: { automationId: trigger.automationId, action: "RESCHEDULE", rescheduledTo: scheduledAt },
      });
      if (rescheduleException) nextOccurrenceAnchor = rescheduleException.occurrenceAt;
    }

    if (!skip) {
      const idempotencyKey = trigger.type === "SCHEDULE_ONCE" ? `once:${trigger.automationId}` : `occurrence:${trigger.automationId}:${scheduledAt.toISOString()}`;
      const activation = await activateAutomation({
        automation: { ...trigger.automation, trigger },
        triggerType: trigger.type,
        triggerSnapshot: { scheduledAt: scheduledAt.toISOString() },
        idempotencyKey,
        correlationId: idempotencyKey,
      });
      if (activation.runId && !activation.blocked) result.runsCreated++;
    }

    let nextOccurrence: Date | null = null;
    if (trigger.type === "SCHEDULE_RECURRING") {
      const config = trigger.config as unknown as RecurrenceConfig;
      nextOccurrence = computeNextOccurrence(config, nextOccurrenceAnchor, trigger.firedCount + 1);
      await prisma.workflowAutomationTrigger.update({
        where: { id: trigger.id },
        data: { nextFiredAt: nextOccurrence, firedCount: { increment: 1 }, lastFiredAt: now },
      });
    } else {
      // SCHEDULE_ONCE never fires again — nextFiredAt stays null forever.
      await prisma.workflowAutomationTrigger.update({ where: { id: trigger.id }, data: { firedCount: { increment: 1 }, lastFiredAt: now } });
    }

    await prisma.workflowAutomation.update({ where: { id: trigger.automationId }, data: { lastRunAt: now, nextRunAt: nextOccurrence } });
  }

  return result;
}

/** CAMPAIGN_DATE_REACHED (spec section 43) — evaluated by the scheduler against real Campaign rows, never a browser timer. Idempotent per (automation, campaign, calendar day) via the same DB unique constraint every other trigger relies on. */
export async function processCampaignDateTriggers(limit = WORKFLOW_AUTOMATION_LIMITS.MAX_SCHEDULES_PER_BATCH): Promise<ScheduleBatchResult> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const result: ScheduleBatchResult = { claimed: 0, runsCreated: 0 };

  const automations = await prisma.workflowAutomation.findMany({
    where: { status: "ACTIVE", trigger: { type: "CAMPAIGN_DATE_REACHED" } },
    include: { trigger: true },
    take: limit,
  });

  for (const automation of automations) {
    if (!automation.trigger) continue;
    const config = automation.trigger.config as unknown as CampaignDateReachedTriggerConfig;
    const dateField = config.which === "END" ? "endDate" : "startDate";

    const campaigns = await prisma.campaign.findMany({
      where: {
        projectId: automation.projectId,
        ...(config.campaignId ? { id: config.campaignId } : {}),
        [dateField]: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, name: true },
    });

    for (const campaign of campaigns) {
      result.claimed++;
      const idempotencyKey = `campaign-date:${automation.id}:${campaign.id}:${dayKeyUtc(now)}`;
      const activation = await activateAutomation({
        automation,
        triggerType: "CAMPAIGN_DATE_REACHED",
        triggerSnapshot: { campaignId: campaign.id, campaignName: campaign.name, which: config.which, date: dayKeyUtc(now) },
        idempotencyKey,
        correlationId: idempotencyKey,
      });
      if (activation.runId && !activation.blocked) result.runsCreated++;
    }
  }

  return result;
}

export async function processRetries(limit = WORKFLOW_AUTOMATION_LIMITS.MAX_SCHEDULES_PER_BATCH): Promise<{ processed: number }> {
  const now = new Date();
  const due = await prisma.workflowAutomationRun.findMany({ where: { status: "RETRY_SCHEDULED", nextRetryAt: { lte: now } }, take: limit });
  let processed = 0;
  for (const run of due) {
    const claim = await prisma.workflowAutomationRun.updateMany({ where: { id: run.id, status: "RETRY_SCHEDULED" }, data: { status: "QUEUED", attempt: { increment: 1 }, workflowRunId: null, executionToken: null, nextRetryAt: null } });
    if (claim.count === 0) continue;
    processed++;
    await startAutomationRun(run.id);
  }
  return { processed };
}

export async function processWaits(limit = WORKFLOW_AUTOMATION_LIMITS.MAX_SCHEDULES_PER_BATCH): Promise<{ processed: number }> {
  const now = new Date();
  const due = await prisma.workflowAutomationWait.findMany({
    where: { status: "PENDING", kind: { in: ["DURATION", "UNTIL_DATE"] }, wakeAt: { lte: now } },
    take: limit,
  });
  let processed = 0;
  for (const wait of due) {
    const claim = await prisma.workflowAutomationWait.updateMany({ where: { id: wait.id, status: "PENDING" }, data: { status: "SATISFIED" } });
    if (claim.count === 0) continue;
    processed++;
    await advanceAutomationRun(wait.runId);
  }
  return { processed };
}

/** Timeouts (spec section 23) — execution/approval/wait, each mapped to its own honest terminal state. Never confuses a timeout with a manual cancellation. */
export async function processTimeouts(limit = WORKFLOW_AUTOMATION_LIMITS.MAX_SCHEDULES_PER_BATCH): Promise<{ timedOutRuns: number; expiredApprovals: number; timedOutWaits: number }> {
  const now = new Date();

  const runningRuns = await prisma.workflowAutomationRun.findMany({
    where: { status: "RUNNING", automation: { executionTimeoutMs: { not: null } } },
    include: { automation: true },
    take: limit,
  });
  let timedOutRuns = 0;
  for (const run of runningRuns) {
    if (!run.startedAt || !run.automation.executionTimeoutMs) continue;
    if (now.getTime() - run.startedAt.getTime() < run.automation.executionTimeoutMs) continue;
    const claim = await prisma.workflowAutomationRun.updateMany({ where: { id: run.id, status: "RUNNING" }, data: { status: "TIMED_OUT", completedAt: now, lastErrorMessage: "Se superó el tiempo máximo de ejecución.", lastErrorCategory: "INTERNAL_SAFE" } });
    if (claim.count > 0) {
      timedOutRuns++;
      await notifyAutomationEvent(run.automationId, run.id, "TIMEOUT");
    }
  }

  const expired = await prisma.workflowAutomationApproval.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  if (expired.count > 0) {
    const expiredApprovals = await prisma.workflowAutomationApproval.findMany({ where: { status: "EXPIRED", decidedAt: null }, take: limit, select: { runId: true } });
    for (const approval of expiredApprovals) {
      await prisma.workflowAutomationRun.updateMany({ where: { id: approval.runId, status: "WAITING_FOR_APPROVAL" }, data: { status: "FAILED", completedAt: now, lastErrorMessage: "La aprobación requerida expiró.", lastErrorCategory: "APPROVAL_REJECTED" } });
    }
  }

  const timedOutWaitsResult = await prisma.workflowAutomationWait.updateMany({
    where: { status: "PENDING", timeoutAt: { lte: now } },
    data: { status: "TIMED_OUT" },
  });

  return { timedOutRuns, expiredApprovals: expired.count, timedOutWaits: timedOutWaitsResult.count };
}

/** Reclaims WorkflowAutomationRun rows whose lock expired without ever reaching a terminal state (a crashed/killed processing pass) — spec section 29: "una ejecución bloqueada debe poder recuperarse si el proceso muere". */
export async function reconcileStaleRunLocks(): Promise<number> {
  const result = await prisma.workflowAutomationRun.updateMany({
    where: { lockExpiresAt: { lt: new Date() } },
    data: { lockedAt: null, lockedBy: null, lockExpiresAt: null },
  });
  return result.count;
}

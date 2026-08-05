import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getProjectRole } from "@/lib/permissions";
import { beginFreshRun, prepareWorkflowStepCore, cancelWorkflowRunCore } from "@/server/actions/workflow-execution";
import { getWorkflowRunForUser } from "@/server/services/workflow-runs";
import { isRunTerminal } from "@/lib/ai-workflows/run-state";
import { computeNextRetryAt } from "@/lib/automations/backoff";
import { isRetryableErrorCategory, type WorkflowAutomationErrorCategory, type WorkflowAutomationRunStatusValue } from "@/lib/automations/types";
import { notifyAutomationEvent } from "@/server/services/automation-notifications";

/**
 * The bridge between an AutomationRun and the REAL AI Workflows engine
 * (spec section 39/19: "no crees un segundo motor de pasos"). Drives the
 * SAME `beginFreshRun`/`prepareWorkflowStepCore` a browser tab would, just
 * headlessly: any step whose resolution is server-computable ("resolved" or
 * "sub_workflow" — transform, knowledge search, brand kit, prompt library,
 * AI template, save_result, and any pure sub-workflow of those) advances
 * immediately. A step that genuinely needs the browser's local AI engine
 * ("ai_tool"/"agent", kind "ai_call") cannot run unattended — this
 * codebase's only AI engine is client-side WebGPU (see
 * src/lib/ai/local/engine.ts). When that happens, the run is left RUNNING
 * at that exact step (never faked as complete) and the project is notified
 * so a human can open it and drive the remaining AI step(s) through the
 * normal AI Workflows UI — the same WorkflowRun, same lease, same engine.
 */

export interface BridgeResult {
  status: string;
  error?: string;
  needsManualStep?: boolean;
}

async function markRunOutcome(automationRunId: string, patch: { status: WorkflowAutomationRunStatusValue; lastErrorMessage?: string | null; lastErrorCategory?: WorkflowAutomationErrorCategory | null; completed?: boolean }) {
  const now = new Date();
  const run = await prisma.workflowAutomationRun.findUnique({ where: { id: automationRunId } });
  if (!run) return;
  const durationMs = patch.completed && run.startedAt ? now.getTime() - run.startedAt.getTime() : undefined;
  await prisma.workflowAutomationRun.update({
    where: { id: automationRunId },
    data: {
      status: patch.status,
      lastErrorMessage: patch.lastErrorMessage,
      lastErrorCategory: patch.lastErrorCategory,
      completedAt: patch.completed ? now : undefined,
      durationMs,
    },
  });
}

async function applyErrorPolicy(automationRunId: string, message: string, category: WorkflowAutomationErrorCategory) {
  const run = await prisma.workflowAutomationRun.findUnique({ where: { id: automationRunId }, include: { automation: true } });
  if (!run) return;

  const retryable = isRetryableErrorCategory(category) && run.automation.errorPolicy === "RETRY";
  if (retryable && run.attempt < run.automation.maxRetryAttempts) {
    const nextRetryAt = computeNextRetryAt(run.attempt, { baseDelayMs: run.automation.retryBaseDelayMs, multiplier: run.automation.retryDelayMultiplier, maxDelayMs: run.automation.retryMaxDelayMs });
    await prisma.$transaction([
      prisma.workflowAutomationRun.update({ where: { id: automationRunId }, data: { status: "RETRY_SCHEDULED", nextRetryAt, lastErrorMessage: message, lastErrorCategory: category } }),
      prisma.workflowAutomationRunAttempt.create({ data: { runId: automationRunId, attemptNumber: run.attempt, status: "FAILED", errorMessage: message, errorCategory: category, completedAt: new Date() } }),
    ]);
    return;
  }

  const finalStatus = run.automation.errorPolicy === "CONTINUE" ? "PARTIALLY_COMPLETED" : run.automation.errorPolicy === "WAIT_FOR_REVIEW" ? "WAITING_FOR_APPROVAL" : "FAILED";
  await prisma.$transaction([
    prisma.workflowAutomationRun.update({ where: { id: automationRunId }, data: { status: finalStatus, lastErrorMessage: message, lastErrorCategory: category, completedAt: finalStatus === "FAILED" || finalStatus === "PARTIALLY_COMPLETED" ? new Date() : null } }),
    prisma.workflowAutomationRunAttempt.create({ data: { runId: automationRunId, attemptNumber: run.attempt, status: "FAILED", errorMessage: message, errorCategory: category, completedAt: new Date() } }),
  ]);

  if (finalStatus === "WAITING_FOR_APPROVAL") {
    await prisma.workflowAutomationApproval.create({ data: { runId: automationRunId, stepLabel: "Revisión tras error", status: "PENDING" } });
  }

  const consecutiveIncrement = finalStatus === "FAILED" ? { increment: 1 } : undefined;
  if (consecutiveIncrement) {
    const updatedAutomation = await prisma.workflowAutomation.update({ where: { id: run.automationId }, data: { consecutiveFailureCount: consecutiveIncrement } });
    if (updatedAutomation.consecutiveFailureCount >= 5 && updatedAutomation.status === "ACTIVE") {
      const { pauseAutomationBySystem } = await import("@/server/services/automation-catalog");
      await pauseAutomationBySystem(run.automationId, `${updatedAutomation.consecutiveFailureCount} fallos consecutivos.`);
    }
  }

  if (finalStatus === "FAILED" && run.automation.notifyOnFailure) {
    await notifyAutomationEvent(run.automationId, automationRunId, "RUN_FAILED");
  }
}

export async function startAutomationRun(automationRunId: string): Promise<BridgeResult> {
  const run = await prisma.workflowAutomationRun.findUnique({ where: { id: automationRunId }, include: { automation: true } });
  if (!run) return { status: "FAILED", error: "Ejecución no encontrada." };
  if (run.workflowRunId) return advanceAutomationRun(automationRunId);

  const actingUserId = run.createdById ?? run.automation.createdById;
  const role = await getProjectRole(actingUserId, run.projectId);
  if (!role) {
    await markRunOutcome(automationRunId, { status: "FAILED", lastErrorMessage: "El usuario responsable ya no tiene acceso a este proyecto.", lastErrorCategory: "PERMISSION", completed: true });
    return { status: "FAILED", error: "Permiso denegado." };
  }

  const started = await beginFreshRun({
    userId: actingUserId,
    projectId: run.projectId,
    workflowId: run.workflowId,
    idempotencyKey: `automation-run:${run.id}`,
    inputVariables: run.inputs as Record<string, string>,
    leaseOwner: `automation:${run.id}`,
    retryOfRunId: null,
    executionMode: "PUBLISHED",
    mode: "published",
  });

  if (started.error || !started.runId || !started.leaseId) {
    await applyErrorPolicy(automationRunId, started.error ?? "No se pudo iniciar el workflow.", "CONFIGURATION");
    return { status: "FAILED", error: started.error };
  }

  await prisma.workflowAutomationRun.update({
    where: { id: automationRunId },
    data: { workflowRunId: started.runId, status: "RUNNING", startedAt: new Date(), executionToken: started.leaseId },
  });
  await prisma.workflowAutomationRunAttempt.create({ data: { runId: automationRunId, attemptNumber: run.attempt, status: "RUNNING" } });

  return advanceAutomationRun(automationRunId);
}

/** Advances an already-started AutomationRun's WorkflowRun as far as it can go without a browser — one PENDING step at a time, exactly like the client's own driving loop. */
export async function advanceAutomationRun(automationRunId: string): Promise<BridgeResult> {
  const run = await prisma.workflowAutomationRun.findUnique({ where: { id: automationRunId }, include: { automation: true } });
  if (!run || !run.workflowRunId || !run.executionToken) return { status: run?.status ?? "FAILED" };

  const actingUserId = run.createdById ?? run.automation.createdById;

  for (let i = 0; i < 200; i++) {
    const wfRun = await getWorkflowRunForUser(run.workflowRunId, actingUserId);
    if (!wfRun) return { status: "FAILED" };

    if (isRunTerminal(wfRun.status)) {
      if (wfRun.status === "COMPLETED") {
        await markRunOutcome(automationRunId, { status: "COMPLETED", completed: true });
        if (run.automation.notifyOnCompletion) await notifyAutomationEvent(run.automationId, automationRunId, "RUN_COMPLETED");
        // workflow_run.completed is published centrally by workflow-execution.ts's own completion chokepoint for every run (automation-driven or not) — never duplicated here.
        return { status: "COMPLETED" };
      }
      if (wfRun.status === "CANCELLED") {
        await markRunOutcome(automationRunId, { status: "CANCELLED", completed: true });
        return { status: "CANCELLED" };
      }
      // FAILED / INTERRUPTED — workflow_run.failed is likewise published centrally by workflow-execution.ts.
      await applyErrorPolicy(automationRunId, wfRun.errorMessage ?? "El workflow falló.", "AI_TRANSIENT");
      return { status: "FAILED" };
    }

    const nextStep = wfRun.steps.find((s) => s.status === "PENDING");
    if (!nextStep) {
      // Nothing pending but not terminal yet (e.g. a step is mid-flight) — nothing more this headless pass can do right now.
      return { status: "RUNNING", needsManualStep: false };
    }

    const prepared = await prepareWorkflowStepCore(actingUserId, { projectId: run.projectId, runId: run.workflowRunId, stepIndex: nextStep.stepIndex, leaseId: run.executionToken });
    if (prepared.error) {
      await applyErrorPolicy(automationRunId, prepared.error, "CONFLICT_TRANSIENT");
      return { status: "FAILED", error: prepared.error };
    }
    if (!prepared.done && prepared.systemPrompt) {
      // A real AI step (ai_tool/agent) — this codebase's only AI engine is browser-only. Leave the run RUNNING at this exact step; notify so a human can open AI Workflows and drive it forward through the normal UI (same run, same lease).
      await notifyAutomationEvent(run.automationId, automationRunId, "NEEDS_MANUAL_STEP");
      return { status: "RUNNING", needsManualStep: true };
    }
    if (prepared.subWorkflow) {
      // The child run was created server-side; it may itself need a manual AI step deeper in — this pass can't drive it further without a browser either. Surface the same "needs manual step" signal.
      await notifyAutomationEvent(run.automationId, automationRunId, "NEEDS_MANUAL_STEP");
      return { status: "RUNNING", needsManualStep: true };
    }
    // prepared.done === true: a "resolved" step already completed itself server-side inside prepareWorkflowStepCore — loop again for the next step.
  }

  return { status: "RUNNING", needsManualStep: true };
}

export async function cancelAutomationRun(automationRunId: string): Promise<void> {
  const run = await prisma.workflowAutomationRun.findUnique({ where: { id: automationRunId }, include: { automation: true } });
  if (!run) return;
  if (run.workflowRunId) {
    const actingUserId = run.createdById ?? run.automation.createdById;
    await cancelWorkflowRunCore(actingUserId, run.projectId, run.workflowRunId);
  }
  await prisma.workflowAutomationRun.update({ where: { id: automationRunId }, data: { status: "CANCELLED", completedAt: new Date() } });
  await prisma.workflowAutomationWait.updateMany({ where: { runId: automationRunId, status: "PENDING" }, data: { status: "CANCELLED" } });
  await prisma.workflowAutomationApproval.updateMany({ where: { runId: automationRunId, status: "PENDING" }, data: { status: "CANCELLED" } });
}

export { applyErrorPolicy };

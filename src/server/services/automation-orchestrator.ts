import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { WorkflowAutomation, WorkflowAutomationTrigger } from "@/generated/prisma/client";
import { checkForAutomationLoop } from "@/lib/automations/loop-detection";
import { resolveInputMappings, type InputMappingSpec } from "@/lib/automations/mapping";
import { WORKFLOW_AUTOMATION_LIMITS } from "@/lib/automations/limits";
import type { WorkflowAutomationTriggerType } from "@/lib/automations/types";
import { startAutomationRun } from "@/server/services/automation-workflow-bridge";
import { notifyAutomationEvent } from "@/server/services/automation-notifications";

export interface ActivateAutomationInput {
  automation: WorkflowAutomation & { trigger: WorkflowAutomationTrigger | null };
  triggerType: WorkflowAutomationTriggerType;
  triggerSnapshot: Record<string, unknown>;
  eventContext?: { event?: Record<string, unknown>; resource?: Record<string, unknown> };
  /** MANUAL trigger only — the user's own form values, used directly as the run's inputs, bypassing mapping resolution (spec section 5/17). */
  staticInputs?: Record<string, string>;
  eventId?: string | null;
  idempotencyKey: string;
  causationAutomationRunId?: string | null;
  correlationId?: string | null;
  chainDepth?: number;
  createdById?: string | null;
}

export interface ActivationResult {
  runId?: string;
  blocked: boolean;
  reason?: string;
  status?: string;
}

async function collectCausationAncestry(startRunId: string | null | undefined): Promise<string[]> {
  const visited: string[] = [];
  let cursor = startRunId ?? null;
  let hops = 0;
  while (cursor && hops < WORKFLOW_AUTOMATION_LIMITS.MAX_CHAIN_DEPTH + 2) {
    const run: { automationId: string; causationId: string | null } | null = await prisma.workflowAutomationRun.findUnique({
      where: { id: cursor },
      select: { automationId: true, causationId: true },
    });
    if (!run) break;
    visited.push(run.automationId);
    cursor = run.causationId;
    hops++;
  }
  return visited;
}

/**
 * The SINGLE entry point every trigger path (manual, schedule, event,
 * webhook, chained) funnels through to actually create+start a run (spec
 * section 5: "la ejecución manual debe pasar por el mismo sistema
 * persistente... no crees un camino alternativo simplificado"). Loop
 * detection, idempotency, input-mapping resolution, and approval-gating all
 * happen here exactly once.
 */
export async function activateAutomation(input: ActivateAutomationInput): Promise<ActivationResult> {
  const { automation } = input;

  const existingRun = await prisma.workflowAutomationRun.findUnique({ where: { automationId_idempotencyKey: { automationId: automation.id, idempotencyKey: input.idempotencyKey } } });
  if (existingRun) return { runId: existingRun.id, blocked: false, status: existingRun.status };

  const chainDepth = input.chainDepth ?? 0;
  const visitedAutomationIds = await collectCausationAncestry(input.causationAutomationRunId);
  const windowStart = new Date(Date.now() - WORKFLOW_AUTOMATION_LIMITS.LOOP_DETECTION_WINDOW_MS);
  const recentSameActivationCount = await prisma.workflowAutomationRun.count({
    where: { automationId: automation.id, triggerType: input.triggerType, createdAt: { gte: windowStart } },
  });

  const loopCheck = checkForAutomationLoop({
    chainDepth,
    maxChainDepth: WORKFLOW_AUTOMATION_LIMITS.MAX_CHAIN_DEPTH,
    visitedAutomationIds,
    candidateAutomationId: automation.id,
    recentSameActivationCount,
    maxRepeatsInWindow: WORKFLOW_AUTOMATION_LIMITS.MAX_AUTOMATIONS_PER_EVENT_TYPE > 0 ? 5 : 5,
  });

  const correlationId = input.correlationId ?? input.idempotencyKey;

  if (loopCheck.blocked) {
    await prisma.workflowAutomationRun.create({
      data: {
        automationId: automation.id,
        projectId: automation.projectId,
        workflowId: automation.workflowId,
        triggerType: input.triggerType,
        eventId: input.eventId ?? null,
        createdById: input.createdById ?? null,
        status: "SKIPPED",
        inputs: {} as Prisma.InputJsonValue,
        triggerSnapshot: input.triggerSnapshot as unknown as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        causationId: input.causationAutomationRunId ?? null,
        correlationId,
        chainDepth,
        lastErrorMessage: loopCheck.reason,
        lastErrorCategory: "AUTOMATION_LOOP_DETECTED",
        completedAt: new Date(),
      },
    });
    return { blocked: true, reason: loopCheck.reason };
  }

  let values: Record<string, string>;
  let emptyRequired: string[] = [];

  if (input.staticInputs) {
    values = input.staticInputs;
    const workflow = await prisma.workflow.findUnique({ where: { id: automation.workflowId }, select: { variables: true } });
    emptyRequired = (workflow?.variables ?? []).filter((name) => !values[name] || !values[name].trim());
  } else {
    const [mappings, workflow] = await Promise.all([
      prisma.workflowAutomationInputMapping.findMany({ where: { automationId: automation.id }, orderBy: { order: "asc" } }),
      prisma.workflow.findUnique({ where: { id: automation.workflowId }, select: { variables: true } }),
    ]);
    const specs: InputMappingSpec[] = mappings.map((m) => ({ targetVariable: m.targetVariable, sourceKind: m.sourceKind as InputMappingSpec["sourceKind"], sourceExpression: m.sourceExpression, transform: m.transform, defaultValue: m.defaultValue }));
    const resolved = resolveInputMappings(specs, { event: input.eventContext?.event, resource: input.eventContext?.resource }, workflow?.variables ?? []);
    values = resolved.values;
    emptyRequired = resolved.emptyRequired;
  }

  if (emptyRequired.length > 0) {
    return { blocked: true, reason: `Faltan entradas obligatorias del workflow: ${emptyRequired.join(", ")}.` };
  }

  const run = await prisma.workflowAutomationRun.create({
    data: {
      automationId: automation.id,
      projectId: automation.projectId,
      workflowId: automation.workflowId,
      triggerType: input.triggerType,
      eventId: input.eventId ?? null,
      createdById: input.createdById ?? null,
      status: automation.requireApprovalBeforeStart ? "WAITING_FOR_APPROVAL" : "QUEUED",
      inputs: values as unknown as Prisma.InputJsonValue,
      triggerSnapshot: input.triggerSnapshot as unknown as Prisma.InputJsonValue,
      idempotencyKey: input.idempotencyKey,
      causationId: input.causationAutomationRunId ?? null,
      correlationId,
      chainDepth,
    },
  });

  if (automation.requireApprovalBeforeStart) {
    await prisma.workflowAutomationApproval.create({
      data: { runId: run.id, stepLabel: "Antes de iniciar", status: "PENDING", expiresAt: automation.approvalTimeoutMs ? new Date(Date.now() + automation.approvalTimeoutMs) : null },
    });
    await notifyAutomationEvent(automation.id, run.id, "APPROVAL_PENDING");
    return { runId: run.id, blocked: false, status: "WAITING_FOR_APPROVAL" };
  }

  const started = await startAutomationRun(run.id);
  return { runId: run.id, blocked: false, status: started.status };
}

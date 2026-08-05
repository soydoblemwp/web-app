import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getWorkflowForUser } from "@/server/services/ai-workflows";
import { validateTriggerConfig } from "@/lib/automations/triggers";
import { validateConditionTree, type ConditionGroupNode } from "@/lib/automations/conditions";
import { generateWebhookSecret, generateWebhookPublicId } from "@/lib/automations/webhook-signature";
import { encryptSecret } from "@/lib/security/encryption";
import { exceedsActiveRecurringLimit, WORKFLOW_AUTOMATION_LIMITS } from "@/lib/automations/limits";
import { automationError } from "@/lib/automations/types";
import type { WorkflowAutomationErrorCode, WorkflowAutomationActionError } from "@/lib/automations/types";

type MaybeError = WorkflowAutomationActionError | Record<string, never>;
import type { WorkflowAutomationTriggerType } from "@/lib/automations/types";
import type { CreateAutomationInput, UpdateAutomationInput, ConditionGroupInput, InputMappingInput } from "@/lib/validation/automations";

export interface CreateResult {
  id?: string;
  errorCode?: WorkflowAutomationErrorCode;
  errorMessage?: string;
}

async function getOwnedAutomation(projectId: string, automationId: string) {
  const automation = await prisma.workflowAutomation.findUnique({
    where: { id: automationId },
    include: { trigger: true, conditionGroups: { include: { conditions: true, childGroups: { include: { conditions: true } } } }, inputMappings: true },
  });
  if (!automation || automation.projectId !== projectId) return null;
  return automation;
}

export async function listAutomations(projectId: string) {
  return prisma.workflowAutomation.findMany({
    where: { projectId },
    include: { trigger: true, workflow: { select: { id: true, name: true, status: true, isActive: true } }, _count: { select: { runs: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getAutomation(projectId: string, automationId: string) {
  const automation = await prisma.workflowAutomation.findUnique({
    where: { id: automationId },
    include: {
      trigger: true,
      conditionGroups: { where: { parentGroupId: null }, include: { conditions: true, childGroups: { include: { conditions: true } } } },
      inputMappings: { orderBy: { order: "asc" } },
      workflow: { select: { id: true, name: true, status: true, isActive: true, activeRevisionId: true, publishedVersion: true, variables: true } },
      pinnedRevision: { select: { id: true, version: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!automation || automation.projectId !== projectId) return null;
  return automation;
}

function buildConditionGroupCreate(group: ConditionGroupInput, order = 0): Prisma.WorkflowAutomationConditionGroupCreateWithoutAutomationInput {
  return {
    operator: group.operator,
    order,
    conditions: { create: group.conditions.map((c, i) => ({ field: c.field, operator: c.operator, value: (c.value ?? null) as Prisma.InputJsonValue, order: i })) },
    childGroups: { create: (group.groups ?? []).map((g, i) => buildConditionGroupCreate(g, i) as Prisma.WorkflowAutomationConditionGroupCreateWithoutParentGroupInput) },
  };
}

function toConditionTree(group: ConditionGroupInput): ConditionGroupNode {
  return {
    operator: group.operator,
    conditions: group.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })),
    groups: (group.groups ?? []).map(toConditionTree),
  };
}

export async function createAutomation(projectId: string, userId: string, input: CreateAutomationInput): Promise<CreateResult> {
  const workflow = await getWorkflowForUser(input.workflowId, userId);
  if (!workflow || workflow.projectId !== projectId) return { errorCode: "WORKFLOW_NOT_READY", errorMessage: "El workflow indicado no existe o no pertenece a este proyecto." };

  const triggerValidation = validateTriggerConfig(input.trigger.type, input.trigger.config ?? {});
  if (!triggerValidation.valid) return { errorCode: "TRIGGER_INVALID", errorMessage: triggerValidation.error };

  if (input.conditions) {
    const issues = validateConditionTree(toConditionTree(input.conditions));
    if (issues.length > 0) return { errorCode: "CONDITION_INVALID", errorMessage: issues[0].message };
  }

  if (input.trigger.type === "SCHEDULE_RECURRING") {
    const activeCount = await prisma.workflowAutomation.count({ where: { projectId, status: "ACTIVE", trigger: { type: "SCHEDULE_RECURRING" } } });
    if (exceedsActiveRecurringLimit(activeCount)) {
      return { errorCode: "SCHEDULE_INVALID", errorMessage: "Se alcanzó el máximo de automatizaciones recurrentes activas en este proyecto. Pausa o elimina alguna antes de crear otra." };
    }
  }

  let webhookPublicId: string | undefined;
  let webhookSecretEncrypted: string | undefined;
  if (input.trigger.type === "WEBHOOK") {
    webhookPublicId = generateWebhookPublicId();
    webhookSecretEncrypted = encryptSecret(generateWebhookSecret());
  }

  const created = await prisma.workflowAutomation.create({
    data: {
      projectId,
      createdById: userId,
      name: input.name,
      description: input.description || null,
      status: "DRAFT",
      workflowId: input.workflowId,
      errorPolicy: input.errorPolicy ?? "STOP",
      maxRetryAttempts: input.maxRetryAttempts ?? 3,
      retryBaseDelayMs: input.retryBaseDelayMs ?? 60000,
      retryDelayMultiplier: input.retryDelayMultiplier ?? 2,
      retryMaxDelayMs: input.retryMaxDelayMs ?? 3600000,
      executionTimeoutMs: input.executionTimeoutMs ?? null,
      approvalTimeoutMs: input.approvalTimeoutMs ?? null,
      waitTimeoutMs: input.waitTimeoutMs ?? null,
      requireApprovalBeforeStart: input.requireApprovalBeforeStart ?? false,
      notifyOnCompletion: input.notifyOnCompletion ?? false,
      notifyOnFailure: input.notifyOnFailure ?? true,
      timezone: input.timezone ?? "UTC",
      trigger: {
        create: {
          type: input.trigger.type,
          config: (input.trigger.config ?? {}) as Prisma.InputJsonValue,
          webhookPublicId,
          webhookSecretEncrypted,
        },
      },
      conditionGroups: input.conditions ? { create: buildConditionGroupCreate(input.conditions) } : undefined,
      inputMappings: input.inputMappings
        ? { create: input.inputMappings.map((m: InputMappingInput, i: number) => ({ targetVariable: m.targetVariable, sourceKind: m.sourceKind, sourceExpression: m.sourceExpression, transform: m.transform ?? null, defaultValue: m.defaultValue ?? null, order: i })) }
        : undefined,
    },
  });

  return { id: created.id };
}

export async function updateAutomation(projectId: string, automationId: string, input: UpdateAutomationInput): Promise<CreateResult> {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing) return { errorCode: "AUTOMATION_NOT_FOUND" };

  if (input.trigger) {
    const triggerValidation = validateTriggerConfig(input.trigger.type, input.trigger.config ?? {});
    if (!triggerValidation.valid) return { errorCode: "TRIGGER_INVALID", errorMessage: triggerValidation.error };
  }
  if (input.conditions) {
    const issues = validateConditionTree(toConditionTree(input.conditions));
    if (issues.length > 0) return { errorCode: "CONDITION_INVALID", errorMessage: issues[0].message };
  }

  await prisma.$transaction(async (tx) => {
    await tx.workflowAutomation.update({
      where: { id: automationId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.errorPolicy !== undefined ? { errorPolicy: input.errorPolicy } : {}),
        ...(input.maxRetryAttempts !== undefined ? { maxRetryAttempts: input.maxRetryAttempts } : {}),
        ...(input.retryBaseDelayMs !== undefined ? { retryBaseDelayMs: input.retryBaseDelayMs } : {}),
        ...(input.retryDelayMultiplier !== undefined ? { retryDelayMultiplier: input.retryDelayMultiplier } : {}),
        ...(input.retryMaxDelayMs !== undefined ? { retryMaxDelayMs: input.retryMaxDelayMs } : {}),
        ...(input.executionTimeoutMs !== undefined ? { executionTimeoutMs: input.executionTimeoutMs } : {}),
        ...(input.approvalTimeoutMs !== undefined ? { approvalTimeoutMs: input.approvalTimeoutMs } : {}),
        ...(input.waitTimeoutMs !== undefined ? { waitTimeoutMs: input.waitTimeoutMs } : {}),
        ...(input.requireApprovalBeforeStart !== undefined ? { requireApprovalBeforeStart: input.requireApprovalBeforeStart } : {}),
        ...(input.notifyOnCompletion !== undefined ? { notifyOnCompletion: input.notifyOnCompletion } : {}),
        ...(input.notifyOnFailure !== undefined ? { notifyOnFailure: input.notifyOnFailure } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
    });

    if (input.trigger) {
      await tx.workflowAutomationTrigger.update({
        where: { automationId },
        data: { type: input.trigger.type, config: (input.trigger.config ?? {}) as Prisma.InputJsonValue, status: "ACTIVE", lastErrorMessage: null },
      });
    }

    if (input.conditions !== undefined) {
      await tx.workflowAutomationConditionGroup.deleteMany({ where: { automationId } });
      if (input.conditions) {
        await tx.workflowAutomation.update({ where: { id: automationId }, data: { conditionGroups: { create: buildConditionGroupCreate(input.conditions) } } });
      }
    }

    if (input.inputMappings !== undefined) {
      await tx.workflowAutomationInputMapping.deleteMany({ where: { automationId } });
      if (input.inputMappings.length > 0) {
        await tx.workflowAutomationInputMapping.createMany({
          data: input.inputMappings.map((m: InputMappingInput, i: number) => ({ automationId, targetVariable: m.targetVariable, sourceKind: m.sourceKind, sourceExpression: m.sourceExpression, transform: m.transform ?? null, defaultValue: m.defaultValue ?? null, order: i })),
        });
      }
    }
  });

  return { id: automationId };
}

export async function setAutomationStatus(projectId: string, automationId: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED", reason?: string): Promise<MaybeError> {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing) return automationError("AUTOMATION_NOT_FOUND");

  let nextFiredAt: Date | null = null;
  if (status === "ACTIVE") {
    const workflow = await prisma.workflow.findUnique({ where: { id: existing.workflowId } });
    if (!workflow || workflow.status === "ARCHIVED" || !workflow.activeRevisionId) {
      return automationError("WORKFLOW_NOT_READY");
    }
    if (existing.trigger?.type === "SCHEDULE_ONCE") {
      const config = existing.trigger.config as unknown as { scheduledAtUtc?: string };
      nextFiredAt = config.scheduledAtUtc ? new Date(config.scheduledAtUtc) : null;
    } else if (existing.trigger?.type === "SCHEDULE_RECURRING") {
      const { computeNextOccurrence } = await import("@/lib/automations/recurrence");
      const config = existing.trigger.config as unknown as Parameters<typeof computeNextOccurrence>[0];
      nextFiredAt = computeNextOccurrence(config, new Date(), 0);
    }
  }

  await prisma.$transaction([
    prisma.workflowAutomation.update({
      where: { id: automationId },
      data: {
        status,
        archivedAt: status === "ARCHIVED" ? new Date() : existing.archivedAt,
        pausedAt: status === "PAUSED" ? new Date() : null,
        pausedReason: status === "PAUSED" ? (reason ?? null) : null,
        pausedBySystem: false,
        consecutiveFailureCount: status === "ACTIVE" ? 0 : existing.consecutiveFailureCount,
        nextRunAt: status === "ACTIVE" ? nextFiredAt : null,
      },
    }),
    ...(existing.trigger && (existing.trigger.type === "SCHEDULE_ONCE" || existing.trigger.type === "SCHEDULE_RECURRING")
      ? [prisma.workflowAutomationTrigger.update({ where: { automationId }, data: { nextFiredAt: status === "ACTIVE" ? nextFiredAt : null, status: status === "ACTIVE" ? "ACTIVE" : "PAUSED" } })]
      : []),
  ]);
  return {};
}

/** System-initiated pause (spec section 36) — distinct from a user pausing manually, so the UI can show "pausada automáticamente por: ...". */
export async function pauseAutomationBySystem(automationId: string, reason: string) {
  await prisma.workflowAutomation.update({
    where: { id: automationId },
    data: { status: "PAUSED", pausedAt: new Date(), pausedReason: reason, pausedBySystem: true },
  });
}

export async function deleteAutomation(projectId: string, automationId: string) {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing) return false;
  await prisma.workflowAutomation.delete({ where: { id: automationId } });
  return true;
}

/** Copies name/description/workflow/trigger/conditions/mappings/policies — never state, secrets, runs, or counters (spec section 37). The copy always starts DRAFT. */
export async function duplicateAutomation(projectId: string, userId: string, automationId: string): Promise<CreateResult> {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing) return { errorCode: "AUTOMATION_NOT_FOUND" };

  const toGroupInput = (g: (typeof existing.conditionGroups)[number]): ConditionGroupInput => ({
    operator: g.operator,
    conditions: g.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })),
    groups: (g.childGroups ?? []).map((cg) => toGroupInput(cg as unknown as (typeof existing.conditionGroups)[number])),
  });

  const rootGroup = existing.conditionGroups.find((g) => g.parentGroupId === null);

  const created = await prisma.workflowAutomation.create({
    data: {
      projectId,
      createdById: userId,
      name: `${existing.name} (copia)`,
      description: existing.description,
      status: "DRAFT",
      workflowId: existing.workflowId,
      errorPolicy: existing.errorPolicy,
      maxRetryAttempts: existing.maxRetryAttempts,
      retryBaseDelayMs: existing.retryBaseDelayMs,
      retryDelayMultiplier: existing.retryDelayMultiplier,
      retryMaxDelayMs: existing.retryMaxDelayMs,
      executionTimeoutMs: existing.executionTimeoutMs,
      approvalTimeoutMs: existing.approvalTimeoutMs,
      waitTimeoutMs: existing.waitTimeoutMs,
      requireApprovalBeforeStart: existing.requireApprovalBeforeStart,
      notifyOnCompletion: existing.notifyOnCompletion,
      notifyOnFailure: existing.notifyOnFailure,
      timezone: existing.timezone,
      trigger: existing.trigger
        ? {
            create: {
              type: existing.trigger.type,
              config: existing.trigger.config as Prisma.InputJsonValue,
              // Webhook secret/publicId are deliberately NOT copied — a duplicate never inherits another automation's live endpoint (spec section 37).
              webhookPublicId: existing.trigger.type === "WEBHOOK" ? generateWebhookPublicId() : null,
              webhookSecretEncrypted: existing.trigger.type === "WEBHOOK" ? encryptSecret(generateWebhookSecret()) : null,
            },
          }
        : undefined,
      conditionGroups: rootGroup ? { create: buildConditionGroupCreate(toGroupInput(rootGroup)) } : undefined,
      inputMappings: existing.inputMappings.length > 0 ? { create: existing.inputMappings.map((m, i) => ({ targetVariable: m.targetVariable, sourceKind: m.sourceKind, sourceExpression: m.sourceExpression, transform: m.transform, defaultValue: m.defaultValue, order: i })) } : undefined,
    },
  });

  return { id: created.id };
}

export async function rotateWebhookSecret(projectId: string, automationId: string) {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing || !existing.trigger || existing.trigger.type !== "WEBHOOK") return null;
  const newSecret = generateWebhookSecret();
  await prisma.workflowAutomationTrigger.update({ where: { automationId }, data: { webhookSecretEncrypted: encryptSecret(newSecret) } });
  // Returned once, in plaintext, only from this call — never persisted or re-readable afterward (spec section 12).
  return newSecret;
}

export async function updateWorkflowPin(projectId: string, automationId: string, pinnedWorkflowRevisionId: string | null): Promise<MaybeError> {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing) return automationError("AUTOMATION_NOT_FOUND");
  if (pinnedWorkflowRevisionId) {
    const revision = await prisma.workflowRevision.findUnique({ where: { id: pinnedWorkflowRevisionId } });
    if (!revision || revision.workflowId !== existing.workflowId) return automationError("TRIGGER_INVALID", "Esa versión no pertenece al workflow de esta automatización.");
  }
  await prisma.workflowAutomation.update({ where: { id: automationId }, data: { pinnedWorkflowRevisionId } });
  return {};
}

export async function listAutomationsForWorkflow(projectId: string, workflowId: string) {
  return prisma.workflowAutomation.findMany({
    where: { projectId, workflowId },
    select: { id: true, name: true, status: true, trigger: { select: { type: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export interface RunListFilters {
  automationId?: string;
  status?: string;
  limit?: number;
}

export async function listAutomationRuns(projectId: string, filters: RunListFilters = {}) {
  return prisma.workflowAutomationRun.findMany({
    where: {
      projectId,
      ...(filters.automationId ? { automationId: filters.automationId } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
    },
    include: { automation: { select: { id: true, name: true } }, workflow: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 50,
  });
}

/** Full history/traceability detail (spec section 32) — includes every related resource link but never a secret or the full raw payload. */
export async function getAutomationRunDetail(projectId: string, runId: string) {
  const run = await prisma.workflowAutomationRun.findUnique({
    where: { id: runId },
    include: {
      automation: { select: { id: true, name: true } },
      workflow: { select: { id: true, name: true } },
      event: { select: { id: true, type: true, occurredAt: true, resourceType: true, resourceId: true } },
      attempts: { orderBy: { attemptNumber: "asc" } },
      approvals: { orderBy: { createdAt: "asc" }, include: { decidedBy: { select: { id: true, name: true, email: true } } } },
      waits: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!run || run.projectId !== projectId) return null;
  return run;
}

export async function cancelAutomationRunOwned(projectId: string, runId: string): Promise<MaybeError> {
  const run = await prisma.workflowAutomationRun.findUnique({ where: { id: runId } });
  if (!run || run.projectId !== projectId) return automationError("AUTOMATION_NOT_FOUND", "No se encontró la ejecución indicada.");
  const { cancelAutomationRun } = await import("@/server/services/automation-workflow-bridge");
  await cancelAutomationRun(runId);
  return {};
}

/** Bounded future window for the upcoming-executions view and calendar integration (spec section 33/34) — never an infinite copy of the recurrence. */
export async function listUpcomingOccurrences(projectId: string, windowDays = 30) {
  const { computeNextOccurrence } = await import("@/lib/automations/recurrence");
  const windowEnd = new Date(Date.now() + windowDays * 24 * 3600_000);

  const triggers = await prisma.workflowAutomationTrigger.findMany({
    where: { status: "ACTIVE", type: { in: ["SCHEDULE_ONCE", "SCHEDULE_RECURRING"] }, automation: { projectId, status: "ACTIVE" }, nextFiredAt: { not: null, lte: windowEnd } },
    include: { automation: { select: { id: true, name: true } } },
  });

  const occurrences: { automationId: string; automationName: string; occurrenceAt: Date; recurring: boolean }[] = [];
  for (const trigger of triggers) {
    if (!trigger.nextFiredAt) continue;
    occurrences.push({ automationId: trigger.automationId, automationName: trigger.automation.name, occurrenceAt: trigger.nextFiredAt, recurring: trigger.type === "SCHEDULE_RECURRING" });
    if (trigger.type === "SCHEDULE_RECURRING") {
      let cursor = trigger.nextFiredAt;
      let count = trigger.firedCount;
      for (let i = 0; i < WORKFLOW_AUTOMATION_LIMITS.MAX_UPCOMING_OCCURRENCES_PER_TRIGGER; i++) {
        const next = computeNextOccurrence(trigger.config as unknown as Parameters<typeof computeNextOccurrence>[0], cursor, count + 1);
        if (!next || next > windowEnd) break;
        occurrences.push({ automationId: trigger.automationId, automationName: trigger.automation.name, occurrenceAt: next, recurring: true });
        cursor = next;
        count++;
      }
    }
  }
  return occurrences.sort((a, b) => a.occurrenceAt.getTime() - b.occurrenceAt.getTime());
}

/** Persists a SKIP exception for one occurrence — never mutates the recurrence itself (spec section 26). */
export async function skipNextOccurrence(projectId: string, automationId: string, userId: string): Promise<MaybeError> {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing) return automationError("AUTOMATION_NOT_FOUND");
  if (!existing.trigger || existing.trigger.type !== "SCHEDULE_RECURRING" || !existing.trigger.nextFiredAt) {
    return automationError("SCHEDULE_INVALID", "Esta automatización no tiene una próxima ejecución programada que omitir.");
  }
  await prisma.workflowAutomationScheduleException.upsert({
    where: { automationId_occurrenceAt: { automationId, occurrenceAt: existing.trigger.nextFiredAt } },
    create: { automationId, occurrenceAt: existing.trigger.nextFiredAt, action: "SKIP", createdById: userId },
    update: { action: "SKIP", rescheduledTo: null },
  });
  return {};
}

/** Moves the next occurrence to a new date, persisted as an exception; the underlying recurrence resumes from its original cadence afterward (spec section 26/34). */
export async function rescheduleNextOccurrence(projectId: string, automationId: string, userId: string, newDate: Date): Promise<MaybeError> {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing) return automationError("AUTOMATION_NOT_FOUND");
  if (!existing.trigger || existing.trigger.type !== "SCHEDULE_RECURRING" || !existing.trigger.nextFiredAt) {
    return automationError("SCHEDULE_INVALID", "Esta automatización no tiene una próxima ejecución programada que reprogramar.");
  }
  if (newDate.getTime() <= Date.now()) return automationError("SCHEDULE_IN_PAST");

  const originalOccurrenceAt = existing.trigger.nextFiredAt;
  await prisma.$transaction([
    prisma.workflowAutomationScheduleException.upsert({
      where: { automationId_occurrenceAt: { automationId, occurrenceAt: originalOccurrenceAt } },
      create: { automationId, occurrenceAt: originalOccurrenceAt, action: "RESCHEDULE", rescheduledTo: newDate, createdById: userId },
      update: { action: "RESCHEDULE", rescheduledTo: newDate },
    }),
    prisma.workflowAutomationTrigger.update({ where: { automationId }, data: { nextFiredAt: newDate } }),
    prisma.workflowAutomation.update({ where: { id: automationId }, data: { nextRunAt: newDate } }),
  ]);
  return {};
}

export interface RunNowResult {
  runId?: string;
  blocked?: boolean;
  reason?: string;
  error?: string;
  code?: WorkflowAutomationErrorCode;
}

/** "Run now" (spec section 33) — creates a real run immediately through the same funnel, without touching the recurrence's own next-scheduled date. */
export async function runAutomationNow(projectId: string, automationId: string, userId: string): Promise<RunNowResult> {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing) return automationError("AUTOMATION_NOT_FOUND");
  const { activateAutomation } = await import("@/server/services/automation-orchestrator");
  const activation = await activateAutomation({
    automation: existing,
    triggerType: existing.trigger?.type ?? "MANUAL",
    triggerSnapshot: { manual: true, runNow: true, triggeredBy: userId },
    idempotencyKey: `run-now:${automationId}:${Date.now()}`,
    createdById: userId,
  });
  return { runId: activation.runId, blocked: activation.blocked, reason: activation.reason };
}

export interface AutomationExport {
  formatVersion: 1;
  name: string;
  description: string | null;
  trigger: { type: WorkflowAutomationTriggerType; config: Record<string, unknown> };
  conditions: ConditionGroupInput | null;
  inputMappings: InputMappingInput[];
  errorPolicy: string;
  maxRetryAttempts: number;
  retryBaseDelayMs: number;
  retryDelayMultiplier: number;
  retryMaxDelayMs: number;
  executionTimeoutMs: number | null;
  approvalTimeoutMs: number | null;
  waitTimeoutMs: number | null;
  requireApprovalBeforeStart: boolean;
  notifyOnCompletion: boolean;
  notifyOnFailure: boolean;
  timezone: string;
}

/**
 * Safe JSON export (spec section 38) — deliberately excludes internal IDs,
 * secrets/tokens, runs, personal data, event payloads, projectId, and any
 * private URL (a webhook's public URL is never included; a re-import always
 * generates a fresh one). Never includes live state (status/counters).
 */
export async function exportAutomation(projectId: string, automationId: string): Promise<AutomationExport | null> {
  const existing = await getOwnedAutomation(projectId, automationId);
  if (!existing) return null;

  const rootGroup = existing.conditionGroups.find((g) => g.parentGroupId === null);
  const toGroupInput = (g: (typeof existing.conditionGroups)[number]): ConditionGroupInput => ({
    operator: g.operator,
    conditions: g.conditions.map((c) => ({ field: c.field, operator: c.operator, value: c.value })),
    groups: (g.childGroups ?? []).map((cg) => toGroupInput(cg as unknown as (typeof existing.conditionGroups)[number])),
  });

  return {
    formatVersion: 1,
    name: existing.name,
    description: existing.description,
    trigger: existing.trigger ? { type: existing.trigger.type, config: (existing.trigger.config as Record<string, unknown>) ?? {} } : { type: "MANUAL", config: {} },
    conditions: rootGroup ? toGroupInput(rootGroup) : null,
    inputMappings: existing.inputMappings.map((m) => ({ targetVariable: m.targetVariable, sourceKind: m.sourceKind as InputMappingInput["sourceKind"], sourceExpression: m.sourceExpression, transform: m.transform as InputMappingInput["transform"], defaultValue: m.defaultValue })),
    errorPolicy: existing.errorPolicy,
    maxRetryAttempts: existing.maxRetryAttempts,
    retryBaseDelayMs: existing.retryBaseDelayMs,
    retryDelayMultiplier: existing.retryDelayMultiplier,
    retryMaxDelayMs: existing.retryMaxDelayMs,
    executionTimeoutMs: existing.executionTimeoutMs,
    approvalTimeoutMs: existing.approvalTimeoutMs,
    waitTimeoutMs: existing.waitTimeoutMs,
    requireApprovalBeforeStart: existing.requireApprovalBeforeStart,
    notifyOnCompletion: existing.notifyOnCompletion,
    notifyOnFailure: existing.notifyOnFailure,
    timezone: existing.timezone,
  };
}

/** Imports a previously exported automation into a chosen workflow — always lands DRAFT, never auto-executes (spec section 38). */
export async function importAutomation(projectId: string, userId: string, workflowId: string, input: CreateAutomationInput): Promise<CreateResult> {
  return createAutomation(projectId, userId, { ...input, workflowId });
}

export type { WorkflowAutomationTriggerType };

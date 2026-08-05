import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { findEventDefinition, sanitizeEventPayload } from "@/lib/automations/events";
import { evaluateConditionGroup, type ConditionGroupNode } from "@/lib/automations/conditions";
import { EVENT_BACKED_TRIGGER_TYPES, type WorkflowAutomationTriggerType } from "@/lib/automations/types";
import { WORKFLOW_AUTOMATION_LIMITS } from "@/lib/automations/limits";
import { activateAutomation } from "@/server/services/automation-orchestrator";

export interface PublishEventInput {
  projectId: string;
  eventKey: string;
  resourceId?: string | null;
  actorId?: string | null;
  payload: Record<string, unknown>;
  /** Stable per real-world occurrence — a retry of the ORIGINAL operation must resolve to the same event row, never create a duplicate (spec section 9). */
  idempotencyKey: string;
  /** Set when this event was itself produced by an AutomationRun's workflow — the loop-detection ancestry chain (spec section 31). */
  causationAutomationRunId?: string | null;
  correlationId?: string | null;
  chainDepth?: number;
}

/**
 * Publishes a real, persistent internal event (spec section 9) — the
 * outbox row IS the durable record; nothing here calls a workflow
 * synchronously. Always called from server code, after the triggering
 * operation's own write already committed — never from a client component,
 * never before the main transaction is done.
 */
export async function publishAutomationEvent(input: PublishEventInput): Promise<{ id: string } | null> {
  const def = findEventDefinition(input.eventKey);
  if (!def) return null;

  const sanitizedPayload = sanitizeEventPayload(input.eventKey, input.payload);

  const existing = await prisma.workflowAutomationEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { id: existing.id };

  try {
    const created = await prisma.workflowAutomationEvent.create({
      data: {
        projectId: input.projectId,
        type: input.eventKey,
        schemaVersion: def.schemaVersion,
        resourceType: def.resourceType,
        resourceId: input.resourceId ?? null,
        actorId: input.actorId ?? null,
        payload: sanitizedPayload as unknown as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        causationId: input.causationAutomationRunId ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
    return { id: created.id };
  } catch {
    // Unique constraint race — another concurrent call already inserted the same idempotencyKey.
    const raced = await prisma.workflowAutomationEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    return raced ? { id: raced.id } : null;
  }
}

/** Which specialized trigger types a given event key satisfies, beyond the generic INTERNAL_EVENT match. */
function specializedTriggerTypesFor(eventKey: string): WorkflowAutomationTriggerType[] {
  if (eventKey === "workflow_run.completed" || eventKey === "workflow_run.failed") return ["WORKFLOW_COMPLETED"];
  if (eventKey === "agent_run.completed" || eventKey === "agent_run.failed") return ["AGENT_RUN_COMPLETED"];
  if (eventKey === "marketing_brain_run.completed" || eventKey === "marketing_brain_run.partially_completed" || eventKey === "marketing_brain_run.failed") return ["MARKETING_BRAIN_COMPLETED"];
  if (eventKey === "knowledge_source.ready" || eventKey === "knowledge_source.failed") return ["KNOWLEDGE_SOURCE_READY"];
  if (eventKey === "content_item.status_changed") return ["CONTENT_STATUS_CHANGED"];
  if (eventKey === "social_post.status_changed") return ["SOCIAL_POST_STATUS_CHANGED"];
  return [];
}

function matchesOutcomeFilter(eventKey: string, config: Record<string, unknown>): boolean {
  const filter = (config.outcomeFilter as string | undefined) ?? "ANY";
  if (filter === "ANY") return true;
  if (eventKey.endsWith(".completed") || eventKey.endsWith(".ready")) return filter === "COMPLETED" || filter === "READY";
  if (eventKey.endsWith(".failed")) return filter === "FAILED";
  if (eventKey.endsWith(".partially_completed")) return filter === "PARTIALLY_COMPLETED";
  return true;
}

interface DbConditionGroup {
  operator: "AND" | "OR";
  conditions: { field: string; operator: string; value: unknown }[];
  childGroups?: DbConditionGroup[];
}

export function toConditionTree(group: DbConditionGroup | null | undefined): ConditionGroupNode {
  if (!group) return { operator: "AND", conditions: [], groups: [] };
  return {
    operator: group.operator,
    conditions: group.conditions.map((c) => ({ field: c.field, operator: c.operator as never, value: c.value })),
    groups: (group.childGroups ?? []).map(toConditionTree),
  };
}

export interface ProcessOutboxResult {
  claimed: number;
  matched: number;
  runsCreated: number;
  skipped: number;
  failed: number;
}

/**
 * Claims a small batch of PENDING events, matches them against every ACTIVE
 * automation whose trigger could plausibly fire for that event key,
 * evaluates conditions, and activates the automation (spec section 10).
 * Never holds an HTTP request open for the full batch — the caller (cron
 * endpoint / dev driver) invokes this once per invocation with a bounded
 * batch size.
 */
export async function processEventOutbox(limit = WORKFLOW_AUTOMATION_LIMITS.MAX_EVENTS_PER_BATCH): Promise<ProcessOutboxResult> {
  const result: ProcessOutboxResult = { claimed: 0, matched: 0, runsCreated: 0, skipped: 0, failed: 0 };
  const now = new Date();

  const candidates = await prisma.workflowAutomationEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { occurredAt: "asc" },
    take: limit,
  });

  for (const event of candidates) {
    const lockToken = randomUUID();
    const claim = await prisma.workflowAutomationEvent.updateMany({
      where: { id: event.id, status: "PENDING" },
      data: { status: "PROCESSING", lockedAt: now, lockedBy: lockToken, lockExpiresAt: new Date(now.getTime() + WORKFLOW_AUTOMATION_LIMITS.LOCK_DURATION_MS) },
    });
    if (claim.count === 0) continue;
    result.claimed++;

    try {
      const specialized = specializedTriggerTypesFor(event.type);
      const relevantTypes: WorkflowAutomationTriggerType[] = ["INTERNAL_EVENT", ...specialized];
      const automations = await prisma.workflowAutomation.findMany({
        where: { projectId: event.projectId, status: "ACTIVE", trigger: { type: { in: relevantTypes.filter((t) => EVENT_BACKED_TRIGGER_TYPES.includes(t)) } } },
        include: { trigger: true, conditionGroups: { where: { parentGroupId: null }, include: { conditions: true, childGroups: { include: { conditions: true } } } } },
      });

      let anyFailed = false;
      let anyProcessed = false;

      for (const automation of automations) {
        if (!automation.trigger) continue;
        const config = (automation.trigger.config as Record<string, unknown>) ?? {};

        if (automation.trigger.type === "INTERNAL_EVENT" && config.eventKey !== event.type) continue;
        if (automation.trigger.type !== "INTERNAL_EVENT" && !matchesOutcomeFilter(event.type, config)) continue;

        const alreadyDelivered = await prisma.workflowAutomationEventDelivery.findUnique({ where: { eventId_automationId: { eventId: event.id, automationId: automation.id } } });
        if (alreadyDelivered) continue;

        result.matched++;
        const rootGroup = automation.conditionGroups[0] ?? null;
        const tree = toConditionTree(rootGroup as unknown as DbConditionGroup | null);
        const conditionsMatch = evaluateConditionGroup(tree, (event.payload as Record<string, unknown>) ?? {});

        if (!conditionsMatch) {
          await prisma.workflowAutomationEventDelivery.create({ data: { eventId: event.id, automationId: automation.id, status: "SKIPPED_CONDITION" } });
          result.skipped++;
          continue;
        }

        try {
          const activation = await activateAutomation({
            automation,
            triggerType: automation.trigger.type,
            triggerSnapshot: { eventType: event.type, eventId: event.id, payload: event.payload },
            eventContext: { event: event.payload as Record<string, unknown> },
            eventId: event.id,
            idempotencyKey: `${automation.id}:${event.id}`,
            causationAutomationRunId: event.causationId,
            correlationId: event.correlationId ?? event.id,
          });
          anyProcessed = true;

          await prisma.workflowAutomationEventDelivery.create({
            data: {
              eventId: event.id,
              automationId: automation.id,
              status: activation.blocked ? "SKIPPED_LOOP" : "CREATED_RUN",
              automationRunId: activation.runId ?? null,
              errorMessage: activation.blocked ? activation.reason : null,
            },
          });
          if (!activation.blocked && activation.runId) result.runsCreated++;
          else result.skipped++;
        } catch (err) {
          anyFailed = true;
          await prisma.workflowAutomationEventDelivery.create({ data: { eventId: event.id, automationId: automation.id, status: "FAILED", errorMessage: err instanceof Error ? err.message.slice(0, 500) : "Error interno." } });
          result.failed++;
        }
      }

      await prisma.workflowAutomationEvent.update({
        where: { id: event.id },
        data: {
          status: anyFailed && anyProcessed ? "PARTIALLY_PROCESSED" : anyFailed ? "FAILED" : "PROCESSED",
          processedAt: new Date(),
          attempts: { increment: 1 },
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
        },
      });
    } catch (err) {
      await prisma.workflowAutomationEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", errorMessage: err instanceof Error ? err.message.slice(0, 500) : "Error interno.", attempts: { increment: 1 }, lockedAt: null, lockedBy: null, lockExpiresAt: null },
      });
      result.failed++;
    }
  }

  return result;
}

/** Releases events stuck in PROCESSING past their lock expiry (a crashed/killed batch) back to PENDING — spec section 10: "liberar eventos bloqueados". */
export async function reconcileStaleEventLocks(): Promise<number> {
  const result = await prisma.workflowAutomationEvent.updateMany({
    where: { status: "PROCESSING", lockExpiresAt: { lt: new Date() } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null, lockExpiresAt: null },
  });
  return result.count;
}

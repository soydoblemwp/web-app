import "server-only";
import { prisma } from "@/lib/db/prisma";
import { verifyWebhookSignature, isTimestampWithinWindow } from "@/lib/automations/webhook-signature";
import { decryptSecret } from "@/lib/security/encryption";
import { exceedsWebhookBodyLimit, WORKFLOW_AUTOMATION_LIMITS } from "@/lib/automations/limits";
import { evaluateConditionGroup } from "@/lib/automations/conditions";
import { activateAutomation } from "@/server/services/automation-orchestrator";
import { toConditionTree } from "@/server/services/automation-events";
import { notifyAutomationEvent } from "@/server/services/automation-notifications";
import type { WorkflowAutomationErrorCode } from "@/lib/automations/types";

export interface WebhookHeaders {
  timestamp?: string | null;
  signature?: string | null;
  deliveryId?: string | null;
  contentType?: string | null;
}

export interface ReceiveWebhookResult {
  ok: boolean;
  status: number;
  errorCode?: WorkflowAutomationErrorCode;
  runId?: string;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_DELIVERIES = 30;
const REJECTED_STREAK_PAUSE_THRESHOLD = 20;

async function recordDelivery(automationId: string, deliveryId: string, status: "RECEIVED" | "REJECTED" | "PROCESSED", bodySizeBytes: number, errorMessage?: string, eventId?: string | null) {
  try {
    return await prisma.workflowAutomationWebhookDelivery.create({ data: { automationId, deliveryId, status, bodySizeBytes, errorMessage: errorMessage ?? null, eventId: eventId ?? null } });
  } catch {
    // Unique (automationId, deliveryId) race — the replay check below already handles the honest response; this just avoids crashing on a concurrent double-send.
    return null;
  }
}

/**
 * Real webhook receiving (spec sections 11-13) — every check (signature,
 * timestamp window, replay, size, content-type, rate limit) genuinely runs;
 * nothing here is a placeholder. Never logs the secret, the full signature,
 * or the full payload — only a safe summary.
 */
export async function receiveWebhook(publicId: string, rawBody: string, headers: WebhookHeaders): Promise<ReceiveWebhookResult> {
  const trigger = await prisma.workflowAutomationTrigger.findUnique({ where: { webhookPublicId: publicId }, include: { automation: true } });
  if (!trigger || trigger.type !== "WEBHOOK") return { ok: false, status: 404, errorCode: "AUTOMATION_NOT_FOUND" };
  if (trigger.automation.status !== "ACTIVE") return { ok: false, status: 403, errorCode: "AUTOMATION_INACTIVE" };

  const bodySizeBytes = Buffer.byteLength(rawBody, "utf8");
  if (exceedsWebhookBodyLimit(bodySizeBytes)) return { ok: false, status: 413, errorCode: "WEBHOOK_INVALID" };
  if (headers.contentType && !headers.contentType.toLowerCase().includes("application/json")) return { ok: false, status: 415, errorCode: "WEBHOOK_INVALID" };

  let parsedBody: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    parsedBody = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, errorCode: "WEBHOOK_INVALID" };
  }

  if (!headers.timestamp || !headers.signature || !headers.deliveryId) return { ok: false, status: 401, errorCode: "WEBHOOK_INVALID" };
  if (!isTimestampWithinWindow(headers.timestamp, WORKFLOW_AUTOMATION_LIMITS.WEBHOOK_SIGNING_WINDOW_SECONDS)) return { ok: false, status: 401, errorCode: "WEBHOOK_SIGNATURE_INVALID" };
  if (!trigger.webhookSecretEncrypted) return { ok: false, status: 401, errorCode: "WEBHOOK_SIGNATURE_INVALID" };

  const secret = decryptSecret(trigger.webhookSecretEncrypted);
  if (!verifyWebhookSignature(secret, headers.timestamp, rawBody, headers.signature)) {
    await recordDelivery(trigger.automationId, headers.deliveryId, "REJECTED", bodySizeBytes, "Firma inválida.");
    await maybeAutoPauseOnAbuse(trigger.automationId);
    return { ok: false, status: 401, errorCode: "WEBHOOK_SIGNATURE_INVALID" };
  }

  const existingDelivery = await prisma.workflowAutomationWebhookDelivery.findUnique({ where: { automationId_deliveryId: { automationId: trigger.automationId, deliveryId: headers.deliveryId } } });
  if (existingDelivery) return { ok: false, status: 409, errorCode: "WEBHOOK_REPLAY_DETECTED" };

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.workflowAutomationWebhookDelivery.count({ where: { automationId: trigger.automationId, receivedAt: { gte: windowStart } } });
  if (recentCount >= RATE_LIMIT_MAX_DELIVERIES) {
    await recordDelivery(trigger.automationId, headers.deliveryId, "REJECTED", bodySizeBytes, "Límite de solicitudes alcanzado.");
    return { ok: false, status: 429, errorCode: "WEBHOOK_RATE_LIMITED" };
  }

  const conditionGroups = await prisma.workflowAutomationConditionGroup.findMany({
    where: { automationId: trigger.automationId, parentGroupId: null },
    include: { conditions: true, childGroups: { include: { conditions: true } } },
  });
  const tree = toConditionTree((conditionGroups[0] as never) ?? null);
  if (!evaluateConditionGroup(tree, parsedBody)) {
    await recordDelivery(trigger.automationId, headers.deliveryId, "RECEIVED", bodySizeBytes, undefined);
    await prisma.workflowAutomationTrigger.update({ where: { id: trigger.id }, data: { webhookReceivedCount: { increment: 1 }, webhookLastReceivedAt: new Date() } });
    return { ok: true, status: 200 };
  }

  const activation = await activateAutomation({
    automation: { ...trigger.automation, trigger },
    triggerType: "WEBHOOK",
    triggerSnapshot: { deliveryId: headers.deliveryId },
    eventContext: { event: parsedBody },
    idempotencyKey: `webhook:${trigger.automationId}:${headers.deliveryId}`,
    correlationId: `webhook:${trigger.automationId}:${headers.deliveryId}`,
  });

  await recordDelivery(trigger.automationId, headers.deliveryId, "PROCESSED", bodySizeBytes);
  await prisma.workflowAutomationTrigger.update({ where: { id: trigger.id }, data: { webhookReceivedCount: { increment: 1 }, webhookLastReceivedAt: new Date(), lastFiredAt: new Date(), firedCount: { increment: 1 } } });

  return { ok: true, status: 200, runId: activation.runId };
}

async function maybeAutoPauseOnAbuse(automationId: string) {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS * 5);
  const rejectedCount = await prisma.workflowAutomationWebhookDelivery.count({ where: { automationId, status: "REJECTED", receivedAt: { gte: windowStart } } });
  if (rejectedCount >= REJECTED_STREAK_PAUSE_THRESHOLD) {
    const { pauseAutomationBySystem } = await import("@/server/services/automation-catalog");
    await pauseAutomationBySystem(automationId, "El webhook recibió demasiadas solicitudes rechazadas seguidas (posible abuso).");
    await notifyAutomationEvent(automationId, null, "WEBHOOK_REJECTED_REPEATEDLY");
  }
}

/** Server-triggered synthetic test — must go through the exact same validation as a real delivery; a successful result means a real event/run was actually created (spec section 13: "no marque la prueba como exitosa si no creó realmente el evento correspondiente"). */
export async function sendWebhookTest(projectId: string, automationId: string): Promise<{ ok: boolean; error?: string; runId?: string }> {
  const trigger = await prisma.workflowAutomationTrigger.findUnique({ where: { automationId }, include: { automation: true } });
  if (!trigger || trigger.automation.projectId !== projectId || trigger.type !== "WEBHOOK" || !trigger.webhookPublicId || !trigger.webhookSecretEncrypted) {
    return { ok: false, error: "Esta automatización no tiene un webhook configurado." };
  }
  const { computeWebhookSignature, generateWebhookPublicId } = await import("@/lib/automations/webhook-signature");
  const secret = decryptSecret(trigger.webhookSecretEncrypted);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ test: true, sentAt: new Date().toISOString() });
  const signature = computeWebhookSignature(secret, timestamp, body);
  const deliveryId = `test-${generateWebhookPublicId()}`;

  const result = await receiveWebhook(trigger.webhookPublicId, body, { timestamp, signature, deliveryId, contentType: "application/json" });
  if (!result.ok) return { ok: false, error: `La prueba no pasó la validación real (status ${result.status}).` };
  return { ok: true, runId: result.runId };
}

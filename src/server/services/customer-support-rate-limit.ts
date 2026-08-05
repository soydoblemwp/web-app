import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { CustomerSupportRateLimitScope } from "@/generated/prisma/enums";
import { CUSTOMER_SUPPORT_LIMITS } from "@/lib/customer-support/limits";

/**
 * Public-endpoint rate limiting (Fase 40 spec section 26) - no reusable
 * generic rate limiter exists in this codebase (confirmed: the only
 * precedent is the bespoke DB-row-count-over-a-window pattern inside
 * src/server/services/automation-webhooks.ts's receiveWebhook). This
 * mirrors that exact pattern: an append-only counter table
 * (CustomerSupportRateLimitEvent), counted over a rolling window, keyed by a
 * HASH of the visitor/session identifier - never the raw IP (spec: "no
 * guardes IP completa si no es necesaria").
 */

const SCOPE_LIMITS: Record<CustomerSupportRateLimitScope, { windowMs: number; max: number }> = {
  SESSION_CREATE: { windowMs: 60 * 60_000, max: CUSTOMER_SUPPORT_LIMITS.MAX_SESSIONS_PER_HOUR },
  MESSAGE: { windowMs: CUSTOMER_SUPPORT_LIMITS.RATE_LIMIT_WINDOW_MS, max: CUSTOMER_SUPPORT_LIMITS.MAX_MESSAGES_PER_MINUTE },
  FEEDBACK: { windowMs: CUSTOMER_SUPPORT_LIMITS.RATE_LIMIT_WINDOW_MS, max: CUSTOMER_SUPPORT_LIMITS.MAX_FEEDBACK_PER_MINUTE },
  HANDOFF: { windowMs: 60 * 60_000, max: CUSTOMER_SUPPORT_LIMITS.MAX_HANDOFFS_PER_HOUR },
};

export function hashRateLimitKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Checks AND records in one call - a small over-limit race under heavy
 * concurrency is an accepted, documented characteristic (the exact same
 * tradeoff the webhook precedent this mirrors already accepts), never a
 * plain read that skips recording (spec: "si el rate limiter falla, debe
 * bloquear o degradar solamente el chat").
 */
export async function checkAndRecordRateLimit(keyHash: string, scope: CustomerSupportRateLimitScope, projectId: string | null): Promise<RateLimitCheckResult> {
  const { windowMs, max } = SCOPE_LIMITS[scope];
  const windowStart = new Date(Date.now() - windowMs);

  const recentCount = await prisma.customerSupportRateLimitEvent.count({ where: { keyHash, scope, createdAt: { gte: windowStart } } });
  if (recentCount >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  await prisma.customerSupportRateLimitEvent.create({ data: { keyHash, scope, projectId } });
  return { allowed: true };
}

/** Best-effort cleanup of old rate-limit rows - safe to call opportunistically from the cron sweep, never touches a row still inside any scope's window. */
export async function purgeOldRateLimitEvents(): Promise<number> {
  const oldestWindowMs = Math.max(...Object.values(SCOPE_LIMITS).map((s) => s.windowMs));
  const cutoff = new Date(Date.now() - oldestWindowMs * 2);
  const result = await prisma.customerSupportRateLimitEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}

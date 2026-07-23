import "server-only";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 6;

export class GuestRateLimitConfigError extends Error {}

export interface GuestRateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

function hashIp(ip: string): string {
  const secret = process.env.GUEST_RATE_LIMIT_SECRET;
  if (!secret) {
    throw new GuestRateLimitConfigError(
      "GUEST_RATE_LIMIT_SECRET no está configurada. No se puede aplicar el límite de solicitudes de invitado."
    );
  }
  return createHmac("sha256", secret).update(ip).digest("hex");
}

/**
 * Persistent, atomic rate limit for guest AI usage, backed by Neon so it
 * holds correctly across separate Vercel function instances and cold
 * starts — unlike the in-memory limiter in rate-limit.ts (still used as-is
 * for authenticated usage in lib/ai/service.ts).
 *
 * Stores only an irreversible HMAC-SHA256 hash of the request IP, the fixed
 * time window it falls in, and a request count. Never the IP itself, and
 * never any prompt, response, or draft content.
 *
 * Atomicity: the increment happens via a single upsert whose `create`/`update`
 * branches are enforced by the (ipHash, periodStart) unique constraint —
 * Postgres executes this as one INSERT ... ON CONFLICT statement, so
 * concurrent requests from the same IP in the same window can't race past
 * the limit.
 */
export async function checkGuestAIRateLimit(ip: string): Promise<GuestRateLimitResult> {
  const ipHash = hashIp(ip);
  const periodStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);

  const record = await prisma.guestRateLimit.upsert({
    where: { ipHash_periodStart: { ipHash, periodStart } },
    create: { ipHash, periodStart, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
  });

  if (record.requestCount > MAX_REQUESTS_PER_WINDOW) {
    const retryAfterMs = periodStart.getTime() + WINDOW_MS - Date.now();
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  return { allowed: true, retryAfterMs: 0 };
}

import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Distinct from the legacy `CRON_SECRET` (src/lib/security/cron-auth.ts) —
 * the Automation Center's scheduling engine is a separate, additive system
 * with its own secret, so rotating one never silently disables the other.
 * When `AUTOMATION_CRON_SECRET` isn't configured, this ALWAYS returns false
 * — the cron endpoint stays honestly disabled, never simulating automatic
 * scheduling (spec section 27).
 */
export function isAuthorizedAutomationCronRequest(request: NextRequest): boolean {
  const secret = process.env.AUTOMATION_CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(headerBuf, expectedBuf);
}

export function isAutomationCronConfigured(): boolean {
  return Boolean(process.env.AUTOMATION_CRON_SECRET);
}

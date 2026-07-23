import "server-only";
import { headers } from "next/headers";

/** Best-effort client IP for rate-limiting only — never store this value. */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = headerList.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

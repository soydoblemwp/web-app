import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { prisma } from "@/lib/db/prisma";
import { executeMonitorCheck } from "@/server/services/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Configure in vercel.json to run periodically. See README for setup. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const now = new Date();
  const monitors = await prisma.monitor.findMany({ where: { isActive: true } });

  const due = monitors.filter((monitor) => {
    if (!monitor.lastCheckedAt) return true;
    const dueAt = new Date(monitor.lastCheckedAt.getTime() + monitor.checkFrequencyMinutes * 60_000);
    return dueAt <= now;
  });

  const results = await Promise.allSettled(due.map((monitor) => executeMonitorCheck(monitor.id)));

  return NextResponse.json({
    checked: due.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { prisma } from "@/lib/db/prisma";
import { executeAutomation } from "@/server/services/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Configure in vercel.json to run periodically. See README for setup. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const now = new Date();
  const dailyKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const weekOfYear = Math.ceil(
    ((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7
  );
  const weeklyKey = `${now.getFullYear()}-W${weekOfYear}`;

  const automations = await prisma.automation.findMany({
    where: { isActive: true, triggerType: { in: ["SCHEDULE_DAILY", "SCHEDULE_WEEKLY"] } },
  });

  const results = await Promise.allSettled(
    automations.map((automation) =>
      executeAutomation(
        automation.id,
        automation.triggerType === "SCHEDULE_DAILY" ? `daily-${dailyKey}` : `weekly-${weeklyKey}`
      )
    )
  );

  return NextResponse.json({
    processed: automations.length,
    succeeded: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });
}

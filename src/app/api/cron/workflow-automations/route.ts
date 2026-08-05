import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAutomationCronRequest, isAutomationCronConfigured } from "@/lib/security/automation-cron-auth";
import { runAutomationCronCycle } from "@/server/services/automation-cron";
import { runPerformanceCronCycle } from "@/server/services/performance-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Protected cron endpoint for the Automation Center's scheduling engine
 * (spec section 27), ALSO used by Performance Intelligence Center's own
 * batch processing (spec section 45: "puede reutilizar Automation Center
 * para procesamiento programado") — a single secret, a single endpoint,
 * never two parallel cron systems. Configure `AUTOMATION_CRON_SECRET` and,
 * optionally, a Vercel Cron entry hitting this route with `Authorization:
 * Bearer $AUTOMATION_CRON_SECRET`. When the secret isn't set, this honestly
 * stays disabled (401) — it never pretends automatic scheduling is running.
 * Manual execution and the local dev driver (scripts/process-automations.ts)
 * keep working regardless.
 */
export async function GET(request: NextRequest) {
  if (!isAutomationCronConfigured()) {
    return NextResponse.json({ error: "AUTOMATION_CRON_SECRET no está configurado en este entorno. La ejecución automática por cron permanece deshabilitada; usa la ejecución manual o el driver de desarrollo." }, { status: 503 });
  }
  if (!isAuthorizedAutomationCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const automations = await runAutomationCronCycle();
  const performance = await runPerformanceCronCycle();
  return NextResponse.json({ ok: true, automations, performance });
}

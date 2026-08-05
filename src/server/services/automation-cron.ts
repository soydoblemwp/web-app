import "server-only";
import { processEventOutbox, reconcileStaleEventLocks } from "@/server/services/automation-events";
import { processDueSchedules, processCampaignDateTriggers, processRetries, processWaits, processTimeouts, reconcileStaleRunLocks } from "@/server/services/automation-scheduler";

export interface AutomationCronSummary {
  staleEventLocksReleased: number;
  staleRunLocksReleased: number;
  events: { claimed: number; matched: number; runsCreated: number; skipped: number; failed: number };
  schedules: { claimed: number; runsCreated: number };
  campaignDates: { claimed: number; runsCreated: number };
  retries: { processed: number };
  waits: { processed: number };
  timeouts: { timedOutRuns: number; expiredApprovals: number; timedOutWaits: number };
}

/**
 * The ONE processing cycle shared verbatim by the protected cron endpoint
 * (src/app/api/cron/workflow-automations/route.ts) and the local dev driver
 * (scripts/process-automations.ts) — spec section 27/28: "no dependa
 * exclusivamente de Vercel Cron" and "el driver de desarrollo debe usar
 * exactamente el mismo servicio". Neither caller holds any scheduling logic
 * of its own; both just invoke this function.
 */
export async function runAutomationCronCycle(): Promise<AutomationCronSummary> {
  const staleEventLocksReleased = await reconcileStaleEventLocks();
  const staleRunLocksReleased = await reconcileStaleRunLocks();

  const events = await processEventOutbox();
  const schedules = await processDueSchedules();
  const campaignDates = await processCampaignDateTriggers();
  const retries = await processRetries();
  const waits = await processWaits();
  const timeouts = await processTimeouts();

  return { staleEventLocksReleased, staleRunLocksReleased, events, schedules, campaignDates, retries, waits, timeouts };
}

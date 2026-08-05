import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { runAutomationCronCycle } from "../src/server/services/automation-cron";
import { runPerformanceCronCycle } from "../src/server/services/performance-cron";

/**
 * Local development driver for the Automation Center's scheduling engine
 * (spec section 28) and Performance Center's batch processing (spec section
 * 45) — calls the EXACT SAME `runAutomationCronCycle`/`runPerformanceCronCycle`
 * the protected cron endpoint uses. There is no separate/simplified
 * scheduling logic here; this script exists only so a developer without
 * Vercel Cron configured can still exercise once/recurring schedules, the
 * event outbox, retries, waits, timeouts, imports, goals, anomalies, and
 * recommendations locally.
 *
 * Run with: npx tsx scripts/process-automations.ts
 */
async function main() {
  const automations = await runAutomationCronCycle();
  const performance = await runPerformanceCronCycle();
  console.log(JSON.stringify({ automations, performance }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

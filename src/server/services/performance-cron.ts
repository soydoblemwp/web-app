import "server-only";
import { prisma } from "@/lib/db/prisma";
import { processPendingImports, reconcileStaleImportLocks } from "@/server/services/performance-imports";
import { processExpiredGoals } from "@/server/services/performance-goals";
import { detectAnomaliesForProject } from "@/server/services/performance-anomalies";
import { generateRecommendations } from "@/server/services/performance-recommendations";
import { recordDailySnapshotForAllProjects } from "@/server/services/performance-daily-snapshot";
import { PERFORMANCE_LIMITS } from "@/lib/performance/limits";
import { processPendingGoogleSyncs, reconcileStaleGoogleSyncLocks } from "@/server/services/google-sync";

/**
 * Performance Center's own scheduled processing (spec section 45: "puede
 * reutilizar Automation Center para procesamiento programado cuando sea
 * apropiado") — reuses the EXACT SAME protected cron endpoint, secret, and
 * dev driver as Automation Center (src/app/api/cron/workflow-automations),
 * never a second cron system with its own secret. Called right alongside
 * runAutomationCronCycle; a failure in one project's step is caught so it
 * never blocks the rest of the batch.
 */

export interface PerformanceCronSummary {
  importsProcessed: number;
  staleImportLocksReleased: number;
  goalsTransitioned: number;
  anomaliesDetected: number;
  recommendationsGenerated: number;
  dailySnapshotsRecorded: number;
  projectsWithErrors: number;
  googleSyncsCreated: number;
  googleSyncsProcessed: number;
  staleGoogleSyncLocksReleased: number;
}

export async function runPerformanceCronCycle(): Promise<PerformanceCronSummary> {
  const staleImportLocksReleased = await reconcileStaleImportLocks();
  const { processed: importsProcessed } = await processPendingImports();
  const goalTransitions = await processExpiredGoals();

  // Google integrations hub (Fase 39) reuses this exact cron cycle — no
  // second cron secret, same per-project error isolation as the loop below.
  const staleGoogleSyncLocksReleased = await reconcileStaleGoogleSyncLocks();
  const { created: googleSyncsCreated, processed: googleSyncsProcessed } = await processPendingGoogleSyncs();

  const projects = await prisma.project.findMany({ select: { id: true }, take: PERFORMANCE_LIMITS.MAX_REPORTS_PER_BATCH });
  let anomaliesDetected = 0;
  let recommendationsGenerated = 0;
  let projectsWithErrors = 0;

  for (const project of projects) {
    try {
      const anomalies = await detectAnomaliesForProject(project.id);
      anomaliesDetected += anomalies.detected;
      const recommendations = await generateRecommendations(project.id);
      recommendationsGenerated += recommendations.generated;
    } catch {
      projectsWithErrors++;
    }
  }

  const { projectsProcessed: dailySnapshotsRecorded } = await recordDailySnapshotForAllProjects();

  return {
    importsProcessed,
    staleImportLocksReleased,
    goalsTransitioned: goalTransitions.length,
    anomaliesDetected,
    recommendationsGenerated,
    dailySnapshotsRecorded,
    projectsWithErrors,
    googleSyncsCreated,
    googleSyncsProcessed,
    staleGoogleSyncLocksReleased,
  };
}

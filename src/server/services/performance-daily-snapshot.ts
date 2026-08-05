import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getPeriodBounds } from "@/lib/performance/periods";
import { createMetricRecordCore } from "@/server/services/performance-metric-records";
import { getInternalMetricsSnapshot } from "@/server/services/performance-internal-metrics";

/**
 * Persists a bounded set of CALCULATED, project-level daily snapshots for
 * the internal metrics that actually benefit from trend/anomaly detection
 * over time (spec sections 6/38/39) — not every internal number needs a
 * historical row, only the ones later analysis reads as a time series.
 * Idempotent: reruns for "today" REPLACE the same day's row rather than
 * creating a duplicate (a day isn't finalized until it's over).
 */

const DAILY_SNAPSHOT_METRIC_KEYS = [
  "content_items_created",
  "social_posts_created",
  "social_posts_approved",
  "campaign_pieces_completed",
  "agent_runs_completed",
  "agent_runs_failed",
  "workflow_automation_runs_completed",
  "knowledge_queries_count",
] as const;

export async function recordDailySnapshot(projectId: string, referenceDate = new Date()): Promise<{ recorded: number }> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, timezone: true } });
  if (!project) return { recorded: 0 };
  const bounds = getPeriodBounds("DAY", referenceDate, project.timezone)!;
  const snapshot = await getInternalMetricsSnapshot(projectId, bounds);

  const values: Record<(typeof DAILY_SNAPSHOT_METRIC_KEYS)[number], number> = {
    content_items_created: snapshot.content.itemsCreated,
    social_posts_created: snapshot.social.created,
    social_posts_approved: snapshot.social.approved,
    campaign_pieces_completed: snapshot.campaign.piecesCompleted,
    agent_runs_completed: snapshot.automation.agentRunsCompleted,
    agent_runs_failed: snapshot.automation.agentRunsFailed,
    workflow_automation_runs_completed: snapshot.automation.workflowAutomationRunsCompleted,
    knowledge_queries_count: snapshot.knowledge.queriesCount,
  };

  let recorded = 0;
  for (const key of DAILY_SNAPSHOT_METRIC_KEYS) {
    const result = await createMetricRecordCore({
      projectId,
      createdById: project.ownerId,
      source: "CALCULATED",
      method: "internal_daily_snapshot",
      metricKey: key,
      resourceType: "PROJECT",
      value: values[key],
      unit: "COUNT",
      measuredAt: new Date(),
      periodStart: bounds.start,
      periodEnd: bounds.end,
      granularity: "DAY",
      duplicatePolicy: "REPLACE",
    });
    if ("id" in result) recorded += 1;
  }
  return { recorded };
}

/** Runs the daily snapshot for every project — safe to call repeatedly (cron, dev driver, or a manual admin action); each project's snapshot is independently idempotent. */
export async function recordDailySnapshotForAllProjects(): Promise<{ projectsProcessed: number }> {
  const projects = await prisma.project.findMany({ select: { id: true } });
  for (const project of projects) {
    await recordDailySnapshot(project.id);
  }
  return { projectsProcessed: projects.length };
}

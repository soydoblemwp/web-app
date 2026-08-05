"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { buildMarketingBrainPerformanceContext } from "@/server/services/performance-marketing-brain-context";

/**
 * A bounded, structured Performance Intelligence context Marketing Brain's
 * briefing flow MAY optionally fetch and pass through as extra context
 * (spec section 31) — never touches its orchestrator, never sends full
 * history, and clearly separates data/interpretation/recommendation.
 */
export async function getMarketingBrainPerformanceContextAction(projectId: string, campaignId?: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return buildMarketingBrainPerformanceContext(projectId, campaignId);
}

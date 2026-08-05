"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { listMarketingBrainRuns, getMarketingBrainRunDetail, type MarketingBrainRunFilters } from "@/server/services/marketing-brain";

export async function listMarketingBrainRunsAction(projectId: string, filters: MarketingBrainRunFilters = {}) {
  await requireProjectAccess(projectId, "VIEWER");
  return listMarketingBrainRuns(projectId, filters);
}

export async function getMarketingBrainRunDetailAction(projectId: string, runId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const run = await getMarketingBrainRunDetail(runId);
  if (!run || run.projectId !== projectId) return null;
  return run;
}

"use server";

import { requireProjectAccess } from "@/lib/permissions";
import {
  saveStepOutputAsContentItem,
  saveStepOutputAsCampaignPillars,
  saveStepOutputAsSocialPosts,
  saveStepOutputAsPrompt,
  type SaveAsContentItemOptions,
  type SaveAsSocialPostsOptions,
} from "@/server/services/agent-results";

export async function saveAgentResultAsContentItemAction(
  projectId: string,
  runId: string,
  stepOrder: number,
  options: SaveAsContentItemOptions
): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return saveStepOutputAsContentItem(projectId, user.id, runId, stepOrder, options);
}

export async function saveAgentResultAsCampaignPillarsAction(
  projectId: string,
  runId: string,
  stepOrder: number,
  campaignId: string
): Promise<{ error?: string; created?: number }> {
  await requireProjectAccess(projectId, "EDITOR");
  return saveStepOutputAsCampaignPillars(projectId, runId, stepOrder, campaignId);
}

export async function saveAgentResultAsSocialPostsAction(
  projectId: string,
  runId: string,
  stepOrder: number,
  options: SaveAsSocialPostsOptions
): Promise<{ error?: string; created?: number; failures?: string[] }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return saveStepOutputAsSocialPosts(projectId, user.id, runId, stepOrder, options);
}

export async function saveAgentResultAsPromptAction(projectId: string, runId: string, stepOrder: number, title: string): Promise<{ error?: string; id?: string }> {
  const user = await requireProjectAccess(projectId, "EDITOR");
  return saveStepOutputAsPrompt(projectId, user.id, runId, stepOrder, title);
}

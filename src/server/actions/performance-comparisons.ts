"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { compareContentItems, compareCampaigns, compareSocialPosts, compareContentVersions } from "@/server/services/performance-comparisons";

export async function compareContentItemsAction(projectId: string, itemIds: string[], metricKeys: string[], periodStartIso: string, periodEndIso: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return compareContentItems(projectId, itemIds, metricKeys, new Date(periodStartIso), new Date(periodEndIso));
}

export async function compareCampaignsAction(projectId: string, campaignIds: string[], metricKeys: string[], periodStartIso: string, periodEndIso: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return compareCampaigns(projectId, campaignIds, metricKeys, new Date(periodStartIso), new Date(periodEndIso));
}

export async function compareSocialPostsAction(projectId: string, postIds: string[], metricKeys: string[], periodStartIso: string, periodEndIso: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return compareSocialPosts(projectId, postIds, metricKeys, new Date(periodStartIso), new Date(periodEndIso));
}

export async function compareContentVersionsAction(projectId: string, versionIds: string[]) {
  await requireProjectAccess(projectId, "VIEWER");
  return compareContentVersions(projectId, versionIds);
}

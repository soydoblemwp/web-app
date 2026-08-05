"use server";

import { requireProjectAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db/prisma";
import { listMetricDefinitions, listMetricDefinitionsByCategory } from "@/lib/performance/metrics-catalog";
import { getInternalMetricsSnapshot, type PeriodRange } from "@/server/services/performance-internal-metrics";
import type { PerformanceMetricCategory } from "@/lib/performance/types";

export async function listMetricCatalogAction(category?: PerformanceMetricCategory) {
  return category ? listMetricDefinitionsByCategory(category) : listMetricDefinitions();
}

export async function listContentItemsForSelectAction(projectId: string) {
  const user = await requireProjectAccess(projectId, "VIEWER");
  return prisma.contentItem.findMany({ where: { projectId, deletedAt: null, authorId: user.id }, select: { id: true, title: true, type: true, status: true }, orderBy: { updatedAt: "desc" }, take: 200 });
}

export async function listCampaignsForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return prisma.campaign.findMany({ where: { projectId }, select: { id: true, name: true, status: true, objective: true }, orderBy: { updatedAt: "desc" }, take: 200 });
}

export async function listSocialPostsForSelectAction(projectId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  return prisma.socialPost.findMany({ where: { projectId }, select: { id: true, platform: true, internalTitle: true, text: true, status: true }, orderBy: { updatedAt: "desc" }, take: 200 });
}

export async function listContentVersionsForSelectAction(projectId: string, contentItemId: string) {
  await requireProjectAccess(projectId, "VIEWER");
  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId }, select: { projectId: true } });
  if (!item || item.projectId !== projectId) return [];
  return prisma.contentVersion.findMany({ where: { contentItemId }, select: { id: true, title: true, createdAt: true }, orderBy: { createdAt: "desc" } });
}

export async function getInternalMetricsSnapshotAction(projectId: string, period: { start: string; end: string }) {
  await requireProjectAccess(projectId, "VIEWER");
  const range: PeriodRange = { start: new Date(period.start), end: new Date(period.end) };
  return getInternalMetricsSnapshot(projectId, range);
}

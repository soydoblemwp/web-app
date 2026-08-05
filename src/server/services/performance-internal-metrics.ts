import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Real internal metrics (spec section 6) — computed LIVE from data every
 * other module already owns; never a second source of truth, never a
 * fabricated number. Nothing here is persisted as a PerformanceMetricRecord
 * by default (that table exists for MANUAL/CSV/JSON/EXTERNAL_PROVIDER data
 * and for the bounded daily CALCULATED snapshots recorded by
 * performance-daily-snapshot.ts) — these are cheap, fresh aggregate queries
 * computed on every dashboard load.
 */

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface ContentInternalMetrics {
  itemsCreated: number;
  versionsCreated: number;
  averageRevisionsPerItem: number | null;
  statusBreakdown: Record<string, number>;
  itemsWithBrandProfile: number;
  itemsWithoutBrandProfile: number;
  knowledgeCitationsCount: number;
  averageSeoScoreAvailable: number;
}

export interface CampaignInternalMetrics {
  created: number;
  active: number;
  completed: number;
  piecesPlanned: number;
  piecesCompleted: number;
  delayedPiecesCount: number;
  relatedPostsCount: number;
  marketingBrainRunsCount: number;
  marketingBrainFailedRunsCount: number;
}

export interface SocialInternalMetrics {
  created: number;
  approved: number;
  changesRequested: number;
  scheduled: number;
  failed: number;
  pending: number;
  published: number;
  postsWithoutDateCount: number;
  postsMissingMediaCount: number;
  retryAttemptsCount: number;
}

export interface AutomationInternalMetrics {
  agentRunsCompleted: number;
  agentRunsFailed: number;
  marketingBrainRunsCompleted: number;
  workflowRunsCompleted: number;
  workflowRunsFailed: number;
  workflowAutomationRunsCompleted: number;
  workflowAutomationRunsFailed: number;
  workflowAutomationRunsTerminalTotal: number;
  workflowAutomationRetries: number;
  loopsPrevented: number;
}

export interface KnowledgeInternalMetrics {
  sourcesReady: number;
  sourcesFailed: number;
  sourcesNeedsOcr: number;
  queriesCount: number;
  queriesWithoutEvidenceCount: number;
  citationsUsedCount: number;
}

export interface InternalMetricsSnapshot {
  period: PeriodRange;
  content: ContentInternalMetrics;
  campaign: CampaignInternalMetrics;
  social: SocialInternalMetrics;
  automation: AutomationInternalMetrics;
  knowledge: KnowledgeInternalMetrics;
}

async function computeContentMetrics(projectId: string, period: PeriodRange): Promise<ContentInternalMetrics> {
  const [itemsCreated, versionsCreated, statusGroups, withBrandProfile, withoutBrandProfile, citationsCount] = await Promise.all([
    prisma.contentItem.count({ where: { projectId, createdAt: { gte: period.start, lte: period.end }, deletedAt: null } }),
    prisma.contentVersion.count({ where: { contentItem: { projectId }, createdAt: { gte: period.start, lte: period.end } } }),
    prisma.contentItem.groupBy({ by: ["status"], where: { projectId, deletedAt: null }, _count: true }),
    prisma.contentItem.count({ where: { projectId, deletedAt: null, brandProfileId: { not: null } } }),
    prisma.contentItem.count({ where: { projectId, deletedAt: null, brandProfileId: null } }),
    prisma.contentKnowledgeCitation.count({ where: { contentItem: { projectId }, createdAt: { gte: period.start, lte: period.end } } }),
  ]);

  const totalItems = withBrandProfile + withoutBrandProfile;
  const statusBreakdown: Record<string, number> = {};
  for (const g of statusGroups) statusBreakdown[g.status] = g._count;

  return {
    itemsCreated,
    versionsCreated,
    averageRevisionsPerItem: itemsCreated > 0 ? Number((versionsCreated / itemsCreated).toFixed(2)) : null,
    statusBreakdown,
    itemsWithBrandProfile: withBrandProfile,
    itemsWithoutBrandProfile: withoutBrandProfile,
    knowledgeCitationsCount: citationsCount,
    averageSeoScoreAvailable: totalItems,
  };
}

async function computeCampaignMetrics(projectId: string, period: PeriodRange): Promise<CampaignInternalMetrics> {
  const [created, active, completed, piecesPlanned, piecesCompleted, delayedPieces, relatedPosts, mbRuns, mbFailedRuns] = await Promise.all([
    prisma.campaign.count({ where: { projectId, createdAt: { gte: period.start, lte: period.end } } }),
    prisma.campaign.count({ where: { projectId, status: "ACTIVE" } }),
    prisma.campaign.count({ where: { projectId, status: "COMPLETED", updatedAt: { gte: period.start, lte: period.end } } }),
    prisma.campaignContentPiece.count({ where: { campaign: { projectId } } }),
    prisma.campaignContentPiece.count({ where: { campaign: { projectId }, status: "PUBLISHED" } }),
    prisma.campaignContentPiece.count({ where: { campaign: { projectId }, status: { notIn: ["PUBLISHED", "CANCELLED"] }, scheduledDate: { lt: new Date() } } }),
    prisma.socialPost.count({ where: { projectId, campaignId: { not: null }, createdAt: { gte: period.start, lte: period.end } } }),
    prisma.marketingBrainRun.count({ where: { projectId, campaignId: { not: null }, createdAt: { gte: period.start, lte: period.end } } }),
    prisma.marketingBrainRun.count({ where: { projectId, campaignId: { not: null }, status: { in: ["FAILED", "PARTIALLY_COMPLETED"] }, createdAt: { gte: period.start, lte: period.end } } }),
  ]);

  return {
    created,
    active,
    completed,
    piecesPlanned,
    piecesCompleted,
    delayedPiecesCount: delayedPieces,
    relatedPostsCount: relatedPosts,
    marketingBrainRunsCount: mbRuns,
    marketingBrainFailedRunsCount: mbFailedRuns,
  };
}

async function computeSocialMetrics(projectId: string, period: PeriodRange): Promise<SocialInternalMetrics> {
  const [created, approved, changesRequested, scheduled, failed, pending, published, withoutDate, retryAttempts] = await Promise.all([
    prisma.socialPost.count({ where: { projectId, createdAt: { gte: period.start, lte: period.end } } }),
    prisma.socialPost.count({ where: { projectId, approvedAt: { gte: period.start, lte: period.end } } }),
    prisma.publicationApprovalEvent.count({ where: { socialPost: { projectId }, action: "CHANGES_REQUESTED", createdAt: { gte: period.start, lte: period.end } } }),
    prisma.socialPost.count({ where: { projectId, status: "SCHEDULED" } }),
    prisma.socialPost.count({ where: { projectId, status: "FAILED" } }),
    prisma.socialPost.count({ where: { projectId, status: { in: ["IDEA", "DRAFT", "IN_REVIEW"] } } }),
    prisma.socialPost.count({ where: { projectId, publishedAt: { gte: period.start, lte: period.end } } }),
    prisma.socialPost.count({ where: { projectId, status: { notIn: ["PUBLISHED", "CANCELLED"] }, scheduledAt: null } }),
    prisma.publicationAttempt.count({ where: { socialPost: { projectId }, attemptNumber: { gt: 1 }, createdAt: { gte: period.start, lte: period.end } } }),
  ]);

  const missingMedia = await prisma.socialPost.count({ where: { projectId, status: { notIn: ["CANCELLED"] }, media: { none: {} }, mediaAssets: { none: {} } } });

  return {
    created,
    approved,
    changesRequested,
    scheduled,
    failed,
    pending,
    published,
    postsWithoutDateCount: withoutDate,
    postsMissingMediaCount: missingMedia,
    retryAttemptsCount: retryAttempts,
  };
}

async function computeAutomationMetrics(projectId: string, period: PeriodRange): Promise<AutomationInternalMetrics> {
  const [agentCompleted, agentFailed, mbCompleted, wfCompleted, wfFailed, waCompleted, waFailed, waTerminalTotal, waRetries, waLoops] = await Promise.all([
    prisma.aiAgentRun.count({ where: { projectId, status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] }, completedAt: { gte: period.start, lte: period.end } } }),
    prisma.aiAgentRun.count({ where: { projectId, status: "FAILED", completedAt: { gte: period.start, lte: period.end } } }),
    prisma.marketingBrainRun.count({ where: { projectId, status: "COMPLETED", completedAt: { gte: period.start, lte: period.end } } }),
    prisma.workflowRun.count({ where: { projectId, status: "COMPLETED", completedAt: { gte: period.start, lte: period.end } } }),
    prisma.workflowRun.count({ where: { projectId, status: "FAILED", completedAt: { gte: period.start, lte: period.end } } }),
    prisma.workflowAutomationRun.count({ where: { projectId, status: "COMPLETED", completedAt: { gte: period.start, lte: period.end } } }),
    prisma.workflowAutomationRun.count({ where: { projectId, status: "FAILED", completedAt: { gte: period.start, lte: period.end } } }),
    prisma.workflowAutomationRun.count({ where: { projectId, status: { in: ["COMPLETED", "FAILED", "PARTIALLY_COMPLETED", "TIMED_OUT", "CANCELLED"] }, completedAt: { gte: period.start, lte: period.end } } }),
    prisma.workflowAutomationRunAttempt.count({ where: { run: { projectId }, attemptNumber: { gt: 1 }, startedAt: { gte: period.start, lte: period.end } } }),
    prisma.workflowAutomationRun.count({ where: { projectId, status: "SKIPPED", lastErrorCategory: "AUTOMATION_LOOP_DETECTED", createdAt: { gte: period.start, lte: period.end } } }),
  ]);

  return {
    agentRunsCompleted: agentCompleted,
    agentRunsFailed: agentFailed,
    marketingBrainRunsCompleted: mbCompleted,
    workflowRunsCompleted: wfCompleted,
    workflowRunsFailed: wfFailed,
    workflowAutomationRunsCompleted: waCompleted,
    workflowAutomationRunsFailed: waFailed,
    workflowAutomationRunsTerminalTotal: waTerminalTotal,
    workflowAutomationRetries: waRetries,
    loopsPrevented: waLoops,
  };
}

async function computeKnowledgeMetrics(projectId: string, period: PeriodRange): Promise<KnowledgeInternalMetrics> {
  const [sourcesReady, sourcesFailed, sourcesNeedsOcr, queriesCount, queriesWithoutEvidence, citationsUsed] = await Promise.all([
    prisma.knowledgeSource.count({ where: { projectId, status: { in: ["READY", "PARTIALLY_READY"] } } }),
    prisma.knowledgeSource.count({ where: { projectId, status: "FAILED" } }),
    prisma.knowledgeSource.count({ where: { projectId, status: "NEEDS_OCR" } }),
    prisma.knowledgeQuery.count({ where: { projectId, createdAt: { gte: period.start, lte: period.end } } }),
    prisma.knowledgeQuery.count({ where: { projectId, createdAt: { gte: period.start, lte: period.end }, status: "COMPLETED", citations: { none: {} } } }),
    prisma.knowledgeCitation.count({ where: { query: { projectId }, createdAt: { gte: period.start, lte: period.end } } }),
  ]);

  return {
    sourcesReady,
    sourcesFailed,
    sourcesNeedsOcr,
    queriesCount,
    queriesWithoutEvidenceCount: queriesWithoutEvidence,
    citationsUsedCount: citationsUsed,
  };
}

export async function getInternalMetricsSnapshot(projectId: string, period: PeriodRange): Promise<InternalMetricsSnapshot> {
  const [content, campaign, social, automation, knowledge] = await Promise.all([
    computeContentMetrics(projectId, period),
    computeCampaignMetrics(projectId, period),
    computeSocialMetrics(projectId, period),
    computeAutomationMetrics(projectId, period),
    computeKnowledgeMetrics(projectId, period),
  ]);
  return { period, content, campaign, social, automation, knowledge };
}

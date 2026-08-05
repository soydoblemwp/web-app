-- CreateEnum
CREATE TYPE "MarketingBrainRunStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'WAITING_FOR_APPROVAL', 'PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketingBrainStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED', 'WAITING_FOR_APPROVAL');

-- CreateEnum
CREATE TYPE "MarketingBrainStepKey" AS ENUM ('INTERPRET_BRIEFING', 'PREPARE_CAMPAIGN', 'GENERATE_STRATEGY', 'CREATE_PILLARS', 'CREATE_CONTENT_PLAN', 'CREATE_PIECES', 'GENERATE_DRAFTS', 'ADAPT_PLATFORMS', 'CREATE_PUBLICATIONS', 'PREPARE_APPROVAL', 'PREPARE_CALENDAR', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "MarketingBrainResourceType" AS ENUM ('CAMPAIGN', 'CAMPAIGN_STRATEGY', 'CAMPAIGN_PILLAR', 'CAMPAIGN_CONTENT_PIECE', 'CONTENT_ITEM', 'SOCIAL_POST');

-- CreateEnum
CREATE TYPE "MarketingBrainResourceAction" AS ENUM ('CREATED', 'REUSED');

-- CreateEnum
CREATE TYPE "MarketingBrainErrorCategory" AS ENUM ('VALIDATION', 'PERMISSION', 'DEPENDENCY', 'AI', 'DATABASE', 'CONFLICT', 'CANCELLATION', 'INTERNAL');

-- CreateEnum
CREATE TYPE "MarketingBrainApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "MarketingBrainRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "campaignId" TEXT,
    "status" "MarketingBrainRunStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStepKey" "MarketingBrainStepKey",
    "idempotencyKey" TEXT NOT NULL,
    "briefing" JSONB NOT NULL,
    "approvedBriefing" JSONB,
    "stagesConfig" JSONB NOT NULL,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "lastErrorCategory" "MarketingBrainErrorCategory",
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sourceRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingBrainRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBrainStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "key" "MarketingBrainStepKey" NOT NULL,
    "status" "MarketingBrainStepStatus" NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "errorCategory" "MarketingBrainErrorCategory",
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "executionToken" TEXT,
    "currentItemIndex" INTEGER,
    "totalItems" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingBrainStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBrainResource" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "type" "MarketingBrainResourceType" NOT NULL,
    "action" "MarketingBrainResourceAction" NOT NULL,
    "campaignId" TEXT,
    "campaignPillarId" TEXT,
    "campaignContentPieceId" TEXT,
    "contentItemId" TEXT,
    "socialPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingBrainResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBrainApproval" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepKey" "MarketingBrainStepKey" NOT NULL,
    "status" "MarketingBrainApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingBrainApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingBrainRun_projectId_status_idx" ON "MarketingBrainRun"("projectId", "status");

-- CreateIndex
CREATE INDEX "MarketingBrainRun_projectId_createdById_idx" ON "MarketingBrainRun"("projectId", "createdById");

-- CreateIndex
CREATE INDEX "MarketingBrainRun_projectId_createdAt_idx" ON "MarketingBrainRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingBrainRun_campaignId_idx" ON "MarketingBrainRun"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainRun_createdById_idempotencyKey_key" ON "MarketingBrainRun"("createdById", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MarketingBrainStep_runId_status_idx" ON "MarketingBrainStep"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainStep_runId_key_key" ON "MarketingBrainStep"("runId", "key");

-- CreateIndex
CREATE INDEX "MarketingBrainResource_runId_idx" ON "MarketingBrainResource"("runId");

-- CreateIndex
CREATE INDEX "MarketingBrainResource_stepId_idx" ON "MarketingBrainResource"("stepId");

-- CreateIndex
CREATE INDEX "MarketingBrainResource_campaignId_idx" ON "MarketingBrainResource"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingBrainResource_campaignPillarId_idx" ON "MarketingBrainResource"("campaignPillarId");

-- CreateIndex
CREATE INDEX "MarketingBrainResource_campaignContentPieceId_idx" ON "MarketingBrainResource"("campaignContentPieceId");

-- CreateIndex
CREATE INDEX "MarketingBrainResource_contentItemId_idx" ON "MarketingBrainResource"("contentItemId");

-- CreateIndex
CREATE INDEX "MarketingBrainResource_socialPostId_idx" ON "MarketingBrainResource"("socialPostId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainResource_runId_campaignId_key" ON "MarketingBrainResource"("runId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainResource_runId_campaignContentPieceId_key" ON "MarketingBrainResource"("runId", "campaignContentPieceId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainResource_runId_contentItemId_key" ON "MarketingBrainResource"("runId", "contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainResource_runId_socialPostId_key" ON "MarketingBrainResource"("runId", "socialPostId");

-- CreateIndex
CREATE INDEX "MarketingBrainApproval_runId_idx" ON "MarketingBrainApproval"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainApproval_runId_stepKey_key" ON "MarketingBrainApproval"("runId", "stepKey");

-- AddForeignKey
ALTER TABLE "MarketingBrainRun" ADD CONSTRAINT "MarketingBrainRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainRun" ADD CONSTRAINT "MarketingBrainRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainRun" ADD CONSTRAINT "MarketingBrainRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainRun" ADD CONSTRAINT "MarketingBrainRun_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "MarketingBrainRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainStep" ADD CONSTRAINT "MarketingBrainStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketingBrainRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainResource" ADD CONSTRAINT "MarketingBrainResource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketingBrainRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainResource" ADD CONSTRAINT "MarketingBrainResource_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "MarketingBrainStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainResource" ADD CONSTRAINT "MarketingBrainResource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainResource" ADD CONSTRAINT "MarketingBrainResource_campaignPillarId_fkey" FOREIGN KEY ("campaignPillarId") REFERENCES "CampaignPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainResource" ADD CONSTRAINT "MarketingBrainResource_campaignContentPieceId_fkey" FOREIGN KEY ("campaignContentPieceId") REFERENCES "CampaignContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainResource" ADD CONSTRAINT "MarketingBrainResource_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainResource" ADD CONSTRAINT "MarketingBrainResource_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainApproval" ADD CONSTRAINT "MarketingBrainApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketingBrainRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainApproval" ADD CONSTRAINT "MarketingBrainApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

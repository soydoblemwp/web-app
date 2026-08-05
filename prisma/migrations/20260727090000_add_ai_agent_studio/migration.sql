-- CreateEnum
CREATE TYPE "AiAgentCategory" AS ENUM ('WRITING', 'SEO', 'RESEARCH', 'SOCIAL_MEDIA', 'MARKETING', 'BRAND', 'CONTENT_REPURPOSING', 'CAMPAIGN', 'PUBLISHING', 'REVIEW', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AiAgentOutputType" AS ENUM ('TEXT', 'DOCUMENT', 'LIST', 'TABLE', 'ANALYSIS', 'STRATEGY', 'PLAN', 'CONTENT', 'PUBLICATION', 'REVIEW', 'VARIANT_SET');

-- CreateEnum
CREATE TYPE "AiAgentCreativity" AS ENUM ('CONSERVATIVE', 'BALANCED', 'CREATIVE');

-- CreateEnum
CREATE TYPE "AiAgentVisibility" AS ENUM ('PROJECT', 'CREATOR_ONLY');

-- CreateEnum
CREATE TYPE "AiAgentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AiAgentTeamErrorStrategy" AS ENUM ('STOP_ON_ERROR', 'CONTINUE_INDEPENDENT_BRANCHES');

-- CreateEnum
CREATE TYPE "AiAgentRunStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AiAgentRunStepStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiAgentErrorCategory" AS ENUM ('VALIDATION', 'PERMISSION', 'DEPENDENCY', 'AI', 'OUTPUT_SCHEMA', 'CONTEXT', 'CONFLICT', 'CANCELLED', 'INTERNAL_SAFE');

-- CreateEnum
CREATE TYPE "AiAgentApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiAgentMemoryType" AS ENUM ('PREFERENCE', 'DECISION', 'PERSISTENT_INSTRUCTION', 'APPROVED_LEARNING', 'BRAND_FACT', 'CONSTRAINT', 'PREFERRED_FORMAT');

-- CreateEnum
CREATE TYPE "AiAgentResourceType" AS ENUM ('CONTENT_ITEM', 'CAMPAIGN', 'CAMPAIGN_STRATEGY', 'CAMPAIGN_PILLAR', 'CAMPAIGN_CONTENT_PIECE', 'SOCIAL_POST', 'FILE_ASSET');

-- CreateEnum
CREATE TYPE "AiAgentResourceAction" AS ENUM ('CREATED', 'REUSED', 'USED_AS_CONTEXT');


-- CreateTable
CREATE TABLE "AiAgent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "category" "AiAgentCategory" NOT NULL,
    "objective" TEXT,
    "systemInstructions" TEXT NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputType" "AiAgentOutputType" NOT NULL,
    "brandProfileId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es',
    "creativity" "AiAgentCreativity" NOT NULL DEFAULT 'BALANCED',
    "allowedTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewerAgentRef" TEXT,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "maxSteps" INTEGER NOT NULL DEFAULT 1,
    "visibility" "AiAgentVisibility" NOT NULL DEFAULT 'PROJECT',
    "status" "AiAgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateSourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentTeam" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "coordinatorAgentRef" TEXT NOT NULL,
    "reviewerAgentRef" TEXT,
    "errorStrategy" "AiAgentTeamErrorStrategy" NOT NULL DEFAULT 'STOP_ON_ERROR',
    "status" "AiAgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateSourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "agentRef" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "officialAgentKey" TEXT,
    "customAgentId" TEXT,
    "teamId" TEXT,
    "status" "AiAgentRunStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStepOrder" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "approvedInput" JSONB,
    "stagesConfig" JSONB,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "brandProfileId" TEXT,
    "result" JSONB,
    "lastErrorMessage" TEXT,
    "lastErrorCategory" "AiAgentErrorCategory",
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sourceRunId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "agentRef" TEXT NOT NULL,
    "status" "AiAgentRunStepStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "errorCategory" "AiAgentErrorCategory",
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "executionToken" TEXT,
    "currentItemIndex" INTEGER,
    "totalItems" INTEGER,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentApproval" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "status" "AiAgentApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,
    "revisedOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentMemory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "agentRef" TEXT NOT NULL,
    "type" "AiAgentMemoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "sourceRunId" TEXT,
    "approvedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentResource" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "type" "AiAgentResourceType" NOT NULL,
    "action" "AiAgentResourceAction" NOT NULL,
    "contentItemId" TEXT,
    "campaignId" TEXT,
    "campaignStrategyId" TEXT,
    "campaignPillarId" TEXT,
    "campaignContentPieceId" TEXT,
    "socialPostId" TEXT,
    "fileAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiAgent_projectId_status_idx" ON "AiAgent"("projectId", "status");

-- CreateIndex
CREATE INDEX "AiAgent_projectId_category_idx" ON "AiAgent"("projectId", "category");

-- CreateIndex
CREATE INDEX "AiAgentTeam_projectId_status_idx" ON "AiAgentTeam"("projectId", "status");

-- CreateIndex
CREATE INDEX "AiAgentTeamMember_teamId_idx" ON "AiAgentTeamMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentTeamMember_teamId_order_key" ON "AiAgentTeamMember"("teamId", "order");

-- CreateIndex
CREATE INDEX "AiAgentRun_projectId_status_idx" ON "AiAgentRun"("projectId", "status");

-- CreateIndex
CREATE INDEX "AiAgentRun_projectId_createdById_idx" ON "AiAgentRun"("projectId", "createdById");

-- CreateIndex
CREATE INDEX "AiAgentRun_projectId_createdAt_idx" ON "AiAgentRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAgentRun_customAgentId_idx" ON "AiAgentRun"("customAgentId");

-- CreateIndex
CREATE INDEX "AiAgentRun_teamId_idx" ON "AiAgentRun"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentRun_createdById_idempotencyKey_key" ON "AiAgentRun"("createdById", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AiAgentRunStep_runId_status_idx" ON "AiAgentRunStep"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentRunStep_runId_order_key" ON "AiAgentRunStep"("runId", "order");

-- CreateIndex
CREATE INDEX "AiAgentApproval_runId_idx" ON "AiAgentApproval"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentApproval_runId_stepOrder_key" ON "AiAgentApproval"("runId", "stepOrder");

-- CreateIndex
CREATE INDEX "AiAgentMemory_projectId_agentRef_idx" ON "AiAgentMemory"("projectId", "agentRef");

-- CreateIndex
CREATE INDEX "AiAgentMemory_sourceRunId_idx" ON "AiAgentMemory"("sourceRunId");

-- CreateIndex
CREATE INDEX "AiAgentResource_runId_idx" ON "AiAgentResource"("runId");

-- CreateIndex
CREATE INDEX "AiAgentResource_stepId_idx" ON "AiAgentResource"("stepId");

-- CreateIndex
CREATE INDEX "AiAgentResource_contentItemId_idx" ON "AiAgentResource"("contentItemId");

-- CreateIndex
CREATE INDEX "AiAgentResource_campaignId_idx" ON "AiAgentResource"("campaignId");

-- CreateIndex
CREATE INDEX "AiAgentResource_campaignPillarId_idx" ON "AiAgentResource"("campaignPillarId");

-- CreateIndex
CREATE INDEX "AiAgentResource_campaignContentPieceId_idx" ON "AiAgentResource"("campaignContentPieceId");

-- CreateIndex
CREATE INDEX "AiAgentResource_socialPostId_idx" ON "AiAgentResource"("socialPostId");

-- CreateIndex
CREATE INDEX "AiAgentResource_fileAssetId_idx" ON "AiAgentResource"("fileAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentResource_runId_contentItemId_key" ON "AiAgentResource"("runId", "contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentResource_runId_campaignId_key" ON "AiAgentResource"("runId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentResource_runId_socialPostId_key" ON "AiAgentResource"("runId", "socialPostId");

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_templateSourceId_fkey" FOREIGN KEY ("templateSourceId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentTeam" ADD CONSTRAINT "AiAgentTeam_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentTeam" ADD CONSTRAINT "AiAgentTeam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentTeam" ADD CONSTRAINT "AiAgentTeam_templateSourceId_fkey" FOREIGN KEY ("templateSourceId") REFERENCES "AiAgentTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentTeamMember" ADD CONSTRAINT "AiAgentTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AiAgentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRun" ADD CONSTRAINT "AiAgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRun" ADD CONSTRAINT "AiAgentRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRun" ADD CONSTRAINT "AiAgentRun_customAgentId_fkey" FOREIGN KEY ("customAgentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRun" ADD CONSTRAINT "AiAgentRun_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AiAgentTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRun" ADD CONSTRAINT "AiAgentRun_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRun" ADD CONSTRAINT "AiAgentRun_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "AiAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRunStep" ADD CONSTRAINT "AiAgentRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiAgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentApproval" ADD CONSTRAINT "AiAgentApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiAgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentApproval" ADD CONSTRAINT "AiAgentApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentMemory" ADD CONSTRAINT "AiAgentMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentMemory" ADD CONSTRAINT "AiAgentMemory_sourceRunId_fkey" FOREIGN KEY ("sourceRunId") REFERENCES "AiAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentMemory" ADD CONSTRAINT "AiAgentMemory_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResource" ADD CONSTRAINT "AiAgentResource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiAgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResource" ADD CONSTRAINT "AiAgentResource_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AiAgentRunStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResource" ADD CONSTRAINT "AiAgentResource_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResource" ADD CONSTRAINT "AiAgentResource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResource" ADD CONSTRAINT "AiAgentResource_campaignStrategyId_fkey" FOREIGN KEY ("campaignStrategyId") REFERENCES "CampaignStrategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResource" ADD CONSTRAINT "AiAgentResource_campaignPillarId_fkey" FOREIGN KEY ("campaignPillarId") REFERENCES "CampaignPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResource" ADD CONSTRAINT "AiAgentResource_campaignContentPieceId_fkey" FOREIGN KEY ("campaignContentPieceId") REFERENCES "CampaignContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResource" ADD CONSTRAINT "AiAgentResource_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentResource" ADD CONSTRAINT "AiAgentResource_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;


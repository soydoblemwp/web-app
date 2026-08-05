-- CreateEnum
CREATE TYPE "CampaignPieceStatus" AS ENUM ('IDEA', 'PENDING', 'IN_PRODUCTION', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignPiecePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CampaignMetricType" AS ENUM ('REACH', 'IMPRESSIONS', 'CLICKS', 'CONVERSIONS', 'LEADS', 'SALES', 'ENGAGEMENT', 'FOLLOWERS', 'PLAYS', 'OPEN_RATE', 'CTR');

-- AlterTable: Campaign Studio briefing fields — all nullable/defaulted, every existing Campaign row is valid as-is.
ALTER TABLE "Campaign" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "brandProfileId" TEXT,
ADD COLUMN     "valueProposition" TEXT,
ADD COLUMN     "mainMessage" TEXT,
ADD COLUMN     "offer" TEXT,
ADD COLUMN     "tone" TEXT,
ADD COLUMN     "forbiddenWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "differentiators" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "audienceLocation" TEXT,
ADD COLUMN     "audienceAgeRange" TEXT,
ADD COLUMN     "audienceInterests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "audiencePainPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "audienceNeeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "audienceObjections" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "audienceAwareness" TEXT,
ADD COLUMN     "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "contentCount" INTEGER,
ADD COLUMN     "frequencyPerWeek" INTEGER,
ADD COLUMN     "preferredDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "preferredHours" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "desiredFormats" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "templateSourceId" TEXT;

-- CreateTable
CREATE TABLE "CampaignStrategy" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "summary" TEXT,
    "audienceProfile" TEXT,
    "valueProposition" TEXT,
    "mainMessage" TEXT,
    "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creativeAngles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta" TEXT,
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedMetrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignStrategyVersion" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignStrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPillar" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "color" TEXT,
    "percentage" INTEGER,
    "formats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignContentPiece" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "pillarId" TEXT,
    "contentItemId" TEXT,
    "title" TEXT NOT NULL,
    "idea" TEXT,
    "platform" TEXT NOT NULL,
    "format" TEXT,
    "objective" TEXT,
    "cta" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "scheduledTime" TEXT,
    "status" "CampaignPieceStatus" NOT NULL DEFAULT 'IDEA',
    "priority" "CampaignPiecePriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" TEXT,
    "authorId" TEXT NOT NULL,
    "updatedById" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignContentPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPieceComment" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPieceComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMetricGoal" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "metricType" "CampaignMetricType" NOT NULL,
    "targetValue" DECIMAL(14,2) NOT NULL,
    "currentValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMetricGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "structure" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignStrategy_campaignId_key" ON "CampaignStrategy"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignStrategyVersion_strategyId_idx" ON "CampaignStrategyVersion"("strategyId");

-- CreateIndex
CREATE INDEX "CampaignPillar_campaignId_order_idx" ON "CampaignPillar"("campaignId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignContentPiece_contentItemId_key" ON "CampaignContentPiece"("contentItemId");

-- CreateIndex
CREATE INDEX "CampaignContentPiece_campaignId_status_idx" ON "CampaignContentPiece"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignContentPiece_campaignId_order_idx" ON "CampaignContentPiece"("campaignId", "order");

-- CreateIndex
CREATE INDEX "CampaignContentPiece_assigneeId_idx" ON "CampaignContentPiece"("assigneeId");

-- CreateIndex
CREATE INDEX "CampaignPieceComment_pieceId_idx" ON "CampaignPieceComment"("pieceId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMetricGoal_campaignId_metricType_key" ON "CampaignMetricGoal"("campaignId", "metricType");

-- CreateIndex
CREATE INDEX "CampaignTemplate_projectId_idx" ON "CampaignTemplate"("projectId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignStrategy" ADD CONSTRAINT "CampaignStrategy_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignStrategyVersion" ADD CONSTRAINT "CampaignStrategyVersion_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "CampaignStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignStrategyVersion" ADD CONSTRAINT "CampaignStrategyVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPillar" ADD CONSTRAINT "CampaignPillar_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentPiece" ADD CONSTRAINT "CampaignContentPiece_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentPiece" ADD CONSTRAINT "CampaignContentPiece_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "CampaignPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentPiece" ADD CONSTRAINT "CampaignContentPiece_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentPiece" ADD CONSTRAINT "CampaignContentPiece_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentPiece" ADD CONSTRAINT "CampaignContentPiece_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContentPiece" ADD CONSTRAINT "CampaignContentPiece_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPieceComment" ADD CONSTRAINT "CampaignPieceComment_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "CampaignContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPieceComment" ADD CONSTRAINT "CampaignPieceComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetricGoal" ADD CONSTRAINT "CampaignMetricGoal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTemplate" ADD CONSTRAINT "CampaignTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTemplate" ADD CONSTRAINT "CampaignTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

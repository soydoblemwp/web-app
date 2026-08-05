-- CreateEnum
CREATE TYPE "PerformanceContextMode" AS ENUM ('RECOMMENDED', 'MANUAL', 'NONE');

-- CreateEnum
CREATE TYPE "MarketingBrainOptimizationStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MarketingBrainScenarioKind" AS ENUM ('CONSERVATIVE', 'BALANCED', 'EXPANSIVE');

-- CreateEnum
CREATE TYPE "MarketingBrainScenarioActionType" AS ENUM ('CAMPAIGN_CONTENT_PIECE', 'CONTENT_ITEM', 'SOCIAL_POST', 'AGENT_RUN', 'KNOWLEDGE_QUERY', 'TASK');

-- CreateEnum
CREATE TYPE "MarketingBrainMeasurementStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketingBrainGoalOutcome" AS ENUM ('REACHED', 'NOT_REACHED', 'INDETERMINATE');

-- CreateEnum
CREATE TYPE "MarketingBrainCausalityStatement" AS ENUM ('OBSERVED_DURING_PERIOD', 'EXPERIMENT_BACKED', 'CANNOT_CONFIRM');

-- CreateTable
CREATE TABLE "MarketingBrainOptimizationSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "campaignId" TEXT,
    "marketingBrainRunId" TEXT,
    "createdByAgentRunId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "MarketingBrainOptimizationStatus" NOT NULL DEFAULT 'DRAFT',
    "contextMode" "PerformanceContextMode" NOT NULL DEFAULT 'NONE',
    "selection" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "executionToken" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorMessage" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingBrainOptimizationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBrainContextSnapshot" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "comparisonPeriodStart" TIMESTAMP(3),
    "comparisonPeriodEnd" TIMESTAMP(3),
    "facts" JSONB NOT NULL,
    "derived" JSONB NOT NULL,
    "signals" JSONB NOT NULL,
    "hypotheses" JSONB NOT NULL,
    "constraints" JSONB NOT NULL,
    "missingData" JSONB NOT NULL,
    "dataQualityScore" INTEGER NOT NULL,
    "dataQualityLevel" TEXT NOT NULL,
    "evidenceStrength" TEXT NOT NULL,
    "metricCount" INTEGER NOT NULL DEFAULT 0,
    "resourceCount" INTEGER NOT NULL DEFAULT 0,
    "recommendationCount" INTEGER NOT NULL DEFAULT 0,
    "experimentCount" INTEGER NOT NULL DEFAULT 0,
    "goalCount" INTEGER NOT NULL DEFAULT 0,
    "benchmarkCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingBrainContextSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBrainScenario" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "MarketingBrainScenarioKind" NOT NULL,
    "objective" TEXT NOT NULL,
    "intensity" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "measurementMethod" TEXT NOT NULL,
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kpis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preconditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "constraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resourcesRequired" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingBrainScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBrainScenarioAction" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "channel" TEXT,
    "actionType" "MarketingBrainScenarioActionType" NOT NULL,
    "convertedById" TEXT,
    "convertedAt" TIMESTAMP(3),
    "campaignContentPieceId" TEXT,
    "contentItemId" TEXT,
    "socialPostId" TEXT,
    "agentRunId" TEXT,
    "knowledgeQueryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingBrainScenarioAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBrainMeasurementPlan" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "primaryMetricKey" TEXT NOT NULL,
    "secondaryMetricKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resourceType" "PerformanceResourceType" NOT NULL,
    "contentItemId" TEXT,
    "campaignId" TEXT,
    "socialPostId" TEXT,
    "goalId" TEXT,
    "trackingStart" TIMESTAMP(3) NOT NULL,
    "trackingEnd" TIMESTAMP(3) NOT NULL,
    "comparisonPeriodStart" TIMESTAMP(3),
    "comparisonPeriodEnd" TIMESTAMP(3),
    "baselineValue" DECIMAL(18,4),
    "baselineQuality" TEXT,
    "baselineSampleSize" INTEGER,
    "baselineCapturedAt" TIMESTAMP(3),
    "status" "MarketingBrainMeasurementStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingBrainMeasurementPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingBrainMeasurementReview" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "initialValue" DECIMAL(18,4),
    "currentValue" DECIMAL(18,4),
    "absoluteDiff" DECIMAL(18,4),
    "percentDiff" DECIMAL(18,4),
    "initialQuality" TEXT,
    "currentQuality" TEXT,
    "goalOutcome" "MarketingBrainGoalOutcome" NOT NULL DEFAULT 'INDETERMINATE',
    "relatedAnomalies" JSONB NOT NULL DEFAULT '[]',
    "relatedExperiments" JSONB NOT NULL DEFAULT '[]',
    "limitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conclusion" TEXT NOT NULL,
    "causalityStatement" "MarketingBrainCausalityStatement" NOT NULL DEFAULT 'CANNOT_CONFIRM',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingBrainMeasurementReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainOptimizationSession_previousVersionId_key" ON "MarketingBrainOptimizationSession"("previousVersionId");

-- CreateIndex
CREATE INDEX "MarketingBrainOptimizationSession_projectId_status_idx" ON "MarketingBrainOptimizationSession"("projectId", "status");

-- CreateIndex
CREATE INDEX "MarketingBrainOptimizationSession_campaignId_idx" ON "MarketingBrainOptimizationSession"("campaignId");

-- CreateIndex
CREATE INDEX "MarketingBrainOptimizationSession_marketingBrainRunId_idx" ON "MarketingBrainOptimizationSession"("marketingBrainRunId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainOptimizationSession_createdById_idempotencyKe_key" ON "MarketingBrainOptimizationSession"("createdById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainContextSnapshot_sessionId_key" ON "MarketingBrainContextSnapshot"("sessionId");

-- CreateIndex
CREATE INDEX "MarketingBrainContextSnapshot_projectId_idx" ON "MarketingBrainContextSnapshot"("projectId");

-- CreateIndex
CREATE INDEX "MarketingBrainScenario_projectId_idx" ON "MarketingBrainScenario"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainScenario_sessionId_kind_key" ON "MarketingBrainScenario"("sessionId", "kind");

-- CreateIndex
CREATE INDEX "MarketingBrainScenarioAction_scenarioId_idx" ON "MarketingBrainScenarioAction"("scenarioId");

-- CreateIndex
CREATE INDEX "MarketingBrainScenarioAction_projectId_idx" ON "MarketingBrainScenarioAction"("projectId");

-- CreateIndex
CREATE INDEX "MarketingBrainMeasurementPlan_sessionId_idx" ON "MarketingBrainMeasurementPlan"("sessionId");

-- CreateIndex
CREATE INDEX "MarketingBrainMeasurementPlan_projectId_status_idx" ON "MarketingBrainMeasurementPlan"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingBrainMeasurementReview_idempotencyKey_key" ON "MarketingBrainMeasurementReview"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MarketingBrainMeasurementReview_planId_idx" ON "MarketingBrainMeasurementReview"("planId");

-- CreateIndex
CREATE INDEX "MarketingBrainMeasurementReview_projectId_idx" ON "MarketingBrainMeasurementReview"("projectId");

-- AddForeignKey
ALTER TABLE "MarketingBrainOptimizationSession" ADD CONSTRAINT "MarketingBrainOptimizationSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainOptimizationSession" ADD CONSTRAINT "MarketingBrainOptimizationSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainOptimizationSession" ADD CONSTRAINT "MarketingBrainOptimizationSession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainOptimizationSession" ADD CONSTRAINT "MarketingBrainOptimizationSession_marketingBrainRunId_fkey" FOREIGN KEY ("marketingBrainRunId") REFERENCES "MarketingBrainRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainOptimizationSession" ADD CONSTRAINT "MarketingBrainOptimizationSession_createdByAgentRunId_fkey" FOREIGN KEY ("createdByAgentRunId") REFERENCES "AiAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainOptimizationSession" ADD CONSTRAINT "MarketingBrainOptimizationSession_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainOptimizationSession" ADD CONSTRAINT "MarketingBrainOptimizationSession_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "MarketingBrainOptimizationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainContextSnapshot" ADD CONSTRAINT "MarketingBrainContextSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MarketingBrainOptimizationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainScenario" ADD CONSTRAINT "MarketingBrainScenario_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MarketingBrainOptimizationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainScenarioAction" ADD CONSTRAINT "MarketingBrainScenarioAction_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "MarketingBrainScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainScenarioAction" ADD CONSTRAINT "MarketingBrainScenarioAction_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainScenarioAction" ADD CONSTRAINT "MarketingBrainScenarioAction_campaignContentPieceId_fkey" FOREIGN KEY ("campaignContentPieceId") REFERENCES "CampaignContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainScenarioAction" ADD CONSTRAINT "MarketingBrainScenarioAction_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainScenarioAction" ADD CONSTRAINT "MarketingBrainScenarioAction_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainScenarioAction" ADD CONSTRAINT "MarketingBrainScenarioAction_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AiAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainScenarioAction" ADD CONSTRAINT "MarketingBrainScenarioAction_knowledgeQueryId_fkey" FOREIGN KEY ("knowledgeQueryId") REFERENCES "KnowledgeQuery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainMeasurementPlan" ADD CONSTRAINT "MarketingBrainMeasurementPlan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MarketingBrainOptimizationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainMeasurementPlan" ADD CONSTRAINT "MarketingBrainMeasurementPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainMeasurementPlan" ADD CONSTRAINT "MarketingBrainMeasurementPlan_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainMeasurementPlan" ADD CONSTRAINT "MarketingBrainMeasurementPlan_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainMeasurementPlan" ADD CONSTRAINT "MarketingBrainMeasurementPlan_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainMeasurementPlan" ADD CONSTRAINT "MarketingBrainMeasurementPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "PerformanceGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainMeasurementReview" ADD CONSTRAINT "MarketingBrainMeasurementReview_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MarketingBrainMeasurementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingBrainMeasurementReview" ADD CONSTRAINT "MarketingBrainMeasurementReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

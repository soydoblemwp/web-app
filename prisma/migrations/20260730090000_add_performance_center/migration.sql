-- CreateEnum
CREATE TYPE "PerformanceMetricOrigin" AS ENUM ('INTERNAL', 'MANUAL', 'CSV_IMPORT', 'JSON_IMPORT', 'EXTERNAL_PROVIDER', 'CALCULATED', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "PerformanceResourceType" AS ENUM ('CONTENT_ITEM', 'CONTENT_VERSION', 'CAMPAIGN', 'CAMPAIGN_CONTENT_PIECE', 'SOCIAL_POST', 'EXPERIMENT_VARIANT', 'PLATFORM', 'PROJECT');

-- CreateEnum
CREATE TYPE "PerformanceMetricCategory" AS ENUM ('CONTENT', 'CAMPAIGN', 'SOCIAL', 'AUTOMATION', 'KNOWLEDGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PerformanceMetricUnit" AS ENUM ('COUNT', 'PERCENTAGE', 'SECONDS', 'CURRENCY', 'RATIO', 'SCORE', 'TEXT');

-- CreateEnum
CREATE TYPE "PerformanceMetricDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "PerformanceMetricAggregation" AS ENUM ('SUM', 'AVERAGE', 'MEDIAN', 'MAX', 'MIN', 'LAST', 'RATE');

-- CreateEnum
CREATE TYPE "PerformancePeriodGranularity" AS ENUM ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'CAMPAIGN', 'EXPERIMENT', 'PUBLICATION', 'CUSTOM_RANGE');

-- CreateEnum
CREATE TYPE "PerformanceMetricRevisionAction" AS ENUM ('CREATED', 'UPDATED', 'REPLACED', 'MERGED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "PerformanceImportKind" AS ENUM ('CSV', 'JSON');

-- CreateEnum
CREATE TYPE "PerformanceImportStage" AS ENUM ('REGISTERED', 'VALIDATING', 'NORMALIZING', 'MATCHING_RESOURCES', 'IMPORTING', 'AGGREGATING', 'ANALYZING', 'FINALIZING');

-- CreateEnum
CREATE TYPE "PerformanceImportStatus" AS ENUM ('DRAFT', 'MAPPING', 'VALIDATING', 'READY', 'IMPORTING', 'PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PerformanceImportRowStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'DUPLICATE', 'IMPORTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PerformanceDuplicatePolicy" AS ENUM ('SKIP', 'REPLACE', 'MERGE_SUM', 'KEEP_BOTH');

-- CreateEnum
CREATE TYPE "PerformanceGoalType" AS ENUM ('MINIMUM', 'MAXIMUM', 'RANGE', 'GROWTH', 'MAINTAIN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PerformanceGoalStatus" AS ENUM ('ACTIVE', 'REACHED', 'MISSED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PerformanceBenchmarkSource" AS ENUM ('INTERNAL_AVERAGE', 'INTERNAL_MEDIAN', 'BEST_HISTORICAL', 'PREVIOUS_PERIOD', 'PREVIOUS_CAMPAIGN', 'MANUAL_VALUE');

-- CreateEnum
CREATE TYPE "PerformanceExperimentType" AS ENUM ('TITLE', 'HOOK', 'CTA', 'DESCRIPTION', 'FORMAT', 'LENGTH', 'TONE', 'PUBLISHING_TIME', 'PLATFORM_ADAPTATION', 'CONTENT_VERSION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PerformanceExperimentStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'INCONCLUSIVE', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PerformanceExperimentVariantStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PerformanceRecommendationCategory" AS ENUM ('CONTENT', 'CAMPAIGN', 'SOCIAL', 'AUTOMATION', 'KNOWLEDGE', 'EXPERIMENT', 'DATA_QUALITY');

-- CreateEnum
CREATE TYPE "PerformanceRecommendationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PerformanceRecommendationSource" AS ENUM ('RULE', 'AI', 'EXPERIMENT');

-- CreateEnum
CREATE TYPE "PerformanceRecommendationStatus" AS ENUM ('NEW', 'REVIEWING', 'ACCEPTED', 'REJECTED', 'APPLIED', 'DISMISSED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PerformanceRecommendationActionType" AS ENUM ('INTERNAL_TASK', 'AGENT_RUN', 'AGENT_TEAM_RUN', 'WORKFLOW_RUN', 'WORKFLOW_AUTOMATION', 'EXPERIMENT', 'CONTENT_VERSION', 'CAMPAIGN_CONTENT_PIECE', 'SOCIAL_POST', 'CONTENT_UPDATE', 'KNOWLEDGE_QUERY');

-- CreateEnum
CREATE TYPE "PerformanceRecommendationActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CREATED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PerformanceAnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PerformanceAnomalyMethod" AS ENUM ('STDDEV', 'IQR', 'PERCENT_CHANGE', 'MISSING_DATA', 'ACTIVITY_DROP', 'ACTIVITY_SPIKE');

-- CreateEnum
CREATE TYPE "PerformanceAnomalyStatus" AS ENUM ('OPEN', 'REVIEWING', 'CONFIRMED', 'DISMISSED', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PerformanceReportType" AS ENUM ('WEEKLY', 'MONTHLY', 'CAMPAIGN', 'CONTENT', 'PLATFORM', 'EXPERIMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PerformanceReportStatus" AS ENUM ('DRAFT', 'GENERATING', 'COMPLETED', 'FAILED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "KnowledgeSource" ADD COLUMN     "performanceReportId" TEXT;

-- CreateTable
CREATE TABLE "PerformanceMetricDefinition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "PerformanceMetricCategory" NOT NULL DEFAULT 'CUSTOM',
    "unit" "PerformanceMetricUnit" NOT NULL,
    "direction" "PerformanceMetricDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
    "aggregation" "PerformanceMetricAggregation" NOT NULL DEFAULT 'SUM',
    "compatibleResourceTypes" "PerformanceResourceType"[] DEFAULT ARRAY[]::"PerformanceResourceType"[],
    "compatiblePlatforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportsCumulative" BOOLEAN NOT NULL DEFAULT true,
    "supportsAverage" BOOLEAN NOT NULL DEFAULT true,
    "supportsPercentage" BOOLEAN NOT NULL DEFAULT false,
    "supportsComparison" BOOLEAN NOT NULL DEFAULT true,
    "requiresNumeratorDenominator" BOOLEAN NOT NULL DEFAULT false,
    "expectedMin" DECIMAL(18,4),
    "expectedMax" DECIMAL(18,4),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMetricDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMetricRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "source" "PerformanceMetricOrigin" NOT NULL,
    "metricKey" TEXT NOT NULL,
    "resourceType" "PerformanceResourceType" NOT NULL,
    "resourceId" TEXT,
    "contentItemId" TEXT,
    "contentVersionId" TEXT,
    "campaignId" TEXT,
    "campaignContentPieceId" TEXT,
    "socialPostId" TEXT,
    "experimentVariantId" TEXT,
    "platform" TEXT,
    "value" DECIMAL(18,4) NOT NULL,
    "unit" "PerformanceMetricUnit" NOT NULL,
    "currency" TEXT,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "granularity" "PerformancePeriodGranularity" NOT NULL DEFAULT 'DAY',
    "provider" TEXT,
    "externalReference" TEXT,
    "method" TEXT NOT NULL,
    "notes" TEXT,
    "evidenceFileAssetId" TEXT,
    "importId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceMetricRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceMetricRevision" (
    "id" TEXT NOT NULL,
    "metricRecordId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "action" "PerformanceMetricRevisionAction" NOT NULL,
    "previousValue" DECIMAL(18,4),
    "newValue" DECIMAL(18,4),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceMetricRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceImport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" "PerformanceImportKind" NOT NULL,
    "status" "PerformanceImportStatus" NOT NULL DEFAULT 'DRAFT',
    "stage" "PerformanceImportStage" NOT NULL DEFAULT 'REGISTERED',
    "fileAssetId" TEXT,
    "rawText" TEXT,
    "platform" TEXT,
    "resourceType" "PerformanceResourceType",
    "mapping" JSONB,
    "config" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" JSONB,
    "executionToken" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "status" "PerformanceImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "duplicateOfId" TEXT,
    "metricRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceGoal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "resourceType" "PerformanceResourceType" NOT NULL DEFAULT 'PROJECT',
    "campaignId" TEXT,
    "contentItemId" TEXT,
    "platform" TEXT,
    "metricKey" TEXT NOT NULL,
    "type" "PerformanceGoalType" NOT NULL,
    "targetValue" DECIMAL(18,4),
    "targetMin" DECIMAL(18,4),
    "targetMax" DECIMAL(18,4),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PerformanceGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "reachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceBenchmark" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "metricKey" TEXT NOT NULL,
    "source" "PerformanceBenchmarkSource" NOT NULL,
    "campaignId" TEXT,
    "label" TEXT,
    "value" DECIMAL(18,4) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceExperiment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "objective" TEXT,
    "type" "PerformanceExperimentType" NOT NULL,
    "primaryMetricKey" TEXT NOT NULL,
    "secondaryMetricKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resourceType" "PerformanceResourceType" NOT NULL,
    "contentItemId" TEXT,
    "campaignId" TEXT,
    "platform" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "status" "PerformanceExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedSampleSize" INTEGER,
    "completionCriteria" TEXT,
    "winnerVariantId" TEXT,
    "conclusion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceExperimentVariant" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "contentVersionId" TEXT,
    "socialPostId" TEXT,
    "text" TEXT,
    "metadata" JSONB,
    "createdByAgentRunId" TEXT,
    "agentKeyUsed" TEXT,
    "confirmedById" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "manualExposure" INTEGER,
    "status" "PerformanceExperimentVariantStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceExperimentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceExperimentMetric" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "mean" DECIMAL(18,6),
    "median" DECIMAL(18,6),
    "stddev" DECIMAL(18,6),
    "proportion" DECIMAL(9,6),
    "value" DECIMAL(18,6) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceExperimentMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceRecommendation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "PerformanceRecommendationCategory" NOT NULL,
    "priority" "PerformanceRecommendationPriority" NOT NULL DEFAULT 'MEDIUM',
    "confidence" DECIMAL(4,3) NOT NULL,
    "source" "PerformanceRecommendationSource" NOT NULL DEFAULT 'RULE',
    "ruleKey" TEXT,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "resourceType" "PerformanceResourceType",
    "contentItemId" TEXT,
    "campaignId" TEXT,
    "socialPostId" TEXT,
    "experimentId" TEXT,
    "actionProposed" TEXT NOT NULL,
    "expectedOutcome" TEXT,
    "risk" TEXT,
    "effortEstimate" TEXT,
    "status" "PerformanceRecommendationStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceRecommendationAction" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "actionType" "PerformanceRecommendationActionType" NOT NULL,
    "status" "PerformanceRecommendationActionStatus" NOT NULL DEFAULT 'PENDING',
    "agentRunId" TEXT,
    "workflowRunId" TEXT,
    "workflowAutomationId" TEXT,
    "experimentId" TEXT,
    "contentVersionId" TEXT,
    "campaignContentPieceId" TEXT,
    "socialPostId" TEXT,
    "knowledgeQueryId" TEXT,
    "parameters" JSONB,
    "performedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceRecommendationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceAnomaly" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "resourceType" "PerformanceResourceType",
    "contentItemId" TEXT,
    "campaignId" TEXT,
    "socialPostId" TEXT,
    "platform" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "expectedValue" DECIMAL(18,4),
    "method" "PerformanceAnomalyMethod" NOT NULL,
    "severity" "PerformanceAnomalySeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "PerformanceAnomalyStatus" NOT NULL DEFAULT 'OPEN',
    "dataQualityAtDetection" TEXT,
    "explanation" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "PerformanceReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PerformanceReportStatus" NOT NULL DEFAULT 'DRAFT',
    "filters" JSONB,
    "summary" JSONB,
    "aiSummary" TEXT,
    "contentItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReportResource" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "resourceType" "PerformanceResourceType" NOT NULL,
    "campaignId" TEXT,
    "contentItemId" TEXT,
    "socialPostId" TEXT,
    "experimentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceReportResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceMetricDefinition_projectId_category_idx" ON "PerformanceMetricDefinition"("projectId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceMetricDefinition_projectId_key_key" ON "PerformanceMetricDefinition"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceMetricRecord_idempotencyKey_key" ON "PerformanceMetricRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PerformanceMetricRecord_projectId_metricKey_idx" ON "PerformanceMetricRecord"("projectId", "metricKey");

-- CreateIndex
CREATE INDEX "PerformanceMetricRecord_projectId_resourceType_resourceId_idx" ON "PerformanceMetricRecord"("projectId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "PerformanceMetricRecord_contentItemId_idx" ON "PerformanceMetricRecord"("contentItemId");

-- CreateIndex
CREATE INDEX "PerformanceMetricRecord_campaignId_idx" ON "PerformanceMetricRecord"("campaignId");

-- CreateIndex
CREATE INDEX "PerformanceMetricRecord_socialPostId_idx" ON "PerformanceMetricRecord"("socialPostId");

-- CreateIndex
CREATE INDEX "PerformanceMetricRecord_experimentVariantId_idx" ON "PerformanceMetricRecord"("experimentVariantId");

-- CreateIndex
CREATE INDEX "PerformanceMetricRecord_projectId_measuredAt_idx" ON "PerformanceMetricRecord"("projectId", "measuredAt");

-- CreateIndex
CREATE INDEX "PerformanceMetricRecord_projectId_periodStart_periodEnd_idx" ON "PerformanceMetricRecord"("projectId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PerformanceMetricRecord_importId_idx" ON "PerformanceMetricRecord"("importId");

-- CreateIndex
CREATE INDEX "PerformanceMetricRevision_metricRecordId_idx" ON "PerformanceMetricRevision"("metricRecordId");

-- CreateIndex
CREATE INDEX "PerformanceImport_projectId_status_idx" ON "PerformanceImport"("projectId", "status");

-- CreateIndex
CREATE INDEX "PerformanceImport_status_lockExpiresAt_idx" ON "PerformanceImport"("status", "lockExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceImportRow_metricRecordId_key" ON "PerformanceImportRow"("metricRecordId");

-- CreateIndex
CREATE INDEX "PerformanceImportRow_importId_status_idx" ON "PerformanceImportRow"("importId", "status");

-- CreateIndex
CREATE INDEX "PerformanceImportRow_importId_rowIndex_idx" ON "PerformanceImportRow"("importId", "rowIndex");

-- CreateIndex
CREATE INDEX "PerformanceGoal_projectId_status_idx" ON "PerformanceGoal"("projectId", "status");

-- CreateIndex
CREATE INDEX "PerformanceGoal_campaignId_idx" ON "PerformanceGoal"("campaignId");

-- CreateIndex
CREATE INDEX "PerformanceBenchmark_projectId_metricKey_idx" ON "PerformanceBenchmark"("projectId", "metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceExperiment_winnerVariantId_key" ON "PerformanceExperiment"("winnerVariantId");

-- CreateIndex
CREATE INDEX "PerformanceExperiment_projectId_status_idx" ON "PerformanceExperiment"("projectId", "status");

-- CreateIndex
CREATE INDEX "PerformanceExperiment_campaignId_idx" ON "PerformanceExperiment"("campaignId");

-- CreateIndex
CREATE INDEX "PerformanceExperiment_contentItemId_idx" ON "PerformanceExperiment"("contentItemId");

-- CreateIndex
CREATE INDEX "PerformanceExperimentVariant_experimentId_idx" ON "PerformanceExperimentVariant"("experimentId");

-- CreateIndex
CREATE INDEX "PerformanceExperimentMetric_experimentId_metricKey_idx" ON "PerformanceExperimentMetric"("experimentId", "metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceExperimentMetric_variantId_metricKey_key" ON "PerformanceExperimentMetric"("variantId", "metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceRecommendation_idempotencyKey_key" ON "PerformanceRecommendation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PerformanceRecommendation_projectId_status_idx" ON "PerformanceRecommendation"("projectId", "status");

-- CreateIndex
CREATE INDEX "PerformanceRecommendation_contentItemId_idx" ON "PerformanceRecommendation"("contentItemId");

-- CreateIndex
CREATE INDEX "PerformanceRecommendation_campaignId_idx" ON "PerformanceRecommendation"("campaignId");

-- CreateIndex
CREATE INDEX "PerformanceRecommendationAction_recommendationId_idx" ON "PerformanceRecommendationAction"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceAnomaly_idempotencyKey_key" ON "PerformanceAnomaly"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PerformanceAnomaly_projectId_status_idx" ON "PerformanceAnomaly"("projectId", "status");

-- CreateIndex
CREATE INDEX "PerformanceAnomaly_contentItemId_idx" ON "PerformanceAnomaly"("contentItemId");

-- CreateIndex
CREATE INDEX "PerformanceAnomaly_campaignId_idx" ON "PerformanceAnomaly"("campaignId");

-- CreateIndex
CREATE INDEX "PerformanceReport_projectId_status_idx" ON "PerformanceReport"("projectId", "status");

-- CreateIndex
CREATE INDEX "PerformanceReportResource_reportId_idx" ON "PerformanceReportResource"("reportId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_performanceReportId_idx" ON "KnowledgeSource"("performanceReportId");

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_performanceReportId_fkey" FOREIGN KEY ("performanceReportId") REFERENCES "PerformanceReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricDefinition" ADD CONSTRAINT "PerformanceMetricDefinition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricDefinition" ADD CONSTRAINT "PerformanceMetricDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_campaignContentPieceId_fkey" FOREIGN KEY ("campaignContentPieceId") REFERENCES "CampaignContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_experimentVariantId_fkey" FOREIGN KEY ("experimentVariantId") REFERENCES "PerformanceExperimentVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_evidenceFileAssetId_fkey" FOREIGN KEY ("evidenceFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRecord" ADD CONSTRAINT "PerformanceMetricRecord_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PerformanceImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRevision" ADD CONSTRAINT "PerformanceMetricRevision_metricRecordId_fkey" FOREIGN KEY ("metricRecordId") REFERENCES "PerformanceMetricRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceMetricRevision" ADD CONSTRAINT "PerformanceMetricRevision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceImport" ADD CONSTRAINT "PerformanceImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceImport" ADD CONSTRAINT "PerformanceImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceImport" ADD CONSTRAINT "PerformanceImport_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceImportRow" ADD CONSTRAINT "PerformanceImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PerformanceImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceImportRow" ADD CONSTRAINT "PerformanceImportRow_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "PerformanceImportRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceImportRow" ADD CONSTRAINT "PerformanceImportRow_metricRecordId_fkey" FOREIGN KEY ("metricRecordId") REFERENCES "PerformanceMetricRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceGoal" ADD CONSTRAINT "PerformanceGoal_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceBenchmark" ADD CONSTRAINT "PerformanceBenchmark_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceBenchmark" ADD CONSTRAINT "PerformanceBenchmark_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceBenchmark" ADD CONSTRAINT "PerformanceBenchmark_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperiment" ADD CONSTRAINT "PerformanceExperiment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperiment" ADD CONSTRAINT "PerformanceExperiment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperiment" ADD CONSTRAINT "PerformanceExperiment_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperiment" ADD CONSTRAINT "PerformanceExperiment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperiment" ADD CONSTRAINT "PerformanceExperiment_winnerVariantId_fkey" FOREIGN KEY ("winnerVariantId") REFERENCES "PerformanceExperimentVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperimentVariant" ADD CONSTRAINT "PerformanceExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "PerformanceExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperimentVariant" ADD CONSTRAINT "PerformanceExperimentVariant_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperimentVariant" ADD CONSTRAINT "PerformanceExperimentVariant_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperimentVariant" ADD CONSTRAINT "PerformanceExperimentVariant_createdByAgentRunId_fkey" FOREIGN KEY ("createdByAgentRunId") REFERENCES "AiAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperimentVariant" ADD CONSTRAINT "PerformanceExperimentVariant_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperimentMetric" ADD CONSTRAINT "PerformanceExperimentMetric_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "PerformanceExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceExperimentMetric" ADD CONSTRAINT "PerformanceExperimentMetric_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "PerformanceExperimentVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendation" ADD CONSTRAINT "PerformanceRecommendation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendation" ADD CONSTRAINT "PerformanceRecommendation_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendation" ADD CONSTRAINT "PerformanceRecommendation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendation" ADD CONSTRAINT "PerformanceRecommendation_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendation" ADD CONSTRAINT "PerformanceRecommendation_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "PerformanceExperiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendation" ADD CONSTRAINT "PerformanceRecommendation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "PerformanceRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AiAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_workflowAutomationId_fkey" FOREIGN KEY ("workflowAutomationId") REFERENCES "WorkflowAutomation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "PerformanceExperiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_campaignContentPieceId_fkey" FOREIGN KEY ("campaignContentPieceId") REFERENCES "CampaignContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_knowledgeQueryId_fkey" FOREIGN KEY ("knowledgeQueryId") REFERENCES "KnowledgeQuery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecommendationAction" ADD CONSTRAINT "PerformanceRecommendationAction_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceAnomaly" ADD CONSTRAINT "PerformanceAnomaly_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceAnomaly" ADD CONSTRAINT "PerformanceAnomaly_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceAnomaly" ADD CONSTRAINT "PerformanceAnomaly_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceAnomaly" ADD CONSTRAINT "PerformanceAnomaly_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceAnomaly" ADD CONSTRAINT "PerformanceAnomaly_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReport" ADD CONSTRAINT "PerformanceReport_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReportResource" ADD CONSTRAINT "PerformanceReportResource_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "PerformanceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReportResource" ADD CONSTRAINT "PerformanceReportResource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReportResource" ADD CONSTRAINT "PerformanceReportResource_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReportResource" ADD CONSTRAINT "PerformanceReportResource_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReportResource" ADD CONSTRAINT "PerformanceReportResource_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "PerformanceExperiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


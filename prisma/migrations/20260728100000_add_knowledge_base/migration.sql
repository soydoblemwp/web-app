-- CreateEnum
CREATE TYPE "KnowledgeCollectionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeSourceOriginType" AS ENUM ('PASTED_TEXT', 'FILE', 'CONTENT_ITEM', 'CAMPAIGN', 'CAMPAIGN_STRATEGY', 'CAMPAIGN_CONTENT_PIECE', 'SOCIAL_POST', 'SAVED_PROMPT', 'NOTE');

-- CreateEnum
CREATE TYPE "KnowledgeSourceFormat" AS ENUM ('TEXT', 'MARKDOWN', 'CSV', 'JSON', 'PDF', 'DOCX', 'HTML');

-- CreateEnum
CREATE TYPE "KnowledgeSourceStatus" AS ENUM ('DRAFT', 'QUEUED', 'EXTRACTING', 'NORMALIZING', 'CHUNKING', 'INDEXING', 'READY', 'PARTIALLY_READY', 'FAILED', 'NEEDS_OCR', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeSourceSyncMode" AS ENUM ('MANUAL', 'ON_SAVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "KnowledgeExtractionQuality" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "KnowledgeChunkStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KnowledgeProcessingStage" AS ENUM ('REGISTER', 'EXTRACT', 'NORMALIZE', 'CHUNK', 'INDEX', 'FINALIZE');

-- CreateEnum
CREATE TYPE "KnowledgeProcessingAttemptStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeErrorCategory" AS ENUM ('VALIDATION', 'PERMISSION', 'EXTRACTION', 'NORMALIZATION', 'CHUNKING', 'INDEXING', 'SEARCH', 'CONFLICT', 'AI', 'INTERNAL_SAFE');

-- CreateEnum
CREATE TYPE "KnowledgeQueryMode" AS ENUM ('SOURCES_ONLY', 'SOURCES_PLUS_GENERAL');

-- CreateEnum
CREATE TYPE "KnowledgeQueryStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeCitationType" AS ENUM ('DIRECT', 'CONTEXTUAL');

-- CreateTable
CREATE TABLE "KnowledgeCollection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'Folder',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "status" "KnowledgeCollectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCollectionSource" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeCollectionSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originType" "KnowledgeSourceOriginType" NOT NULL,
    "format" "KnowledgeSourceFormat" NOT NULL,
    "fileAssetId" TEXT,
    "contentItemId" TEXT,
    "campaignId" TEXT,
    "campaignStrategyId" TEXT,
    "campaignContentPieceId" TEXT,
    "socialPostId" TEXT,
    "savedPromptId" TEXT,
    "status" "KnowledgeSourceStatus" NOT NULL DEFAULT 'DRAFT',
    "syncMode" "KnowledgeSourceSyncMode" NOT NULL DEFAULT 'MANUAL',
    "activeVersionId" TEXT,
    "language" TEXT,
    "lastErrorMessage" TEXT,
    "lastErrorCategory" "KnowledgeErrorCategory",
    "sensitiveWarning" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSourceVersion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "KnowledgeSourceStatus" NOT NULL DEFAULT 'QUEUED',
    "title" TEXT,
    "author" TEXT,
    "detectedLanguage" TEXT,
    "rawText" TEXT,
    "normalizedText" TEXT,
    "checksumRaw" TEXT NOT NULL,
    "checksumNormalized" TEXT,
    "extractionMethod" TEXT,
    "extractionQuality" "KnowledgeExtractionQuality",
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pageCount" INTEGER,
    "sectionCount" INTEGER,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "executionToken" TEXT,
    "currentStage" "KnowledgeProcessingStage",
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorMessage" TEXT,
    "lastErrorCategory" "KnowledgeErrorCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSourceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- searchVector is a Postgres GENERATED ALWAYS AS ... STORED column (real
-- built-in full-text search, no extension required) — Prisma models it as
-- Unsupported("tsvector") and never writes to it; only Postgres itself does.
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "title" TEXT,
    "heading" TEXT,
    "page" INTEGER,
    "section" TEXT,
    "rowIndex" INTEGER,
    "jsonPath" TEXT,
    "locationLabel" TEXT,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "checksum" TEXT NOT NULL,
    "sizeChars" INTEGER NOT NULL,
    "tokenEstimate" INTEGER NOT NULL,
    "status" "KnowledgeChunkStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('spanish', "text")) STORED,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeQuery" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "askedById" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "mode" "KnowledgeQueryMode" NOT NULL DEFAULT 'SOURCES_ONLY',
    "collectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brandProfileId" TEXT,
    "language" TEXT,
    "maxSources" INTEGER,
    "status" "KnowledgeQueryStatus" NOT NULL DEFAULT 'PENDING',
    "executionToken" TEXT,
    "answer" TEXT,
    "supportedFacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingInfo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generalKnowledgeUsed" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "errorCategory" "KnowledgeErrorCategory",
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeQueryResult" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "chunkId" TEXT,
    "sourceId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "snippet" TEXT NOT NULL,

    CONSTRAINT "KnowledgeQueryResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCitation" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "chunkId" TEXT,
    "sourceId" TEXT,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "citationType" "KnowledgeCitationType" NOT NULL DEFAULT 'CONTEXTUAL',
    "quoteSnapshot" TEXT NOT NULL,
    "sourceTitleSnapshot" TEXT NOT NULL,
    "locationLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentKnowledgeCitation" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "chunkId" TEXT,
    "sourceId" TEXT,
    "insertedById" TEXT NOT NULL,
    "citationType" "KnowledgeCitationType" NOT NULL DEFAULT 'DIRECT',
    "quoteSnapshot" TEXT NOT NULL,
    "sourceTitleSnapshot" TEXT NOT NULL,
    "locationLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentKnowledgeCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeProcessingAttempt" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stage" "KnowledgeProcessingStage" NOT NULL,
    "status" "KnowledgeProcessingAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "executionToken" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "errorMessage" TEXT,
    "errorCategory" "KnowledgeErrorCategory",
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeProcessingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeCollection_projectId_status_idx" ON "KnowledgeCollection"("projectId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeCollectionSource_sourceId_idx" ON "KnowledgeCollectionSource"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCollectionSource_collectionId_sourceId_key" ON "KnowledgeCollectionSource"("collectionId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSource_activeVersionId_key" ON "KnowledgeSource"("activeVersionId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_projectId_status_idx" ON "KnowledgeSource"("projectId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeSource_projectId_isArchived_idx" ON "KnowledgeSource"("projectId", "isArchived");

-- CreateIndex
CREATE INDEX "KnowledgeSource_fileAssetId_idx" ON "KnowledgeSource"("fileAssetId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_contentItemId_idx" ON "KnowledgeSource"("contentItemId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_campaignId_idx" ON "KnowledgeSource"("campaignId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_campaignStrategyId_idx" ON "KnowledgeSource"("campaignStrategyId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_campaignContentPieceId_idx" ON "KnowledgeSource"("campaignContentPieceId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_socialPostId_idx" ON "KnowledgeSource"("socialPostId");

-- CreateIndex
CREATE INDEX "KnowledgeSource_savedPromptId_idx" ON "KnowledgeSource"("savedPromptId");

-- CreateIndex
CREATE INDEX "KnowledgeSourceVersion_sourceId_status_idx" ON "KnowledgeSourceVersion"("sourceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSourceVersion_sourceId_version_key" ON "KnowledgeSourceVersion"("sourceId", "version");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_sourceId_idx" ON "KnowledgeChunk"("sourceId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_versionId_status_idx" ON "KnowledgeChunk"("versionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_versionId_order_key" ON "KnowledgeChunk"("versionId", "order");

-- CreateIndex (GIN full-text index on the generated tsvector column — the real search index, section 15)
CREATE INDEX "KnowledgeChunk_searchVector_idx" ON "KnowledgeChunk" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "KnowledgeQuery_projectId_createdAt_idx" ON "KnowledgeQuery"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeQuery_projectId_askedById_idx" ON "KnowledgeQuery"("projectId", "askedById");

-- CreateIndex
CREATE INDEX "KnowledgeQueryResult_queryId_idx" ON "KnowledgeQueryResult"("queryId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeQueryResult_queryId_chunkId_key" ON "KnowledgeQueryResult"("queryId", "chunkId");

-- CreateIndex
CREATE INDEX "KnowledgeCitation_queryId_idx" ON "KnowledgeCitation"("queryId");

-- CreateIndex
CREATE INDEX "KnowledgeCitation_sourceId_idx" ON "KnowledgeCitation"("sourceId");

-- CreateIndex
CREATE INDEX "ContentKnowledgeCitation_contentItemId_idx" ON "ContentKnowledgeCitation"("contentItemId");

-- CreateIndex
CREATE INDEX "ContentKnowledgeCitation_sourceId_idx" ON "ContentKnowledgeCitation"("sourceId");

-- CreateIndex
CREATE INDEX "KnowledgeProcessingAttempt_versionId_stage_idx" ON "KnowledgeProcessingAttempt"("versionId", "stage");

-- CreateIndex
CREATE INDEX "KnowledgeProcessingAttempt_sourceId_idx" ON "KnowledgeProcessingAttempt"("sourceId");

-- AddForeignKey
ALTER TABLE "KnowledgeCollection" ADD CONSTRAINT "KnowledgeCollection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCollection" ADD CONSTRAINT "KnowledgeCollection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCollectionSource" ADD CONSTRAINT "KnowledgeCollectionSource_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "KnowledgeCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCollectionSource" ADD CONSTRAINT "KnowledgeCollectionSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCollectionSource" ADD CONSTRAINT "KnowledgeCollectionSource_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_campaignStrategyId_fkey" FOREIGN KEY ("campaignStrategyId") REFERENCES "CampaignStrategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_campaignContentPieceId_fkey" FOREIGN KEY ("campaignContentPieceId") REFERENCES "CampaignContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_savedPromptId_fkey" FOREIGN KEY ("savedPromptId") REFERENCES "SavedPrompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "KnowledgeSourceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSourceVersion" ADD CONSTRAINT "KnowledgeSourceVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "KnowledgeSourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeQuery" ADD CONSTRAINT "KnowledgeQuery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeQuery" ADD CONSTRAINT "KnowledgeQuery_askedById_fkey" FOREIGN KEY ("askedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeQuery" ADD CONSTRAINT "KnowledgeQuery_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeQueryResult" ADD CONSTRAINT "KnowledgeQueryResult_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "KnowledgeQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeQueryResult" ADD CONSTRAINT "KnowledgeQueryResult_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "KnowledgeChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCitation" ADD CONSTRAINT "KnowledgeCitation_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "KnowledgeQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCitation" ADD CONSTRAINT "KnowledgeCitation_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "KnowledgeChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCitation" ADD CONSTRAINT "KnowledgeCitation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentKnowledgeCitation" ADD CONSTRAINT "ContentKnowledgeCitation_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentKnowledgeCitation" ADD CONSTRAINT "ContentKnowledgeCitation_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "KnowledgeChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentKnowledgeCitation" ADD CONSTRAINT "ContentKnowledgeCitation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentKnowledgeCitation" ADD CONSTRAINT "ContentKnowledgeCitation_insertedById_fkey" FOREIGN KEY ("insertedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeProcessingAttempt" ADD CONSTRAINT "KnowledgeProcessingAttempt_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "KnowledgeSourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

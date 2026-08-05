-- AlterEnum: 3 new real channels that never become an OAuth-connected SocialPlatformConnection.
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'BLOG';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'EMAIL';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'NEWSLETTER';

-- AlterEnum: editorial-approval additions to the existing publish lifecycle.
ALTER TYPE "SocialPostStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED' AFTER 'APPROVED';
ALTER TYPE "SocialPostStatus" ADD VALUE IF NOT EXISTS 'PUBLISHING' AFTER 'SCHEDULED';
ALTER TYPE "SocialPostStatus" ADD VALUE IF NOT EXISTS 'CANCELLED' AFTER 'ARCHIVED';

-- CreateEnum
CREATE TYPE "PublicationAttemptStatus" AS ENUM ('WAITING', 'PROCESSING', 'PUBLISHED', 'TEMPORARY_ERROR', 'PERMANENT_ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PublicationApprovalAction" AS ENUM ('SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'SPECIFIC_DAYS', 'MONTHLY', 'CUSTOM_INTERVAL');

-- AlterTable: project-wide editorial policy.
ALTER TABLE "Project" ADD COLUMN     "requireApprovalBeforePublish" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowSelfApproval" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Publishing Hub fields on SocialPost — all nullable/defaulted, every existing row stays valid.
ALTER TABLE "SocialPost" ADD COLUMN     "format" TEXT,
ADD COLUMN     "firstComment" TEXT,
ADD COLUMN     "altText" TEXT,
ADD COLUMN     "priority" "CampaignPiecePriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "brandProfileId" TEXT,
ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "approverId" TEXT,
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "checklistState" JSONB,
ADD COLUMN     "sourcePieceId" TEXT,
ADD COLUMN     "templateSourceId" TEXT,
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "queuePosition" INTEGER,
ADD COLUMN     "isPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lastErrorProvider" TEXT,
ADD COLUMN     "lastErrorCode" TEXT,
ADD COLUMN     "lastErrorMessage" TEXT,
ADD COLUMN     "isRetryable" BOOLEAN;

-- AlterTable: media library fields on FileAsset.
ALTER TABLE "FileAsset" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "altText" TEXT,
ADD COLUMN     "widthPx" INTEGER,
ADD COLUMN     "heightPx" INTEGER,
ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rightsSource" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PublicationMedia" (
    "id" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "altTextOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationApprovalEvent" (
    "id" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "PublicationApprovalAction" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationAttempt" (
    "id" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "PublicationAttemptStatus" NOT NULL DEFAULT 'WAITING',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "isRetryable" BOOLEAN,
    "nextAttemptAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationSeries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "daysOfWeek" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "intervalDays" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "structure" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingChecklistTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "items" JSONB NOT NULL,
    "blocksPublish" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishingChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPost_sourcePieceId_idx" ON "SocialPost"("sourcePieceId");
CREATE INDEX "SocialPost_assigneeId_idx" ON "SocialPost"("assigneeId");
CREATE INDEX "SocialPost_approverId_idx" ON "SocialPost"("approverId");
CREATE INDEX "SocialPost_seriesId_idx" ON "SocialPost"("seriesId");
CREATE INDEX "SocialPost_projectId_queuePosition_idx" ON "SocialPost"("projectId", "queuePosition");

-- CreateIndex
CREATE INDEX "FileAsset_projectId_isArchived_idx" ON "FileAsset"("projectId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationMedia_socialPostId_fileAssetId_key" ON "PublicationMedia"("socialPostId", "fileAssetId");
CREATE INDEX "PublicationMedia_socialPostId_order_idx" ON "PublicationMedia"("socialPostId", "order");

-- CreateIndex
CREATE INDEX "PublicationApprovalEvent_socialPostId_createdAt_idx" ON "PublicationApprovalEvent"("socialPostId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicationAttempt_socialPostId_createdAt_idx" ON "PublicationAttempt"("socialPostId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicationSeries_projectId_idx" ON "PublicationSeries"("projectId");

-- CreateIndex
CREATE INDEX "PublicationTemplate_projectId_idx" ON "PublicationTemplate"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishingChecklistTemplate_projectId_platform_key" ON "PublishingChecklistTemplate"("projectId", "platform");

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_sourcePieceId_fkey" FOREIGN KEY ("sourcePieceId") REFERENCES "CampaignContentPiece"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "PublicationSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationMedia" ADD CONSTRAINT "PublicationMedia_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicationMedia" ADD CONSTRAINT "PublicationMedia_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationApprovalEvent" ADD CONSTRAINT "PublicationApprovalEvent_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicationApprovalEvent" ADD CONSTRAINT "PublicationApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationSeries" ADD CONSTRAINT "PublicationSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicationSeries" ADD CONSTRAINT "PublicationSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationTemplate" ADD CONSTRAINT "PublicationTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicationTemplate" ADD CONSTRAINT "PublicationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingChecklistTemplate" ADD CONSTRAINT "PublishingChecklistTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

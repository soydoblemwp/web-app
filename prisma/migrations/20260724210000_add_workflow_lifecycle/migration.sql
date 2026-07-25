
-- CreateEnum
CREATE TYPE "WorkflowLifecycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "activeRevisionId" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "draftHash" TEXT,
ADD COLUMN     "editVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "hasUnpublishedChanges" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastPublishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedHash" TEXT,
ADD COLUMN     "publishedVersion" INTEGER,
ADD COLUMN     "status" "WorkflowLifecycleStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "sourceDefinitionHash" TEXT,
ADD COLUMN     "workflowRevisionId" TEXT,
ALTER COLUMN "executionMode" SET DEFAULT 'PUBLISHED';

-- CreateTable
CREATE TABLE "WorkflowRevision" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definitionSnapshot" JSONB NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "changeSummary" JSONB,
    "releaseNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowRevision_workflowId_isActive_idx" ON "WorkflowRevision"("workflowId", "isActive");

-- CreateIndex
CREATE INDEX "WorkflowRevision_workflowId_createdAt_idx" ON "WorkflowRevision"("workflowId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRevision_workflowId_version_key" ON "WorkflowRevision"("workflowId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_activeRevisionId_key" ON "Workflow"("activeRevisionId");

-- CreateIndex
CREATE INDEX "Workflow_userId_status_idx" ON "Workflow"("userId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowRevisionId_idx" ON "WorkflowRun"("workflowRevisionId");

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "WorkflowRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRevision" ADD CONSTRAINT "WorkflowRevision_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRevision" ADD CONSTRAINT "WorkflowRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRevision" ADD CONSTRAINT "WorkflowRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowRevisionId_fkey" FOREIGN KEY ("workflowRevisionId") REFERENCES "WorkflowRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;


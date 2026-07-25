
-- AlterEnum
ALTER TYPE "WorkflowRunStatus" ADD VALUE 'INTERRUPTED';

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "executionMode" TEXT NOT NULL DEFAULT 'NEW',
ADD COLUMN     "interruptionReason" TEXT,
ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "leaseAcquiredAt" TIMESTAMP(3),
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "leaseId" TEXT,
ADD COLUMN     "leaseOwner" TEXT,
ADD COLUMN     "resumedAt" TIMESTAMP(3),
ADD COLUMN     "retryOfRunId" TEXT,
ADD COLUMN     "workflowSnapshot" JSONB,
ADD COLUMN     "workflowVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "WorkflowStepRun" ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "executionToken" TEXT,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "preparedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WorkflowRun_status_leaseExpiresAt_idx" ON "WorkflowRun"("status", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_retryOfRunId_fkey" FOREIGN KEY ("retryOfRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- AlterTable
ALTER TABLE "AIUsage" ADD COLUMN     "executionMode" TEXT,
ADD COLUMN     "toolSlug" TEXT,
ADD COLUMN     "workflowId" TEXT,
ADD COLUMN     "workflowRunId" TEXT,
ADD COLUMN     "workflowStepRunId" TEXT,
ADD COLUMN     "workflowVersion" INTEGER;

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "normalizedErrorCode" TEXT;

-- AlterTable
ALTER TABLE "WorkflowStepRun" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "normalizedErrorCode" TEXT;

-- CreateIndex
CREATE INDEX "AIUsage_workflowId_createdAt_idx" ON "AIUsage"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsage_workflowRunId_idx" ON "AIUsage"("workflowRunId");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_status_idx" ON "WorkflowRun"("workflowId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_workflowVersion_idx" ON "WorkflowRun"("workflowId", "workflowVersion");

-- CreateIndex
CREATE INDEX "WorkflowStepRun_workflowRunId_stepType_idx" ON "WorkflowStepRun"("workflowRunId", "stepType");

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_workflowStepRunId_fkey" FOREIGN KEY ("workflowStepRunId") REFERENCES "WorkflowStepRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "parentRunId" TEXT,
ADD COLUMN     "parentStepRunId" TEXT,
ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WorkflowDependency" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "childWorkflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_parentStepRunId_key" ON "WorkflowRun"("parentStepRunId");

-- CreateIndex
CREATE INDEX "WorkflowRun_parentRunId_idx" ON "WorkflowRun"("parentRunId");

-- CreateIndex
CREATE INDEX "WorkflowDependency_workflowId_idx" ON "WorkflowDependency"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowDependency_childWorkflowId_idx" ON "WorkflowDependency"("childWorkflowId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDependency_workflowId_childWorkflowId_key" ON "WorkflowDependency"("workflowId", "childWorkflowId");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_parentStepRunId_fkey" FOREIGN KEY ("parentStepRunId") REFERENCES "WorkflowStepRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDependency" ADD CONSTRAINT "WorkflowDependency_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDependency" ADD CONSTRAINT "WorkflowDependency_childWorkflowId_fkey" FOREIGN KEY ("childWorkflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('PENDING', 'VALIDATING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowStepRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "stopOnError" BOOLEAN NOT NULL DEFAULT true,
    "inputVariables" JSONB NOT NULL,
    "finalOutput" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepRun" (
    "id" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "outputVariable" TEXT NOT NULL,
    "status" "WorkflowStepRunStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedInput" TEXT,
    "output" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_createdAt_idx" ON "WorkflowRun"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_userId_createdAt_idx" ON "WorkflowRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_userId_status_idx" ON "WorkflowRun"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_userId_idempotencyKey_key" ON "WorkflowRun"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkflowStepRun_workflowRunId_stepIndex_idx" ON "WorkflowStepRun"("workflowRunId", "stepIndex");

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;


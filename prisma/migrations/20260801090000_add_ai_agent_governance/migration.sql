-- CreateEnum
CREATE TYPE "GovernanceDecision" AS ENUM ('ALLOW', 'DENY', 'REQUIRE_APPROVAL');

-- CreateEnum
CREATE TYPE "GovernanceRiskLevel" AS ENUM ('READ_ONLY', 'DRAFT_WRITE', 'INTERNAL_MUTATION', 'EXTERNAL_SIDE_EFFECT');

-- CreateEnum
CREATE TYPE "AiAgentPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AiAgentPolicyRuleScope" AS ENUM ('AGENT', 'MODE');

-- CreateEnum
CREATE TYPE "AiAgentBudgetScope" AS ENUM ('PROJECT', 'AGENT');

-- CreateEnum
CREATE TYPE "AiAgentBudgetMetric" AS ENUM ('RUNS', 'AI_STEPS', 'RETRIES', 'EXECUTION_SECONDS', 'CONTEXT_CHARS', 'OUTPUT_CHARS');

-- CreateEnum
CREATE TYPE "AiAgentBudgetWindow" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AiAgentBudgetOnExhausted" AS ENUM ('DENY', 'REQUIRE_APPROVAL');

-- CreateEnum
CREATE TYPE "AiAgentGovernanceApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AiAgentPolicy" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AiAgentPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "comment" TEXT,
    "maxRiskLevel" "GovernanceRiskLevel" NOT NULL DEFAULT 'DRAFT_WRITE',
    "requireApprovalAtOrAboveRisk" "GovernanceRiskLevel",
    "maxRunsPerDay" INTEGER,
    "maxRunsPerMonth" INTEGER,
    "maxConcurrentRunsPerProject" INTEGER NOT NULL DEFAULT 5,
    "maxConcurrentRunsPerAgent" INTEGER NOT NULL DEFAULT 2,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "maxDurationSeconds" INTEGER,
    "maxSteps" INTEGER,
    "maxContextChars" INTEGER,
    "maxOutputChars" INTEGER,
    "onBudgetExhausted" "AiAgentBudgetOnExhausted" NOT NULL DEFAULT 'DENY',
    "disabledAgentRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentPolicyRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "scope" "AiAgentPolicyRuleScope" NOT NULL,
    "agentRef" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN,
    "riskOverride" "GovernanceRiskLevel",
    "requireApproval" BOOLEAN,
    "maxRunsPerDay" INTEGER,
    "maxConcurrent" INTEGER,
    "maxRetries" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentPolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentProjectGovernanceState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectPaused" BOOLEAN NOT NULL DEFAULT false,
    "projectPausedAt" TIMESTAMP(3),
    "projectPausedById" TEXT,
    "emergencyStopEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emergencyStopEnabledAt" TIMESTAMP(3),
    "emergencyStopEnabledById" TEXT,
    "pausedAgentRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentProjectGovernanceState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentBudgetUsage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scope" "AiAgentBudgetScope" NOT NULL,
    "agentRef" TEXT NOT NULL DEFAULT '',
    "metric" "AiAgentBudgetMetric" NOT NULL,
    "window" "AiAgentBudgetWindow" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentBudgetUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentGovernanceApproval" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "agentRef" TEXT NOT NULL,
    "mode" TEXT,
    "riskLevel" "GovernanceRiskLevel" NOT NULL,
    "sanitizedInput" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "status" "AiAgentGovernanceApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdRunId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentGovernanceApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentRunGovernanceSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "decision" "GovernanceDecision" NOT NULL,
    "code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "policyId" TEXT,
    "policyVersion" INTEGER,
    "riskLevel" "GovernanceRiskLevel" NOT NULL,
    "rulesEvaluated" JSONB NOT NULL,
    "effectiveLimits" JSONB NOT NULL,
    "budgetSnapshot" JSONB NOT NULL,
    "concurrencyObserved" INTEGER NOT NULL,
    "approvalId" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentRunGovernanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiAgentPolicy_projectId_status_idx" ON "AiAgentPolicy"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentPolicy_projectId_version_key" ON "AiAgentPolicy"("projectId", "version");

-- A project can never have two simultaneously ACTIVE policies (spec sections 10/34) — a partial unique
-- index is the only way Postgres can enforce this atomically; Prisma's schema DSL can't express a
-- WHERE-scoped unique constraint, so it lives only here, applied directly via raw SQL.
CREATE UNIQUE INDEX "AiAgentPolicy_project_active_unique" ON "AiAgentPolicy"("projectId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "AiAgentPolicyRule_policyId_idx" ON "AiAgentPolicyRule"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentPolicyRule_policyId_scope_agentRef_mode_key" ON "AiAgentPolicyRule"("policyId", "scope", "agentRef", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentProjectGovernanceState_projectId_key" ON "AiAgentProjectGovernanceState"("projectId");

-- CreateIndex
CREATE INDEX "AiAgentBudgetUsage_projectId_window_periodStart_idx" ON "AiAgentBudgetUsage"("projectId", "window", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentBudgetUsage_projectId_scope_agentRef_metric_window_p_key" ON "AiAgentBudgetUsage"("projectId", "scope", "agentRef", "metric", "window", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentGovernanceApproval_createdRunId_key" ON "AiAgentGovernanceApproval"("createdRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentGovernanceApproval_idempotencyKey_key" ON "AiAgentGovernanceApproval"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AiAgentGovernanceApproval_projectId_status_idx" ON "AiAgentGovernanceApproval"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentRunGovernanceSnapshot_runId_key" ON "AiAgentRunGovernanceSnapshot"("runId");

-- CreateIndex
CREATE INDEX "AiAgentRunGovernanceSnapshot_projectId_decision_idx" ON "AiAgentRunGovernanceSnapshot"("projectId", "decision");

-- AddForeignKey
ALTER TABLE "AiAgentPolicy" ADD CONSTRAINT "AiAgentPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicy" ADD CONSTRAINT "AiAgentPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyRule" ADD CONSTRAINT "AiAgentPolicyRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AiAgentPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentProjectGovernanceState" ADD CONSTRAINT "AiAgentProjectGovernanceState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentProjectGovernanceState" ADD CONSTRAINT "AiAgentProjectGovernanceState_projectPausedById_fkey" FOREIGN KEY ("projectPausedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentProjectGovernanceState" ADD CONSTRAINT "AiAgentProjectGovernanceState_emergencyStopEnabledById_fkey" FOREIGN KEY ("emergencyStopEnabledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentBudgetUsage" ADD CONSTRAINT "AiAgentBudgetUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentGovernanceApproval" ADD CONSTRAINT "AiAgentGovernanceApproval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentGovernanceApproval" ADD CONSTRAINT "AiAgentGovernanceApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentGovernanceApproval" ADD CONSTRAINT "AiAgentGovernanceApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentGovernanceApproval" ADD CONSTRAINT "AiAgentGovernanceApproval_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AiAgentPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentGovernanceApproval" ADD CONSTRAINT "AiAgentGovernanceApproval_createdRunId_fkey" FOREIGN KEY ("createdRunId") REFERENCES "AiAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRunGovernanceSnapshot" ADD CONSTRAINT "AiAgentRunGovernanceSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiAgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRunGovernanceSnapshot" ADD CONSTRAINT "AiAgentRunGovernanceSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRunGovernanceSnapshot" ADD CONSTRAINT "AiAgentRunGovernanceSnapshot_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AiAgentPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentRunGovernanceSnapshot" ADD CONSTRAINT "AiAgentRunGovernanceSnapshot_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "AiAgentGovernanceApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

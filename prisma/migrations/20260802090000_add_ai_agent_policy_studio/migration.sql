-- Fase 38: AI Agent Policy Studio, Rule Matrix, Staged Rollouts & Compliance Assurance
-- Additive only. No DROP TABLE, no TRUNCATE, no data loss.
--
-- NOTE: `prisma migrate diff` against the live database also reported 3 lines
-- of pre-existing drift unrelated to this phase's schema changes (same drift
-- already documented in the Fase 37 migration): a DROP INDEX on
-- "KnowledgeChunk_searchVector_idx" and two "ALTER TABLE ... DROP DEFAULT"
-- statements on FileAsset.updatedAt / KnowledgeChunk.searchVector. Those are
-- intentionally NOT included below — they do not correspond to anything in
-- this phase's schema.prisma changes and were confirmed spurious drift when
-- Fase 37's migration was authored.

-- CreateEnum
CREATE TYPE "AiAgentUnknownAgentBehavior" AS ENUM ('ALLOW_DEFAULT', 'REQUIRE_APPROVAL', 'DENY');

-- CreateEnum
CREATE TYPE "AiAgentRolloutStage" AS ENUM ('SHADOW', 'LIMITED', 'PROMOTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AiAgentPolicyChangeApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "AiAgentPolicy" ADD COLUMN     "basedOnPolicyId" TEXT,
ADD COLUMN     "unknownAgentBehavior" "AiAgentUnknownAgentBehavior" NOT NULL DEFAULT 'ALLOW_DEFAULT';

-- AlterTable
ALTER TABLE "AiAgentPolicyRule" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AiAgentPolicyRollout" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "AiAgentRolloutStage" NOT NULL DEFAULT 'SHADOW',
    "scopeAgentRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopeModes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "percentage" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shadowEvaluationCount" INTEGER NOT NULL DEFAULT 0,
    "shadowDifferenceCount" INTEGER NOT NULL DEFAULT 0,
    "promotedById" TEXT,
    "promotedAt" TIMESTAMP(3),
    "retiredById" TEXT,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "AiAgentPolicyRollout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentPolicyShadowEvaluation" (
    "id" TEXT NOT NULL,
    "rolloutId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "agentRef" TEXT NOT NULL,
    "mode" TEXT,
    "activeDecision" "GovernanceDecision" NOT NULL,
    "shadowDecision" "GovernanceDecision" NOT NULL,
    "activeCode" TEXT NOT NULL,
    "shadowCode" TEXT NOT NULL,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentPolicyShadowEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentPolicyChangeApproval" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "sensitiveChanges" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AiAgentPolicyChangeApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgentPolicyChangeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentPolicyRollout_policyId_key" ON "AiAgentPolicyRollout"("policyId");

-- CreateIndex
CREATE INDEX "AiAgentPolicyRollout_projectId_stage_idx" ON "AiAgentPolicyRollout"("projectId", "stage");

-- CreateIndex
CREATE INDEX "AiAgentPolicyShadowEvaluation_rolloutId_createdAt_idx" ON "AiAgentPolicyShadowEvaluation"("rolloutId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentPolicyChangeApproval_idempotencyKey_key" ON "AiAgentPolicyChangeApproval"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AiAgentPolicyChangeApproval_projectId_status_idx" ON "AiAgentPolicyChangeApproval"("projectId", "status");

-- AddForeignKey
ALTER TABLE "AiAgentPolicy" ADD CONSTRAINT "AiAgentPolicy_basedOnPolicyId_fkey" FOREIGN KEY ("basedOnPolicyId") REFERENCES "AiAgentPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyRollout" ADD CONSTRAINT "AiAgentPolicyRollout_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AiAgentPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyRollout" ADD CONSTRAINT "AiAgentPolicyRollout_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyRollout" ADD CONSTRAINT "AiAgentPolicyRollout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyRollout" ADD CONSTRAINT "AiAgentPolicyRollout_promotedById_fkey" FOREIGN KEY ("promotedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyRollout" ADD CONSTRAINT "AiAgentPolicyRollout_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyShadowEvaluation" ADD CONSTRAINT "AiAgentPolicyShadowEvaluation_rolloutId_fkey" FOREIGN KEY ("rolloutId") REFERENCES "AiAgentPolicyRollout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyShadowEvaluation" ADD CONSTRAINT "AiAgentPolicyShadowEvaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyChangeApproval" ADD CONSTRAINT "AiAgentPolicyChangeApproval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyChangeApproval" ADD CONSTRAINT "AiAgentPolicyChangeApproval_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AiAgentPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyChangeApproval" ADD CONSTRAINT "AiAgentPolicyChangeApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentPolicyChangeApproval" ADD CONSTRAINT "AiAgentPolicyChangeApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

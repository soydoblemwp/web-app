-- CreateEnum
CREATE TYPE "WorkflowAutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'ERROR');

-- CreateEnum
CREATE TYPE "WorkflowAutomationTriggerType" AS ENUM ('MANUAL', 'SCHEDULE_ONCE', 'SCHEDULE_RECURRING', 'INTERNAL_EVENT', 'WEBHOOK', 'WORKFLOW_COMPLETED', 'AGENT_RUN_COMPLETED', 'MARKETING_BRAIN_COMPLETED', 'KNOWLEDGE_SOURCE_READY', 'CONTENT_STATUS_CHANGED', 'CAMPAIGN_DATE_REACHED', 'SOCIAL_POST_STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "WorkflowAutomationTriggerStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "WorkflowAutomationErrorPolicy" AS ENUM ('STOP', 'RETRY', 'CONTINUE', 'WAIT_FOR_REVIEW');

-- CreateEnum
CREATE TYPE "WorkflowAutomationRunStatus" AS ENUM ('QUEUED', 'WAITING_FOR_SCHEDULE', 'WAITING_FOR_CONDITION', 'WAITING_FOR_APPROVAL', 'RUNNING', 'RETRY_SCHEDULED', 'PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'SKIPPED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowAutomationRunAttemptStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowAutomationApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowAutomationWaitKind" AS ENUM ('DURATION', 'UNTIL_DATE', 'APPROVAL', 'EVENT', 'CONDITION');

-- CreateEnum
CREATE TYPE "WorkflowAutomationWaitStatus" AS ENUM ('PENDING', 'SATISFIED', 'TIMED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowAutomationConditionOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'IS_EMPTY', 'IS_NOT_EMPTY', 'IN', 'NOT_IN', 'CHANGED_FROM', 'CHANGED_TO', 'EXISTS', 'NOT_EXISTS');

-- CreateEnum
CREATE TYPE "WorkflowAutomationConditionGroupOperator" AS ENUM ('AND', 'OR');

-- CreateEnum
CREATE TYPE "WorkflowAutomationEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'PARTIALLY_PROCESSED', 'FAILED', 'IGNORED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowAutomationEventDeliveryStatus" AS ENUM ('PENDING', 'MATCHED', 'SKIPPED_CONDITION', 'SKIPPED_LOOP', 'CREATED_RUN', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowAutomationWebhookDeliveryStatus" AS ENUM ('RECEIVED', 'REJECTED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "WorkflowAutomationScheduleExceptionAction" AS ENUM ('SKIP', 'RESCHEDULE');

-- CreateTable
CREATE TABLE "WorkflowAutomation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowAutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "workflowId" TEXT NOT NULL,
    "pinnedWorkflowRevisionId" TEXT,
    "errorPolicy" "WorkflowAutomationErrorPolicy" NOT NULL DEFAULT 'STOP',
    "maxRetryAttempts" INTEGER NOT NULL DEFAULT 3,
    "retryBaseDelayMs" INTEGER NOT NULL DEFAULT 60000,
    "retryDelayMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "retryMaxDelayMs" INTEGER NOT NULL DEFAULT 3600000,
    "executionTimeoutMs" INTEGER,
    "approvalTimeoutMs" INTEGER,
    "waitTimeoutMs" INTEGER,
    "requireApprovalBeforeStart" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnCompletion" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "consecutiveFailureCount" INTEGER NOT NULL DEFAULT 0,
    "pausedReason" TEXT,
    "pausedAt" TIMESTAMP(3),
    "pausedBySystem" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationTrigger" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "type" "WorkflowAutomationTriggerType" NOT NULL,
    "status" "WorkflowAutomationTriggerStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL,
    "webhookPublicId" TEXT,
    "webhookSecretEncrypted" TEXT,
    "webhookReceivedCount" INTEGER NOT NULL DEFAULT 0,
    "webhookLastReceivedAt" TIMESTAMP(3),
    "lastFiredAt" TIMESTAMP(3),
    "nextFiredAt" TIMESTAMP(3),
    "firedCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowAutomationTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationConditionGroup" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "parentGroupId" TEXT,
    "operator" "WorkflowAutomationConditionGroupOperator" NOT NULL DEFAULT 'AND',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAutomationConditionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationCondition" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" "WorkflowAutomationConditionOperator" NOT NULL,
    "value" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAutomationCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationInputMapping" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "targetVariable" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceExpression" TEXT NOT NULL,
    "transform" TEXT,
    "defaultValue" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAutomationInputMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workflowRunId" TEXT,
    "triggerType" "WorkflowAutomationTriggerType" NOT NULL,
    "eventId" TEXT,
    "createdById" TEXT,
    "status" "WorkflowAutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "nextRetryAt" TIMESTAMP(3),
    "inputs" JSONB NOT NULL,
    "triggerSnapshot" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "causationId" TEXT,
    "correlationId" TEXT NOT NULL,
    "chainDepth" INTEGER NOT NULL DEFAULT 0,
    "lastErrorMessage" TEXT,
    "lastErrorCategory" TEXT,
    "executionToken" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationRunAttempt" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "WorkflowAutomationRunAttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "errorCategory" TEXT,

    CONSTRAINT "WorkflowAutomationRunAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationApproval" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepLabel" TEXT,
    "requiredUserId" TEXT,
    "status" "WorkflowAutomationApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowAutomationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationWait" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "WorkflowAutomationWaitKind" NOT NULL,
    "wakeAt" TIMESTAMP(3),
    "condition" JSONB,
    "eventKey" TEXT,
    "timeoutAt" TIMESTAMP(3),
    "status" "WorkflowAutomationWaitStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowAutomationWait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationScheduleException" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "occurrenceAt" TIMESTAMP(3) NOT NULL,
    "action" "WorkflowAutomationScheduleExceptionAction" NOT NULL,
    "rescheduledTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAutomationScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationWebhookDelivery" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "status" "WorkflowAutomationWebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "bodySizeBytes" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "eventId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAutomationWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "WorkflowAutomationEventStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "causationId" TEXT,
    "correlationId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAutomationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationEventDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "status" "WorkflowAutomationEventDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "automationRunId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAutomationEventDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowAutomationNotificationState" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "runId" TEXT,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowAutomationNotificationState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowAutomation_projectId_status_idx" ON "WorkflowAutomation"("projectId", "status");

-- CreateIndex
CREATE INDEX "WorkflowAutomation_workflowId_idx" ON "WorkflowAutomation"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowAutomation_status_nextRunAt_idx" ON "WorkflowAutomation"("status", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationTrigger_automationId_key" ON "WorkflowAutomationTrigger"("automationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationTrigger_webhookPublicId_key" ON "WorkflowAutomationTrigger"("webhookPublicId");

-- CreateIndex
CREATE INDEX "WorkflowAutomationTrigger_type_status_nextFiredAt_idx" ON "WorkflowAutomationTrigger"("type", "status", "nextFiredAt");

-- CreateIndex
CREATE INDEX "WorkflowAutomationConditionGroup_automationId_idx" ON "WorkflowAutomationConditionGroup"("automationId");

-- CreateIndex
CREATE INDEX "WorkflowAutomationConditionGroup_parentGroupId_idx" ON "WorkflowAutomationConditionGroup"("parentGroupId");

-- CreateIndex
CREATE INDEX "WorkflowAutomationCondition_groupId_idx" ON "WorkflowAutomationCondition"("groupId");

-- CreateIndex
CREATE INDEX "WorkflowAutomationInputMapping_automationId_idx" ON "WorkflowAutomationInputMapping"("automationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationInputMapping_automationId_targetVariable_key" ON "WorkflowAutomationInputMapping"("automationId", "targetVariable");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationRun_workflowRunId_key" ON "WorkflowAutomationRun"("workflowRunId");

-- CreateIndex
CREATE INDEX "WorkflowAutomationRun_projectId_status_idx" ON "WorkflowAutomationRun"("projectId", "status");

-- CreateIndex
CREATE INDEX "WorkflowAutomationRun_automationId_status_idx" ON "WorkflowAutomationRun"("automationId", "status");

-- CreateIndex
CREATE INDEX "WorkflowAutomationRun_status_nextRetryAt_idx" ON "WorkflowAutomationRun"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "WorkflowAutomationRun_status_lockExpiresAt_idx" ON "WorkflowAutomationRun"("status", "lockExpiresAt");

-- CreateIndex
CREATE INDEX "WorkflowAutomationRun_correlationId_idx" ON "WorkflowAutomationRun"("correlationId");

-- CreateIndex
CREATE INDEX "WorkflowAutomationRun_eventId_idx" ON "WorkflowAutomationRun"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationRun_automationId_idempotencyKey_key" ON "WorkflowAutomationRun"("automationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkflowAutomationRunAttempt_runId_idx" ON "WorkflowAutomationRunAttempt"("runId");

-- CreateIndex
CREATE INDEX "WorkflowAutomationApproval_runId_status_idx" ON "WorkflowAutomationApproval"("runId", "status");

-- CreateIndex
CREATE INDEX "WorkflowAutomationWait_status_wakeAt_idx" ON "WorkflowAutomationWait"("status", "wakeAt");

-- CreateIndex
CREATE INDEX "WorkflowAutomationWait_runId_idx" ON "WorkflowAutomationWait"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationScheduleException_automationId_occurrence_key" ON "WorkflowAutomationScheduleException"("automationId", "occurrenceAt");

-- CreateIndex
CREATE INDEX "WorkflowAutomationWebhookDelivery_automationId_receivedAt_idx" ON "WorkflowAutomationWebhookDelivery"("automationId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationWebhookDelivery_automationId_deliveryId_key" ON "WorkflowAutomationWebhookDelivery"("automationId", "deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationEvent_idempotencyKey_key" ON "WorkflowAutomationEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkflowAutomationEvent_projectId_status_idx" ON "WorkflowAutomationEvent"("projectId", "status");

-- CreateIndex
CREATE INDEX "WorkflowAutomationEvent_status_lockExpiresAt_idx" ON "WorkflowAutomationEvent"("status", "lockExpiresAt");

-- CreateIndex
CREATE INDEX "WorkflowAutomationEvent_projectId_type_occurredAt_idx" ON "WorkflowAutomationEvent"("projectId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkflowAutomationEventDelivery_automationId_idx" ON "WorkflowAutomationEventDelivery"("automationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationEventDelivery_eventId_automationId_key" ON "WorkflowAutomationEventDelivery"("eventId", "automationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowAutomationNotificationState_dedupeKey_key" ON "WorkflowAutomationNotificationState"("dedupeKey");

-- CreateIndex
CREATE INDEX "WorkflowAutomationNotificationState_automationId_idx" ON "WorkflowAutomationNotificationState"("automationId");

-- AddForeignKey
ALTER TABLE "WorkflowAutomation" ADD CONSTRAINT "WorkflowAutomation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomation" ADD CONSTRAINT "WorkflowAutomation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomation" ADD CONSTRAINT "WorkflowAutomation_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomation" ADD CONSTRAINT "WorkflowAutomation_pinnedWorkflowRevisionId_fkey" FOREIGN KEY ("pinnedWorkflowRevisionId") REFERENCES "WorkflowRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationTrigger" ADD CONSTRAINT "WorkflowAutomationTrigger_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WorkflowAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationConditionGroup" ADD CONSTRAINT "WorkflowAutomationConditionGroup_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WorkflowAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationConditionGroup" ADD CONSTRAINT "WorkflowAutomationConditionGroup_parentGroupId_fkey" FOREIGN KEY ("parentGroupId") REFERENCES "WorkflowAutomationConditionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationCondition" ADD CONSTRAINT "WorkflowAutomationCondition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkflowAutomationConditionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationInputMapping" ADD CONSTRAINT "WorkflowAutomationInputMapping_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WorkflowAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationRun" ADD CONSTRAINT "WorkflowAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WorkflowAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationRun" ADD CONSTRAINT "WorkflowAutomationRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationRun" ADD CONSTRAINT "WorkflowAutomationRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationRun" ADD CONSTRAINT "WorkflowAutomationRun_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationRun" ADD CONSTRAINT "WorkflowAutomationRun_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WorkflowAutomationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationRun" ADD CONSTRAINT "WorkflowAutomationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationRun" ADD CONSTRAINT "WorkflowAutomationRun_causationId_fkey" FOREIGN KEY ("causationId") REFERENCES "WorkflowAutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationRunAttempt" ADD CONSTRAINT "WorkflowAutomationRunAttempt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowAutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationApproval" ADD CONSTRAINT "WorkflowAutomationApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowAutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationApproval" ADD CONSTRAINT "WorkflowAutomationApproval_requiredUserId_fkey" FOREIGN KEY ("requiredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationApproval" ADD CONSTRAINT "WorkflowAutomationApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationWait" ADD CONSTRAINT "WorkflowAutomationWait_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowAutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationScheduleException" ADD CONSTRAINT "WorkflowAutomationScheduleException_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WorkflowAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationScheduleException" ADD CONSTRAINT "WorkflowAutomationScheduleException_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationWebhookDelivery" ADD CONSTRAINT "WorkflowAutomationWebhookDelivery_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WorkflowAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationWebhookDelivery" ADD CONSTRAINT "WorkflowAutomationWebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WorkflowAutomationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationEvent" ADD CONSTRAINT "WorkflowAutomationEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationEvent" ADD CONSTRAINT "WorkflowAutomationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationEventDelivery" ADD CONSTRAINT "WorkflowAutomationEventDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WorkflowAutomationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationEventDelivery" ADD CONSTRAINT "WorkflowAutomationEventDelivery_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WorkflowAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowAutomationNotificationState" ADD CONSTRAINT "WorkflowAutomationNotificationState_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WorkflowAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


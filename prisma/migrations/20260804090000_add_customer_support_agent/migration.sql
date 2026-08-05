-- CreateEnum
CREATE TYPE "CustomerSupportFaqStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomerSupportKnowledgeSourceType" AS ENUM ('INTERNAL_PAGE', 'DOCUMENTATION', 'KNOWLEDGE_BASE_PUBLIC', 'TOOL_DESCRIPTION', 'HELP_PUBLIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "CustomerSupportKnowledgeStatus" AS ENUM ('DRAFT', 'APPROVED', 'OUTDATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomerSupportKnowledgeVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CustomerSupportSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CustomerSupportConversationStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ESCALATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustomerSupportMessageRole" AS ENUM ('VISITOR', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CustomerSupportResponseType" AS ENUM ('FAQ', 'KNOWLEDGE', 'AI_ASSISTED', 'FALLBACK');

-- CreateEnum
CREATE TYPE "CustomerSupportEvidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "CustomerSupportFeedback" AS ENUM ('NONE', 'POSITIVE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "CustomerSupportMessageStatus" AS ENUM ('SENT', 'REDACTED');

-- CreateEnum
CREATE TYPE "CustomerSupportHandoffStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustomerSupportHandoffPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CustomerSupportWidgetPosition" AS ENUM ('LEFT', 'RIGHT');

-- CreateEnum
CREATE TYPE "CustomerSupportAppearanceTheme" AS ENUM ('DEFAULT', 'MINIMAL', 'BOLD');

-- CreateEnum
CREATE TYPE "CustomerSupportTone" AS ENUM ('NEUTRAL', 'FRIENDLY', 'FORMAL', 'CONCISE');

-- CreateEnum
CREATE TYPE "CustomerSupportRateLimitScope" AS ENUM ('SESSION_CREATE', 'MESSAGE', 'FEEDBACK', 'HANDOFF');

-- CreateTable
CREATE TABLE "CustomerSupportConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "agentName" TEXT NOT NULL DEFAULT 'Asistente de soporte',
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Hola, ¿en qué puedo ayudarte?',
    "buttonText" TEXT NOT NULL DEFAULT 'Ayuda',
    "suggestedQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL DEFAULT 'es',
    "tone" "CustomerSupportTone" NOT NULL DEFAULT 'NEUTRAL',
    "position" "CustomerSupportWidgetPosition" NOT NULL DEFAULT 'RIGHT',
    "includedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "offHoursMessage" TEXT,
    "humanHandoffEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxMessagesPerConversation" INTEGER NOT NULL DEFAULT 30,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "privacyText" TEXT NOT NULL DEFAULT 'Esta conversación puede guardarse para mejorar el soporte. No compartas contraseñas ni datos sensibles. Las respuestas pueden ser generadas por IA.',
    "appearanceTheme" "CustomerSupportAppearanceTheme" NOT NULL DEFAULT 'DEFAULT',
    "testCompletedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSupportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSupportFaq" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL DEFAULT 'es',
    "relatedLink" TEXT,
    "status" "CustomerSupportFaqStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSupportFaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSupportKnowledgeSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "CustomerSupportKnowledgeSourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "status" "CustomerSupportKnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "CustomerSupportKnowledgeVisibility" NOT NULL DEFAULT 'INTERNAL',
    "language" TEXT NOT NULL DEFAULT 'es',
    "excerpt" TEXT,
    "normalizedContent" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSupportKnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSupportKnowledgeSyncRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT,
    "requestedPath" TEXT NOT NULL,
    "status" "CustomerSupportSyncStatus" NOT NULL DEFAULT 'PENDING',
    "changeDetected" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "startedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSupportKnowledgeSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSupportConversation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "visitorKeyHash" TEXT NOT NULL,
    "userId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es',
    "originPage" TEXT,
    "status" "CustomerSupportConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "category" TEXT,
    "lastResponseType" "CustomerSupportResponseType",
    "lastEvidence" "CustomerSupportEvidenceLevel",
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerSupportConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSupportMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "CustomerSupportMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "responseType" "CustomerSupportResponseType",
    "evidence" "CustomerSupportEvidenceLevel",
    "sourcesUsed" JSONB,
    "feedback" "CustomerSupportFeedback" NOT NULL DEFAULT 'NONE',
    "status" "CustomerSupportMessageStatus" NOT NULL DEFAULT 'SENT',
    "aiAgentRunId" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSupportHandoff" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT,
    "priority" "CustomerSupportHandoffPriority" NOT NULL DEFAULT 'MEDIUM',
    "sanitizedMessage" TEXT NOT NULL,
    "originPage" TEXT,
    "status" "CustomerSupportHandoffStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "internalNotes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerSupportHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSupportRateLimitEvent" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scope" "CustomerSupportRateLimitScope" NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSupportRateLimitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSupportConfig_projectId_key" ON "CustomerSupportConfig"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSupportConfig_publicId_key" ON "CustomerSupportConfig"("publicId");

-- CreateIndex
CREATE INDEX "CustomerSupportConfig_publicId_idx" ON "CustomerSupportConfig"("publicId");

-- CreateIndex
CREATE INDEX "CustomerSupportFaq_projectId_status_language_idx" ON "CustomerSupportFaq"("projectId", "status", "language");

-- CreateIndex
CREATE INDEX "CustomerSupportFaq_projectId_category_idx" ON "CustomerSupportFaq"("projectId", "category");

-- CreateIndex
CREATE INDEX "CustomerSupportKnowledgeSource_projectId_status_visibility_idx" ON "CustomerSupportKnowledgeSource"("projectId", "status", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSupportKnowledgeSource_projectId_sourceRef_key" ON "CustomerSupportKnowledgeSource"("projectId", "sourceRef");

-- CreateIndex
CREATE INDEX "CustomerSupportKnowledgeSyncRun_projectId_createdAt_idx" ON "CustomerSupportKnowledgeSyncRun"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSupportConversation_publicId_key" ON "CustomerSupportConversation"("publicId");

-- CreateIndex
CREATE INDEX "CustomerSupportConversation_projectId_status_isTest_idx" ON "CustomerSupportConversation"("projectId", "status", "isTest");

-- CreateIndex
CREATE INDEX "CustomerSupportConversation_projectId_startedAt_idx" ON "CustomerSupportConversation"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "CustomerSupportConversation_visitorKeyHash_idx" ON "CustomerSupportConversation"("visitorKeyHash");

-- CreateIndex
CREATE INDEX "CustomerSupportMessage_conversationId_createdAt_idx" ON "CustomerSupportMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerSupportMessage_projectId_createdAt_idx" ON "CustomerSupportMessage"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerSupportHandoff_projectId_status_idx" ON "CustomerSupportHandoff"("projectId", "status");

-- CreateIndex
CREATE INDEX "CustomerSupportRateLimitEvent_keyHash_scope_createdAt_idx" ON "CustomerSupportRateLimitEvent"("keyHash", "scope", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerSupportConfig" ADD CONSTRAINT "CustomerSupportConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportConfig" ADD CONSTRAINT "CustomerSupportConfig_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportFaq" ADD CONSTRAINT "CustomerSupportFaq_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportFaq" ADD CONSTRAINT "CustomerSupportFaq_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportFaq" ADD CONSTRAINT "CustomerSupportFaq_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportKnowledgeSource" ADD CONSTRAINT "CustomerSupportKnowledgeSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportKnowledgeSource" ADD CONSTRAINT "CustomerSupportKnowledgeSource_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportKnowledgeSyncRun" ADD CONSTRAINT "CustomerSupportKnowledgeSyncRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportKnowledgeSyncRun" ADD CONSTRAINT "CustomerSupportKnowledgeSyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CustomerSupportKnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportKnowledgeSyncRun" ADD CONSTRAINT "CustomerSupportKnowledgeSyncRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportConversation" ADD CONSTRAINT "CustomerSupportConversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportConversation" ADD CONSTRAINT "CustomerSupportConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportMessage" ADD CONSTRAINT "CustomerSupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CustomerSupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportMessage" ADD CONSTRAINT "CustomerSupportMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportMessage" ADD CONSTRAINT "CustomerSupportMessage_aiAgentRunId_fkey" FOREIGN KEY ("aiAgentRunId") REFERENCES "AiAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportHandoff" ADD CONSTRAINT "CustomerSupportHandoff_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CustomerSupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportHandoff" ADD CONSTRAINT "CustomerSupportHandoff_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportHandoff" ADD CONSTRAINT "CustomerSupportHandoff_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


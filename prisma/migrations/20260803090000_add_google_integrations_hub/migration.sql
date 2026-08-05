-- Fase 39: Centro de Integraciones — Google Analytics 4 & Google Search Console
-- Additive only. No DROP TABLE, no TRUNCATE, no data loss.
--
-- NOTE: `prisma migrate diff` against the live database also reported 3 lines
-- of pre-existing drift unrelated to this phase's schema changes (same drift
-- already documented in the Fase 37/38 migrations): a DROP INDEX on
-- "KnowledgeChunk_searchVector_idx" and two "ALTER TABLE ... DROP DEFAULT"
-- statements on FileAsset.updatedAt / KnowledgeChunk.searchVector. Those are
-- intentionally NOT included below — they do not correspond to anything in
-- this phase's schema.prisma changes and were confirmed spurious drift when
-- earlier migrations were authored.

-- CreateEnum
CREATE TYPE "GoogleConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'AVAILABLE', 'CONNECTING', 'CONNECTED', 'SYNCING', 'PAUSED', 'REAUTH_REQUIRED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "GoogleResourceType" AS ENUM ('GA4_PROPERTY', 'SEARCH_CONSOLE_SITE');

-- CreateEnum
CREATE TYPE "GoogleSyncType" AS ENUM ('INITIAL', 'INCREMENTAL', 'MANUAL', 'RESYNC');

-- CreateEnum
CREATE TYPE "GoogleSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'GOOGLE';

-- CreateTable
CREATE TABLE "GoogleIntegrationConnection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectedById" TEXT NOT NULL,
    "googleEmail" TEXT,
    "status" "GoogleConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleIntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleIntegrationResource" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "GoogleResourceType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "accountName" TEXT,
    "permissionLevel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "importConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleIntegrationResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleIntegrationSyncRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "syncType" "GoogleSyncType" NOT NULL,
    "status" "GoogleSyncStatus" NOT NULL DEFAULT 'PENDING',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "cursor" TEXT,
    "rowsReceived" INTEGER NOT NULL DEFAULT 0,
    "pointsCreated" INTEGER NOT NULL DEFAULT 0,
    "pointsUpdated" INTEGER NOT NULL DEFAULT 0,
    "pointsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "errorCategory" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "startedById" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "executionToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleIntegrationSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleOAuthState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "encryptedCodeVerifier" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleIntegrationConnection_projectId_key" ON "GoogleIntegrationConnection"("projectId");

-- CreateIndex
CREATE INDEX "GoogleIntegrationConnection_projectId_status_idx" ON "GoogleIntegrationConnection"("projectId", "status");

-- CreateIndex
CREATE INDEX "GoogleIntegrationResource_projectId_type_active_idx" ON "GoogleIntegrationResource"("projectId", "type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleIntegrationResource_connectionId_type_externalId_key" ON "GoogleIntegrationResource"("connectionId", "type", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleIntegrationSyncRun_idempotencyKey_key" ON "GoogleIntegrationSyncRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GoogleIntegrationSyncRun_projectId_status_idx" ON "GoogleIntegrationSyncRun"("projectId", "status");

-- CreateIndex
CREATE INDEX "GoogleIntegrationSyncRun_resourceId_createdAt_idx" ON "GoogleIntegrationSyncRun"("resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "GoogleIntegrationSyncRun_connectionId_createdAt_idx" ON "GoogleIntegrationSyncRun"("connectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleOAuthState_stateHash_key" ON "GoogleOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "GoogleOAuthState_projectId_idx" ON "GoogleOAuthState"("projectId");

-- CreateIndex
CREATE INDEX "GoogleOAuthState_expiresAt_idx" ON "GoogleOAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "GoogleIntegrationConnection" ADD CONSTRAINT "GoogleIntegrationConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleIntegrationConnection" ADD CONSTRAINT "GoogleIntegrationConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleIntegrationResource" ADD CONSTRAINT "GoogleIntegrationResource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleIntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleIntegrationResource" ADD CONSTRAINT "GoogleIntegrationResource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleIntegrationSyncRun" ADD CONSTRAINT "GoogleIntegrationSyncRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleIntegrationSyncRun" ADD CONSTRAINT "GoogleIntegrationSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleIntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleIntegrationSyncRun" ADD CONSTRAINT "GoogleIntegrationSyncRun_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "GoogleIntegrationResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleIntegrationSyncRun" ADD CONSTRAINT "GoogleIntegrationSyncRun_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleOAuthState" ADD CONSTRAINT "GoogleOAuthState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleOAuthState" ADD CONSTRAINT "GoogleOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

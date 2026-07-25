-- CreateEnum
CREATE TYPE "AiToolInteractionType" AS ENUM ('FAVORITE', 'RECENT_USE');

-- CreateTable
CREATE TABLE "AiToolInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "toolSlug" TEXT NOT NULL,
    "type" "AiToolInteractionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiToolInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiToolInteraction_userId_type_idx" ON "AiToolInteraction"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "AiToolInteraction_userId_toolSlug_type_key" ON "AiToolInteraction"("userId", "toolSlug", "type");

-- AddForeignKey
ALTER TABLE "AiToolInteraction" ADD CONSTRAINT "AiToolInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiToolInteraction" ADD CONSTRAINT "AiToolInteraction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


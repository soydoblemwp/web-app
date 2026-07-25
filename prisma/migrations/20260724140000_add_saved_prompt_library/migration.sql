-- CreateTable
CREATE TABLE "SavedPrompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sourceTool" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedPrompt_userId_updatedAt_idx" ON "SavedPrompt"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "SavedPrompt_userId_isFavorite_idx" ON "SavedPrompt"("userId", "isFavorite");

-- CreateIndex
CREATE INDEX "SavedPrompt_projectId_idx" ON "SavedPrompt"("projectId");

-- AddForeignKey
ALTER TABLE "SavedPrompt" ADD CONSTRAINT "SavedPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPrompt" ADD CONSTRAINT "SavedPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


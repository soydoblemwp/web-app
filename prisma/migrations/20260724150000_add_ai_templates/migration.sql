-- CreateTable
CREATE TABLE "AiTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sourceTool" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiTemplate_userId_updatedAt_idx" ON "AiTemplate"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiTemplate_userId_isFavorite_idx" ON "AiTemplate"("userId", "isFavorite");

-- CreateIndex
CREATE INDEX "AiTemplate_projectId_idx" ON "AiTemplate"("projectId");

-- AddForeignKey
ALTER TABLE "AiTemplate" ADD CONSTRAINT "AiTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTemplate" ADD CONSTRAINT "AiTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


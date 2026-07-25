-- AlterTable
ALTER TABLE "SavedPrompt" ADD COLUMN     "useBrandKit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mission" TEXT,
    "vision" TEXT,
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetAudience" TEXT,
    "tone" TEXT,
    "personality" TEXT,
    "primaryLanguage" TEXT,
    "country" TEXT,
    "allowedWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "forbiddenWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "writingStyle" TEXT,
    "preferredCTAs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "socialLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "website" TEXT,
    "email" TEXT,
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "typography" TEXT,
    "logoUrl" TEXT,
    "internalNotes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandProfile_userId_updatedAt_idx" ON "BrandProfile"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "BrandProfile_userId_isDefault_idx" ON "BrandProfile"("userId", "isDefault");

-- AddForeignKey
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "CustomerSupportPublicSiteStatus" AS ENUM ('PENDING', 'VERIFIED', 'ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "CustomerSupportPublicSite" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "customerSupportConfigId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "normalizedHostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "status" "CustomerSupportPublicSiteStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSupportPublicSite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSupportPublicSite_normalizedHostname_key" ON "CustomerSupportPublicSite"("normalizedHostname");

-- CreateIndex
CREATE INDEX "CustomerSupportPublicSite_projectId_status_idx" ON "CustomerSupportPublicSite"("projectId", "status");

-- CreateIndex
CREATE INDEX "CustomerSupportPublicSite_customerSupportConfigId_idx" ON "CustomerSupportPublicSite"("customerSupportConfigId");

-- AddForeignKey
ALTER TABLE "CustomerSupportPublicSite" ADD CONSTRAINT "CustomerSupportPublicSite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportPublicSite" ADD CONSTRAINT "CustomerSupportPublicSite_customerSupportConfigId_fkey" FOREIGN KEY ("customerSupportConfigId") REFERENCES "CustomerSupportConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSupportPublicSite" ADD CONSTRAINT "CustomerSupportPublicSite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


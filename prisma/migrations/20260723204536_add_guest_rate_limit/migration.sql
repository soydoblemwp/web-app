-- CreateTable
CREATE TABLE "GuestRateLimit" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestRateLimit_periodStart_idx" ON "GuestRateLimit"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "GuestRateLimit_ipHash_periodStart_key" ON "GuestRateLimit"("ipHash", "periodStart");

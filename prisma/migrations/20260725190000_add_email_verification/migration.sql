-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: existing accounts predate email verification entirely (it
-- did not exist as a feature until this migration) and were never asked to
-- prove control of their email address at signup. Retroactively rejecting
-- them now, with no way to recover access (verifying requires logging in,
-- which would itself be blocked), would be a self-inflicted lockout with no
-- escape hatch — most notably for the platform's own SUPER_ADMIN account,
-- provisioned out-of-band via `npm run admin:create` (direct database/server
-- access, a stronger trust signal than a public email link). Grandfather
-- every pre-existing account as verified as of its own original createdAt —
-- never a fabricated "verified just now" timestamp — so history stays
-- honest. This UPDATE runs exactly once, at migration-apply time; it never
-- touches any account created after this point, since new registrations
-- always start with emailVerified = NULL and must complete the real flow.
UPDATE "User" SET "emailVerified" = "createdAt" WHERE "emailVerified" IS NULL;

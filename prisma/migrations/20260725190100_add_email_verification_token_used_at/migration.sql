-- AlterTable
-- Nullable, additive — every row created by the previous migration (there
-- are none yet; the table was just created and nothing has written to it)
-- defaults to NULL, meaning "not yet used", which is correct.
ALTER TABLE "EmailVerificationToken" ADD COLUMN "usedAt" TIMESTAMP(3);

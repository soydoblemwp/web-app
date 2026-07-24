-- AlterEnum
-- Removes the unused 'ANTHROPIC' value: no remote AI provider integration
-- exists anymore, generation runs locally in the browser.
BEGIN;
CREATE TYPE "IntegrationType_new" AS ENUM ('WORDPRESS', 'GITHUB', 'EMAIL', 'STORAGE');
ALTER TABLE "Integration" ALTER COLUMN "type" TYPE "IntegrationType_new" USING ("type"::text::"IntegrationType_new");
ALTER TYPE "IntegrationType" RENAME TO "IntegrationType_old";
ALTER TYPE "IntegrationType_new" RENAME TO "IntegrationType";
DROP TYPE "IntegrationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AIResult" DROP CONSTRAINT "AIResult_projectId_fkey";

-- DropTable
-- The server-side prompt/response cache is obsolete: prompts never reach
-- the server anymore, generation happens entirely in the browser.
DROP TABLE "AIResult";

-- DropTable
-- The guest AI rate limiter protected a paid remote API budget that no
-- longer exists — local browser generation has no server-side cost.
DROP TABLE "GuestRateLimit";

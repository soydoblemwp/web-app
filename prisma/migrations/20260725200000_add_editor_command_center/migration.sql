-- AlterEnum: two new editorial states the "Command Center" summary panel
-- needs (Idea, before Draft even starts; Scheduled, once a publish date is
-- set) — additive only, existing rows/values are untouched.
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'IDEA' BEFORE 'DRAFT';
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED' BEFORE 'PUBLISHED';

-- AlterTable: editor sidebar metadata (Resumen/SEO/Publicación tabs). All
-- nullable — every existing ContentItem row is valid with these unset.
ALTER TABLE "ContentItem" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "seoKeyword" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "searchIntent" TEXT,
ADD COLUMN     "brandProfileId" TEXT,
ADD COLUMN     "publishChecklist" JSONB;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

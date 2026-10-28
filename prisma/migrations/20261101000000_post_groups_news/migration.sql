-- AlterTable
ALTER TABLE "BrandProfile" ADD COLUMN     "newsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GeneratedPost" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE INDEX "GeneratedPost_groupId_idx" ON "GeneratedPost"("groupId");

-- CreateIndex
CREATE INDEX "GeneratedPost_companyId_sourceUrl_idx" ON "GeneratedPost"("companyId", "sourceUrl");

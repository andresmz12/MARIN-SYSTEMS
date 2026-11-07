-- AlterTable
ALTER TABLE "BrandProfile" ADD COLUMN "blogApiUrl" TEXT,
ADD COLUMN "blogEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Reports Systems ya tenía su blog conectado: se deja activo.
UPDATE "BrandProfile" SET "blogEnabled" = true
WHERE "blogCta" IS NOT NULL AND "companyId" IN (SELECT "id" FROM "CEOCompany" WHERE "name" ILIKE '%reports systems%');

-- AlterTable
ALTER TABLE "BrandProfile" ADD COLUMN "blogMirrorFrom" TEXT,
ADD COLUMN "blogMirrorSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BlogMirror" (
    "id" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "targetCompanyId" TEXT NOT NULL,
    "sourcePostId" TEXT NOT NULL,
    "slug" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogMirror_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogMirror_groupKey_targetCompanyId_key" ON "BlogMirror"("groupKey", "targetCompanyId");

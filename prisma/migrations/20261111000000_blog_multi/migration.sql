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

-- AlterTable
ALTER TABLE "BrandProfile" ADD COLUMN "blogCtaEn" TEXT,
ADD COLUMN "blogAiWrite" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BlogArticle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "translationKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tags" TEXT[],
    "content" TEXT NOT NULL,
    "topicTitle" TEXT,
    "isLegal" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "position" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogArticle_companyId_locale_translationKey_key" ON "BlogArticle"("companyId", "locale", "translationKey");

-- CreateIndex
CREATE INDEX "BlogArticle_companyId_status_position_idx" ON "BlogArticle"("companyId", "status", "position");

-- CreateTable
CREATE TABLE "BrandAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandAsset_companyId_kind_key" ON "BrandAsset"("companyId", "kind");

-- CreateIndex
CREATE INDEX "BrandAsset_userId_idx" ON "BrandAsset"("userId");

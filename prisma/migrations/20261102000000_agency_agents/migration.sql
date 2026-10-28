-- AlterTable
ALTER TABLE "GeneratedPost" ADD COLUMN     "factCheck" JSONB,
ADD COLUMN     "factCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PostMetric" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reach" INTEGER,
    "impressions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "clicks" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDoc" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'tax',
    "sourceUrl" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostMetric_postId_key" ON "PostMetric"("postId");

-- CreateIndex
CREATE INDEX "AgentReport_userId_kind_createdAt_idx" ON "AgentReport"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AgentReport_companyId_kind_createdAt_idx" ON "AgentReport"("companyId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeDoc_userId_idx" ON "KnowledgeDoc"("userId");

-- CreateIndex
CREATE INDEX "KnowledgeDoc_companyId_idx" ON "KnowledgeDoc"("companyId");

-- AddForeignKey
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GeneratedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

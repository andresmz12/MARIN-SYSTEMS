-- AlterTable
ALTER TABLE "GeneratedPost" ADD COLUMN "previousVersion" JSONB;

-- CreateTable
CREATE TABLE "AiStatus" (
    "id" TEXT NOT NULL,
    "okAt" TIMESTAMP(3),
    "failAt" TIMESTAMP(3),
    "failKind" TEXT,
    "failMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiStatus_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add temaHash to StudioSession
ALTER TABLE "StudioSession" ADD COLUMN "temaHash" TEXT;

-- CreateIndex
CREATE INDEX "StudioSession_userId_temaHash_idx" ON "StudioSession"("userId", "temaHash");

-- CreateTable
CREATE TABLE "IrsNoticia" (
    "id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "mapaJson" JSONB,
    "audioPath" TEXT,
    "timestamps" JSONB,
    "pubDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IrsNoticia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IrsNoticia_guid_key" ON "IrsNoticia"("guid");

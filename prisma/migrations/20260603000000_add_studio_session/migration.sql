-- CreateTable
CREATE TABLE "StudioSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tema" TEXT NOT NULL,
    "redSocial" TEXT NOT NULL,
    "duracion" TEXT NOT NULL,
    "mapaJson" JSONB NOT NULL,
    "guion" TEXT NOT NULL,
    "audioData" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudioSession_token_key" ON "StudioSession"("token");

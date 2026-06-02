-- CreateTable
CREATE TABLE "ContentCreatorHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tema" TEXT NOT NULL,
    "redSocial" TEXT NOT NULL,
    "duracion" TEXT NOT NULL,
    "mapaJson" JSONB NOT NULL,
    "guion" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "hashtags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentCreatorHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentCreatorHistory_userId_idx" ON "ContentCreatorHistory"("userId");

-- AddForeignKey
ALTER TABLE "ContentCreatorHistory" ADD CONSTRAINT "ContentCreatorHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

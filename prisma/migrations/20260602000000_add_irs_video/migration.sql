-- CreateTable
CREATE TABLE "IrsVideoContent" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "guionCompleto" TEXT NOT NULL,
    "mapaJson" JSONB NOT NULL,
    "audioUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IrsVideoContent_pkey" PRIMARY KEY ("id")
);

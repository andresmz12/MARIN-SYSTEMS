-- AlterTable
ALTER TABLE "GeneratedPost" ADD COLUMN     "slides" JSONB,
ADD COLUMN     "slideImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PostSlideImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSlideImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostSlideImage_token_key" ON "PostSlideImage"("token");

-- CreateIndex
CREATE INDEX "PostSlideImage_postId_idx" ON "PostSlideImage"("postId");

-- AddForeignKey
ALTER TABLE "PostSlideImage" ADD CONSTRAINT "PostSlideImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "GeneratedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

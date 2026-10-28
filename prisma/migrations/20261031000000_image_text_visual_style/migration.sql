-- AlterTable
ALTER TABLE "BrandProfile" ADD COLUMN     "visualStyle" JSONB;

-- AlterTable
ALTER TABLE "GeneratedPost" ADD COLUMN     "facts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "imageHeight" INTEGER,
ADD COLUMN     "imageText" JSONB,
ADD COLUMN     "imageWidth" INTEGER;


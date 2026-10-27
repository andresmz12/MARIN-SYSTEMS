-- AlterTable
ALTER TABLE "BrandProfile" ADD COLUMN     "autoEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoPlatforms" TEXT[] DEFAULT ARRAY['instagram', 'facebook', 'linkedin', 'tiktok']::TEXT[];

-- AlterTable
ALTER TABLE "GeneratedPost" ADD COLUMN     "imagePrompt" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

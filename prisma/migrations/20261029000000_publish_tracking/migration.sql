-- AlterTable
ALTER TABLE "BrandProfile" ALTER COLUMN "autoPlatforms" SET DEFAULT ARRAY['instagram', 'facebook', 'linkedin', 'twitter']::TEXT[];

-- AlterTable
ALTER TABLE "GeneratedPost" ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "publishAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "publishError" TEXT;


-- Marcas que siguen con la selección por defecto anterior (que incluía TikTok): pasan a la nueva
-- (X en lugar de TikTok). Las que el dueño ya personalizó no se tocan.
UPDATE "BrandProfile"
SET "autoPlatforms" = ARRAY['instagram', 'facebook', 'linkedin', 'twitter']::TEXT[]
WHERE "autoPlatforms" = ARRAY['instagram', 'facebook', 'linkedin', 'tiktok']::TEXT[];

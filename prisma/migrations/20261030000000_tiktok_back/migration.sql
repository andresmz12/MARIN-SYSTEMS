-- AlterTable
ALTER TABLE "BrandProfile" ALTER COLUMN "autoPlatforms" SET DEFAULT ARRAY['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok']::TEXT[];

-- Marcas que siguen con la selección por defecto anterior (4 redes): se les suma TikTok.
-- Las que el dueño ya personalizó no se tocan.
UPDATE "BrandProfile"
SET "autoPlatforms" = ARRAY['instagram', 'facebook', 'linkedin', 'twitter', 'tiktok']::TEXT[]
WHERE "autoPlatforms" = ARRAY['instagram', 'facebook', 'linkedin', 'twitter']::TEXT[];

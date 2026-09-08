/*
  Warnings:

  - You are about to drop the column `strokes` on the `Meeting` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Meeting" DROP COLUMN "strokes",
ADD COLUMN     "pages" JSONB NOT NULL DEFAULT '[]';

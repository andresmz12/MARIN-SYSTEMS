-- AlterTable: agregar startDate a CorporateTask con default = createdAt para filas existentes
ALTER TABLE "CorporateTask" ADD COLUMN "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: add reminder tracking + updatedAt to TaskInstance
ALTER TABLE "TaskInstance" ADD COLUMN "morningReminderSentAt" TIMESTAMP(3);
ALTER TABLE "TaskInstance" ADD COLUMN "eveningReminderSentAt" TIMESTAMP(3);
ALTER TABLE "TaskInstance" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "TaskInstance_scheduledDate_idx" ON "TaskInstance"("scheduledDate");

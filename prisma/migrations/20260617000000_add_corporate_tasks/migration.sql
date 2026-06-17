-- CreateTable
CREATE TABLE "CorporateTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attachmentUrl" TEXT,
    "internalNotes" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringRule" TEXT,
    "recurringEndDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskInstance" (
    "id" TEXT NOT NULL,
    "corporateTaskId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorporateTask_companyId_idx" ON "CorporateTask"("companyId");
CREATE INDEX "CorporateTask_dueDate_idx" ON "CorporateTask"("dueDate");
CREATE UNIQUE INDEX "TaskInstance_corporateTaskId_scheduledDate_key" ON "TaskInstance"("corporateTaskId", "scheduledDate");
CREATE INDEX "TaskInstance_corporateTaskId_idx" ON "TaskInstance"("corporateTaskId");

-- AddForeignKey
ALTER TABLE "CorporateTask" ADD CONSTRAINT "CorporateTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskInstance" ADD CONSTRAINT "TaskInstance_corporateTaskId_fkey" FOREIGN KEY ("corporateTaskId") REFERENCES "CorporateTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

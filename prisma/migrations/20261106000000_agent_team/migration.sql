-- CreateTable
CREATE TABLE "AgentActivity" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "companyId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUsage" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AgentUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLesson" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSetting" (
    "agent" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "modelTier" TEXT NOT NULL DEFAULT 'default',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSetting_pkey" PRIMARY KEY ("agent")
);

-- CreateIndex
CREATE INDEX "AgentActivity_agent_createdAt_idx" ON "AgentActivity"("agent", "createdAt");

-- CreateIndex
CREATE INDEX "AgentActivity_createdAt_idx" ON "AgentActivity"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentUsage_agent_model_day_key" ON "AgentUsage"("agent", "model", "day");

-- CreateIndex
CREATE INDEX "AgentUsage_day_idx" ON "AgentUsage"("day");

-- CreateIndex
CREATE INDEX "AgentLesson_companyId_active_idx" ON "AgentLesson"("companyId", "active");

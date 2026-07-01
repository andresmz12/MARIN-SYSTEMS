-- Add extended metrics to AgentHealthLog for full traceability
ALTER TABLE "AgentHealthLog" ADD COLUMN IF NOT EXISTS "errorRate" DOUBLE PRECISION;
ALTER TABLE "AgentHealthLog" ADD COLUMN IF NOT EXISTS "memoryUsage" DOUBLE PRECISION;
ALTER TABLE "AgentHealthLog" ADD COLUMN IF NOT EXISTS "cpuUsage" DOUBLE PRECISION;
ALTER TABLE "AgentHealthLog" ADD COLUMN IF NOT EXISTS "databaseConnected" BOOLEAN;

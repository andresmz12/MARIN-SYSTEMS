import { prisma } from '@/lib/prisma';
import { AgentRoom } from '@/components/agents/AgentRoom';
import { CronRunsPanel } from '@/components/agents/CronRunsPanel';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Agent Monitoring | Marin Systems',
  description: 'Real-time monitoring of external applications',
};

export default async function AgentesPage() {
  const apps = await prisma.monitoredApp.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const checks = apps.map((a) => a.lastCheckAt?.getTime() ?? 0);
  const lastAgentCheck = checks.length && Math.max(...checks) > 0 ? new Date(Math.max(...checks)).toISOString() : null;

  return (
    <div className="space-y-6">
      <AgentRoom initialApps={apps} />
      <CronRunsPanel lastAgentCheck={lastAgentCheck} />
    </div>
  );
}

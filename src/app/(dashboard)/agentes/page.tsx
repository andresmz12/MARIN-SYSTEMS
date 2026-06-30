import { prisma } from '@/lib/prisma';
import { AgentRoom } from '@/components/agents/AgentRoom';
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

  return (
    <div className="space-y-6">
      <AgentRoom initialApps={apps} />
    </div>
  );
}

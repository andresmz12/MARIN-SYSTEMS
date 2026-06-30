'use client';

import { useEffect } from 'react';
import { MonitoredApp } from '@/types/agents';
import { useAgentStore } from '@/stores/agentStore';
import { useAgentPolling } from '@/hooks/useAgentPolling';
import { AgentPanel } from './AgentPanel';
import { AgentGrid } from './AgentGrid';

interface AgentRoomProps {
  initialApps: MonitoredApp[];
}

export function AgentRoom({ initialApps }: AgentRoomProps) {
  const initializeAgents = useAgentStore((state) => state.initializeAgents);
  const agentCount = useAgentStore((state) => Object.keys(state.agents).length);
  const healthyCount = useAgentStore(
    (state) =>
      Object.values(state.agents).filter((a) => a.status === 'healthy').length
  );

  // Inicializar store con apps del servidor
  useEffect(() => {
    initializeAgents(initialApps);
  }, [initialApps, initializeAgents]);

  // Iniciar polling
  useAgentPolling();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Agent Monitoring</h1>
          <p className="text-slate-400 mt-1">
            Real-time health monitoring of external applications
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-sm text-slate-200">
            {healthyCount} / {agentCount} online
          </span>
        </div>
      </div>

      {/* Grid */}
      {initialApps.length > 0 ? (
        <AgentGrid>
          {initialApps.map((app) => (
            <AgentPanel
              key={app.id}
              id={app.id}
              name={app.name}
              role={app.role}
              color={app.color}
            />
          ))}
        </AgentGrid>
      ) : (
        <div className="text-center py-12 text-slate-400">
          No apps configured yet
        </div>
      )}
    </div>
  );
}

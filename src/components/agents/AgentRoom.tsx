'use client';

import { useEffect, useState } from 'react';
import { MonitoredApp } from '@/types/agents';
import { useAgentStore } from '@/stores/agentStore';
import { useAgentPolling } from '@/hooks/useAgentPolling';
import { useAgentHistoryPolling } from '@/hooks/useAgentHistoryPolling';
import { AgentPanel } from './AgentPanel';
import { AgentGrid } from './AgentGrid';
import { AgentOffice } from './AgentOffice';

interface AgentRoomProps {
  initialApps: MonitoredApp[];
}

type ViewMode = 'office' | 'metrics';

export function AgentRoom({ initialApps }: AgentRoomProps) {
  const initializeAgents = useAgentStore((state) => state.initializeAgents);
  const agentCount = useAgentStore((state) => Object.keys(state.agents).length);
  const healthyCount = useAgentStore(
    (state) =>
      Object.values(state.agents).filter((a) => a.status === 'healthy').length
  );

  const [view, setView] = useState<ViewMode>('office');

  // Inicializar store con apps del servidor
  useEffect(() => {
    initializeAgents(initialApps);
  }, [initialApps, initializeAgents]);

  // Iniciar polling
  useAgentPolling();
  useAgentHistoryPolling();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Agent Monitoring</h1>
          <p className="text-slate-400 mt-1">
            {view === 'office'
              ? 'Tu equipo de agentes trabajando en la oficina'
              : 'Real-time health monitoring of external applications'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setView('office')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'office'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🏢 Oficina
            </button>
            <button
              type="button"
              onClick={() => setView('metrics')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === 'metrics'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📊 Métricas
            </button>
          </div>

          <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-sm text-slate-200">
              {healthyCount} / {agentCount} online
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      {initialApps.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          No apps configured yet
        </div>
      ) : view === 'office' ? (
        <AgentOffice apps={initialApps} />
      ) : (
        <AgentGrid>
          {initialApps.map((app) => (
            <AgentPanel
              key={app.id}
              id={app.id}
              name={app.name}
              agentName={app.agentName}
              role={app.role}
              color={app.color}
            />
          ))}
        </AgentGrid>
      )}
    </div>
  );
}

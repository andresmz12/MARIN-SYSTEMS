'use client';

import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { MonitoredApp } from '@/types/agents';
import { useAgentStore } from '@/stores/agentStore';
import { useAgentPolling, refreshAgentsNow } from '@/hooks/useAgentPolling';
import { useAgentHistoryPolling } from '@/hooks/useAgentHistoryPolling';
import { AgentPanel } from './AgentPanel';
import { AgentGrid } from './AgentGrid';
import { AgentOffice } from './AgentOffice';
import { ManageAgentsModal } from './ManageAgentsModal';

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
  // Select the raw record with useShallow (stable across renders unless the
  // store actually changes it), then derive with useMemo. The previous version
  // derived a brand-new array straight from a Zustand selector — Zustand
  // compares selector output by reference, so a fresh array every call always
  // read as "changed", forcing a re-render that ran the selector again forever
  // (React error #185, crashed the whole Agentes page in production).
  const agentsById = useAgentStore(useShallow((state) => state.agents));
  const downAgents = useMemo(
    () =>
      initialApps
        .map((app) => ({ app, data: agentsById[app.id] }))
        .filter(({ data }) => data?.status === 'down' && data?.message),
    [initialApps, agentsById]
  );

  const [view, setView] = useState<ViewMode>('office');
  const [manageOpen, setManageOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
        <div className="flex flex-wrap items-center gap-3">
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

          <button
            type="button"
            onClick={async () => {
              setRefreshing(true);
              await refreshAgentsNow();
              setRefreshing(false);
            }}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-60"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refrescar ahora
          </button>

          <button type="button" onClick={() => setManageOpen(true)} className="btn-primary">
            + Gestionar agentes
          </button>

          <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
            <div className={`w-2.5 h-2.5 rounded-full ${healthyCount === agentCount && agentCount > 0 ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-sm text-slate-200">
              {healthyCount} / {agentCount} online
            </span>
          </div>
        </div>
      </div>

      {/* Diagnóstico real: por qué un agente aparece caído */}
      {downAgents.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-red-400">
            ⚠ {downAgents.length} agente{downAgents.length > 1 ? 's' : ''} sin responder — razón real:
          </p>
          {downAgents.map(({ app, data }) => (
            <p key={app.id} className="text-xs text-slate-400">
              <span className="text-slate-200 font-medium">{app.agentName}</span> ({app.healthUrl}) — {data?.message}
            </p>
          ))}
        </div>
      )}

      {/* Content */}
      {initialApps.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-slate-400">Aún no has configurado ningún agente.</p>
          <button type="button" onClick={() => setManageOpen(true)} className="btn-primary">
            + Agregar mi primer agente
          </button>
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

      {manageOpen && <ManageAgentsModal apps={initialApps} onClose={() => setManageOpen(false)} />}
    </div>
  );
}

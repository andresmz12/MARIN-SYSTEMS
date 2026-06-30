'use client';

import { useState } from 'react';
import { HealthStatus } from '@/types/agents';
import { useAgentStore } from '@/stores/agentStore';
import { AgentDetailsModal } from './AgentDetailsModal';

interface AgentPanelProps {
  id: string;
  name: string;
  agentName: string;
  role: string | null;
  color: string;
}

export function AgentPanel({ id, name, agentName, role, color }: AgentPanelProps) {
  const agentData = useAgentStore((state) => state.agents[id]);
  const status = (agentData?.status || 'unknown') as HealthStatus;
  const latency = agentData?.latency;
  const uptime = agentData?.uptime;
  const [showDetails, setShowDetails] = useState(false);

  const statusConfig = {
    healthy:  { label: 'Todo bien',     color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    degraded: { label: 'Advertencia',   color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    down:     { label: 'Error',         color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    unknown:  { label: 'Verificando...', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  };

  const statusEmoji = {
    healthy:  '✓',
    degraded: '⚠',
    down:     '✗',
    unknown:  '?',
  };

  const config = statusConfig[status];

  return (
    <div className="group rounded-xl border border-slate-700 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-600 transition-all p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: color }}
          >
            {agentName.charAt(0)}
          </div>
          {/* Name */}
          <div>
            <h3 className="font-semibold text-white text-sm">{agentName}</h3>
            <p className="text-xs text-slate-400">{name}</p>
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className={`inline-block px-3 py-1 rounded-full border text-xs font-medium ${config.color}`}>
        {statusEmoji[status]} {config.label}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-slate-400 mb-1">Latencia</div>
          <div className="text-slate-100 font-semibold">
            {latency !== null && latency !== undefined ? `${latency}ms` : '—'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-slate-400 mb-1">Uptime</div>
          <div className="text-slate-100 font-semibold">
            {uptime !== null && uptime !== undefined ? `${uptime.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {/* View Details Button */}
      <button
        onClick={() => setShowDetails(true)}
        className="w-full text-center py-2 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
      >
        Ver detalles →
      </button>

      {showDetails && (
        <AgentDetailsModal
          id={id}
          name={name}
          agentName={agentName}
          role={role}
          color={color}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}

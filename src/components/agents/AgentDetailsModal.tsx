'use client';

import { Modal } from '@/components/ui/Modal';
import { HealthStatus } from '@/types/agents';
import { useAgentStore } from '@/stores/agentStore';
import { formatDateTime } from '@/lib/utils';

interface AgentDetailsModalProps {
  id: string;
  name: string;
  agentName: string;
  role: string | null;
  color: string;
  onClose: () => void;
}

const STATUS_CONFIG: Record<HealthStatus, { label: string; color: string; emoji: string }> = {
  healthy: { label: 'Todo bien', color: 'bg-green-500/20 text-green-400 border-green-500/30', emoji: '✓' },
  degraded: { label: 'Advertencia', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', emoji: '⚠' },
  down: { label: 'Error', color: 'bg-red-500/20 text-red-400 border-red-500/30', emoji: '✗' },
  unknown: { label: 'Verificando...', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', emoji: '?' },
};

export function AgentDetailsModal({ id, name, agentName, color, onClose }: AgentDetailsModalProps) {
  const agentData = useAgentStore((state) => state.agents[id]);
  const status = (agentData?.status || 'unknown') as HealthStatus;
  const config = STATUS_CONFIG[status];

  return (
    <Modal isOpen onClose={onClose} title="Detalles del agente" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ backgroundColor: color }}
          >
            {agentName.charAt(0)}
          </div>
          <div>
            <h3 className="font-semibold text-white text-base">{agentName}</h3>
            <p className="text-xs text-slate-400">{name}</p>
          </div>
        </div>

        <div className={`inline-block px-3 py-1 rounded-full border text-xs font-medium ${config.color}`}>
          {config.emoji} {config.label}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 mb-1">Latencia</div>
            <div className="text-slate-100 font-semibold">
              {agentData?.latency != null ? `${agentData.latency}ms` : '—'}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 mb-1">Uptime</div>
            <div className="text-slate-100 font-semibold">
              {agentData?.uptime != null ? `${agentData.uptime.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 mb-1">Último update</div>
            <div className="text-slate-100 font-semibold">
              {agentData?.lastChecked ? formatDateTime(agentData.lastChecked) : '—'}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 mb-1">Último cambio de estado</div>
            <div className="text-slate-100 font-semibold">
              {agentData?.lastStatusChange ? formatDateTime(agentData.lastStatusChange) : '—'}
            </div>
          </div>
        </div>

        {agentData?.message && (
          <p className="text-xs text-slate-400">{agentData.message}</p>
        )}
      </div>
    </Modal>
  );
}

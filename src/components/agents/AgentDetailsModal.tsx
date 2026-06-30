'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Modal } from '@/components/ui/Modal';
import { AgentHistoryPoint, AgentTransition, HealthStatus } from '@/types/agents';
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

interface HistoryResponse {
  points: AgentHistoryPoint[];
  transitions: AgentTransition[];
  stats: {
    changesToday: number;
    peakLatencyToday: number | null;
    lastFailureAt: string | null;
    trend: 'up' | 'down' | 'stable';
  };
}

export function AgentDetailsModal({ id, name, agentName, color, onClose }: AgentDetailsModalProps) {
  const agentData = useAgentStore((state) => state.agents[id]);
  const status = (agentData?.status || 'unknown') as HealthStatus;
  const config = STATUS_CONFIG[status];

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const res = await fetch(`/api/agents/history?appId=${id}&hours=24`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setHistory({
            points: data.points ?? [],
            transitions: data.transitions ?? [],
            stats: data.stats,
          });
        }
      } catch (error) {
        console.error('Failed to load agent history:', error);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const chartData =
    history?.points
      .filter((p) => p.latency != null)
      .map((p) => ({
        time: formatDateTime(p.checkedAt).slice(-5),
        latency: p.latency,
      })) ?? [];

  const timeSinceLastFailure = history?.stats.lastFailureAt
    ? formatDistanceToNow(new Date(history.stats.lastFailureAt), { addSuffix: true, locale: es })
    : 'Sin fallas registradas';

  return (
    <Modal isOpen onClose={onClose} title="Detalles del agente" size="md">
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

        {/* Gráfico de latencia 24h */}
        <div>
          <h4 className="text-xs font-semibold text-slate-300 mb-2">Latencia — últimas 24h</h4>
          <div className="bg-slate-800/50 rounded-lg p-3 h-40">
            {loadingHistory ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Cargando...
              </div>
            ) : chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={36} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }}
                    labelStyle={{ color: '#cbd5e1' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke={color}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Aún no hay suficientes datos
              </div>
            )}
          </div>
        </div>

        {/* Estadísticas de hoy */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 mb-1">Cambios hoy</div>
            <div className="text-slate-100 font-semibold">{history?.stats.changesToday ?? '—'}</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 mb-1">Pico de latencia hoy</div>
            <div className="text-slate-100 font-semibold">
              {history?.stats.peakLatencyToday != null ? `${history.stats.peakLatencyToday}ms` : '—'}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 mb-1">Última falla</div>
            <div className="text-slate-100 font-semibold">{timeSinceLastFailure}</div>
          </div>
        </div>

        {/* Timeline de cambios de estado */}
        <div>
          <h4 className="text-xs font-semibold text-slate-300 mb-2">Cambios de estado — últimas 24h</h4>
          <div className="bg-slate-800/50 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
            {history && history.transitions.length > 0 ? (
              [...history.transitions].reverse().map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">
                    {STATUS_CONFIG[t.from].emoji} {STATUS_CONFIG[t.from].label} → {STATUS_CONFIG[t.to].emoji}{' '}
                    {STATUS_CONFIG[t.to].label}
                  </span>
                  <span className="text-slate-500">{formatDateTime(t.checkedAt)}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">Sin cambios de estado en las últimas 24h</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { HealthStatus } from '@/types/agents';
import { useAgentStore } from '@/stores/agentStore';
import { formatDateTime } from '@/lib/utils';
import { AgentDetailsModal } from './AgentDetailsModal';

interface AgentPanelProps {
  id: string;
  name: string;
  agentName: string;
  role: string | null;
  color: string;
}

const ALERT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

const TREND_CONFIG: Record<'up' | 'down' | 'stable', { icon: string; label: string }> = {
  up: { icon: '↑', label: 'Latencia subiendo' },
  down: { icon: '↓', label: 'Latencia bajando' },
  stable: { icon: '→', label: 'Latencia estable' },
};

function usageBarColor(value: number) {
  if (value > 85) return 'bg-red-500';
  if (value > 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function formatRelativeTime(date: Date): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return `Hace ${diffSec} segundo${diffSec === 1 ? '' : 's'}`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} minuto${diffMin === 1 ? '' : 's'}`;
  const diffHour = Math.floor(diffMin / 60);
  return `Hace ${diffHour} hora${diffHour === 1 ? '' : 's'}`;
}

function MiniUsageBar({ label, value }: { label: string; value: number | null }) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-slate-400 w-12 shrink-0">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-slate-700/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${usageBarColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-slate-300 font-medium w-12 text-right shrink-0">
        {value != null ? `${value.toFixed(1)}%` : '—'}
      </span>
    </div>
  );
}

export function AgentPanel({ id, name, agentName, role, color }: AgentPanelProps) {
  const agentData = useAgentStore((state) => state.agents[id]);
  const history = useAgentStore((state) => state.history[id]);
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
  const consecutiveFailures = agentData?.consecutiveFailures ?? 0;
  const errorRate = agentData?.errorRate ?? null;
  const isCritical = consecutiveFailures >= 3;
  const hasHighErrorRate = errorRate != null && errorRate > 5;
  // A hard "down" (or sustained failures) is a red, pulsing alarm. A self-reported
  // "degraded" (high memory/CPU) stays a calm amber warning — it doesn't escalate.
  const isCriticalState = status === 'down' || isCritical;
  const isWarningState = status === 'degraded' && !isCriticalState;

  const isRecentChange =
    !!agentData?.lastStatusChange &&
    Date.now() - new Date(agentData.lastStatusChange).getTime() < ALERT_WINDOW_MS;

  const trend = history?.stats.trend ?? 'stable';
  const trendConfig = TREND_CONFIG[trend];
  const changesToday = history?.stats.changesToday ?? 0;
  const sparklineData = history?.points.filter((p) => p.latency != null) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`group rounded-xl border bg-slate-900/50 hover:bg-slate-900 transition-colors p-5 space-y-4 ${
        isCriticalState
          ? 'border-red-500/40 animate-pulse'
          : isWarningState
            ? 'border-amber-500/40'
            : 'border-slate-700 hover:border-slate-600'
      }`}
    >
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
        <div className="flex flex-col items-end gap-1">
          {isCritical && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
              ⚠️ Críticas
            </span>
          )}
          {hasHighErrorRate && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              Error rate alto
            </span>
          )}
          {isRecentChange && !isCritical && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30">
              En alerta
            </span>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div
        className={`inline-block px-3 py-1 rounded-full border text-xs font-medium transition-colors duration-500 ${config.color}`}
      >
        {statusEmoji[status]} {config.label}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-slate-400 mb-1 flex items-center gap-1">
            Latencia
            <span title={trendConfig.label}>{trendConfig.icon}</span>
          </div>
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

      {/* Mini sparkline + cambios hoy */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1 text-xs text-slate-400">
          <span>Latencia (6h)</span>
          <span>{changesToday} cambios hoy</span>
        </div>
        {sparklineData.length > 1 ? (
          <div className="h-10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Line
                  type="monotone"
                  dataKey="latency"
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-10 flex items-center text-[11px] text-slate-500">
            Aún no hay suficientes datos
          </div>
        )}
        <div
          className="mt-2 text-[11px] text-slate-500"
          title={agentData?.lastChecked ? formatDateTime(agentData.lastChecked) : undefined}
        >
          Último update: {agentData?.lastChecked ? formatRelativeTime(new Date(agentData.lastChecked)) : '—'}
        </div>
      </div>

      {/* System Health compacto */}
      <div className="border-t border-slate-700/60 pt-3 space-y-1.5">
        <MiniUsageBar label="Memory" value={agentData?.memoryUsage ?? null} />
        <MiniUsageBar label="CPU" value={agentData?.cpuUsage ?? null} />
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
    </motion.div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
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

const SIMPLE_STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: 'OK',
  degraded: 'DEGRADED',
  down: 'DOWN',
  unknown: 'UNKNOWN',
};

const SIMPLE_STATUS_COLOR: Record<HealthStatus, string> = {
  healthy: 'text-green-400',
  degraded: 'text-yellow-400',
  down: 'text-red-400',
  unknown: 'text-slate-400',
};

const ONE_HOUR_MS = 60 * 60 * 1000;

function formatLatencyDelta(delta: number | null): { text: string; color: string } {
  if (delta == null) return { text: '—', color: 'text-slate-500' };
  if (delta > 0) return { text: `↑ +${delta}ms`, color: 'text-red-400' };
  if (delta < 0) return { text: `↓ ${delta}ms`, color: 'text-green-400' };
  return { text: '→ 0ms', color: 'text-slate-400' };
}

function barColor(value: number, kind: 'error' | 'usage') {
  if (kind === 'error') {
    if (value > 5) return 'bg-red-500';
    if (value > 2) return 'bg-yellow-500';
    return 'bg-green-500';
  }
  if (value > 85) return 'bg-red-500';
  if (value > 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function ProgressBar({ value, kind }: { value: number; kind: 'error' | 'usage' }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-700/60 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barColor(value, kind)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

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

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayHeatColor(uptime: number | null): string {
  if (uptime == null) return 'bg-slate-800 border-slate-700';
  if (uptime >= 99) return 'bg-green-500/80 border-green-400/50';
  if (uptime >= 95) return 'bg-green-600/50 border-green-500/40';
  if (uptime >= 80) return 'bg-yellow-500/60 border-yellow-400/50';
  if (uptime > 0) return 'bg-red-500/70 border-red-400/50';
  return 'bg-red-700/80 border-red-500/50';
}

export function AgentDetailsModal({ id, name, agentName, color, onClose }: AgentDetailsModalProps) {
  const agentData = useAgentStore((state) => state.agents[id]);
  const status = (agentData?.status || 'unknown') as HealthStatus;
  const config = STATUS_CONFIG[status];

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [weeklyPoints, setWeeklyPoints] = useState<AgentHistoryPoint[] | null>(null);

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

    async function loadWeekly() {
      try {
        const res = await fetch(`/api/agents/history?appId=${id}&hours=168`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setWeeklyPoints(data.points ?? []);
      } catch (error) {
        console.error('Failed to load weekly agent history:', error);
      }
    }

    loadHistory();
    loadWeekly();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Últimos 7 días, hoy incluido, en orden cronológico — % de checks "healthy" por día.
  const weeklyUptime = useMemo(() => {
    const days: { key: string; label: string; uptime: number | null }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d), label: d.toLocaleDateString('es-CO', { weekday: 'short' }), uptime: null });
    }
    const byDay = new Map<string, { total: number; healthy: number }>();
    for (const p of weeklyPoints ?? []) {
      const k = dayKey(new Date(p.checkedAt));
      const bucket = byDay.get(k) ?? { total: 0, healthy: 0 };
      bucket.total += 1;
      if (p.status === 'healthy') bucket.healthy += 1;
      byDay.set(k, bucket);
    }
    return days.map((d) => {
      const bucket = byDay.get(d.key);
      return { ...d, uptime: bucket && bucket.total > 0 ? (bucket.healthy / bucket.total) * 100 : null };
    });
  }, [weeklyPoints]);

  const p95Latency = useMemo(() => {
    const values = (history?.points ?? [])
      .map((p) => p.latency)
      .filter((v): v is number => v != null);
    return percentile(values, 95);
  }, [history]);

  const chartData =
    history?.points
      .filter((p) => p.latency != null)
      .map((p) => ({
        time: formatDateTime(p.checkedAt).slice(-5),
        latency: p.latency,
      })) ?? [];

  const lastHourPoints = (history?.points ?? []).filter(
    (p) => Date.now() - new Date(p.checkedAt).getTime() <= ONE_HOUR_MS
  );

  const lastHourRows = lastHourPoints.map((p, i) => ({
    point: p,
    delta: i > 0 && p.latency != null && lastHourPoints[i - 1].latency != null
      ? p.latency - (lastHourPoints[i - 1].latency as number)
      : null,
  }));

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
              {agentData?.lastStatusChange ? formatDateTime(agentData.lastStatusChange) : 'Sin cambios'}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 mb-1">HTTP status</div>
            <div className="text-slate-100 font-semibold">
              {agentData?.httpStatusCode != null ? agentData.httpStatusCode : 'Sin respuesta'}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 mb-1">Latencia P95 (24h)</div>
            <div className="text-slate-100 font-semibold">{p95Latency != null ? `${p95Latency}ms` : '—'}</div>
          </div>
        </div>

        {/* Uptime últimos 7 días */}
        <div>
          <h4 className="text-xs font-semibold text-slate-300 mb-2">Uptime — últimos 7 días</h4>
          <div className="bg-slate-800/50 rounded-lg p-3 flex items-center justify-between gap-1.5">
            {weeklyUptime.map((d) => (
              <div key={d.key} className="flex flex-col items-center gap-1 flex-1">
                <div
                  title={d.uptime != null ? `${d.uptime.toFixed(1)}%` : 'Sin datos'}
                  className={`w-full aspect-square rounded-md border ${dayHeatColor(d.uptime)}`}
                />
                <span className="text-[10px] text-slate-500 capitalize">{d.label.replace('.', '')}</span>
              </div>
            ))}
          </div>
        </div>

        {agentData?.message && (
          <p className="text-xs text-slate-400">{agentData.message}</p>
        )}

        {/* System Health */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-300">System Health</h4>
            {(agentData?.consecutiveFailures ?? 0) >= 3 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                ⚠️ ALERTAS CRÍTICAS
              </span>
            )}
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">Error Rate</span>
                <span className="text-slate-100 font-semibold">
                  {agentData?.errorRate != null ? `${agentData.errorRate.toFixed(1)}%` : '—'}
                </span>
              </div>
              <ProgressBar value={agentData?.errorRate ?? 0} kind="error" />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Database</span>
              <span className="text-slate-100 font-semibold">
                {agentData?.databaseConnected ? '🟢 Conectado' : '🔴 Desconectado'}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">Memory</span>
                <span className="text-slate-100 font-semibold">
                  {agentData?.memoryUsage != null ? `${agentData.memoryUsage.toFixed(1)}%` : '—'}
                </span>
              </div>
              <ProgressBar value={agentData?.memoryUsage ?? 0} kind="usage" />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">CPU</span>
                <span className="text-slate-100 font-semibold">
                  {agentData?.cpuUsage != null ? `${agentData.cpuUsage.toFixed(1)}%` : '—'}
                </span>
              </div>
              <ProgressBar value={agentData?.cpuUsage ?? 0} kind="usage" />
            </div>
          </div>
        </div>

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

        {/* Historial última hora */}
        <div>
          <h4 className="text-xs font-semibold text-slate-300 mb-2">Historial última hora</h4>
          <div className="bg-slate-800/50 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
            {loadingHistory ? (
              <p className="text-xs text-slate-500">Cargando...</p>
            ) : lastHourRows.length > 0 ? (
              [...lastHourRows].reverse().map(({ point, delta }) => {
                const deltaInfo = formatLatencyDelta(delta);
                return (
                  <div key={point.checkedAt} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{formatDateTime(point.checkedAt).slice(-5)}</span>
                    <span className={`font-semibold ${SIMPLE_STATUS_COLOR[point.status]}`}>
                      {SIMPLE_STATUS_LABEL[point.status]}
                    </span>
                    <span className="text-slate-300">
                      {point.latency != null ? `${point.latency}ms` : '—'}
                    </span>
                    <span className={deltaInfo.color}>{deltaInfo.text}</span>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-500">Sin health checks en la última hora</p>
            )}
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

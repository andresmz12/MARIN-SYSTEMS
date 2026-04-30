'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'

interface Stats {
  total: number
  wins: number
  losses: number
  be: number
  winRate: number
  pctPlan: number
  totalPips: number
  profitFactor: number
  streak: number
  streakType: string
  byEmotion: { emotion: string; wins: number; losses: number; total: number; winRate: number }[]
  performance: { month: string; pips: number }[]
}

const PIE_COLORS = ['#22c55e', '#ef4444', '#6b7280']

export default function EstadisticasPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => { setStats(data); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-gray-500 text-sm">Cargando estadísticas...</div>
      </div>
    )
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Estadísticas</h1>
        <div className="card text-center py-12">
          <p className="text-gray-500">No hay trades registrados aún.</p>
          <p className="text-gray-600 text-sm mt-1">Comienza registrando operaciones en el Diario.</p>
        </div>
      </div>
    )
  }

  const pieData = [
    { name: 'WIN', value: stats.wins },
    { name: 'LOSS', value: stats.losses },
    { name: 'BE', value: stats.be },
  ].filter((d) => d.value > 0)

  const streakLabel = stats.streakType === 'win'
    ? `${stats.streak} victorias consecutivas`
    : stats.streakType === 'loss'
    ? `${stats.streak} pérdidas consecutivas`
    : 'Sin racha'

  const streakColor = stats.streakType === 'win'
    ? 'text-green-400'
    : stats.streakType === 'loss'
    ? 'text-red-400'
    : 'text-gray-400'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Estadísticas</h1>
        <p className="text-gray-500 text-sm mt-0.5">Análisis de tu desempeño como trader</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Win Rate"
          value={`${stats.winRate}%`}
          sub={`${stats.wins}W · ${stats.losses}L · ${stats.be}BE`}
          color={stats.winRate >= 55 ? 'green' : stats.winRate >= 40 ? 'yellow' : 'red'}
        />
        <StatCard
          label="Profit Factor"
          value={stats.profitFactor.toFixed(2)}
          sub={`${stats.profitFactor >= 1.5 ? 'Consistente' : 'Mejorar'}`}
          color={stats.profitFactor >= 1.5 ? 'green' : stats.profitFactor >= 1 ? 'yellow' : 'red'}
        />
        <StatCard
          label="% Siguió el plan"
          value={`${stats.pctPlan}%`}
          sub={`de ${stats.total} trades`}
          color={stats.pctPlan >= 80 ? 'green' : stats.pctPlan >= 60 ? 'yellow' : 'red'}
        />
        <StatCard
          label="Total Pips"
          value={`${stats.totalPips > 0 ? '+' : ''}${stats.totalPips}`}
          sub="todos los trades"
          color={stats.totalPips >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Streak + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Streak */}
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Racha actual</p>
          <div className="flex items-center gap-4">
            <div className={`text-4xl font-bold ${streakColor}`}>{stats.streak}</div>
            <div>
              <p className={`font-semibold text-sm ${streakColor}`}>{streakLabel}</p>
              {stats.streakType === 'loss' && stats.streak >= 3 && (
                <p className="text-xs text-red-400 mt-1">🛑 Regla de los 3 strikes activada</p>
              )}
            </div>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Distribución de resultados</p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Legend
                iconSize={8}
                formatter={(value) => <span className="text-xs text-gray-400">{value}</span>}
              />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                labelStyle={{ color: '#9ca3af' }}
                itemStyle={{ color: '#e5e7eb' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Performance over time */}
      {stats.performance.length > 1 && (
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Rendimiento por mes (pips)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.performance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                labelStyle={{ color: '#9ca3af' }}
                itemStyle={{ color: '#e5e7eb' }}
              />
              <Bar dataKey="pips" name="Pips" radius={[4, 4, 0, 0]}>
                {stats.performance.map((entry, i) => (
                  <Cell key={i} fill={entry.pips >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Win rate by emotion */}
      {stats.byEmotion.length > 0 && (
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Rendimiento por emoción al entrar</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.byEmotion} margin={{ top: 0, right: 0, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="emotion" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                labelStyle={{ color: '#9ca3af' }}
                itemStyle={{ color: '#e5e7eb' }}
                formatter={(value: number) => [`${value}%`, 'Win Rate']}
              />
              <Bar dataKey="winRate" name="Win Rate %" radius={[4, 4, 0, 0]} fill="#2563eb">
                {stats.byEmotion.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.winRate >= 60 ? '#22c55e' : entry.winRate >= 40 ? '#eab308' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {stats.byEmotion.map((e) => (
              <div key={e.emotion} className="bg-[#111] rounded-lg p-2 text-xs">
                <p className="text-gray-400 font-medium">{e.emotion}</p>
                <p className="text-gray-500 mt-0.5">{e.total} trades · {e.winRate}% win</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label, value, sub, color,
}: {
  label: string
  value: string
  sub: string
  color: 'green' | 'yellow' | 'red' | 'gray'
}) {
  const textColor = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    gray: 'text-gray-400',
  }[color]

  return (
    <div className="card">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${textColor}`}>{value}</p>
      <p className="text-xs text-gray-600 mt-1">{sub}</p>
    </div>
  )
}

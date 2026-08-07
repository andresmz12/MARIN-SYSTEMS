'use client'

import { useEffect, useState } from 'react'
import { startOfWeek, endOfWeek, format, addWeeks, subWeeks } from 'date-fns'
import { es } from 'date-fns/locale'

interface WeekStats {
  total: number
  wins: number
  losses: number
  be: number
  winRate: number
  complianceRate: number | null
  followedCount: number
  totalPips: number
  bestDay: { date: string; pips: number } | null
  worstDay: { date: string; pips: number } | null
  topPair: string | null
  topSetup: string | null
  journalMood: number | null
  journalContent: string | null
  tradesByDay: { date: string; wins: number; losses: number; pips: number }[]
}

export default function ResumenSemanalPage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [stats, setStats] = useState<WeekStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 })
  const weekLabel = `${format(weekStart, "d 'de' MMM", { locale: es })} – ${format(weekEnd, "d 'de' MMM yyyy", { locale: es })}`

  useEffect(() => { loadWeek() }, [weekOffset])

  async function loadWeek() {
    setLoadError(false)
    setLoading(true)
    try {
      const fromStr = format(weekStart, 'yyyy-MM-dd')
      const toStr = format(weekEnd, 'yyyy-MM-dd')
      const [tradesRes, journalRes] = await Promise.all([
        fetch(`/api/trades?from=${fromStr}&to=${toStr}`),
        fetch(`/api/journal?from=${fromStr}&to=${toStr}`),
      ])

      const trades: { id: string; date: string; pair: string; result: string; pips: number | null; setup: string | null; followedPlan: boolean }[] =
        tradesRes.ok ? await tradesRes.json() : []
      const journals: { date: string; mood: number; content: string }[] =
        journalRes.ok ? await journalRes.json() : []

      const total = trades.length
      const wins = trades.filter((t) => t.result === 'win').length
      const losses = trades.filter((t) => t.result === 'loss').length
      const be = trades.filter((t) => t.result === 'be').length
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
      const totalPips = Math.round(trades.reduce((s, t) => s + (t.pips ?? 0), 0) * 10) / 10

      // Cumplimiento del sistema: % de trades donde seguiste el plan (el TOS lo prioriza sobre el resultado)
      const followedCount = trades.filter((t) => t.followedPlan).length
      const complianceRate = total > 0 ? Math.round((followedCount / total) * 100) : null

      // By day
      const byDay: Record<string, { wins: number; losses: number; pips: number }> = {}
      for (const t of trades) {
        const d = t.date.split('T')[0]
        if (!byDay[d]) byDay[d] = { wins: 0, losses: 0, pips: 0 }
        byDay[d].pips += t.pips ?? 0
        if (t.result === 'win') byDay[d].wins++
        if (t.result === 'loss') byDay[d].losses++
      }
      const tradesByDay = Object.entries(byDay).map(([date, d]) => ({ date, ...d, pips: Math.round(d.pips * 10) / 10 })).sort((a, b) => a.date.localeCompare(b.date))

      const bestDay = tradesByDay.reduce<{ date: string; pips: number } | null>((best, d) => !best || d.pips > best.pips ? d : best, null)
      const worstDay = tradesByDay.reduce<{ date: string; pips: number } | null>((worst, d) => !worst || d.pips < worst.pips ? d : worst, null)

      // Top pair
      const pairCount: Record<string, number> = {}
      for (const t of trades) { pairCount[t.pair] = (pairCount[t.pair] ?? 0) + 1 }
      const topPair = Object.entries(pairCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

      // Top setup
      const setupCount: Record<string, number> = {}
      for (const t of trades) { if (t.setup) setupCount[t.setup] = (setupCount[t.setup] ?? 0) + 1 }
      const topSetup = Object.entries(setupCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

      // Journal summary (average mood this week)
      const avgMood = journals.length > 0
        ? Math.round(journals.reduce((s, j) => s + j.mood, 0) / journals.length)
        : null

      setStats({
        total, wins, losses, be, winRate, complianceRate, followedCount, totalPips,
        bestDay, worstDay, topPair, topSetup,
        journalMood: avgMood,
        journalContent: journals[0]?.content ?? null,
        tradesByDay,
      })
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Resumen Semanal</h1>
          <p className="text-gray-500 text-sm mt-0.5">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="btn-secondary px-2.5 py-1.5 text-sm"
          >
            ← Anterior
          </button>
          {weekOffset < 0 && (
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="btn-secondary px-2.5 py-1.5 text-sm"
            >
              Siguiente →
            </button>
          )}
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-xs text-blue-400 hover:text-blue-300">
              Hoy
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="card h-20 bg-[#1a1a1a] animate-pulse" />)}
        </div>
      )}

      {loadError && (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <p className="text-gray-400">Error al cargar el resumen</p>
          <button onClick={loadWeek} className="btn-secondary">Reintentar</button>
        </div>
      )}

      {!loading && !loadError && stats && (
        <>
          {stats.total === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">Sin trades esta semana</p>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="card">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Trades</p>
                  <p className="text-3xl font-bold text-white mt-1">{stats.total}</p>
                  <p className="text-xs text-gray-600 mt-1">{stats.wins}W · {stats.losses}L · {stats.be}BE</p>
                </div>
                <div className="card border border-blue-500/20">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Cumplimiento del sistema</p>
                  <p className={`text-3xl font-bold mt-1 ${stats.complianceRate === null ? 'text-gray-600' : stats.complianceRate >= 80 ? 'text-green-400' : stats.complianceRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {stats.complianceRate !== null ? `${stats.complianceRate}%` : '—'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{stats.followedCount}/{stats.total} siguiendo el plan</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Win Rate</p>
                  <p className={`text-3xl font-bold mt-1 ${stats.winRate >= 55 ? 'text-green-400' : stats.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {stats.winRate}%
                  </p>
                  <p className="text-xs text-gray-600 mt-1">de {stats.total} operaciones</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Total Pips</p>
                  <p className={`text-3xl font-bold mt-1 ${stats.totalPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.totalPips > 0 ? '+' : ''}{stats.totalPips}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">semana</p>
                </div>
                <div className="card">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Mood promedio</p>
                  <p className={`text-3xl font-bold mt-1 ${stats.journalMood !== null ? (stats.journalMood >= 7 ? 'text-green-400' : stats.journalMood >= 4 ? 'text-yellow-400' : 'text-red-400') : 'text-gray-600'}`}>
                    {stats.journalMood !== null ? stats.journalMood : '—'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">del journal</p>
                </div>
              </div>

              {/* Highlights */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card space-y-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Destacados de la semana</p>
                  {stats.bestDay && (
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">↑</span>
                      <div>
                        <p className="text-xs text-gray-500">Mejor día</p>
                        <p className="text-sm text-gray-200">{format(new Date(stats.bestDay.date + 'T12:00:00'), "EEEE d", { locale: es })} — <span className="text-green-400">+{stats.bestDay.pips} pips</span></p>
                      </div>
                    </div>
                  )}
                  {stats.worstDay && stats.worstDay.pips < 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">↓</span>
                      <div>
                        <p className="text-xs text-gray-500">Peor día</p>
                        <p className="text-sm text-gray-200">{format(new Date(stats.worstDay.date + 'T12:00:00'), "EEEE d", { locale: es })} — <span className="text-red-400">{stats.worstDay.pips} pips</span></p>
                      </div>
                    </div>
                  )}
                  {stats.topPair && (
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400">📊</span>
                      <div>
                        <p className="text-xs text-gray-500">Par más operado</p>
                        <p className="text-sm text-gray-200">{stats.topPair}</p>
                      </div>
                    </div>
                  )}
                  {stats.topSetup && (
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400">⚡</span>
                      <div>
                        <p className="text-xs text-gray-500">Setup más usado</p>
                        <p className="text-sm text-gray-200">{stats.topSetup}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Daily breakdown */}
                <div className="card">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Pips por día</p>
                  <div className="space-y-2">
                    {stats.tradesByDay.map((d) => (
                      <div key={d.date} className="flex items-center gap-3">
                        <p className="text-xs text-gray-500 w-20 flex-shrink-0">
                          {format(new Date(d.date + 'T12:00:00'), 'EEE d', { locale: es })}
                        </p>
                        <div className="flex-1 bg-[#1a1a1a] rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${d.pips >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(100, Math.abs(d.pips) * 2)}%` }}
                          />
                        </div>
                        <p className={`text-xs w-16 text-right flex-shrink-0 ${d.pips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {d.pips > 0 ? '+' : ''}{d.pips}p
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

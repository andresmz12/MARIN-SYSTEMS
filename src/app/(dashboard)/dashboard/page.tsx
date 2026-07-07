'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getDailyQuote, computeTrafficLight } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

interface DailyState {
  id?: string
  mentalState: number
  rutinaCompleted: boolean
  hasNews: boolean
}

interface Trade {
  id: string
  result: string
  pair: string
  pips: number | null
}

interface Habit {
  id: string
  name: string
  emoji: string
  isPreMarket: boolean
}

interface HabitCompletion {
  habitId: string
}

interface Event {
  id: string
  title: string
  date: string
  time: string | null
  type: string
  isForexNews: boolean
}

interface UrgentTask {
  id: string
  title: string
  priority: string
  status: string
  dueDate?: string | null
  company: {
    id: string
    name: string
    color: string
    emoji: string
  }
}

interface CeoStats {
  totalBlocks: number
  doneBlocks: number
  skippedBlocks: number
  workedHours: number
  pct: number
}

interface Stats {
  last10WinRate: number
  habitStreak: number
  ceo: CeoStats | null
}

const MOOD_LABELS = ['', 'Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente']
const MOOD_COLORS = ['', 'text-red-400', 'text-orange-400', 'text-yellow-400', 'text-green-400', 'text-emerald-400']

export default function DashboardPage() {
  const { showToast } = useToast()
  const [dailyState, setDailyState] = useState<DailyState>({
    mentalState: 3,
    rutinaCompleted: false,
    hasNews: false,
  })
  const [todayTrades, setTodayTrades] = useState<Trade[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<HabitCompletion[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([])
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]
  const quote = getDailyQuote()
  const light = computeTrafficLight(dailyState.mentalState, dailyState.rutinaCompleted, dailyState.hasNews)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoadError(false)
    setLoading(true)
    try {
      const [stateRes, tradesRes, habitsRes, completionsRes, eventsRes, companiesRes, statsRes] = await Promise.all([
        fetch(`/api/daily-state?date=${today}`),
        fetch(`/api/trades?date=${today}`),
        fetch('/api/habits'),
        fetch(`/api/habits/complete?date=${today}`),
        fetch(`/api/events?from=${today}`),
        fetch('/api/companies'),
        fetch('/api/stats'),
      ])

      if (stateRes.ok) {
        const state = await stateRes.json()
        if (state) setDailyState(state)
      }
      if (tradesRes.ok) setTodayTrades(await tradesRes.json())
      if (habitsRes.ok) setHabits(await habitsRes.json())
      if (completionsRes.ok) setCompletions(await completionsRes.json())
      if (eventsRes.ok) {
        const events = await eventsRes.json()
        setUpcomingEvents(events.slice(0, 5))
      }
      if (statsRes.ok) setStats(await statsRes.json())
      if (companiesRes.ok) {
        const companies: Array<{ id: string; name: string; color: string; emoji: string; tasks: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string | null }> }> = await companiesRes.json()
        const urgent: UrgentTask[] = []
        const todayDate = new Date(today)
        for (const c of companies) {
          for (const t of c.tasks) {
            if (t.priority === 'alta' && t.status !== 'completada') {
              urgent.push({ id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate, company: { id: c.id, name: c.name, color: c.color, emoji: c.emoji } })
            }
          }
        }
        setUrgentTasks(urgent.slice(0, 6))
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  async function saveDailyState(updates: Partial<DailyState>) {
    const prevState = dailyState
    const newState = { ...dailyState, ...updates }
    setDailyState(newState)
    setSaving(true)
    try {
      const res = await fetch('/api/daily-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newState, date: today }),
      })
      if (!res.ok) throw new Error()
      showToast('Estado guardado', 'success')
    } catch {
      setDailyState(prevState)
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const wins = todayTrades.filter((t) => t.result === 'win').length
  const losses = todayTrades.filter((t) => t.result === 'loss').length
  const winRate = todayTrades.length > 0 ? Math.round((wins / todayTrades.length) * 100) : 0
  const completedCount = completions.length
  const preMarketHabits = habits.filter((h) => h.isPreMarket)
  const completedPreMarket = preMarketHabits.filter((h) =>
    completions.some((c) => c.habitId === h.id)
  ).length

  const lightConfig = {
    verde: { label: 'Condición ÓPTIMA', color: 'text-green-400', bg: 'bg-green-500/20 border-green-500/30', dot: 'bg-green-400' },
    amarillo: { label: 'Condición MODERADA', color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-500/30', dot: 'bg-yellow-400' },
    rojo: { label: 'Condición BAJA — cuidado', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30', dot: 'bg-red-400' },
  }[light]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-[#1a1a1a] animate-pulse rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card h-24 bg-[#1a1a1a] animate-pulse" />
          <div className="card h-24 bg-[#1a1a1a] animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="card h-20 bg-[#1a1a1a] animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-400">No se pudo cargar el dashboard</p>
        <button onClick={loadData} className="btn-secondary">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Traffic Light + Daily State */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Semáforo */}
        <div className={`card border ${lightConfig.bg}`}>
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full ${lightConfig.dot} shadow-lg flex-shrink-0 animate-pulse`} />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Semáforo del día</p>
              <p className={`text-lg font-bold mt-0.5 ${lightConfig.color}`}>{lightConfig.label}</p>
              <p className="text-xs text-gray-500 mt-1">
                Estado mental: {MOOD_LABELS[dailyState.mentalState]} •{' '}
                Rutina: {dailyState.rutinaCompleted ? '✓' : '✗'} •{' '}
                Noticias: {dailyState.hasNews ? '⚠️ Sí' : 'No'}
              </p>
            </div>
          </div>
        </div>

        {/* Update Estado */}
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">
            Actualizar estado {saving && <span className="text-blue-400">• guardando...</span>}
          </p>
          <div className="space-y-3">
            <div>
              <label className="label">Estado mental ({MOOD_LABELS[dailyState.mentalState]})</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    onClick={() => saveDailyState({ mentalState: v })}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      dailyState.mentalState === v
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#111] text-gray-500 hover:text-gray-300 border border-[#2a2a2a]'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dailyState.rutinaCompleted}
                  onChange={(e) => saveDailyState({ rutinaCompleted: e.target.checked })}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm text-gray-300">Rutina completada</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dailyState.hasNews}
                  onChange={(e) => saveDailyState({ hasNews: e.target.checked })}
                  className="w-4 h-4 rounded accent-yellow-500"
                />
                <span className="text-sm text-gray-300">Noticias de alto impacto</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Trades hoy</p>
          <p className="text-3xl font-bold text-white mt-1">{todayTrades.length}</p>
          <p className="text-xs text-gray-600 mt-1">{wins}W · {losses}L</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Win Rate</p>
          <p className={`text-3xl font-bold mt-1 ${winRate >= 60 ? 'text-green-400' : winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
            {winRate}%
          </p>
          <p className="text-xs text-gray-600 mt-1">hoy · últ. 10: {stats?.last10WinRate ?? '—'}%</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Hábitos</p>
          <p className="text-3xl font-bold text-white mt-1">{completedCount}/{habits.length}</p>
          <p className="text-xs text-gray-600 mt-1">
            completados{stats && stats.habitStreak > 0 ? ` · 🔥 ${stats.habitStreak}d racha` : ''}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Pre-mercado</p>
          <p className={`text-3xl font-bold mt-1 ${completedPreMarket === preMarketHabits.length && preMarketHabits.length > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
            {completedPreMarket}/{preMarketHabits.length}
          </p>
          <p className="text-xs text-gray-600 mt-1">rutina</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quote */}
        <div className="card border-l-2 border-blue-600">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Cita del día</p>
          <p className="text-gray-300 text-sm italic leading-relaxed">"{quote}"</p>
        </div>

        {/* Upcoming Events */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Próximos eventos</p>
            <Link href="/agenda" className="text-xs text-blue-400 hover:text-blue-300">Ver agenda →</Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-gray-600">Sin eventos próximos</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${event.isForexNews ? 'bg-red-400' : 'bg-blue-400'}`} />
                  <p className="text-sm text-gray-300 flex-1 truncate">{event.title}</p>
                  <p className="text-xs text-gray-600">{event.time || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Urgent Company Tasks */}
      {urgentTasks.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" />
              Tareas urgentes de empresas
            </p>
            <Link href="/empresas" className="text-xs text-blue-400 hover:text-blue-300">Ver empresas →</Link>
          </div>
          <div className="space-y-2">
            {urgentTasks.map((task) => (
              <Link
                key={task.id}
                href={`/empresas/${task.company.id}`}
                className="flex items-center gap-3 py-1.5 hover:bg-[#1a1a1a] rounded-lg px-1 transition-colors group"
              >
                <div
                  className="w-1.5 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: task.company.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{task.title}</p>
                  <p className="text-xs text-gray-600">
                    {task.company.emoji} {task.company.name}
                  </p>
                </div>
                {task.dueDate && new Date(task.dueDate) < new Date(today) ? (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 flex-shrink-0 font-semibold">
                    VENCIDA
                  </span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex-shrink-0">
                    {task.status === 'en-progreso' ? 'En progreso' : 'Pendiente'}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* CEO Command Center summary */}
      {stats?.ceo && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
              🎯 Plan del día — Command Center
            </p>
            <Link href="/command-center" className="text-xs text-blue-400 hover:text-blue-300">
              Ver plan →
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
                  style={{ width: `${stats.ceo.pct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                {stats.ceo.doneBlocks} de {stats.ceo.totalBlocks} bloques ·{' '}
                {stats.ceo.workedHours}h trabajadas
                {stats.ceo.skippedBlocks > 0 && (
                  <span className="text-zinc-600"> · {stats.ceo.skippedBlocks} saltados</span>
                )}
              </p>
            </div>
            <span
              className={`text-2xl font-bold flex-shrink-0 ${
                stats.ceo.pct >= 75 ? 'text-emerald-400' : stats.ceo.pct >= 40 ? 'text-yellow-400' : 'text-zinc-400'
              }`}
            >
              {stats.ceo.pct}%
            </span>
          </div>
        </div>
      )}

      {/* Corporate Tasks card */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">📋 Tareas Corporativas</p>
            <Link href="/corporate-tasks" className="text-sm text-blue-400 hover:text-blue-300">
              Ver tareas →
            </Link>
          </div>
          <Link
            href="/corporate-tasks/new"
            className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/trading/diario" className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Registrar Trade
        </Link>
        <Link href="/trading/checklist" className="btn-secondary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Checklist Pre-trade
        </Link>
        <Link href="/habitos" className="btn-secondary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Marcar Hábitos
        </Link>
      </div>
    </div>
  )
}

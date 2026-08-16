'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { getDailyQuote, computeTrafficLight } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { Sparkline } from '@/components/ui/Sparkline'

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

interface HabitHistoryEntry {
  habitId: string
  date: string
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
  source: 'interna' | 'corp'
  company: {
    id: string
    name: string
    color: string
    emoji: string
  }
}

interface CorpTaskLite {
  status: string
  completedAt: string | null
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
  equityCurve: { date: string; cumPips: number }[]
}

interface FinanceSummary {
  netBalance: number
  totalIncome: number
  totalExpenses: number
}

interface StudioSessionLite {
  createdAt: string
}

interface IrsNewsLite {
  used: boolean
}

const MOOD_LABELS = ['', 'Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente']

const ACCENT = {
  blue: { text: 'text-blue-400', border: 'border-blue-500/30 hover:border-blue-500/50', badge: 'bg-blue-500/15 border-blue-500/30 text-blue-400', wash: 'from-blue-500/[0.08]', hex: '#3b82f6' },
  purple: { text: 'text-purple-400', border: 'border-purple-500/30 hover:border-purple-500/50', badge: 'bg-purple-500/15 border-purple-500/30 text-purple-400', wash: 'from-purple-500/[0.08]', hex: '#a855f7' },
  emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30 hover:border-emerald-500/50', badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400', wash: 'from-emerald-500/[0.08]', hex: '#10b981' },
  amber: { text: 'text-amber-400', border: 'border-amber-500/30 hover:border-amber-500/50', badge: 'bg-amber-500/15 border-amber-500/30 text-amber-400', wash: 'from-amber-500/[0.08]', hex: '#f59e0b' },
} as const

type Accent = keyof typeof ACCENT

// ── Section: agrupa tarjetas bajo un mismo "mundo" (Trading, Vida Personal,
// Negocios, Contenido), reflejando los mismos grupos del sidebar ──
function Section({
  icon, title, accent, href, hrefLabel, children,
}: {
  icon: ReactNode
  title: string
  accent: Accent
  href?: string
  hrefLabel?: string
  children: ReactNode
}) {
  const a = ACCENT[accent]
  return (
    <section className={`relative overflow-hidden rounded-2xl border p-5 space-y-4 bg-[var(--bg-elevated)] transition-colors ${a.border}`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.wash} to-transparent`} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${a.badge}`}>
            {icon}
          </div>
          <h2 className="font-bold text-[15px] text-white tracking-tight">{title}</h2>
        </div>
        {href && (
          <Link href={href} className={`text-xs font-medium hover:underline ${a.text}`}>
            {hrefLabel ?? 'Ver todo'} →
          </Link>
        )}
      </div>
      <div className="relative space-y-4">{children}</div>
    </section>
  )
}

function StatBlock({ label, value, valueClass, caption }: { label: string; value: ReactNode; valueClass?: string; caption?: string }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-3xl font-extrabold mt-0.5 tracking-tight ${valueClass ?? 'text-white'}`}>{value}</p>
      {caption && <p className="text-xs text-gray-600 mt-0.5">{caption}</p>}
    </div>
  )
}

function last14Dates(): string[] {
  const days: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

function countByDay(dates: string[], itemDates: string[]): { x: string; y: number }[] {
  return dates.map((d) => ({
    x: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
    y: itemDates.filter((it) => it === d).length,
  }))
}

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
  const [habitHistory, setHabitHistory] = useState<HabitHistoryEntry[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([])
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([])
  const [corpTasksAll, setCorpTasksAll] = useState<CorpTaskLite[]>([])
  const [dailyGoals, setDailyGoals] = useState<{ id: string; todayDone: boolean }[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [finance, setFinance] = useState<FinanceSummary | null>(null)
  const [studioSessions, setStudioSessions] = useState<StudioSessionLite[]>([])
  const [irsNews, setIrsNews] = useState<IrsNewsLite[]>([])
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
      const [
        stateRes, tradesRes, habitsRes, completionsRes, habitHistoryRes, eventsRes,
        companiesRes, corpTasksRes, statsRes, goalsRes,
        financeRes, studioRes, irsNewsRes,
      ] = await Promise.all([
        fetch(`/api/daily-state?date=${today}`),
        fetch(`/api/trades?date=${today}`),
        fetch('/api/habits'),
        fetch(`/api/habits/complete?date=${today}`),
        fetch('/api/habits/history'),
        fetch(`/api/events?from=${today}`),
        fetch('/api/companies'),
        fetch('/api/corporate-tasks'),
        fetch('/api/stats'),
        fetch('/api/goals'),
        fetch('/api/finance/summary'),
        fetch('/api/studio/historial'),
        fetch('/api/irs-news'),
      ])

      if (stateRes.ok) {
        const state = await stateRes.json()
        if (state) setDailyState(state)
      }
      if (tradesRes.ok) setTodayTrades(await tradesRes.json())
      if (habitsRes.ok) setHabits(await habitsRes.json())
      if (completionsRes.ok) setCompletions(await completionsRes.json())
      if (habitHistoryRes.ok) setHabitHistory(await habitHistoryRes.json())
      if (eventsRes.ok) {
        const events = await eventsRes.json()
        setUpcomingEvents(events.slice(0, 5))
      }
      if (statsRes.ok) setStats(await statsRes.json())
      if (financeRes.ok) setFinance(await financeRes.json())
      if (studioRes.ok) setStudioSessions(await studioRes.json())
      if (irsNewsRes.ok) setIrsNews(await irsNewsRes.json())
      const urgent: UrgentTask[] = []
      if (companiesRes.ok) {
        const companies: Array<{ id: string; name: string; color: string; emoji: string; tasks: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string | null }> }> = await companiesRes.json()
        for (const c of companies) {
          for (const t of c.tasks) {
            if (t.priority === 'alta' && t.status !== 'completada') {
              urgent.push({ id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate, source: 'interna', company: { id: c.id, name: c.name, color: c.color, emoji: c.emoji } })
            }
          }
        }
      }
      if (corpTasksRes.ok) {
        const corpTasks: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string | null; completedAt: string | null; company: { id: string; name: string; color: string; emoji: string } }> = await corpTasksRes.json()
        setCorpTasksAll(corpTasks.map((t) => ({ status: t.status, completedAt: t.completedAt })))
        for (const t of corpTasks) {
          if ((t.priority === 'high' || t.priority === 'urgent') && t.status !== 'completed') {
            urgent.push({ id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate, source: 'corp', company: t.company })
          }
        }
      }
      urgent.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
      setUrgentTasks(urgent.slice(0, 6))
      if (goalsRes.ok) {
        const goals: Array<{ subGoals: Array<{ id: string; daily: boolean; todayDone: boolean }> }> = await goalsRes.json()
        setDailyGoals(goals.flatMap((g) => g.subGoals.filter((s) => s.daily).map((s) => ({ id: s.id, todayDone: s.todayDone }))))
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

  const dates14 = last14Dates()
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const contentThisWeek = studioSessions.filter((s) => new Date(s.createdAt) >= sevenDaysAgo).length
  const irsNewsPending = irsNews.filter((n) => !n.used).length

  const equitySpark = (stats?.equityCurve ?? []).slice(-14).map((p, i) => ({ x: `${i + 1}`, y: p.cumPips }))
  const habitsSpark = countByDay(dates14, habitHistory.map((h) => h.date.split('T')[0]))
  const contentSpark = countByDay(dates14, studioSessions.map((s) => s.createdAt.split('T')[0]))
  const negociosSpark = countByDay(dates14, corpTasksAll.filter((t) => t.completedAt).map((t) => t.completedAt!.split('T')[0]))

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-56 bg-[#1a1a1a] animate-pulse rounded-2xl" />)}
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

      {/* Traffic Light + Daily State — estado general del día, no pertenece a un solo mundo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">
            Actualizar estado {saving && <span className="text-blue-400">• guardando...</span>}
          </p>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="label">Estado mental ({MOOD_LABELS[dailyState.mentalState]})</label>
                <Link href="/journal" className="text-[11px] text-gray-600 hover:text-blue-400">
                  Journal de hoy →
                </Link>
              </div>
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

      {/* Cita del día */}
      <div className="card border-l-2 border-blue-600">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Cita del día</p>
        <p className="text-gray-300 text-sm italic leading-relaxed">&quot;{quote}&quot;</p>
      </div>

      {/* ── Los 4 mundos: Trading · Vida Personal · Negocios · Contenido ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Trading */}
        <Section
          accent="blue"
          href="/trading/sistema"
          title="Trading"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <StatBlock label="Trades hoy" value={todayTrades.length} caption={`${wins}W · ${losses}L`} />
            <StatBlock
              label="Win Rate"
              value={`${winRate}%`}
              valueClass={winRate >= 60 ? 'text-green-400' : winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}
              caption={`últ. 10: ${stats?.last10WinRate ?? '—'}%`}
            />
          </div>
          <div>
            <p className="text-[11px] text-gray-600 mb-1">Curva de equity · últimos 14 trades</p>
            <Sparkline data={equitySpark} color={ACCENT.blue.hex} valueSuffix=" pips" />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/trading/diario" className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Registrar trade
            </Link>
            <Link href="/trading/sistema" className="btn-secondary text-xs py-1.5 px-3">Checklist pre-trade</Link>
          </div>
        </Section>

        {/* Vida Personal */}
        <Section
          accent="purple"
          href="/habitos"
          title="Vida Personal"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <StatBlock
              label="Hábitos"
              value={`${completedCount}/${habits.length}`}
              caption={stats && stats.habitStreak > 0 ? `🔥 ${stats.habitStreak}d racha` : 'completados hoy'}
            />
            <StatBlock
              label="Pre-mercado"
              value={`${completedPreMarket}/${preMarketHabits.length}`}
              valueClass={completedPreMarket === preMarketHabits.length && preMarketHabits.length > 0 ? 'text-green-400' : 'text-yellow-400'}
              caption="rutina"
            />
          </div>
          <div>
            <p className="text-[11px] text-gray-600 mb-1">Hábitos completados · últimos 14 días</p>
            <Sparkline data={habitsSpark} color={ACCENT.purple.hex} />
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#2a2a2a]">
            {dailyGoals.length > 0 ? (
              <Link href="/metas" className="text-gray-500 hover:text-purple-400">
                🎯 {dailyGoals.filter((g) => g.todayDone).length}/{dailyGoals.length} metas diarias
              </Link>
            ) : <span />}
            {finance && (
              <Link href="/finanzas" className={`hover:underline ${finance.netBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                💰 {finance.netBalance >= 0 ? '+' : ''}{finance.netBalance.toLocaleString('es-CO', { maximumFractionDigits: 0 })} este mes
              </Link>
            )}
          </div>
        </Section>

        {/* Negocios */}
        <Section
          accent="emerald"
          href="/empresas"
          title="Negocios"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          {stats?.ceo ? (
            <div className="grid grid-cols-2 gap-3">
              <StatBlock
                label="Plan del día"
                value={`${stats.ceo.pct}%`}
                valueClass={stats.ceo.pct >= 75 ? 'text-emerald-400' : stats.ceo.pct >= 40 ? 'text-yellow-400' : 'text-zinc-400'}
                caption={`${stats.ceo.doneBlocks}/${stats.ceo.totalBlocks} bloques`}
              />
              <StatBlock label="Horas trabajadas" value={`${stats.ceo.workedHours}h`} caption="Command Center" />
            </div>
          ) : (
            <StatBlock label="Tareas urgentes" value={urgentTasks.length} caption="empresas + corporativas" />
          )}
          <div>
            <p className="text-[11px] text-gray-600 mb-1">Tareas corporativas completadas · últimos 14 días</p>
            <Sparkline data={negociosSpark} color={ACCENT.emerald.hex} />
          </div>
          {urgentTasks.length > 0 ? (
            <div className="space-y-1.5 pt-1 border-t border-[#2a2a2a]">
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                Tareas urgentes
              </p>
              {urgentTasks.slice(0, 3).map((task) => (
                <Link
                  key={`${task.source}-${task.id}`}
                  href={task.source === 'corp' ? `/corporate-tasks/${task.id}` : `/empresas/${task.company.id}`}
                  className="flex items-center gap-2 hover:bg-[#1a1a1a] rounded px-1 py-0.5 transition-colors"
                >
                  <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: task.company.color }} />
                  <p className="text-xs text-gray-300 flex-1 truncate">{task.title}</p>
                  <span className="text-[10px] text-gray-600 flex-shrink-0">{task.company.emoji}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-600 pt-1 border-t border-[#2a2a2a]">Sin tareas urgentes</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/corporate-tasks/new" className="btn-secondary text-xs py-1.5 px-3">+ Tarea corporativa</Link>
          </div>
        </Section>

        {/* Contenido */}
        <Section
          accent="amber"
          href="/content-creator"
          title="Contenido"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4" />
            </svg>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <StatBlock label="Guiones esta semana" value={contentThisWeek} caption="sesiones de estudio" />
            <StatBlock
              label="IRS News"
              value={irsNewsPending}
              valueClass={irsNewsPending > 0 ? 'text-amber-400' : 'text-gray-500'}
              caption="pendientes de usar"
            />
          </div>
          <div>
            <p className="text-[11px] text-gray-600 mb-1">Guiones generados · últimos 14 días</p>
            <Sparkline data={contentSpark} color={ACCENT.amber.hex} />
          </div>
          <div className="flex flex-wrap gap-2 pt-1 border-t border-[#2a2a2a]">
            <Link href="/content-creator" className="btn-secondary text-xs py-1.5 px-3">Content Creator</Link>
            <Link href="/mis-mapas" className="btn-secondary text-xs py-1.5 px-3">Mis Mapas</Link>
            <Link href="/irs-video" className="btn-secondary text-xs py-1.5 px-3">IRS Video</Link>
          </div>
        </Section>
      </div>
    </div>
  )
}

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
  blue: { text: 'text-cyan-300', border: 'border-cyan-500/25 hover:border-cyan-400/50', badge: 'bg-cyan-500/10 border-cyan-400/30 text-cyan-300', wash: 'from-cyan-500/[0.07]', hex: '#22d3ee', glow: 'rgba(34,211,238,0.16)' },
  purple: { text: 'text-violet-300', border: 'border-violet-500/25 hover:border-violet-400/50', badge: 'bg-violet-500/10 border-violet-400/30 text-violet-300', wash: 'from-violet-500/[0.07]', hex: '#a78bfa', glow: 'rgba(167,139,250,0.16)' },
  emerald: { text: 'text-emerald-300', border: 'border-emerald-500/25 hover:border-emerald-400/50', badge: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300', wash: 'from-emerald-500/[0.07]', hex: '#34d399', glow: 'rgba(52,211,153,0.16)' },
  amber: { text: 'text-amber-300', border: 'border-amber-500/25 hover:border-amber-400/50', badge: 'bg-amber-500/10 border-amber-400/30 text-amber-300', wash: 'from-amber-500/[0.07]', hex: '#fbbf24', glow: 'rgba(251,191,36,0.16)' },
} as const

type Accent = keyof typeof ACCENT

// Clipped corner (top-right + bottom-left notch) for the HUD-panel look — a single
// clip-path shared by every panel so the app reads as one system, not per-page CSS.
const HUD_CLIP = 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))'

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
    <section
      className={`group relative overflow-hidden border p-5 space-y-4 bg-[var(--bg-elevated)] transition-all duration-300 hover:-translate-y-0.5 ${a.border}`}
      style={{ clipPath: HUD_CLIP, boxShadow: `0 0 0 1px rgba(255,255,255,0.02)` }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ boxShadow: `0 0 32px -6px ${a.glow}` }}
      />
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.wash} to-transparent`} />
      <div className="pointer-events-none absolute top-0 left-0 right-4 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-40" style={{ color: a.hex }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 border flex items-center justify-center flex-shrink-0 ${a.badge}`} style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}>
            {icon}
          </div>
          <h2 className="font-display font-bold text-[15px] text-white tracking-tight">{title}</h2>
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
      <p className={`font-display text-3xl font-extrabold mt-0.5 tracking-tight ${valueClass ?? 'text-white'}`}>{value}</p>
      {caption && <p className="text-xs text-gray-600 mt-0.5">{caption}</p>}
    </div>
  )
}

// Live HUD clock — ticks client-side only, avoids hydration mismatch by rendering
// nothing until mounted.
function HudClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!now) return <span className="tabular-nums opacity-0">00:00:00</span>
  return <span className="tabular-nums">{now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
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
    verde: { label: 'Condición óptima', color: 'text-green-400', border: 'border-green-500/30', badge: 'bg-green-500/15 border-green-500/30', dot: 'bg-green-400' },
    amarillo: { label: 'Condición moderada', color: 'text-yellow-400', border: 'border-yellow-500/30', badge: 'bg-yellow-500/15 border-yellow-500/30', dot: 'bg-yellow-400' },
    rojo: { label: 'Condición baja — cuidado', color: 'text-red-400', border: 'border-red-500/30', badge: 'bg-red-500/15 border-red-500/30', dot: 'bg-red-400' },
  }[light]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-[#1a1a1a] animate-pulse rounded" />
        <div className="h-32 bg-[#1a1a1a] animate-pulse rounded-2xl" />
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
      {/* HUD status bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold gradient-text tracking-tight">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5 capitalize">
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass hud-border">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-display text-sm text-cyan-200">
            <HudClock />
          </span>
        </div>
      </div>

      {/* Estado del día — semáforo + inputs unificados en una sola tarjeta */}
      <div
        className={`relative overflow-hidden border p-5 space-y-4 bg-[var(--bg-elevated)] ${lightConfig.border}`}
        style={{ clipPath: HUD_CLIP }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${lightConfig.badge}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${lightConfig.dot}`} />
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Estado del día</p>
              <p className={`text-base font-bold leading-tight ${lightConfig.color}`}>{lightConfig.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#111] border border-[#2a2a2a] text-gray-400">
              Ánimo: {MOOD_LABELS[dailyState.mentalState]}
            </span>
            <span className={`text-[11px] px-2.5 py-1 rounded-full border ${dailyState.rutinaCompleted ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-[#111] border-[#2a2a2a] text-gray-500'}`}>
              Rutina {dailyState.rutinaCompleted ? '✓' : '✗'}
            </span>
            <span className={`text-[11px] px-2.5 py-1 rounded-full border ${dailyState.hasNews ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' : 'bg-[#111] border-[#2a2a2a] text-gray-500'}`}>
              Noticias {dailyState.hasNews ? '⚠️ Sí' : 'No'}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-[#2a2a2a] grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500">
                Actualizar estado mental {saving && <span className="text-cyan-300">• guardando...</span>}
              </label>
              <Link href="/journal" className="text-[11px] text-gray-600 hover:text-cyan-300">
                Journal de hoy →
              </Link>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => saveDailyState({ mentalState: v })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    dailyState.mentalState === v
                      ? 'bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-glow'
                      : 'bg-[#111] text-gray-500 hover:text-gray-300 border border-[#2a2a2a]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 md:pt-5">
            <button
              onClick={() => saveDailyState({ rutinaCompleted: !dailyState.rutinaCompleted })}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                dailyState.rutinaCompleted
                  ? 'bg-green-500/15 border-green-500/30 text-green-400'
                  : 'bg-[#111] border-[#2a2a2a] text-gray-400 hover:text-gray-200'
              }`}
            >
              Rutina completada
            </button>
            <button
              onClick={() => saveDailyState({ hasNews: !dailyState.hasNews })}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                dailyState.hasNews
                  ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                  : 'bg-[#111] border-[#2a2a2a] text-gray-400 hover:text-gray-200'
              }`}
            >
              Noticias alto impacto
            </button>
          </div>
        </div>
      </div>

      {/* Cita del día */}
      <div className="card border-l-2 border-cyan-500/60 glass">
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

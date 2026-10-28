'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { getDailyQuote, computeTrafficLight } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import type { OfficeDepartment } from '@/lib/office'

// Centro de mando: primero lo que necesita tu decisión hoy, después tus empresas y,
// al final, tu día personal. Cada bloque lleva a la pantalla donde se trabaja.

interface DailyState { mentalState: number; rutinaCompleted: boolean; hasNews: boolean }
interface Trade { id: string; result: string }
interface Habit { id: string; isPreMarket: boolean }
interface HabitCompletion { habitId: string }
interface AppEvent { id: string; title: string; date: string; time: string | null; isForexNews: boolean }
interface UrgentTask {
  id: string
  title: string
  dueDate?: string | null
  source: 'interna' | 'corp'
  company: { id: string; name: string; emoji: string }
}
interface Stats { last10WinRate: number; habitStreak: number }
interface FinanceSummary { netBalance: number }
interface IrsNewsLite { used: boolean }

const MOOD_LABELS = ['', 'Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente']

const LIGHT = {
  verde: { label: 'Condición óptima', cls: 'text-emerald-300', dot: 'bg-emerald-400' },
  amarillo: { label: 'Condición moderada', cls: 'text-amber-300', dot: 'bg-amber-400' },
  rojo: { label: 'Condición baja: cuídate hoy', cls: 'text-red-300', dot: 'bg-red-400' },
} as const

function greeting(): string {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Bogota' }))
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function Card({ title, href, hrefLabel, children, className = '' }: { title: string; href?: string; hrefLabel?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {href && <Link href={href} className="text-xs font-medium text-cyan-300 hover:underline">{hrefLabel ?? 'Ver todo'} →</Link>}
      </div>
      {children}
    </section>
  )
}

function Attention({ href, count, label, hint, tone }: { href: string; count: number; label: string; hint: string; tone: 'amber' | 'red' | 'cyan' }) {
  const t = {
    amber: 'border-amber-500/30 hover:border-amber-400/60 text-amber-300',
    red: 'border-red-500/30 hover:border-red-400/60 text-red-300',
    cyan: 'border-cyan-500/30 hover:border-cyan-400/60 text-cyan-300',
  }[tone]
  return (
    <Link href={href} className={`group flex items-center gap-4 rounded-2xl border bg-zinc-900/60 p-4 transition-colors ${t}`}>
      <span className="font-display text-4xl font-extrabold tabular-nums">{count}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-zinc-100">{label}</span>
        <span className="block text-xs text-zinc-500">{hint}</span>
      </span>
      <span className="ml-auto text-zinc-600 transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  )
}

export default function DashboardPage() {
  const { showToast } = useToast()
  const [dailyState, setDailyState] = useState<DailyState>({ mentalState: 3, rutinaCompleted: false, hasNews: false })
  const [todayTrades, setTodayTrades] = useState<Trade[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<HabitCompletion[]>([])
  const [events, setEvents] = useState<AppEvent[]>([])
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([])
  const [dailyGoals, setDailyGoals] = useState<{ id: string; todayDone: boolean }[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [finance, setFinance] = useState<FinanceSummary | null>(null)
  const [irsNews, setIrsNews] = useState<IrsNewsLite[]>([])
  const [departments, setDepartments] = useState<OfficeDepartment[]>([])
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]
  const quote = getDailyQuote()
  const light = LIGHT[computeTrafficLight(dailyState.mentalState, dailyState.rutinaCompleted, dailyState.hasNews)]

  const loadData = useCallback(async () => {
    setLoadError(false)
    setLoading(true)
    try {
      const [stateRes, tradesRes, habitsRes, completionsRes, eventsRes, companiesRes, corpTasksRes, statsRes, goalsRes, financeRes, irsNewsRes, officeRes] = await Promise.all([
        fetch(`/api/daily-state?date=${today}`),
        fetch(`/api/trades?date=${today}`),
        fetch('/api/habits'),
        fetch(`/api/habits/complete?date=${today}`),
        fetch(`/api/events?from=${today}`),
        fetch('/api/companies'),
        fetch('/api/corporate-tasks'),
        fetch('/api/stats'),
        fetch('/api/goals'),
        fetch('/api/finance/summary'),
        fetch('/api/irs-news'),
        fetch('/api/office', { cache: 'no-store' }),
      ])
      if (stateRes.ok) { const s = await stateRes.json(); if (s) setDailyState(s) }
      if (tradesRes.ok) setTodayTrades(await tradesRes.json())
      if (habitsRes.ok) setHabits(await habitsRes.json())
      if (completionsRes.ok) setCompletions(await completionsRes.json())
      if (eventsRes.ok) setEvents((await eventsRes.json()).slice(0, 5))
      if (statsRes.ok) setStats(await statsRes.json())
      if (financeRes.ok) setFinance(await financeRes.json())
      if (irsNewsRes.ok) setIrsNews(await irsNewsRes.json())
      if (officeRes.ok) setDepartments(((await officeRes.json()) as { departments: OfficeDepartment[] }).departments)

      const urgent: UrgentTask[] = []
      if (companiesRes.ok) {
        const companies: Array<{ id: string; name: string; emoji: string; tasks: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string | null }> }> = await companiesRes.json()
        for (const c of companies) {
          for (const t of c.tasks) {
            if (t.priority === 'alta' && t.status !== 'completada') urgent.push({ id: t.id, title: t.title, dueDate: t.dueDate, source: 'interna', company: { id: c.id, name: c.name, emoji: c.emoji } })
          }
        }
      }
      if (corpTasksRes.ok) {
        const corp: Array<{ id: string; title: string; priority: string; status: string; dueDate?: string | null; company: { id: string; name: string; emoji: string } }> = await corpTasksRes.json()
        for (const t of corp) {
          if ((t.priority === 'high' || t.priority === 'urgent') && t.status !== 'completed') urgent.push({ id: t.id, title: t.title, dueDate: t.dueDate, source: 'corp', company: t.company })
        }
      }
      urgent.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      setUrgentTasks(urgent)
      if (goalsRes.ok) {
        const goals: Array<{ subGoals: Array<{ id: string; daily: boolean; todayDone: boolean }> }> = await goalsRes.json()
        setDailyGoals(goals.flatMap((g) => g.subGoals.filter((s) => s.daily).map((s) => ({ id: s.id, todayDone: s.todayDone }))))
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => { loadData() }, [loadData])

  async function saveDailyState(updates: Partial<DailyState>) {
    const prev = dailyState
    const next = { ...dailyState, ...updates }
    setDailyState(next)
    setSaving(true)
    try {
      const res = await fetch('/api/daily-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...next, date: today }) })
      if (!res.ok) throw new Error()
      showToast('Estado guardado', 'success')
    } catch {
      setDailyState(prev)
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const marketing = useMemo(() => departments.filter((d) => d.kind === 'marketing'), [departments])
  const postsPending = marketing.reduce((n, d) => n + (d.stats[0]?.value ?? 0), 0)
  const agentsDown = departments.flatMap((d) => d.agents.filter((a) => a.status === 'alert').map((a) => ({ a, d })))
  const irsPending = irsNews.filter((n) => !n.used).length
  const todayEvents = events.filter((e) => e.date.split('T')[0] === today)
  const attentionCount = (postsPending ? 1 : 0) + (agentsDown.length ? 1 : 0) + (urgentTasks.length ? 1 : 0) + (irsPending ? 1 : 0)

  // Una frase que resume el día, para no tener que leer todas las tarjetas.
  const summary = (() => {
    const bits: string[] = []
    if (postsPending) bits.push(`${plural(postsPending, 'post espera', 'posts esperan')} tu aprobación`)
    if (agentsDown.length) bits.push(`${plural(agentsDown.length, 'agente necesita', 'agentes necesitan')} atención`)
    if (urgentTasks.length) bits.push(`${plural(urgentTasks.length, 'tarea urgente', 'tareas urgentes')}`)
    if (bits.length === 0) return 'Todo en orden: nada pendiente por decidir.'
    return `Hoy: ${bits.join(' · ')}.`
  })()

  const wins = todayTrades.filter((t) => t.result === 'win').length
  const preMarket = habits.filter((h) => h.isPreMarket)
  const preMarketDone = preMarket.filter((h) => completions.some((c) => c.habitId === h.id)).length
  const goalsDone = dailyGoals.filter((g) => g.todayDone).length

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-16 w-80 animate-pulse rounded-lg bg-zinc-800/60" />
        <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-800/60" />)}</div>
        <div className="h-48 animate-pulse rounded-2xl bg-zinc-800/60" />
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-zinc-400">No se pudo cargar el dashboard</p>
        <button onClick={loadData} className="btn-secondary">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Saludo y resumen */}
      <header>
        <p className="text-sm capitalize text-zinc-500">
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' })}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">{greeting()}</h1>
        <p className="mt-1 text-[15px] text-zinc-300">{summary}</p>
      </header>

      {/* Necesita tu atención */}
      <section aria-label="Necesita tu atención">
        {attentionCount === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <span className="text-xl">✅</span>
            <div>
              <p className="text-sm font-semibold text-emerald-200">Todo en orden</p>
              <p className="text-xs text-zinc-400">No hay posts por aprobar, ni agentes con problemas, ni tareas urgentes.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {postsPending > 0 && <Attention href="/command-center" count={postsPending} tone="amber" label={postsPending === 1 ? 'Post por aprobar' : 'Posts por aprobar'} hint="Revísalos en el Command Center" />}
            {agentsDown.length > 0 && <Attention href="/agentes" count={agentsDown.length} tone="red" label={agentsDown.length === 1 ? 'Agente con problemas' : 'Agentes con problemas'} hint={agentsDown.slice(0, 2).map((x) => x.a.name).join(', ')} />}
            {urgentTasks.length > 0 && <Attention href="/corporate-tasks" count={urgentTasks.length} tone="cyan" label={urgentTasks.length === 1 ? 'Tarea urgente' : 'Tareas urgentes'} hint={urgentTasks[0]?.title ?? ''} />}
            {irsPending > 0 && <Attention href="/irs-news" count={irsPending} tone="cyan" label={irsPending === 1 ? 'Noticia del IRS sin usar' : 'Noticias del IRS sin usar'} hint="Conviértelas en contenido" />}
          </div>
        )}
      </section>

      {/* Tus empresas */}
      <Card title="Tus empresas" href="/command-center" hrefLabel="Command Center">
        {marketing.length === 0 ? (
          <p className="text-sm text-zinc-500">Aún no tienes empresas activas. Créalas en el Command Center.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {marketing.map((d) => {
              const working = d.agents.filter((a) => a.status === 'work').length
              const alert = d.agents.filter((a) => a.status === 'alert').length
              const real = d.agents.filter((a) => a.status !== 'ghost').length
              return (
                <li key={d.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href="/command-center" className="flex flex-wrap items-center gap-x-6 gap-y-2 hover:opacity-90">
                    <span className="flex min-w-[180px] flex-1 items-center gap-2.5">
                      <span className="h-3 w-3 rounded-sm" style={{ background: d.accent }} />
                      <span className="text-sm font-semibold text-zinc-100">{d.name}</span>
                    </span>
                    <span className="flex gap-5 text-xs text-zinc-400">
                      {d.stats.map((s) => (
                        <span key={s.label}><b className="font-mono text-base text-white">{s.value}</b> {s.label}</span>
                      ))}
                    </span>
                    <span className={`text-xs ${alert ? 'text-red-300' : working ? 'text-emerald-300' : 'text-zinc-500'}`}>
                      ● {alert ? `${plural(alert, 'agente con problemas', 'agentes con problemas')}` : working ? `${working} de ${real} agentes trabajando` : `${real} agentes en reposo`}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agenda y tareas */}
        <Card title="Lo que viene" href="/agenda" hrefLabel="Agenda">
          {events.length === 0 && urgentTasks.length === 0 ? (
            <p className="text-sm text-zinc-500">Sin eventos próximos ni tareas urgentes.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 font-mono text-xs text-zinc-500">
                    {e.date.split('T')[0] === today ? 'hoy' : new Date(e.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                    {e.time ? ` ${e.time}` : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{e.isForexNews ? '📰 ' : ''}{e.title}</span>
                </li>
              ))}
              {urgentTasks.slice(0, 4).map((t) => (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-xs text-red-300">urgente</span>
                  <Link href={t.source === 'corp' ? `/corporate-tasks/${t.id}` : `/empresas/${t.company.id}`} className="min-w-0 flex-1 truncate text-zinc-200 hover:text-cyan-300">
                    {t.title} <span className="text-zinc-600">· {t.company.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {todayEvents.length > 0 && <p className="mt-3 text-xs text-zinc-500">{plural(todayEvents.length, 'evento hoy', 'eventos hoy')}</p>}
        </Card>

        {/* Tu día */}
        <Card title="Tu día">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${light.dot}`} />
            <span className={`text-sm font-semibold ${light.cls}`}>{light.label}</span>
            <span className="ml-auto text-xs text-zinc-500">Ánimo: {MOOD_LABELS[dailyState.mentalState]}{saving ? ' · guardando…' : ''}</span>
          </div>
          <div className="mt-3 flex gap-1.5" role="group" aria-label="Estado mental">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => saveDailyState({ mentalState: v })}
                aria-pressed={dailyState.mentalState === v}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${dailyState.mentalState === v ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100' : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-200'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => saveDailyState({ rutinaCompleted: !dailyState.rutinaCompleted })}
              aria-pressed={dailyState.rutinaCompleted}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${dailyState.rutinaCompleted ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              {dailyState.rutinaCompleted ? '✓ ' : ''}Rutina completada
            </button>
            <button
              onClick={() => saveDailyState({ hasNews: !dailyState.hasNews })}
              aria-pressed={dailyState.hasNews}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${dailyState.hasNews ? 'border-amber-500/40 bg-amber-500/15 text-amber-300' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              Noticias de alto impacto
            </button>
            <Link href="/journal" className="ml-auto self-center text-xs text-zinc-500 hover:text-cyan-300">Journal →</Link>
          </div>
          <p className="mt-3 border-l-2 border-cyan-500/50 pl-3 text-sm italic text-zinc-400">&ldquo;{quote}&rdquo;</p>
        </Card>
      </div>

      {/* Números rápidos */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/habitos" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-600">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Hábitos hoy</p>
          <p className="font-display text-3xl font-extrabold tabular-nums text-white">{completions.length}<span className="text-lg text-zinc-600">/{habits.length}</span></p>
          <p className="text-xs text-zinc-500">{preMarket.length ? `Pre-mercado ${preMarketDone}/${preMarket.length} · ` : ''}racha {stats?.habitStreak ?? 0} días</p>
        </Link>
        <Link href="/trading/sistema" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-600">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Trading hoy</p>
          <p className="font-display text-3xl font-extrabold tabular-nums text-white">{todayTrades.length}<span className="text-lg text-zinc-600"> trades</span></p>
          <p className="text-xs text-zinc-500">{wins}W · {todayTrades.length - wins}L · últimos 10: {stats?.last10WinRate ?? 0}% acierto</p>
        </Link>
        <Link href="/metas" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-600">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Metas de hoy</p>
          <p className="font-display text-3xl font-extrabold tabular-nums text-white">{goalsDone}<span className="text-lg text-zinc-600">/{dailyGoals.length}</span></p>
          <p className="text-xs text-zinc-500">metas diarias cumplidas</p>
        </Link>
        <Link href="/finanzas" className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-600">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Finanzas del mes</p>
          <p className={`font-display text-3xl font-extrabold tabular-nums ${(finance?.netBalance ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {finance ? `${finance.netBalance >= 0 ? '+' : ''}${finance.netBalance.toLocaleString('es-CO', { maximumFractionDigits: 0 })}` : '—'}
          </p>
          <p className="text-xs text-zinc-500">balance neto</p>
        </Link>
      </div>
    </div>
  )
}

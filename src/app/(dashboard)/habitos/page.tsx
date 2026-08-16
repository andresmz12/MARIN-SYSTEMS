'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

interface Habit {
  id: string
  name: string
  emoji: string
  category: string
  frequency: string
  isPreMarket: boolean
}

interface Completion {
  id: string
  habitId: string
  date: string
}

interface HabitHistory {
  habitId: string
  date: string
}

const CATEGORIES = ['trading', 'salud', 'personal', 'aprendizaje']
const CATEGORY_COLORS: Record<string, string> = {
  trading: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  salud: 'bg-green-500/20 text-green-400 border-green-500/30',
  personal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  aprendizaje: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const WEEKDAY_ABBR = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

const WEEK_PALETTE = [
  { bg: 'bg-pink-500/10', border: 'border-pink-500/20', text: 'text-pink-400', bar: 'bg-pink-500', check: 'bg-pink-500 border-pink-500' },
  { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', bar: 'bg-purple-500', check: 'bg-purple-500 border-purple-500' },
  { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500', check: 'bg-blue-500 border-blue-500' },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', bar: 'bg-cyan-500', check: 'bg-cyan-500 border-cyan-500' },
  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', bar: 'bg-emerald-500', check: 'bg-emerald-500 border-emerald-500' },
]

const emptyForm = {
  name: '',
  emoji: '⭐',
  category: 'trading',
  frequency: 'diario',
  isPreMarket: false,
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function generateLast84Days(): string[] {
  const days: string[] = []
  for (let i = 83; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

function getMonthDays(monthStr: string): { dateStr: string; day: number; weekday: string }[] {
  const [y, m] = monthStr.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days: { dateStr: string; day: number; weekday: string }[] = []
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(y, m - 1, day))
    days.push({
      dateStr: `${y}-${pad2(m)}-${pad2(day)}`,
      day,
      weekday: WEEKDAY_ABBR[d.getUTCDay()],
    })
  }
  return days
}

function chunkWeeks<T>(arr: T[], size = 7): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

export default function HabitosPage() {
  const { showToast } = useToast()
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<Completion[]>([])
  const [history, setHistory] = useState<HabitHistory[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editHabit, setEditHabit] = useState<Habit | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'mensual' | 'lista'>('mensual')
  const [currentMonth, setCurrentMonth] = useState(currentMonthStr())
  const [monthHistory, setMonthHistory] = useState<HabitHistory[]>([])
  const [monthLoading, setMonthLoading] = useState(false)
  const today = new Date().toISOString().split('T')[0]
  const days84 = generateLast84Days()

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    loadMonthHistory(currentMonth)
  }, [currentMonth])

  async function loadData() {
    setLoadError(false)
    setPageLoading(true)
    try {
      const [habitsRes, completionsRes, historyRes] = await Promise.all([
        fetch('/api/habits'),
        fetch(`/api/habits/complete?date=${today}`),
        fetch('/api/habits/history'),
      ])
      if (habitsRes.ok) setHabits(await habitsRes.json())
      if (completionsRes.ok) setCompletions(await completionsRes.json())
      if (historyRes.ok) setHistory(await historyRes.json())
    } catch {
      setLoadError(true)
    } finally {
      setPageLoading(false)
    }
  }

  async function loadMonthHistory(month: string) {
    setMonthLoading(true)
    try {
      const res = await fetch(`/api/habits/history?month=${month}`)
      if (res.ok) setMonthHistory(await res.json())
    } catch {
      showToast('Error al cargar el historial del mes', 'error')
    } finally {
      setMonthLoading(false)
    }
  }

  async function toggleHabit(habitId: string) {
    // Optimistic update
    const isDone = completions.some((c) => c.habitId === habitId)
    if (isDone) {
      setCompletions((prev) => prev.filter((c) => c.habitId !== habitId))
    } else {
      setCompletions((prev) => [...prev, { id: `temp-${habitId}`, habitId, date: today }])
    }
    try {
      await fetch('/api/habits/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date: today }),
      })
      if (currentMonth === currentMonthStr()) loadMonthHistory(currentMonth)
    } catch {
      // Revert on error
      if (isDone) {
        setCompletions((prev) => [...prev, { id: `temp-${habitId}`, habitId, date: today }])
      } else {
        setCompletions((prev) => prev.filter((c) => c.habitId !== habitId))
      }
      showToast('Error al guardar hábito', 'error')
    }
  }

  async function toggleGridCell(habitId: string, dateStr: string) {
    if (dateStr > today) return // no se pueden marcar días futuros

    const isDone = monthHistory.some((h) => h.habitId === habitId && h.date.startsWith(dateStr))
    // Optimistic update
    if (isDone) {
      setMonthHistory((prev) => prev.filter((h) => !(h.habitId === habitId && h.date.startsWith(dateStr))))
    } else {
      setMonthHistory((prev) => [...prev, { habitId, date: dateStr }])
    }
    if (dateStr === today) {
      if (isDone) setCompletions((prev) => prev.filter((c) => c.habitId !== habitId))
      else setCompletions((prev) => [...prev, { id: `temp-${habitId}`, habitId, date: today }])
    }

    try {
      await fetch('/api/habits/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date: dateStr }),
      })
    } catch {
      // Revert on error
      if (isDone) setMonthHistory((prev) => [...prev, { habitId, date: dateStr }])
      else setMonthHistory((prev) => prev.filter((h) => !(h.habitId === habitId && h.date.startsWith(dateStr))))
      if (dateStr === today) {
        if (isDone) setCompletions((prev) => [...prev, { id: `temp-${habitId}`, habitId, date: today }])
        else setCompletions((prev) => prev.filter((c) => c.habitId !== habitId))
      }
      showToast('Error al guardar hábito', 'error')
    }
  }

  function openCreate() {
    setEditHabit(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(habit: Habit) {
    setEditHabit(habit)
    setForm({
      name: habit.name,
      emoji: habit.emoji,
      category: habit.category,
      frequency: habit.frequency,
      isPreMarket: habit.isPreMarket,
    })
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (editHabit) {
        await fetch(`/api/habits/${editHabit.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        showToast('Hábito actualizado', 'success')
      } else {
        await fetch('/api/habits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        showToast('Hábito creado', 'success')
      }
    } catch {
      showToast('Error al guardar hábito', 'error')
    } finally {
      setLoading(false)
      setModalOpen(false)
      loadData()
      loadMonthHistory(currentMonth)
    }
  }

  async function deleteHabit(id: string) {
    if (!confirm('¿Eliminar este hábito y todo su historial?')) return
    try {
      await fetch(`/api/habits/${id}`, { method: 'DELETE' })
      showToast('Hábito eliminado', 'info')
    } catch {
      showToast('Error al eliminar', 'error')
    }
    loadData()
    loadMonthHistory(currentMonth)
  }

  function computeStreak(habitId: string): number {
    const habitDates = history
      .filter((h) => h.habitId === habitId)
      .map((h) => h.date.split('T')[0])
      .sort((a, b) => b.localeCompare(a))

    if (!habitDates.length) return 0
    const todayCompleted = completions.some((c) => c.habitId === habitId)
    const reference = todayCompleted ? today : (() => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return d.toISOString().split('T')[0]
    })()
    if (habitDates[0] !== reference && habitDates[0] !== today) return 0

    let streak = 0
    let current = new Date(habitDates[0])
    for (const dateStr of habitDates) {
      const d = new Date(dateStr)
      const diff = Math.round((current.getTime() - d.getTime()) / 86400000)
      if (diff <= 1) {
        streak++
        current = d
      } else break
    }
    return streak
  }

  const filtered = selectedCategory === 'all' ? habits : habits.filter((h) => h.category === selectedCategory)
  const completedCount = completions.length
  const totalHabits = habits.filter((h) => h.frequency === 'diario').length

  // ── Datos de la vista mensual ──
  const dailyHabits = habits.filter((h) => h.frequency === 'diario')
  const monthDays = getMonthDays(currentMonth)
  const weeks = chunkWeeks(monthDays, 7)
  const isCurrentCalendarMonth = currentMonth === currentMonthStr()

  const monthCompletedByDate: Record<string, Set<string>> = {}
  for (const h of monthHistory) {
    const d = h.date.split('T')[0]
    if (!monthCompletedByDate[d]) monthCompletedByDate[d] = new Set()
    monthCompletedByDate[d].add(h.habitId)
  }

  const dailyHabitIds = new Set(dailyHabits.map((h) => h.id))
  const totalCompletedThisMonth = monthHistory.filter((h) => dailyHabitIds.has(h.habitId)).length
  const daysElapsedInMonth = isCurrentCalendarMonth
    ? monthDays.filter((d) => d.dateStr <= today).length
    : monthDays.length
  const totalPossibleSoFar = dailyHabits.length * daysElapsedInMonth
  const remainingThisMonth = Math.max(0, dailyHabits.length * monthDays.length - totalCompletedThisMonth)

  const trendData = monthDays.map((d) => ({
    day: d.day,
    completados: dailyHabits.length > 0 ? (monthCompletedByDate[d.dateStr]?.size ?? 0) : 0,
  }))

  if (pageLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-[#1a1a1a] animate-pulse rounded" />
        <div className="card h-12 bg-[#1a1a1a] animate-pulse" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="card h-16 bg-[#1a1a1a] animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-400">No se pudo cargar los hábitos</p>
        <button onClick={loadData} className="btn-secondary">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Hábitos</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {completedCount}/{totalHabits} completados hoy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
            <button
              onClick={() => setViewMode('mensual')}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'mensual' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setViewMode('lista')}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'lista' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Lista
            </button>
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo hábito
          </button>
        </div>
      </div>

      {viewMode === 'mensual' ? (
        <>
          {/* Month navigator */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentMonth((m) => shiftMonth(m, -1))}
              className="text-gray-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-[#1a1a1a]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              {MONTH_NAMES[Number(currentMonth.split('-')[1]) - 1]} {currentMonth.split('-')[0]}
            </h2>
            <button
              onClick={() => setCurrentMonth((m) => shiftMonth(m, 1))}
              disabled={currentMonth >= currentMonthStr()}
              className="text-gray-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-[#1a1a1a] disabled:opacity-30 disabled:pointer-events-none"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {dailyHabits.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-600 text-sm">No hay hábitos diarios. ¡Crea el primero!</p>
            </div>
          ) : (
            <>
              {/* Stat cards + trend chart */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card md:col-span-1 flex flex-col justify-center gap-3">
                  <div>
                    <p className="text-xs text-pink-400 uppercase tracking-wider font-semibold">Completados</p>
                    <p className="text-2xl font-bold text-white">{totalCompletedThisMonth}</p>
                  </div>
                  <div>
                    <p className="text-xs text-purple-400 uppercase tracking-wider font-semibold">Restantes</p>
                    <p className="text-2xl font-bold text-white">{remainingThisMonth}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-400 uppercase tracking-wider font-semibold">Días del mes</p>
                    <p className="text-2xl font-bold text-white">{monthDays.length}</p>
                  </div>
                  {totalPossibleSoFar > 0 && (
                    <div className="pt-1 border-t border-[#2a2a2a]">
                      <p className="text-xs text-gray-500">Progreso global</p>
                      <p className="text-sm font-semibold text-white">
                        {totalCompletedThisMonth}/{dailyHabits.length * monthDays.length}{' '}
                        <span className="text-gray-500 font-normal">
                          ({Math.round((totalCompletedThisMonth / (dailyHabits.length * monthDays.length)) * 100)}%)
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="card md:col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Tendencia diaria</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="habitTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                      <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                        labelStyle={{ color: '#9ca3af' }}
                        itemStyle={{ color: '#e5e7eb' }}
                        labelFormatter={(d) => `Día ${d}`}
                      />
                      <Area type="monotone" dataKey="completados" stroke="#22c55e" strokeWidth={2} fill="url(#habitTrend)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Weekly progress bars */}
              <div className="card">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Resumen semanal</p>
                <div className="space-y-3">
                  {weeks.map((week, wIdx) => {
                    const palette = WEEK_PALETTE[wIdx % WEEK_PALETTE.length]
                    const relevantDays = week.filter((d) => !isCurrentCalendarMonth || d.dateStr <= today)
                    const terminado = relevantDays.reduce(
                      (sum, d) => sum + (monthCompletedByDate[d.dateStr]?.size ?? 0), 0,
                    )
                    const total = dailyHabits.length * week.length
                    const pct = total > 0 ? Math.round((terminado / total) * 100) : 0
                    return (
                      <div key={wIdx} className="flex items-center gap-3">
                        <span className={`text-xs font-semibold w-20 flex-shrink-0 ${palette.text}`}>
                          Semana {wIdx + 1}
                        </span>
                        <div className="flex-1 bg-[#111] rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-2.5 rounded-full transition-all duration-500 ${palette.bar}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-20 flex-shrink-0 text-right">
                          {terminado}/{total} · {pct}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Grid de hábitos diarios */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Hábitos diarios</p>
                  {monthLoading && <span className="text-xs text-gray-600">Cargando…</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="border-separate" style={{ borderSpacing: '2px' }}>
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-[color:var(--bg-elevated)] text-left text-xs text-gray-500 font-medium px-2 pb-2 min-w-[180px]">
                          Hábito
                        </th>
                        {weeks.map((week, wIdx) => {
                          const palette = WEEK_PALETTE[wIdx % WEEK_PALETTE.length]
                          return week.map((d) => (
                            <th key={d.dateStr} className={`px-0 pb-2 text-center ${palette.text}`}>
                              <div className="text-[10px] uppercase">{d.weekday}</div>
                              <div className="text-xs font-semibold">{d.day}</div>
                            </th>
                          ))
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {dailyHabits.map((habit) => (
                        <tr key={habit.id}>
                          <td className="sticky left-0 z-10 bg-[color:var(--bg-elevated)] px-2 py-1 text-sm text-white whitespace-nowrap">
                            <span className="mr-1.5">{habit.emoji}</span>{habit.name}
                          </td>
                          {weeks.map((week, wIdx) => {
                            const palette = WEEK_PALETTE[wIdx % WEEK_PALETTE.length]
                            return week.map((d) => {
                              const done = monthCompletedByDate[d.dateStr]?.has(habit.id) ?? false
                              const isFuture = d.dateStr > today
                              return (
                                <td key={d.dateStr} className={`p-0.5 rounded ${palette.bg}`}>
                                  <button
                                    disabled={isFuture}
                                    onClick={() => toggleGridCell(habit.id, d.dateStr)}
                                    className={`w-7 h-7 rounded border flex items-center justify-center transition-colors ${
                                      done
                                        ? palette.check
                                        : `border-[#2a2a2a] ${isFuture ? 'opacity-30 cursor-not-allowed' : 'hover:border-gray-500'}`
                                    }`}
                                  >
                                    {done && (
                                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </button>
                                </td>
                              )
                            })
                          })}
                        </tr>
                      ))}
                      <tr>
                        <td className="sticky left-0 z-10 bg-[color:var(--bg-elevated)] px-2 pt-2 text-xs text-gray-500 font-medium">
                          Terminado
                        </td>
                        {weeks.map((week, wIdx) =>
                          week.map((d) => (
                            <td key={d.dateStr} className="pt-2 text-center text-xs text-gray-400 font-semibold">
                              {monthCompletedByDate[d.dateStr]?.size ?? 0}
                            </td>
                          )),
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* Progress bar */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Progreso de hoy</span>
              <span className="text-sm font-semibold text-white">
                {totalHabits > 0 ? Math.round((completedCount / totalHabits) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-[#111] rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${totalHabits > 0 ? (completedCount / totalHabits) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Category filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-gray-500/20 text-gray-300 border-gray-500/40'
                  : 'text-gray-600 border-[#2a2a2a] hover:text-gray-400'
              }`}
            >
              Todos
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ${
                  selectedCategory === cat
                    ? CATEGORY_COLORS[cat]
                    : 'text-gray-600 border-[#2a2a2a] hover:text-gray-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Habits List */}
          {filtered.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-600 text-sm">No hay hábitos. ¡Crea el primero!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((habit) => {
                const isDone = completions.some((c) => c.habitId === habit.id)
                const streak = computeStreak(habit.id)
                const habitHistory = history.filter((h) => h.habitId === habit.id).map((h) => h.date.split('T')[0])

                return (
                  <div key={habit.id} className="card flex items-start gap-4">
                    {/* Toggle */}
                    <button
                      onClick={() => toggleHabit(habit.id)}
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        isDone
                          ? 'bg-green-500 border-green-500'
                          : 'border-[#3a3a3a] hover:border-green-500'
                      }`}
                    >
                      {isDone && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg">{habit.emoji}</span>
                        <span className={`font-medium text-sm ${isDone ? 'text-gray-500 line-through' : 'text-white'}`}>
                          {habit.name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[habit.category]}`}>
                          {habit.category}
                        </span>
                        {habit.isPreMarket && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            pre-mercado
                          </span>
                        )}
                      </div>

                      {/* Contribution mini-graph */}
                      <div className="mt-2 flex gap-0.5 flex-wrap" style={{ maxWidth: '420px' }}>
                        {days84.slice(-28).map((day) => {
                          const done = habitHistory.includes(day) || (day === today && isDone)
                          return (
                            <div
                              key={day}
                              title={day}
                              className={`w-3 h-3 rounded-sm ${done ? 'bg-green-500' : 'bg-[#222]'}`}
                            />
                          )
                        })}
                      </div>
                    </div>

                    {/* Streak + Actions */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {streak > 0 && (
                        <div className="text-center">
                          <p className="text-sm font-bold text-orange-400">{streak}</p>
                          <p className="text-[10px] text-gray-600">racha</p>
                        </div>
                      )}
                      <button
                        onClick={() => openEdit(habit)}
                        className="text-gray-600 hover:text-gray-400 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteHabit(habit.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 12-Week Contribution Graph */}
          {habits.length > 0 && (
            <div className="card">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Historial de completados — últimas 12 semanas</p>
              <div className="overflow-x-auto">
                <div className="flex gap-1">
                  {Array.from({ length: 12 }, (_, weekIdx) => (
                    <div key={weekIdx} className="flex flex-col gap-1">
                      {Array.from({ length: 7 }, (_, dayIdx) => {
                        const dayOffset = (11 - weekIdx) * 7 + (6 - dayIdx)
                        const d = new Date()
                        d.setDate(d.getDate() - dayOffset)
                        const dateStr = d.toISOString().split('T')[0]
                        const completedHabits = habits.filter((h) =>
                          history.some((hist) => hist.habitId === h.id && hist.date.startsWith(dateStr))
                        ).length
                        const pct = habits.length > 0 ? completedHabits / habits.length : 0
                        const bg = pct === 0 ? 'bg-[#1f1f1f]'
                          : pct < 0.33 ? 'bg-green-900'
                          : pct < 0.66 ? 'bg-green-700'
                          : pct < 1 ? 'bg-green-500'
                          : 'bg-green-400'
                        return (
                          <div
                            key={dayIdx}
                            className={`w-3.5 h-3.5 rounded-sm ${bg}`}
                            title={`${dateStr}: ${completedHabits}/${habits.length} hábitos`}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-gray-600">Menos</span>
                {['bg-[#1f1f1f]', 'bg-green-900', 'bg-green-700', 'bg-green-500', 'bg-green-400'].map((c, i) => (
                  <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
                ))}
                <span className="text-xs text-gray-600">Más</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editHabit ? 'Editar hábito' : 'Nuevo hábito'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="label">Emoji</label>
              <input
                type="text"
                className="input text-center text-lg"
                value={form.emoji}
                onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                maxLength={2}
              />
            </div>
            <div className="col-span-3">
              <label className="label">Nombre del hábito</label>
              <input
                type="text"
                className="input"
                placeholder="Ej: Hacer ejercicio"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoría</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Frecuencia</label>
              <select
                className="input"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              >
                <option value="diario">Diario</option>
                <option value="semanal">Semanal</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPreMarket}
              onChange={(e) => setForm({ ...form, isPreMarket: e.target.checked })}
              className="w-4 h-4 rounded accent-orange-500"
            />
            <span className="text-sm text-gray-300">Es parte de la rutina pre-mercado</span>
          </label>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Guardando...' : editHabit ? 'Actualizar' : 'Crear hábito'}
            </button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

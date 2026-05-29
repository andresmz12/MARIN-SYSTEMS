'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany, DayStatus, WeekDay, RolloverResult } from './types'
import { todayKey, weekStartKey, addDaysKey, formatLong } from './utils'
import { DayStatusBar } from './components/DayStatusBar'
import { WeekOverview } from './components/WeekOverview'
import { DailyPlanTimeline } from './components/DailyPlanTimeline'
import { MarketingIdeasBank } from './components/MarketingIdeasBank'
import { CompanyManager } from './components/CompanyManager'

type View = 'plan' | 'ideas' | 'companies'

const VIEWS: { key: View; label: string }[] = [
  { key: 'plan', label: '📅 Plan del día' },
  { key: 'ideas', label: '💡 Banco de ideas' },
  { key: 'companies', label: '🏢 Empresas' },
]

export default function CommandCenterPage() {
  const { showToast } = useToast()
  const [companies, setCompanies] = useState<CEOCompany[]>([])
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [weekStart, setWeekStart] = useState(() => weekStartKey(todayKey()))
  const [dayStatus, setDayStatus] = useState<DayStatus | null>(null)
  const [week, setWeek] = useState<WeekDay[]>([])
  const [availableHours, setAvailableHours] = useState(8)
  const [view, setView] = useState<View>('plan')

  const [initialLoading, setInitialLoading] = useState(true)
  const [dayLoading, setDayLoading] = useState(true)
  const [weekLoading, setWeekLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/ceo/companies')
      if (res.ok) setCompanies(await res.json())
    } catch {
      showToast('Error al cargar empresas', 'error')
    }
  }, [showToast])

  const loadDay = useCallback(async (date: string) => {
    setDayLoading(true)
    try {
      const res = await fetch(`/api/ceo/day-status?date=${date}`)
      if (res.ok) {
        const data: DayStatus | null = await res.json()
        setDayStatus(data)
        if (data?.availableHours) setAvailableHours(data.availableHours)
      }
    } catch {
      showToast('Error al cargar el día', 'error')
    }
    setDayLoading(false)
  }, [showToast])

  const loadWeek = useCallback(async (start: string) => {
    setWeekLoading(true)
    try {
      const res = await fetch(`/api/ceo/week-overview?startDate=${start}`)
      if (res.ok) setWeek(await res.json())
    } catch {
      showToast('Error al cargar la semana', 'error')
    }
    setWeekLoading(false)
  }, [showToast])

  function handleWeekNav(dir: -1 | 1) {
    const next = addDaysKey(weekStart, dir * 7)
    setWeekStart(next)
    loadWeek(next)
  }

  // Initial load
  useEffect(() => {
    (async () => {
      await Promise.all([loadCompanies(), loadDay(selectedDate), loadWeek(weekStart)])
      setInitialLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When user clicks a day, load that day's data and sync week if needed.
  useEffect(() => {
    if (initialLoading) return
    loadDay(selectedDate)
    // If the selected day is outside the current weekStart window, jump to its week.
    const dayWeekStart = weekStartKey(selectedDate)
    if (dayWeekStart !== weekStart) {
      setWeekStart(dayWeekStart)
      loadWeek(dayWeekStart)
    } else {
      loadWeek(weekStart)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  const plan = dayStatus?.dailyPlan ?? null
  const planExists = !!plan

  async function handleStatusChange(status: string) {
    try {
      const res = await fetch('/api/ceo/day-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, status, availableHours }),
      })
      if (!res.ok) throw new Error()
      const data: RolloverResult = await res.json()
      setDayStatus(data.dayStatus)
      if (data.rolledBlocks > 0 && data.nextWorkDay) {
        showToast(`${data.rolledBlocks} bloque(s) acumulados para el ${formatLong(data.nextWorkDay)}`, 'info')
      } else {
        showToast('Estado del día actualizado', 'success')
      }
      loadWeek(weekStart)
    } catch {
      showToast('Error al cambiar el estado', 'error')
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/ceo/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, availableHours }),
      })
      if (res.status === 409) {
        showToast('Ya existe un plan para este día', 'info')
      } else if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? 'Error al generar el plan', 'error')
      } else {
        showToast('Plan generado ⚡', 'success')
        await loadDay(selectedDate)
        loadWeek(weekStart)
      }
    } catch {
      showToast('Error al generar el plan', 'error')
    }
    setGenerating(false)
  }

  async function handleGenerateForDate(date: string) {
    setGenerating(true)
    try {
      const res = await fetch('/api/ceo/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, availableHours }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? 'Error al generar el plan', 'error')
      } else {
        showToast('Plan generado ⚡', 'success')
        setSelectedDate(date)
        const newWeekStart = weekStartKey(date)
        setWeekStart(newWeekStart)
        loadWeek(newWeekStart)
      }
    } catch {
      showToast('Error al generar el plan', 'error')
    }
    setGenerating(false)
  }

  async function handleRegenerate() {
    if (!window.confirm('¿Regenerar el plan de este día? Se perderá el progreso actual.')) return
    setGenerating(true)
    try {
      await fetch(`/api/ceo/generate-plan?date=${selectedDate}`, { method: 'DELETE' })
      const res = await fetch('/api/ceo/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, availableHours }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? 'Error al regenerar el plan', 'error')
      } else {
        showToast('Plan regenerado ⚡', 'success')
        await loadDay(selectedDate)
        loadWeek(weekStart)
      }
    } catch {
      showToast('Error al regenerar el plan', 'error')
    }
    setGenerating(false)
  }

  async function handleBlockUpdate(id: string, status: string) {
    // Optimistic update
    setDayStatus((prev) => {
      if (!prev?.dailyPlan) return prev
      return {
        ...prev,
        dailyPlan: {
          ...prev.dailyPlan,
          workBlocks: prev.dailyPlan.workBlocks.map((b) => (b.id === id ? { ...b, status } : b)),
        },
      }
    })
    try {
      const res = await fetch(`/api/ceo/work-blocks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      loadWeek(selectedDate)
    } catch {
      showToast('Error al actualizar bloque', 'error')
      loadDay(selectedDate)
    }
  }

  if (initialLoading) {
    return (
      <div className="space-y-4">
        <div className="h-16 rounded-xl bg-zinc-800/60 animate-pulse" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-zinc-800/60 animate-pulse" />)}
        </div>
        <div className="h-40 rounded-xl bg-zinc-800/60 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">🎯 CEO Command Center</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Tu sistema operativo para dirigir todas tus empresas.</p>
      </div>

      <DayStatusBar
        dateKey={selectedDate}
        status={dayStatus?.status ?? 'normal'}
        availableHours={availableHours}
        planExists={planExists}
        generating={generating}
        onStatusChange={handleStatusChange}
        onHoursChange={setAvailableHours}
        onGenerate={handleGenerate}
      />

      <WeekOverview
        days={week}
        weekStart={weekStart}
        selectedDate={selectedDate}
        loading={weekLoading}
        onSelectDay={setSelectedDate}
        onGenerateDay={handleGenerateForDate}
        onWeekNav={handleWeekNav}
      />

      {/* View tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 pb-3">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              view === v.key ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'plan' && (
        <DailyPlanTimeline
          plan={plan}
          dateKey={selectedDate}
          loading={dayLoading}
          generating={generating}
          onGenerate={handleGenerate}
          onRegenerate={handleRegenerate}
          onBlockUpdate={handleBlockUpdate}
        />
      )}

      {view === 'ideas' && (
        <MarketingIdeasBank companies={companies} onChanged={loadCompanies} />
      )}

      {view === 'companies' && (
        <CompanyManager companies={companies} onChanged={loadCompanies} />
      )}
    </div>
  )
}

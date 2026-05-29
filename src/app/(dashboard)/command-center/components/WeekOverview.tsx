'use client'

import type { WeekDay } from '../types'
import { dayStatusConfig, formatShort, todayKey, fromKey, addDaysKey } from '../utils'

interface Props {
  days: WeekDay[]
  weekStart: string
  selectedDate: string
  loading: boolean
  onSelectDay: (date: string) => void
  onGenerateDay: (date: string) => void
  onWeekNav: (dir: -1 | 1) => void
}

export function WeekOverview({ days, weekStart, selectedDate, loading, onSelectDay, onGenerateDay, onWeekNav }: Props) {
  const today = todayKey()
  // Weekdays only — weekends are for resting.
  const weekdays = days.filter((d) => {
    const dow = fromKey(d.date).getDay()
    return dow !== 0 && dow !== 6
  })

  // Week label: "Semana del 26 May" or "Semana actual"
  const mondayLabel = (() => {
    const d = fromKey(weekStart)
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
  })()
  const fridayLabel = (() => {
    const d = fromKey(addDaysKey(weekStart, 4))
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
  })()
  const isCurrentWeek = weekStart === (() => {
    const now = new Date()
    const dow = now.getDay()
    const diff = dow === 0 ? -6 : 1 - dow
    const d = new Date(now)
    d.setDate(d.getDate() + diff)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  return (
    <div>
      {/* Week nav header */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <button
          onClick={() => onWeekNav(-1)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800"
        >
          ‹ Anterior
        </button>
        <span className="text-xs text-zinc-500 font-medium">
          {isCurrentWeek ? 'Semana actual' : `${mondayLabel} – ${fridayLabel}`}
        </span>
        <button
          onClick={() => onWeekNav(1)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800"
        >
          Siguiente ›
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-zinc-800/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {weekdays.map((day) => {
            const cfg = dayStatusConfig(day.dayStatus?.status)
            const isSelected = day.date === selectedDate
            const isToday = day.date === today
            const isPast = day.date < today
            const hasPlan = day.totalBlocks > 0
            const pct = hasPlan ? Math.round((day.completedBlocks / day.totalBlocks) * 100) : 0
            const isPastPending = isPast && hasPlan && day.completedBlocks < day.totalBlocks

            return (
              <button
                key={day.date}
                onClick={() => onSelectDay(day.date)}
                className={`group relative text-left rounded-xl border p-2.5 transition-all ${
                  isToday
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : isSelected
                      ? 'border-indigo-400/60 bg-indigo-500/5'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isToday ? 'text-indigo-400' : 'text-zinc-300'}`}>
                    {formatShort(day.date)}
                  </span>
                  {day.dayStatus && <span className={`w-2 h-2 rounded-full ${cfg.dot}`} title={cfg.label} />}
                </div>

                {hasPlan ? (
                  <>
                    <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full transition-all ${isPastPending ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-zinc-500">
                      {day.completedBlocks}/{day.totalBlocks} bloques
                    </p>
                    {isPastPending && (
                      <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40">
                        Pendiente
                      </span>
                    )}
                  </>
                ) : (
                  <div className="mt-3 h-7 flex items-center">
                    <span className="text-[10px] text-zinc-600 group-hover:hidden">Sin plan</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        onGenerateDay(day.date)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation()
                          onGenerateDay(day.date)
                        }
                      }}
                      className="hidden group-hover:inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors"
                    >
                      ＋ Generar
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import type { WeekDay } from '../types'
import { dayStatusConfig, formatShort, todayKey } from '../utils'

interface Props {
  days: WeekDay[]
  selectedDate: string
  loading: boolean
  onSelectDay: (date: string) => void
}

export function WeekOverview({ days, selectedDate, loading, onSelectDay }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-zinc-800/60 animate-pulse" />
        ))}
      </div>
    )
  }

  const today = todayKey()

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
      {days.map((day) => {
        const cfg = dayStatusConfig(day.dayStatus?.status)
        const isSelected = day.date === selectedDate
        const isToday = day.date === today
        const pct = day.totalBlocks > 0 ? Math.round((day.completedBlocks / day.totalBlocks) * 100) : 0

        return (
          <button
            key={day.date}
            onClick={() => onSelectDay(day.date)}
            className={`text-left rounded-xl border p-2.5 transition-all ${
              isSelected
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${isToday ? 'text-indigo-400' : 'text-zinc-300'}`}>
                {formatShort(day.date)}
              </span>
              {day.dayStatus && (
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} title={cfg.label} />
              )}
            </div>

            {day.totalBlocks > 0 ? (
              <>
                <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-[10px] text-zinc-500">
                  {day.completedBlocks}/{day.totalBlocks} bloques
                </p>
              </>
            ) : (
              <p className="mt-3 text-[10px] text-zinc-600">Sin plan</p>
            )}
          </button>
        )
      })}
    </div>
  )
}

'use client'

import { DAY_STATUS_CONFIG, dayStatusConfig, formatLong, todayKey } from '../utils'

interface Props {
  dateKey: string
  status: string
  availableHours: number
  planExists: boolean
  generating: boolean
  onStatusChange: (status: string) => void
  onHoursChange: (hours: number) => void
  onGenerate: () => void
}

export function DayStatusBar({
  dateKey, status, availableHours, planExists, generating,
  onStatusChange, onHoursChange, onGenerate,
}: Props) {
  const current = dayStatusConfig(status)
  const isToday = dateKey === todayKey()

  return (
    <div className="sticky top-0 z-20 -mx-6 px-6 py-4 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Date */}
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">
            {isToday ? 'Hoy' : 'Fecha seleccionada'}
          </p>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>{current.emoji}</span>
            {formatLong(dateKey)}
          </h2>
        </div>

        {/* Status selector */}
        <div className="flex flex-wrap gap-1.5">
          {DAY_STATUS_CONFIG.map((cfg) => {
            const active = cfg.value === status
            return (
              <button
                key={cfg.value}
                onClick={() => onStatusChange(cfg.value)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  active ? cfg.active : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <span>{cfg.emoji}</span>
                {cfg.label}
              </button>
            )
          })}
        </div>

        {/* Hours + generate */}
        <div className="flex items-center gap-4">
          {!planExists && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 whitespace-nowrap">Horas disponibles</span>
              <input
                type="range"
                min={2}
                max={12}
                step={1}
                value={availableHours}
                onChange={(e) => onHoursChange(Number(e.target.value))}
                className="w-28 accent-indigo-500"
              />
              <span className="text-sm font-bold text-white w-8 text-center">{availableHours}h</span>
            </div>
          )}
          {planExists && (
            <span className="text-xs text-zinc-500">
              Plan de <span className="text-white font-semibold">{availableHours}h</span> activo
            </span>
          )}
          <button
            onClick={onGenerate}
            disabled={planExists || generating}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {generating ? 'Generando…' : planExists ? '✓ Plan generado' : '⚡ Generar Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

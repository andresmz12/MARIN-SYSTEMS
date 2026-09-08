'use client'

import { useEffect, useState } from 'react'
import type { WeekDay } from '../types'
import { addDaysKey, formatLong, formatShort } from '../utils'

interface Props {
  week: WeekDay[]
  weekStart: string
}

interface Reflection {
  wins: string
  improve: string
  nextWeek: string
}

const EMPTY_REFLECTION: Reflection = { wins: '', improve: '', nextWeek: '' }

function storageKey(weekStart: string) {
  return `weekly-review-${weekStart}`
}

function loadReflection(weekStart: string): Reflection {
  try {
    const raw = localStorage.getItem(storageKey(weekStart))
    if (raw) return { ...EMPTY_REFLECTION, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...EMPTY_REFLECTION }
}

export function WeeklyReview({ week, weekStart }: Props) {
  const [reflection, setReflection] = useState<Reflection>(EMPTY_REFLECTION)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setReflection(loadReflection(weekStart))
    setSaved(false)
  }, [weekStart])

  function save() {
    try {
      localStorage.setItem(storageKey(weekStart), JSON.stringify(reflection))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* ignore */ }
  }

  function update(key: keyof Reflection, value: string) {
    setSaved(false)
    setReflection((prev) => ({ ...prev, [key]: value }))
  }

  // Stats from week data
  const workDays = week.filter((d) => {
    const dow = new Date(`${d.date}T12:00:00`).getDay()
    return dow >= 1 && dow <= 5
  })

  const totalBlocks = workDays.reduce((s, d) => s + d.totalBlocks, 0)
  const completedBlocks = workDays.reduce((s, d) => s + d.completedBlocks, 0)
  const pendingBlocks = workDays.reduce((s, d) => s + d.pendingBlocks, 0)
  const totalHours = workDays.reduce((s, d) => s + d.completedHours, 0)
  const completionRate = totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0

  const daysWithPlan = workDays.filter((d) => d.plan !== null).length
  const daysCompleted = workDays.filter((d) => d.completedBlocks > 0 && d.completedBlocks >= d.totalBlocks).length

  const weekEnd = addDaysKey(weekStart, 4)

  return (
    <div className="space-y-6">
      {/* Week header */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-base font-bold text-white mb-1">
          📋 Revisión semanal
        </h2>
        <p className="text-sm text-zinc-500">
          {formatLong(weekStart)} — {formatLong(weekEnd)}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Bloques completados" value={`${completedBlocks}/${totalBlocks}`} sub={`${completionRate}% tasa`} color="text-indigo-400" />
        <KpiCard label="Horas trabajadas" value={`${totalHours.toFixed(1)}h`} sub="bloques no-fijos" color="text-emerald-400" />
        <KpiCard label="Días con plan" value={`${daysWithPlan}/5`} sub="días laborables" color="text-cyan-300" />
        <KpiCard label="Días 100%" value={`${daysCompleted}/5`} sub="todos los bloques ✓" color="text-amber-400" />
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-400">Progreso de la semana</span>
          <span className="text-xs font-bold text-white">{completionRate}%</span>
        </div>
        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
            style={{ width: `${completionRate}%` }}
          />
        </div>
        {pendingBlocks > 0 && (
          <p className="mt-2 text-xs text-amber-400">⚠️ {pendingBlocks} bloque(s) pendiente(s)</p>
        )}
      </div>

      {/* Day by day */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Día a día</h3>
        <div className="space-y-2">
          {workDays.map((d) => {
            const pct = d.totalBlocks > 0 ? (d.completedBlocks / d.totalBlocks) * 100 : 0
            return (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-14 flex-shrink-0">{formatShort(d.date)}</span>
                {d.plan === null ? (
                  <span className="text-xs text-zinc-600 italic">sin plan</span>
                ) : (
                  <>
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-500 w-16 text-right flex-shrink-0">
                      {d.completedBlocks}/{d.totalBlocks} · {d.completedHours.toFixed(1)}h
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Reflection */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">✍️ Reflexión semanal</h3>

        <ReflectionField
          label="🏆 ¿Qué funcionó bien esta semana?"
          placeholder="Logros, hábitos que mantuve, decisiones acertadas…"
          value={reflection.wins}
          onChange={(v) => update('wins', v)}
        />
        <ReflectionField
          label="🔧 ¿Qué mejoraría o acumulé sin hacer?"
          placeholder="Bloqueos, distracciones, tareas postergadas…"
          value={reflection.improve}
          onChange={(v) => update('improve', v)}
        />
        <ReflectionField
          label="🎯 ¿Cuál es la prioridad clave de la próxima semana?"
          placeholder="El movimiento más importante que puedo hacer…"
          value={reflection.nextWeek}
          onChange={(v) => update('nextWeek', v)}
        />

        <button
          onClick={save}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            saved
              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {saved ? '✓ Guardado' : '💾 Guardar reflexión'}
        </button>
        <p className="text-xs text-zinc-600">Se guarda localmente en este dispositivo.</p>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs font-medium text-zinc-300 mt-0.5">{label}</p>
      <p className="text-[11px] text-zinc-600 mt-0.5">{sub}</p>
    </div>
  )
}

function ReflectionField({
  label, placeholder, value, onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-xs font-medium text-zinc-400 block mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
      />
    </div>
  )
}

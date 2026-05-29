'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DailyPlan, WorkBlock } from '../types'
import {
  BLOCK_TYPE_CONFIG, BLOCK_STATUS_CONFIG, parseBlockDetails, timeToMinutes,
  formatLong, todayKey,
} from '../utils'
import { ContentGeneratorSheet } from './ContentGeneratorSheet'
import { FocusMode } from './FocusMode'

/** Pixels per minute (1h = 80px). */
const PX_PER_MIN = 80 / 60
const MIN_BLOCK_PX = 46

interface Props {
  plan: DailyPlan | null
  dateKey: string
  loading: boolean
  generating: boolean
  onGenerate: () => void
  onRegenerate: () => void
  onBlockUpdate: (id: string, status: string) => void
}

export function DailyPlanTimeline({ plan, dateKey, loading, generating, onGenerate, onRegenerate, onBlockUpdate }: Props) {
  // Live "now" indicator — re-render every 30s.
  const [nowMin, setNowMin] = useState(() => currentMinutes())
  useEffect(() => {
    const t = setInterval(() => setNowMin(currentMinutes()), 30_000)
    return () => clearInterval(t)
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-800/60 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!plan || plan.workBlocks.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-10 text-center">
        <div className="text-4xl mb-3">🗓️</div>
        <h3 className="text-lg font-bold text-white">Aún no hay plan para este día</h3>
        <p className="mt-1.5 text-sm text-zinc-500 max-w-sm mx-auto">
          Tu rutina fija (mascota, desayuno, forex, gym…) y los bloques de trabajo de tus empresas se
          organizarán automáticamente según prioridad estratégica e ideas activas.
        </p>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="mt-5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40"
        >
          {generating ? 'Generando…' : '⚡ Generar plan para hoy'}
        </button>
      </div>
    )
  }

  const blocks = [...plan.workBlocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
  const workBlocks = blocks.filter((b) => !b.isFixed)
  const doneBlocks = workBlocks.filter((b) => b.status === 'done')
  const workedHours = doneBlocks.reduce((s, b) => s + b.durationHours, 0)

  const dayStart = timeToMinutes(blocks[0].startTime)
  const dayEnd = Math.max(...blocks.map((b) => timeToMinutes(b.endTime)))
  const totalPx = (dayEnd - dayStart) * PX_PER_MIN
  const isToday = dateKey === todayKey()
  const showNow = isToday && nowMin >= dayStart && nowMin <= dayEnd
  const nowTop = (nowMin - dayStart) * PX_PER_MIN

  return (
    <div>
      {/* Header */}
      <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{formatLong(dateKey)}</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              {doneBlocks.length} de {workBlocks.length} bloques completados ·{' '}
              <span className="text-zinc-500">{workedHours}h trabajadas</span>
            </p>
          </div>
          <button
            onClick={onRegenerate}
            disabled={generating}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            {generating ? 'Regenerando…' : '🔄 Regenerar'}
          </button>
        </div>
        <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
            style={{ width: `${workBlocks.length ? (doneBlocks.length / workBlocks.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Timeline — horizontally scrollable on very small screens */}
      <div className="overflow-x-auto -mx-2 px-2">
      <div className="relative min-w-[340px]" style={{ height: totalPx }}>
        {/* Vertical line */}
        <div className="absolute top-0 bottom-0 left-[50px] w-px bg-zinc-800" />

        {/* Now indicator */}
        {showNow && (
          <div className="absolute left-[42px] right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <div className="flex-1 h-px bg-red-500/70" />
            </div>
          </div>
        )}

        {blocks.map((block) => {
          const top = (timeToMinutes(block.startTime) - dayStart) * PX_PER_MIN
          const height = Math.max(MIN_BLOCK_PX, (timeToMinutes(block.endTime) - timeToMinutes(block.startTime)) * PX_PER_MIN)
          return (
            <div key={block.id} className="absolute left-0 right-0" style={{ top, height }}>
              {/* Time label */}
              <span className="absolute left-0 top-0 w-[44px] text-right text-[11px] font-mono text-zinc-500 -translate-y-0.5">
                {block.startTime}
              </span>
              {/* Block card */}
              <div className="absolute left-[62px] right-0 top-0 bottom-1.5">
                {block.isFixed ? (
                  <FixedBlock block={block} />
                ) : (
                  <WorkBlockCard block={block} onBlockUpdate={onBlockUpdate} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

function currentMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/** Fixed routine block — subtle, non-interactive separator of the day. */
function FixedBlock({ block }: { block: WorkBlock }) {
  return (
    <div className="h-full flex items-center gap-2.5 rounded-lg border-l-[3px] border-zinc-600 bg-zinc-800/30 pl-3 pr-3">
      <span className="text-sm text-zinc-400 font-medium truncate">{block.title}</span>
      <span className="ml-auto text-[11px] font-mono text-zinc-600 flex-shrink-0">
        {block.startTime}–{block.endTime}
      </span>
    </div>
  )
}

function fmtTimer(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** Dynamic company work block — full card with steps, inline timer, + focus mode. */
function WorkBlockCard({ block, onBlockUpdate }: { block: WorkBlock; onBlockUpdate: (id: string, status: string) => void }) {
  const [showContentGen, setShowContentGen] = useState(false)
  const [showFocus, setShowFocus] = useState(false)
  const [timerSec, setTimerSec] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const typeCfg = BLOCK_TYPE_CONFIG[block.blockType] ?? BLOCK_TYPE_CONFIG.work
  const statusCfg = BLOCK_STATUS_CONFIG[block.status] ?? BLOCK_STATUS_CONFIG.pending
  const color = block.company?.color ?? '#6366f1'
  const done = block.status === 'done'
  const { description, steps } = parseBlockDetails(block.description)
  const isMarketing = ['marketing', 'deepwork'].includes(block.blockType)

  const targetSec = Math.round(block.durationHours * 3600)
  const timerOvertime = timerSec > targetSec

  useEffect(() => {
    if (timerRunning) {
      intervalRef.current = setInterval(() => setTimerSec((s) => s + 1), 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerRunning])

  // Visual-only step checkboxes (do not persist).
  const [checked, setChecked] = useState<boolean[]>(() => steps.map(() => false))
  const toggle = (i: number) => setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))

  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: done ? 0.6 : 1, y: 0 }}
      className="h-full overflow-y-auto rounded-xl border-l-4 p-3"
      style={{ borderLeftColor: color, backgroundColor: `${color}26` }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-200">
          {block.company?.emoji ?? '🏢'} {block.company?.name ?? 'Empresa'}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeCfg.cls}`}>{typeCfg.label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusCfg.cls}`}>{statusCfg.label}</span>
        {block.rolledFromDate && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400/80 border-amber-500/30">
            ↩ acumulado
          </span>
        )}
        <span className="ml-auto text-[11px] font-mono text-zinc-400">
          {block.startTime}–{block.endTime}
        </span>
      </div>

      {/* Title */}
      <p className={`mt-1.5 text-base font-semibold leading-snug ${done ? 'text-zinc-400 line-through' : 'text-white'}`}>
        {block.title}
      </p>

      {/* Description */}
      {description && <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{description}</p>}

      {/* Steps */}
      {steps.length > 0 && (
        <ul className="mt-2 space-y-1">
          {steps.map((step, i) => (
            <li key={i}>
              <button
                onClick={() => toggle(i)}
                className="flex items-start gap-2 text-left text-xs text-zinc-300 hover:text-white transition-colors"
              >
                <span
                  className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center text-[10px] ${
                    checked[i] ? 'bg-emerald-500/30 border-emerald-500 text-emerald-300' : 'border-zinc-600 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className={checked[i] ? 'line-through text-zinc-500' : ''}>{step}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Inline timer */}
      {!done && (
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <span className={`font-mono text-sm font-bold ${timerOvertime ? 'text-red-400' : timerSec > 0 ? 'text-white' : 'text-zinc-600'}`}>
            ⏱ {fmtTimer(timerSec)}
          </span>
          <button
            onClick={() => setTimerRunning((r) => !r)}
            className="text-[11px] px-2 py-0.5 rounded bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            {timerRunning ? '⏸' : '▶'}
          </button>
          {timerSec > 0 && (
            <button
              onClick={() => { setTimerSec(0); setTimerRunning(false) }}
              className="text-[11px] px-2 py-0.5 rounded bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 transition-colors"
            >
              🔄
            </button>
          )}
          {timerOvertime && <span className="text-[10px] text-red-400 font-medium">+{fmtTimer(timerSec - targetSec)}</span>}
        </div>
      )}

      {/* Action buttons row */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {/* Content generator for marketing blocks */}
        {isMarketing && !done && (
          <button
            onClick={() => setShowContentGen(true)}
            className="text-xs px-2 py-1 rounded-md bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors"
          >
            ✨ Generar contenido
          </button>
        )}

        {/* Focus mode */}
        {!done && (
          <button
            onClick={() => setShowFocus(true)}
            className="text-xs px-2 py-1 rounded-md bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
          >
            🎯 Modo foco
          </button>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <AnimatePresence mode="wait">
          {done ? (
            <motion.button
              key="undo"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={() => onBlockUpdate(block.id, 'pending')}
              className="text-xs px-2 py-1 rounded-md bg-zinc-700/40 text-zinc-300 hover:bg-zinc-700/60 transition-colors"
            >
              ↩️ Reabrir
            </motion.button>
          ) : (
            <motion.div key="actions" className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => onBlockUpdate(block.id, 'done')}
                className="text-xs px-2 py-1 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
              >
                ✅ Hecho
              </button>
              <button
                onClick={() => onBlockUpdate(block.id, 'skipped')}
                className="text-xs px-2 py-1 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
              >
                ⏭️ Saltar
              </button>
              <button
                onClick={() => onBlockUpdate(block.id, 'rolled_over')}
                className="text-xs px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
              >
                🔄 Acumular
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>

    {showContentGen && block.company && (
      <ContentGeneratorSheet
        companyId={block.companyId}
        companyName={`${block.company.emoji ?? ''} ${block.company.name}`}
        workBlockId={block.id}
        linkedTopic={block.title}
        onClose={() => setShowContentGen(false)}
      />
    )}

    {showFocus && (
      <FocusMode
        block={block}
        onClose={() => setShowFocus(false)}
        onBlockUpdate={onBlockUpdate}
      />
    )}
  </>
  )
}

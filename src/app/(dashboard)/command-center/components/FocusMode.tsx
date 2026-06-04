'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { WorkBlock } from '../types'
import { parseBlockDetails } from '../utils'

interface Props {
  block: WorkBlock
  onClose: () => void
  onBlockUpdate: (id: string, status: string) => void
}

function fmt(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function FocusModeInner({ block, onClose, onBlockUpdate }: Props) {
  const { description, steps } = parseBlockDetails(block.description)
  const [timerSec, setTimerSec] = useState(0)
  const [running, setRunning] = useState(false)
  const [checked, setChecked] = useState<boolean[]>(() => steps.map(() => false))
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const targetSec = Math.round(block.durationHours * 3600)
  const pct = Math.min(100, (timerSec / targetSec) * 100)
  const overtime = timerSec > targetSec
  const color = block.company?.color ?? '#6366f1'
  const circumference = 2 * Math.PI * 52

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setTimerSec((s) => s + 1), 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const checkedCount = checked.filter(Boolean).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-zinc-950/98 backdrop-blur-lg flex flex-col items-center justify-center p-6 overflow-y-auto"
    >
      {/* Exit */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
      >
        ✕ Salir (ESC)
      </button>

      {/* Company */}
      <div className="text-3xl mb-1">{block.company?.emoji ?? '🏢'}</div>
      <p className="text-zinc-500 text-sm mb-4">{block.company?.name ?? 'Empresa'} · {block.startTime}–{block.endTime}</p>

      {/* Title */}
      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 max-w-xl text-center leading-snug">
        {block.title}
      </h1>
      {description && (
        <p className="text-zinc-400 text-sm mb-6 max-w-md text-center leading-relaxed">{description}</p>
      )}

      {/* Timer ring */}
      <div className="relative w-44 h-44 mb-5">
        <svg className="absolute inset-0 -rotate-90 w-full h-full" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#27272a" strokeWidth="7" />
          <circle
            cx="60" cy="60" r="52" fill="none"
            stroke={overtime ? '#ef4444' : color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct / 100)}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-mono font-bold ${overtime ? 'text-red-400' : 'text-white'}`}>
            {fmt(timerSec)}
          </span>
          <span className="text-xs text-zinc-600 mt-0.5">/ {fmt(targetSec)}</span>
          {overtime && <span className="text-xs text-red-400 mt-0.5 font-medium">overtime</span>}
        </div>
      </div>

      {/* Timer controls */}
      <div className="flex gap-2.5 mb-8">
        <button
          onClick={() => setRunning((r) => !r)}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          style={{ backgroundColor: `${color}33`, color }}
        >
          {running ? '⏸ Pausar' : timerSec > 0 ? '▶ Continuar' : '▶ Iniciar'}
        </button>
        <button
          onClick={() => { setTimerSec(0); setRunning(false) }}
          className="px-4 py-2.5 rounded-xl text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          🔄 Reset
        </button>
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div className="w-full max-w-md mb-8">
          <p className="text-xs text-zinc-500 mb-3 flex items-center gap-2">
            <span>Pasos</span>
            <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{checkedCount}/{steps.length}</span>
          </p>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <button
                key={i}
                onClick={() => setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))}
                className="w-full flex items-start gap-3 text-left p-3 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 transition-colors"
              >
                <span
                  className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center text-[10px] ${
                    checked[i] ? 'bg-emerald-500/30 border-emerald-500 text-emerald-300' : 'border-zinc-600 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className={`text-sm ${checked[i] ? 'line-through text-zinc-500' : 'text-zinc-300'}`}>{step}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={() => { onBlockUpdate(block.id, 'done'); onClose() }}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
        >
          ✅ Marcar hecho
        </button>
        <button
          onClick={() => { onBlockUpdate(block.id, 'skipped'); onClose() }}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
        >
          ⏭️ Saltar
        </button>
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          🔙 Volver al plan
        </button>
      </div>
    </motion.div>
  )
}

export function FocusMode(props: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      <FocusModeInner {...props} />
    </AnimatePresence>,
    document.body,
  )
}

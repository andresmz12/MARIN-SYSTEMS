'use client'

import { useEffect, useState } from 'react'

const PHASE_LABELS = ['Inhala', 'Sostén', 'Exhala', 'Sostén'] as const
const PHASE_SECONDS = 4
const CYCLE_SECONDS = PHASE_SECONDS * PHASE_LABELS.length
const GROWN_SCALE = 1.15
const SHRUNK_SCALE = 0.75
const FULLSCREEN_SIZE = 420

const COLORS = {
  teal: { ring: '#2dd4bf', ringBg: 'rgba(45,212,191,0.15)', glow: 'rgba(45,212,191,0.35)', text: 'text-teal-300' },
  orange: { ring: '#fb923c', ringBg: 'rgba(251,146,60,0.15)', glow: 'rgba(251,146,60,0.35)', text: 'text-orange-300' },
}

export function BreathingTimer({
  durationSeconds,
  onComplete,
  color = 'teal',
  size = 220,
  autoStart = false,
}: {
  durationSeconds: number
  onComplete?: () => void
  color?: keyof typeof COLORS
  size?: number
  autoStart?: boolean
}) {
  const [running, setRunning] = useState(autoStart)
  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const done = elapsed >= durationSeconds
  const palette = COLORS[color]

  useEffect(() => {
    if (!running || done) return
    const t = setTimeout(() => setElapsed((e) => Math.min(durationSeconds, e + 1)), 1000)
    return () => clearTimeout(t)
  }, [running, elapsed, done, durationSeconds])

  useEffect(() => {
    if (done) { setRunning(false); onComplete?.() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  // Cierra la pantalla completa sola al terminar, para no dejar al usuario
  // atrapado en el overlay tras completar la sesión.
  useEffect(() => {
    if (done) setExpanded(false)
  }, [done])

  const secondsLeft = durationSeconds - elapsed
  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const ss = (secondsLeft % 60).toString().padStart(2, '0')

  const phaseIndex = Math.floor((elapsed % CYCLE_SECONDS) / PHASE_SECONDS)
  const phaseLabel = PHASE_LABELS[phaseIndex]
  // El escalado solo cambia de objetivo al empezar Inhala/Exhala; en las fases de
  // Sostén se mantiene el mismo valor, dando el efecto de pausa entre respiraciones.
  const targetScale = phaseIndex === 2 || phaseIndex === 3 ? SHRUNK_SCALE : GROWN_SCALE

  function handleStart() { setElapsed(0); setRunning(true) }
  function handlePauseResume() { setRunning((r) => !r) }
  function handleReset() { setRunning(false); setElapsed(0) }

  function renderCircle(sz: number) {
    const radius = (sz - 20) / 2
    const circumference = 2 * Math.PI * radius
    const dashOffset = circumference * (1 - (durationSeconds > 0 ? elapsed / durationSeconds : 0))
    return (
      <div className="relative flex items-center justify-center" style={{ width: sz, height: sz }}>
        <svg width={sz} height={sz} className="-rotate-90">
          <circle cx={sz / 2} cy={sz / 2} r={radius} fill="none" stroke={palette.ringBg} strokeWidth={8} />
          <circle
            cx={sz / 2} cy={sz / 2} r={radius} fill="none"
            stroke={palette.ring} strokeWidth={8} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div
          className="absolute inset-0 m-auto rounded-full flex flex-col items-center justify-center"
          style={{
            width: sz * 0.62,
            height: sz * 0.62,
            background: `radial-gradient(circle, ${palette.glow}, transparent 70%)`,
            transform: `scale(${elapsed > 0 ? targetScale : 1})`,
            transition: `transform ${PHASE_SECONDS}s ease-in-out`,
          }}
        >
          <span className={`font-bold tabular-nums ${palette.text}`} style={{ fontSize: sz * 0.14 }}>{mm}:{ss}</span>
          {running && <span className="text-xs text-gray-400 mt-1 uppercase tracking-wider" style={{ fontSize: sz * 0.045 }}>{phaseLabel}</span>}
          {done && <span className="text-xs text-green-400 mt-1">Completado 🧘</span>}
        </div>
      </div>
    )
  }

  function renderControls() {
    return (
      <div className="flex gap-2">
        {!running && elapsed === 0 && (
          <button onClick={handleStart} className="btn-primary text-sm px-6">Comenzar</button>
        )}
        {(running || (elapsed > 0 && !done)) && (
          <>
            <button onClick={handlePauseResume} className="btn-secondary text-sm">
              {running ? 'Pausar' : 'Reanudar'}
            </button>
            <button onClick={handleReset} className="btn-secondary text-sm">Reiniciar</button>
          </>
        )}
        {done && (
          <button onClick={handleStart} className="btn-secondary text-sm">Repetir</button>
        )}
      </div>
    )
  }

  if (expanded) {
    return (
      <div
        className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center gap-8"
        onClick={() => setExpanded(false)}
      >
        <button
          onClick={() => setExpanded(false)}
          className="absolute top-6 right-6 text-white/60 hover:text-white transition-colors"
          title="Salir de pantalla completa"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex flex-col items-center gap-8" onClick={(e) => e.stopPropagation()}>
          {renderCircle(FULLSCREEN_SIZE)}
          {renderControls()}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {renderCircle(size)}
        <button
          onClick={() => setExpanded(true)}
          className="absolute top-1 right-1 text-gray-500 hover:text-gray-300 transition-colors p-1.5 rounded-full hover:bg-white/5"
          title="Ver en pantalla completa"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>
      <div className="mt-1">{renderControls()}</div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

// Live HUD clock — ticks client-side only, avoids hydration mismatch by rendering
// nothing until mounted.
function HudClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!now) return <span className="tabular-nums opacity-0">00:00:00</span>
  return (
    <span className="tabular-nums">
      {now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

/**
 * Persistent cockpit strip shown above every page's content — the thing that
 * makes the whole app read as one system you're "inside of", not a stack of
 * separate pages with a sidebar bolted on.
 */
export function HudStatusBar() {
  return (
    <div className="hidden sm:flex items-center justify-between px-4 lg:px-6 py-1.5 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)]/70 backdrop-blur-sm text-[11px] text-slate-500">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        <span className="font-display tracking-[0.2em] uppercase text-cyan-300/80">Marin Systems</span>
        <span className="opacity-40">·</span>
        <span className="capitalize">
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>
      <div className="flex items-center gap-1.5 font-display text-cyan-200">
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <HudClock />
      </div>
    </div>
  )
}

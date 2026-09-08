'use client'

import { useEffect, useRef } from 'react'

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking'

interface JarvisReactorProps {
  state: JarvisState
  /** 0..1 live audio level (mic while listening, output while speaking) — read every frame, never causes a re-render. */
  levelRef: React.MutableRefObject<number>
}

const STATE_COLOR: Record<JarvisState, string> = {
  idle: '#3b4358',
  listening: '#22d3ee',
  thinking: '#a78bfa',
  speaking: '#e8ecf5',
}

/**
 * Arc-reactor style visual, driven by a live audio level ref via requestAnimationFrame —
 * deliberately bypasses React state per-frame to avoid re-render storms during audio playback.
 */
export function JarvisReactor({ state, levelRef }: JarvisReactorProps) {
  const coreRef = useRef<SVGCircleElement>(null)
  const ring1Ref = useRef<SVGCircleElement>(null)
  const ring2Ref = useRef<SVGCircleElement>(null)
  const ring3Ref = useRef<SVGCircleElement>(null)
  const glowRef = useRef<SVGCircleElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)

  useEffect(() => {
    const color = STATE_COLOR[state]
    ;[coreRef, ring1Ref, ring2Ref, ring3Ref, glowRef].forEach((r) => {
      if (r.current) r.current.setAttribute('stroke', color)
    })
    if (glowRef.current) glowRef.current.setAttribute('fill', color)
    if (coreRef.current) coreRef.current.setAttribute('fill', color)

    function tick() {
      phaseRef.current += 0.02
      const level = levelRef.current // 0..1
      const idleBreath = (Math.sin(phaseRef.current) + 1) / 2 // 0..1 slow breathing for idle/thinking

      const boost = state === 'idle' ? idleBreath * 0.15 : state === 'thinking' ? idleBreath * 0.35 + 0.25 : level

      if (coreRef.current) {
        const r = 34 + boost * 10
        coreRef.current.setAttribute('r', String(r))
        coreRef.current.setAttribute('opacity', String(0.85 + boost * 0.15))
      }
      if (glowRef.current) {
        const r = 46 + boost * 34
        glowRef.current.setAttribute('r', String(r))
        glowRef.current.setAttribute('opacity', String(0.15 + boost * 0.35))
      }
      if (ring1Ref.current) {
        ring1Ref.current.setAttribute('r', String(58 + boost * 14))
        ring1Ref.current.setAttribute('opacity', String(0.5 + boost * 0.3))
        ring1Ref.current.setAttribute(
          'transform',
          `rotate(${(state === 'thinking' ? phaseRef.current * 40 : phaseRef.current * 8) % 360} 120 120)`
        )
      }
      if (ring2Ref.current) {
        ring2Ref.current.setAttribute('r', String(78 + boost * 20))
        ring2Ref.current.setAttribute('opacity', String(0.35 + boost * 0.25))
        ring2Ref.current.setAttribute(
          'transform',
          `rotate(${(state === 'thinking' ? -phaseRef.current * 55 : -phaseRef.current * 5) % 360} 120 120)`
        )
      }
      if (ring3Ref.current) {
        ring3Ref.current.setAttribute('r', String(98 + boost * 26))
        ring3Ref.current.setAttribute('opacity', String(0.2 + boost * 0.2))
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, levelRef])

  return (
    <svg viewBox="0 0 240 240" className="w-full h-full max-w-[min(70vh,420px)] max-h-[min(70vh,420px)]">
      <circle ref={ring3Ref} cx={120} cy={120} r={98} fill="none" strokeWidth={1} strokeDasharray="2 6" />
      <circle ref={ring2Ref} cx={120} cy={120} r={78} fill="none" strokeWidth={1.5} strokeDasharray="10 6" />
      <circle ref={ring1Ref} cx={120} cy={120} r={58} fill="none" strokeWidth={1.5} strokeDasharray="14 4" />
      <circle ref={glowRef} cx={120} cy={120} r={46} style={{ filter: 'blur(18px)' }} />
      <circle ref={coreRef} cx={120} cy={120} r={34} />
    </svg>
  )
}

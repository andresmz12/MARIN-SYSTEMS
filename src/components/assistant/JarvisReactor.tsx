'use client'

import { useEffect, useRef } from 'react'

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

interface JarvisReactorProps {
  state: JarvisState
  /** 0..1 live audio level (mic while listening, output while speaking) — read every frame, never causes a re-render. */
  levelRef: React.MutableRefObject<number>
}

const STATE_RGB: Record<JarvisState, [number, number, number]> = {
  idle: [80, 96, 130],
  listening: [34, 211, 238],
  thinking: [167, 139, 250],
  speaking: [232, 236, 245],
  error: [239, 68, 68],
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

const TICKS = Array.from({ length: 48 }, (_, i) => i)
const PARTICLES = Array.from({ length: 10 }, (_, i) => i)

export function JarvisReactor({ state, levelRef }: JarvisReactorProps) {
  const rootRef = useRef<SVGSVGElement>(null)
  const glowOuterRef = useRef<SVGCircleElement>(null)
  const glowMidRef = useRef<SVGCircleElement>(null)
  const coreRef = useRef<SVGCircleElement>(null)
  const coreHighlightRef = useRef<SVGEllipseElement>(null)
  const levelArcRef = useRef<SVGCircleElement>(null)
  const dialRef = useRef<SVGGElement>(null)
  const energyRing1Ref = useRef<SVGCircleElement>(null)
  const energyRing2Ref = useRef<SVGCircleElement>(null)
  const particleRingRef = useRef<SVGGElement>(null)
  const tickRefs = useRef<(SVGLineElement | null)[]>([])
  const particleRefs = useRef<(SVGCircleElement | null)[]>([])

  const colorRef = useRef<[number, number, number]>(STATE_RGB.idle)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)

  useEffect(() => {
    function tick() {
      phaseRef.current += 0.03
      const t = phaseRef.current
      const level = levelRef.current

      // Smoothly ease the RGB color toward the target state color (no instant flat swap).
      const target = STATE_RGB[state]
      const cur = colorRef.current
      cur[0] = lerp(cur[0], target[0], 0.12)
      cur[1] = lerp(cur[1], target[1], 0.12)
      cur[2] = lerp(cur[2], target[2], 0.12)
      const [r, g, b] = cur
      const rgb = `rgb(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)})`
      const rgbSoft = `rgba(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)},0.5)`

      const idleBreath = (Math.sin(t * 1.6) + 1) / 2
      const alarmBlink = (Math.sin(t * 5) + 1) / 2
      // Speaking has no real audio-level feed (see JarvisFullscreen — TTS plays as a
      // plain <audio> element, not routed through an analyser, for Safari reliability)
      // so it gets a synthetic "talking cadence" pulse instead: two layered waves so
      // it doesn't read as a flat metronome.
      const talkPulse = (Math.sin(t * 7) * 0.5 + Math.sin(t * 15) * 0.3 + 0.8) / 1.6
      const boost =
        state === 'idle' ? idleBreath * 0.12
        : state === 'thinking' ? idleBreath * 0.3 + 0.28
        : state === 'error' ? alarmBlink * 0.4 + 0.15
        : state === 'speaking' ? talkPulse * 0.5 + 0.25
        : level

      if (coreRef.current) {
        coreRef.current.setAttribute('r', String(30 + boost * 9))
        coreRef.current.setAttribute('fill', rgb)
      }
      if (coreHighlightRef.current) {
        coreHighlightRef.current.setAttribute('opacity', String(0.35 + boost * 0.25))
      }
      if (glowMidRef.current) {
        glowMidRef.current.setAttribute('r', String(48 + boost * 30))
        glowMidRef.current.setAttribute('fill', rgb)
        glowMidRef.current.setAttribute('opacity', String(0.22 + boost * 0.28))
      }
      if (glowOuterRef.current) {
        glowOuterRef.current.setAttribute('r', String(70 + boost * 55))
        glowOuterRef.current.setAttribute('fill', rgb)
        glowOuterRef.current.setAttribute('opacity', String(0.08 + boost * 0.16))
      }
      if (levelArcRef.current) {
        const circumference = 2 * Math.PI * 62
        const frac = state === 'idle' ? 0 : 0.12 + boost * 0.88
        levelArcRef.current.setAttribute('stroke', rgb)
        levelArcRef.current.setAttribute('stroke-dasharray', `${circumference * frac} ${circumference}`)
        levelArcRef.current.setAttribute('transform', `rotate(${-90 + t * (state === 'thinking' ? 55 : 16)} 120 120)`)
      }
      if (energyRing1Ref.current) {
        energyRing1Ref.current.setAttribute('stroke', rgbSoft)
        energyRing1Ref.current.setAttribute(
          'transform',
          `rotate(${(t * (state === 'thinking' ? 50 : 22)) % 360} 120 120)`
        )
      }
      if (energyRing2Ref.current) {
        energyRing2Ref.current.setAttribute('stroke', rgbSoft)
        energyRing2Ref.current.setAttribute(
          'transform',
          `rotate(${(-t * (state === 'thinking' ? 62 : 16)) % 360} 120 120)`
        )
      }
      if (dialRef.current) {
        dialRef.current.setAttribute('transform', `rotate(${(t * 9) % 360} 120 120)`)
      }
      tickRefs.current.forEach((el, i) => {
        if (!el) return
        const major = i % 4 === 0
        const flicker = major ? 0.55 : 0.22
        el.setAttribute('stroke', rgb)
        el.setAttribute('opacity', String(flicker + boost * 0.35 * Math.sin(t * 3.5 + i)))
      })
      if (particleRingRef.current) {
        particleRingRef.current.setAttribute('transform', `rotate(${(t * 30) % 360} 120 120)`)
      }
      particleRefs.current.forEach((el, i) => {
        if (!el) return
        el.setAttribute('fill', rgb)
        el.setAttribute('opacity', String(0.25 + 0.55 * ((Math.sin(t * 3 + i * 1.3) + 1) / 2) + boost * 0.2))
      })

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, levelRef])

  return (
    <svg ref={rootRef} viewBox="0 0 240 240" className="w-full h-full drop-shadow-[0_0_60px_rgba(34,211,238,0.15)]">
      <defs>
        <radialGradient id="jarvis-core-grad" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
          <stop offset="45%" stopColor="#ffffff" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Bloom layers */}
      <circle ref={glowOuterRef} cx={120} cy={120} r={70} style={{ filter: 'blur(30px)' }} />
      <circle ref={glowMidRef} cx={120} cy={120} r={48} style={{ filter: 'blur(14px)' }} />

      {/* Rotating HUD dial with tick marks */}
      <g ref={dialRef}>
        {TICKS.map((i) => {
          const angle = (i / TICKS.length) * 2 * Math.PI
          const major = i % 4 === 0
          const rOuter = 112
          const rInner = major ? 100 : 105
          const x1 = 120 + rOuter * Math.cos(angle)
          const y1 = 120 + rOuter * Math.sin(angle)
          const x2 = 120 + rInner * Math.cos(angle)
          const y2 = 120 + rInner * Math.sin(angle)
          return (
            <line
              key={i}
              ref={(el) => { tickRefs.current[i] = el }}
              x1={x1} y1={y1} x2={x2} y2={y2}
              strokeWidth={major ? 1.6 : 0.8}
              strokeLinecap="round"
            />
          )
        })}
      </g>

      {/* Orbiting particles */}
      <g ref={particleRingRef}>
        {PARTICLES.map((i) => {
          const angle = (i / PARTICLES.length) * 2 * Math.PI
          const r = 88
          return (
            <circle
              key={i}
              ref={(el) => { particleRefs.current[i] = el }}
              cx={120 + r * Math.cos(angle)}
              cy={120 + r * Math.sin(angle)}
              r={1.6}
            />
          )
        })}
      </g>

      {/* Counter-rotating energy rings */}
      <circle ref={energyRing1Ref} cx={120} cy={120} r={78} fill="none" strokeWidth={1.2} strokeDasharray="1 9" />
      <circle ref={energyRing2Ref} cx={120} cy={120} r={68} fill="none" strokeWidth={1} strokeDasharray="0.5 6" />

      {/* Level arc — direct readout of live audio energy */}
      <circle
        ref={levelArcRef}
        cx={120} cy={120} r={62}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{ transition: 'stroke 0.3s ease' }}
      />

      {/* Core sphere */}
      <circle ref={coreRef} cx={120} cy={120} r={30} style={{ filter: 'drop-shadow(0 0 18px rgba(255,255,255,0.35))' }} />
      <ellipse ref={coreHighlightRef} cx={112} cy={110} rx={16} ry={11} fill="url(#jarvis-core-grad)" />
    </svg>
  )
}

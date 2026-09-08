'use client'

import { useEffect, useMemo, useRef } from 'react'

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

interface JarvisReactorProps {
  state: JarvisState
  /** 0..1 live audio level (mic while listening, output while speaking) — read every frame, never causes a re-render. */
  levelRef: React.MutableRefObject<number>
}

// Gold/amber hologram palette — the classic Iron Man J.A.R.V.I.S. look — instead
// of the app's cyan/violet theme, which is intentionally left untouched elsewhere.
const STATE_RGB: Record<JarvisState, [number, number, number]> = {
  idle: [120, 96, 40],
  listening: [251, 191, 36],
  thinking: [249, 158, 11],
  speaking: [255, 223, 150],
  error: [239, 68, 68],
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// Small deterministic PRNG (mulberry32) so the filament/city-light layout is
// stable across renders instead of reshuffling on every remount.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PARTICLES = Array.from({ length: 14 }, (_, i) => i)

interface Filament { angle: number; r1: number; r2: number; major: boolean; branchAngle: number | null; branchLen: number }
interface CityDot { x: number; y: number; size: number; phase: number }

// Dense, irregular circuit-like filament network radiating from the core — this
// is what makes the reactor read as an intricate hologram (like the WSJ Age of
// Ultron still) instead of a clean minimal dashboard dial. Precomputed once via
// useMemo, only opacity/color are touched per frame.
function buildFilaments(): Filament[] {
  const rand = mulberry32(1337)
  const filaments: Filament[] = []
  const count = 64
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI + (rand() - 0.5) * 0.06
    const major = i % 3 === 0
    const r1 = 62 + rand() * 14
    const r2 = r1 + 22 + rand() * (major ? 46 : 24)
    const hasBranch = rand() > 0.55
    filaments.push({
      angle,
      r1,
      r2,
      major,
      branchAngle: hasBranch ? angle + (rand() - 0.5) * 0.9 : null,
      branchLen: 10 + rand() * 16,
    })
  }
  return filaments
}

function buildCityDots(): CityDot[] {
  const rand = mulberry32(4242)
  const dots: CityDot[] = []
  for (let i = 0; i < 46; i++) {
    const angle = rand() * 2 * Math.PI
    const r = 14 + rand() * 58
    dots.push({
      x: 120 + r * Math.cos(angle),
      y: 120 + r * Math.sin(angle) * 0.55, // flattened vertically, like specks scattered across a sphere's face
      size: 0.5 + rand() * 1.1,
      phase: rand() * 10,
    })
  }
  return dots
}

export function JarvisReactor({ state, levelRef }: JarvisReactorProps) {
  const rootRef = useRef<SVGSVGElement>(null)
  const glowOuterRef = useRef<SVGCircleElement>(null)
  const glowMidRef = useRef<SVGCircleElement>(null)
  const coreRef = useRef<SVGCircleElement>(null)
  const coreHighlightRef = useRef<SVGEllipseElement>(null)
  const levelArcRef = useRef<SVGCircleElement>(null)
  const dialRef = useRef<SVGGElement>(null)
  const filamentGroupRef = useRef<SVGGElement>(null)
  const energyRing1Ref = useRef<SVGCircleElement>(null)
  const energyRing2Ref = useRef<SVGCircleElement>(null)
  const particleRingRef = useRef<SVGGElement>(null)
  const filamentRefs = useRef<(SVGPathElement | null)[]>([])
  const particleRefs = useRef<(SVGCircleElement | null)[]>([])
  const cityDotRefs = useRef<(SVGCircleElement | null)[]>([])
  const globeLatRefs = useRef<(SVGEllipseElement | null)[]>([])
  const globeLonRefs = useRef<(SVGEllipseElement | null)[]>([])

  const filaments = useMemo(buildFilaments, [])
  const cityDots = useMemo(buildCityDots, [])
  const globeLats = useMemo(() => [0, 1, 2, 3, 4, 5], [])
  const globeLons = useMemo(() => [0, 1, 2, 3], [])

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
        coreRef.current.setAttribute('r', String(28 + boost * 8))
        coreRef.current.setAttribute('fill', rgb)
      }
      if (coreHighlightRef.current) {
        coreHighlightRef.current.setAttribute('opacity', String(0.35 + boost * 0.25))
      }
      if (glowMidRef.current) {
        glowMidRef.current.setAttribute('r', String(46 + boost * 28))
        glowMidRef.current.setAttribute('fill', rgb)
        glowMidRef.current.setAttribute('opacity', String(0.22 + boost * 0.28))
      }
      if (glowOuterRef.current) {
        glowOuterRef.current.setAttribute('r', String(72 + boost * 50))
        glowOuterRef.current.setAttribute('fill', rgb)
        glowOuterRef.current.setAttribute('opacity', String(0.09 + boost * 0.16))
      }
      if (levelArcRef.current) {
        const circumference = 2 * Math.PI * 58
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
        dialRef.current.setAttribute('transform', `rotate(${(t * 6) % 360} 120 120)`)
      }
      if (filamentGroupRef.current) {
        filamentGroupRef.current.setAttribute('transform', `rotate(${(-t * 3.2) % 360} 120 120)`)
      }
      filamentRefs.current.forEach((el, i) => {
        if (!el) return
        const f = filaments[i]
        const flicker = f.major ? 0.5 : 0.2
        el.setAttribute('stroke', rgb)
        el.setAttribute('opacity', String(flicker + boost * 0.4 * ((Math.sin(t * 2.6 + i * 0.7) + 1) / 2)))
      })
      // Wireframe "globe" — latitude rings squash/stretch through sin() to fake
      // a slowly tumbling sphere; longitude rings do the same on the other axis.
      globeLatRefs.current.forEach((el, i) => {
        if (!el) return
        const ry = 4 + 86 * Math.abs(Math.sin(t * 0.11 + i * 0.9))
        el.setAttribute('ry', String(ry))
        el.setAttribute('stroke', rgb)
        el.setAttribute('opacity', String(0.12 + boost * 0.12))
      })
      globeLonRefs.current.forEach((el, i) => {
        if (!el) return
        const rx = 4 + 86 * Math.abs(Math.cos(t * 0.09 + i * 1.1))
        el.setAttribute('rx', String(rx))
        el.setAttribute('stroke', rgb)
        el.setAttribute('opacity', String(0.1 + boost * 0.1))
      })
      if (particleRingRef.current) {
        particleRingRef.current.setAttribute('transform', `rotate(${(t * 26) % 360} 120 120)`)
      }
      particleRefs.current.forEach((el, i) => {
        if (!el) return
        el.setAttribute('fill', rgb)
        el.setAttribute('opacity', String(0.25 + 0.55 * ((Math.sin(t * 3 + i * 1.3) + 1) / 2) + boost * 0.2))
      })
      cityDotRefs.current.forEach((el, i) => {
        if (!el) return
        const d = cityDots[i]
        el.setAttribute('fill', rgb)
        el.setAttribute('opacity', String(0.15 + 0.55 * ((Math.sin(t * 2.2 + d.phase) + 1) / 2)))
      })

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, levelRef, filaments, cityDots])

  return (
    <svg ref={rootRef} viewBox="0 0 240 240" className="w-full h-full drop-shadow-[0_0_60px_rgba(251,191,36,0.2)]">
      <defs>
        <radialGradient id="jarvis-core-grad" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
          <stop offset="45%" stopColor="#ffffff" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Bloom layers */}
      <circle ref={glowOuterRef} cx={120} cy={120} r={72} style={{ filter: 'blur(32px)' }} />
      <circle ref={glowMidRef} cx={120} cy={120} r={46} style={{ filter: 'blur(14px)' }} />

      {/* Wireframe globe — latitude + longitude bands simulating a slowly tumbling sphere */}
      <g opacity={0.9}>
        {globeLats.map((i) => (
          <ellipse
            key={`lat-${i}`}
            ref={(el) => { globeLatRefs.current[i] = el }}
            cx={120} cy={120} rx={86} ry={40}
            fill="none"
            strokeWidth={0.6}
          />
        ))}
        {globeLons.map((i) => (
          <ellipse
            key={`lon-${i}`}
            ref={(el) => { globeLonRefs.current[i] = el }}
            cx={120} cy={120} rx={40} ry={86}
            fill="none"
            strokeWidth={0.6}
          />
        ))}
      </g>

      {/* Dense irregular filament network — the "circuit hologram" texture */}
      <g ref={filamentGroupRef}>
        {filaments.map((f, i) => {
          const x1 = 120 + f.r1 * Math.cos(f.angle)
          const y1 = 120 + f.r1 * Math.sin(f.angle)
          const x2 = 120 + f.r2 * Math.cos(f.angle)
          const y2 = 120 + f.r2 * Math.sin(f.angle)
          let d = `M${x1},${y1} L${x2},${y2}`
          if (f.branchAngle != null) {
            const bx = x2 + f.branchLen * Math.cos(f.branchAngle)
            const by = y2 + f.branchLen * Math.sin(f.branchAngle)
            d += ` M${x2},${y2} L${bx},${by}`
          }
          return (
            <path
              key={i}
              ref={(el) => { filamentRefs.current[i] = el }}
              d={d}
              fill="none"
              strokeWidth={f.major ? 1.1 : 0.6}
              strokeLinecap="round"
            />
          )
        })}
      </g>

      {/* Fine rotating tick dial (kept, thinner — sits on top of the filament haze) */}
      <g ref={dialRef} opacity={0.7}>
        {Array.from({ length: 72 }, (_, i) => {
          const angle = (i / 72) * 2 * Math.PI
          const major = i % 6 === 0
          const rOuter = 112
          const rInner = major ? 104 : 108
          return (
            <line
              key={i}
              x1={120 + rOuter * Math.cos(angle)}
              y1={120 + rOuter * Math.sin(angle)}
              x2={120 + rInner * Math.cos(angle)}
              y2={120 + rInner * Math.sin(angle)}
              stroke="currentColor"
              className="text-amber-300"
              strokeWidth={major ? 1.2 : 0.5}
              strokeLinecap="round"
              opacity={major ? 0.5 : 0.22}
            />
          )
        })}
      </g>

      {/* Scattered "city light" specks across the globe's face */}
      {cityDots.map((d, i) => (
        <circle key={i} ref={(el) => { cityDotRefs.current[i] = el }} cx={d.x} cy={d.y} r={d.size} />
      ))}

      {/* Orbiting particles */}
      <g ref={particleRingRef}>
        {PARTICLES.map((i) => {
          const angle = (i / PARTICLES.length) * 2 * Math.PI
          const r = 92
          return (
            <circle
              key={i}
              ref={(el) => { particleRefs.current[i] = el }}
              cx={120 + r * Math.cos(angle)}
              cy={120 + r * Math.sin(angle)}
              r={1.4}
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
        cx={120} cy={120} r={58}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{ transition: 'stroke 0.3s ease' }}
      />

      {/* Core sphere */}
      <circle ref={coreRef} cx={120} cy={120} r={28} style={{ filter: 'drop-shadow(0 0 18px rgba(255,255,255,0.35))' }} />
      <ellipse ref={coreHighlightRef} cx={112} cy={110} rx={15} ry={10} fill="url(#jarvis-core-grad)" />
    </svg>
  )
}

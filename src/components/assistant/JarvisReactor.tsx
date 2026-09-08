'use client'

import { useEffect, useMemo, useRef } from 'react'

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

interface JarvisReactorProps {
  state: JarvisState
  /** 0..1 live audio level (mic while listening, output while speaking) — read every frame, never causes a re-render. */
  levelRef: React.MutableRefObject<number>
}

// Gold/amber hologram palette — the classic Iron Man J.A.R.V.I.S. look.
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

interface Point3D { x: number; y: number; z: number }

// Evenly-spaced points on a unit sphere — real 3D geometry, not a flat-ellipse
// illusion, so the "globe" actually reads as a rotating sphere with correct
// perspective foreshortening at the edges.
function fibonacciSphere(n: number): Point3D[] {
  const pts: Point3D[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    pts.push({ x: Math.cos(theta) * radiusAtY, y, z: Math.sin(theta) * radiusAtY })
  }
  return pts
}

// A handful of nearest neighbors per point, as index pairs — this is what
// gets drawn as the "circuit filament" mesh over the sphere's surface.
function buildNeighborPairs(pts: Point3D[], maxPerPoint: number, maxDist: number): [number, number][] {
  const pairs: [number, number][] = []
  const maxDistSq = maxDist * maxDist
  for (let i = 0; i < pts.length; i++) {
    const candidates: { j: number; d: number }[] = []
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue
      const dx = pts[i].x - pts[j].x
      const dy = pts[i].y - pts[j].y
      const dz = pts[i].z - pts[j].z
      const d = dx * dx + dy * dy + dz * dz
      if (d < maxDistSq) candidates.push({ j, d })
    }
    candidates.sort((a, b) => a.d - b.d)
    for (let k = 0; k < Math.min(maxPerPoint, candidates.length); k++) {
      const j = candidates[k].j
      if (j > i) pairs.push([i, j])
    }
  }
  return pairs
}

const POINT_COUNT = 560

export function JarvisReactor({ state, levelRef }: JarvisReactorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const colorRef = useRef<[number, number, number]>(STATE_RGB.idle)

  const points = useMemo(() => fibonacciSphere(POINT_COUNT), [])
  const pairs = useMemo(() => buildNeighborPairs(points, 3, 0.34), [points])

  useEffect(() => {
    const canvasEl = canvasRef.current
    const containerEl = containerRef.current
    if (!canvasEl || !containerEl) return
    const ctx2d = canvasEl.getContext('2d')
    if (!ctx2d) return
    // Rebind to non-nullable locals — TS doesn't propagate the null-checks
    // above into resize()/tick() as separate function declarations.
    const ctx = ctx2d
    const canvas = canvasEl
    const container = containerEl

    let width = 0
    let height = 0

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = container.clientWidth
      height = container.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    function tick() {
      phaseRef.current += 0.012
      const t = phaseRef.current
      const level = levelRef.current

      const target = STATE_RGB[state]
      const cur = colorRef.current
      cur[0] = lerp(cur[0], target[0], 0.08)
      cur[1] = lerp(cur[1], target[1], 0.08)
      cur[2] = lerp(cur[2], target[2], 0.08)
      const r = cur[0] | 0
      const g = cur[1] | 0
      const b = cur[2] | 0

      const idleBreath = (Math.sin(t * 1.6) + 1) / 2
      const alarmBlink = (Math.sin(t * 5) + 1) / 2
      // Speaking has no real audio-level feed (TTS plays as a plain <audio>
      // element, not routed through an analyser, for Safari reliability) so it
      // gets a synthetic "talking cadence" pulse instead of a flat metronome.
      const talkPulse = (Math.sin(t * 7) * 0.5 + Math.sin(t * 15) * 0.3 + 0.8) / 1.6
      const boost =
        state === 'idle' ? idleBreath * 0.15
        : state === 'thinking' ? idleBreath * 0.3 + 0.3
        : state === 'error' ? alarmBlink * 0.45 + 0.15
        : state === 'speaking' ? talkPulse * 0.5 + 0.3
        : level

      ctx.clearRect(0, 0, width, height)

      const cx = width / 2
      const cy = height / 2
      const R = Math.min(width, height) * 0.4
      const rotY = t * (0.22 + boost * 0.35)
      const rotX = Math.sin(t * 0.3) * 0.22
      const cosY = Math.cos(rotY)
      const sinY = Math.sin(rotY)
      const cosX = Math.cos(rotX)
      const sinX = Math.sin(rotX)
      const focal = 2.6

      const projX = new Float32Array(points.length)
      const projY = new Float32Array(points.length)
      const projZ = new Float32Array(points.length)
      const projScale = new Float32Array(points.length)
      for (let i = 0; i < points.length; i++) {
        const p = points[i]
        const x1 = p.x * cosY - p.z * sinY
        const z1 = p.x * sinY + p.z * cosY
        const y2 = p.y * cosX - z1 * sinX
        const z2 = p.y * sinX + z1 * cosX
        const scale = focal / (focal + z2)
        projX[i] = cx + x1 * R * scale
        projY[i] = cy + y2 * R * scale
        projZ[i] = z2
        projScale[i] = scale
      }

      // Additive blending so overlapping filaments/particles build up brighter,
      // like real light — this is the single biggest lever for "hologram" feel.
      ctx.globalCompositeOperation = 'lighter'

      ctx.lineWidth = 0.6
      for (const [i, j] of pairs) {
        const depth = (projZ[i] + projZ[j]) / 2
        const alpha = Math.max(0, 0.16 + depth * 0.16) * (0.5 + boost * 0.5)
        if (alpha <= 0.01) continue
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(projX[i], projY[i])
        ctx.lineTo(projX[j], projY[j])
        ctx.stroke()
      }

      for (let i = 0; i < points.length; i++) {
        const depth = (projZ[i] + 1) / 2 // 0 (back) .. 1 (front)
        const size = (0.55 + depth * 1.5) * projScale[i]
        const alpha = (0.2 + depth * 0.55) * (0.6 + boost * 0.4)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(projX[i], projY[i], size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Core glow — layered radial gradient, white-hot center fading to the state color.
      const coreR = R * 0.32 * (1 + boost * 0.2)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.6)
      grad.addColorStop(0, 'rgba(255,255,255,0.95)')
      grad.addColorStop(0.28, `rgba(${r},${g},${b},0.85)`)
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 2.6, 0, Math.PI * 2)
      ctx.fill()

      // Outer ambient haze, well beyond the sphere itself.
      const haze = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.7)
      haze.addColorStop(0, `rgba(${r},${g},${b},${(0.05 + boost * 0.07).toFixed(3)})`)
      haze.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = haze
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.7, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalCompositeOperation = 'source-over'

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [state, levelRef, points, pairs])

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" style={{ filter: 'drop-shadow(0 0 70px rgba(251,191,36,0.25))' }} />
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

interface Child {
  id: string
  texto: string
  color: string
}

interface Branch {
  id: string
  emoji: string
  texto: string
  color: string
  hijos: Child[]
}

interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string }
  ramas: Branch[]
}

interface Props {
  mapaJson: MapaJson
}

interface DrawPath { d: string; color: string }

const FONT = "'Caveat', cursive"
const DRAW_COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#1a1a2e']

// Layout constants (relative to minDim)
const K_BRANCH_DIST = 0.26   // center → branch circle center
const K_CHILD_DIST  = 0.44   // center → child pill center
const K_CENTER_R    = 0.090  // center circle radius
const K_BRANCH_R    = 0.072  // branch circle radius
const CHILD_W       = 128    // child pill width (fixed px, scales via zoom)
const CHILD_LINE_H  = 21     // child pill line height

function polarToXY(angle: number, r: number) {
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (test.length > maxChars && cur) { lines.push(cur); cur = w }
    else cur = test
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 3)
}

export default function StudioMap({ mapaJson }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [drawMode, setDrawMode] = useState(false)
  const [drawings, setDrawings] = useState<DrawPath[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0])

  const isDragging    = useRef(false)
  const dragStart     = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const isDrawing     = useRef(false)
  const currentPts    = useRef<string[]>([])
  const activePtr     = useRef(new Map<number, { x: number; y: number }>())
  const lastPinchDist = useRef<number | null>(null)
  const autoFitDone   = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      const w = Math.max(width, 320)
      const h = Math.max(height, 240)
      setSize({ w, h })
      if (!autoFitDone.current && width > 100) {
        autoFitDone.current = true
        const minD = Math.min(w, h)
        // Furthest content point: child pill center + half pill height + margin
        const childDist = minD * K_CHILD_DIST
        const contentR  = childDist + CHILD_W * 0.5 + 24
        const targetR   = Math.min(w, h) / 2 - 24
        setZoom(Math.min(1, targetR / contentR))
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => Math.max(0.2, Math.min(4, z * (e.deltaY > 0 ? 0.93 : 1.07))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function svgPoint(cx: number, cy: number) {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: (cx - rect.left - size.w / 2 - pan.x) / zoom,
      y: (cy - rect.top  - size.h / 2 - pan.y) / zoom,
    }
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    activePtr.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    svgRef.current?.setPointerCapture(e.pointerId)
    if (activePtr.current.size > 1) return
    if (drawMode) {
      isDrawing.current = true
      const p = svgPoint(e.clientX, e.clientY)
      const d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
      currentPts.current = [d]
      setCurrentPath(d)
    } else {
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    activePtr.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activePtr.current.size === 2) {
      isDragging.current = false
      isDrawing.current  = false
      const pts  = Array.from(activePtr.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (lastPinchDist.current !== null)
        setZoom((z) => Math.max(0.2, Math.min(4, z * dist / lastPinchDist.current!)))
      lastPinchDist.current = dist
      return
    }
    lastPinchDist.current = null
    if (drawMode && isDrawing.current) {
      const p = svgPoint(e.clientX, e.clientY)
      currentPts.current.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      setCurrentPath(currentPts.current.join(' '))
    } else if (isDragging.current) {
      setPan({
        x: dragStart.current.px + e.clientX - dragStart.current.x,
        y: dragStart.current.py + e.clientY - dragStart.current.y,
      })
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    activePtr.current.delete(e.pointerId)
    lastPinchDist.current = null
    if (drawMode && isDrawing.current && currentPath) {
      setDrawings((d) => [...d, { d: currentPath, color: drawColor }])
      setCurrentPath('')
      currentPts.current = []
    }
    isDrawing.current  = false
    isDragging.current = false
  }

  const { centro, ramas } = mapaJson
  const branchCount = ramas.length
  const angleStep   = (2 * Math.PI) / branchCount
  const startAngle  = -Math.PI / 2

  const minDim    = Math.min(size.w, size.h)
  const BDIST     = minDim * K_BRANCH_DIST
  const CDIST     = minDim * K_CHILD_DIST
  const CR        = minDim * K_CENTER_R
  const BR        = minDim * K_BRANCH_R
  // Spread: tighter for more branches so children don't cross adjacent sectors
  const SPREAD    = branchCount <= 4 ? 0.40 : 0.28

  const tfm = `translate(${(size.w / 2 + pan.x).toFixed(1)},${(size.h / 2 + pan.y).toFixed(1)}) scale(${zoom})`

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        overflow="visible"
        style={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none', cursor: drawMode ? 'crosshair' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="sdots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="1" fill="#ccc" />
          </pattern>
          <filter id="ssh" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.18)" />
          </filter>
        </defs>

        {/* Background */}
        <rect width={size.w} height={size.h} fill="#fafaf8" />
        <rect width={size.w} height={size.h} fill="url(#sdots)" opacity={0.3} />

        <g transform={tfm}>

          {/* ── Lines ─────────────────────────────────── */}
          {ramas.map((branch, i) => {
            const a  = startAngle + i * angleStep
            const bp = polarToXY(a, BDIST)
            return (
              <g key={`ln${i}`}>
                {/* center → branch */}
                <line x1={0} y1={0} x2={bp.x} y2={bp.y}
                  stroke={branch.color} strokeWidth={2.5}
                  strokeOpacity={0.4} strokeDasharray="7 5" />
                {/* branch → each child */}
                {(branch.hijos ?? []).map((_, j) => {
                  const ca = a + (j - (branch.hijos.length - 1) / 2) * SPREAD
                  const cp = polarToXY(ca, CDIST)
                  return (
                    <line key={j} x1={bp.x} y1={bp.y} x2={cp.x} y2={cp.y}
                      stroke={branch.color} strokeWidth={1.5} strokeOpacity={0.35} />
                  )
                })}
              </g>
            )
          })}

          {/* ── Child pills ───────────────────────────── */}
          {ramas.map((branch, i) => {
            const a = startAngle + i * angleStep
            return (branch.hijos ?? []).map((child, j) => {
              const ca    = a + (j - (branch.hijos.length - 1) / 2) * SPREAD
              const cp    = polarToXY(ca, CDIST)
              const lines = wrapText(child.texto, 14)
              const rh    = Math.max(32, lines.length * CHILD_LINE_H + 12)
              const fontSize = Math.max(12, minDim * 0.018)
              return (
                <g key={`c${i}-${j}`}>
                  <rect x={cp.x - CHILD_W / 2} y={cp.y - rh / 2}
                    width={CHILD_W} height={rh} rx={rh / 2}
                    fill={branch.color} fillOpacity={0.13}
                    stroke={branch.color} strokeWidth={1.5} strokeOpacity={0.55} />
                  {lines.map((line, li) => (
                    <text key={li}
                      x={cp.x}
                      y={cp.y - ((lines.length - 1) * CHILD_LINE_H) / 2 + li * CHILD_LINE_H}
                      textAnchor="middle" dominantBaseline="central"
                      fill="#1e1e28" fontSize={fontSize} fontFamily={FONT}>
                      {line}
                    </text>
                  ))}
                </g>
              )
            })
          })}

          {/* ── Branch circles ────────────────────────── */}
          {ramas.map((branch, i) => {
            const a  = startAngle + i * angleStep
            const bp = polarToXY(a, BDIST)
            // Text wraps at 12 chars, max 2 lines inside circle
            const labelLines = wrapText(branch.texto, 12).slice(0, 2)
            const emojiSize  = BR * 0.50
            const labelSize  = BR * 0.245
            const labelY0    = bp.y + BR * 0.12 - ((labelLines.length - 1) * BR * 0.255) / 2
            return (
              <g key={`br${i}`}>
                <circle cx={bp.x} cy={bp.y} r={BR}
                  fill={branch.color} filter="url(#ssh)" />
                {/* emoji – upper half of circle */}
                <text x={bp.x} y={bp.y - BR * 0.26}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={emojiSize} fontFamily={FONT}>
                  {branch.emoji}
                </text>
                {/* name lines – lower half */}
                {labelLines.map((line, li) => (
                  <text key={li}
                    x={bp.x} y={labelY0 + li * BR * 0.30}
                    textAnchor="middle" dominantBaseline="central"
                    fill="white" fontSize={labelSize}
                    fontFamily={FONT} fontWeight="700">
                    {line}
                  </text>
                ))}
              </g>
            )
          })}

          {/* ── Center node ───────────────────────────── */}
          <circle cx={0} cy={0} r={CR} fill={centro.color} filter="url(#ssh)" />
          <text x={0} y={-CR * 0.26}
            textAnchor="middle" dominantBaseline="central"
            fontSize={CR * 0.46} fontFamily={FONT}>
            {centro.emoji}
          </text>
          {wrapText(centro.texto, 13).map((line, li, arr) => (
            <text key={li}
              x={0}
              y={CR * 0.16 + li * CR * 0.30 - ((arr.length - 1) * CR * 0.15)}
              textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize={CR * 0.24}
              fontFamily={FONT} fontWeight="700">
              {line}
            </text>
          ))}

          {/* ── Drawings ──────────────────────────────── */}
          {drawings.map((p, idx) => (
            <path key={idx} d={p.d} stroke={p.color} strokeWidth={3}
              fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          ))}
          {currentPath && (
            <path d={currentPath} stroke={drawColor} strokeWidth={3}
              fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          )}
        </g>
      </svg>

      {/* ── Left-side controls (won't overlap audio FABs on the right) ── */}
      <div style={{
        position: 'absolute', left: 14, bottom: 28,
        display: 'flex', flexDirection: 'column-reverse', gap: 9,
        zIndex: 30, alignItems: 'center',
      }}>
        {/* Draw / Move toggle */}
        <Fab
          bg={drawMode ? '#f59e0b' : undefined}
          border={drawMode ? '#fbbf24' : undefined}
          onClick={() => setDrawMode((v) => !v)}
          title={drawMode ? 'Modo mover' : 'Modo dibujar'}>
          {drawMode ? '✏️' : '✋'}
        </Fab>

        {/* Zoom controls (move mode only) */}
        {!drawMode && (
          <>
            <Fab onClick={() => setZoom((z) => Math.min(4, z + 0.2))} title="Acercar">
              <span style={{ color: '#1a1a2e', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>+</span>
            </Fab>
            <Fab onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))} title="Alejar">
              <span style={{ color: '#1a1a2e', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>−</span>
            </Fab>
            <Fab onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1) }} title="Centrar">
              <span style={{ fontSize: 17 }}>⊙</span>
            </Fab>
          </>
        )}

        {/* Draw tools (draw mode only) */}
        {drawMode && (
          <>
            {DRAW_COLORS.map((c) => (
              <div key={c} onClick={() => setDrawColor(c)} style={{
                width: drawColor === c ? 36 : 28, height: drawColor === c ? 36 : 28,
                borderRadius: '50%', background: c, cursor: 'pointer', transition: 'all 0.15s',
                border: drawColor === c ? '3px solid #1a1a2e' : '2px solid rgba(0,0,0,0.15)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }} />
            ))}
            <Fab bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.4)"
              onClick={() => setDrawings([])} title="Borrar trazos">
              🗑️
            </Fab>
          </>
        )}
      </div>
    </div>
  )
}

function Fab({
  children, onClick, title,
  bg = 'rgba(0,0,0,0.07)',
  border = 'rgba(0,0,0,0.14)',
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  bg?: string
  border?: string
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 50, height: 50, borderRadius: '50%',
      background: bg, border: `1px solid ${border}`,
      cursor: 'pointer', fontSize: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
      padding: 0,
    }}>
      {children}
    </button>
  )
}

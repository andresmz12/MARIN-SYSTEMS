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
const DRAW_COLORS = ['#fbbf24', '#ef4444', '#4ade80', '#60a5fa', '#f472b6', '#ffffff']

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

  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const isDrawing = useRef(false)
  const currentPoints = useRef<string[]>([])
  const activePointers = useRef(new Map<number, { x: number; y: number }>())
  const lastPinchDist = useRef<number | null>(null)
  const autoFitDone = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      const w = Math.max(width, 320)
      const h = Math.max(height, 240)
      setSize({ w, h })
      if (!autoFitDone.current && width > 100) {
        autoFitDone.current = true
        const minDim = Math.min(w, h)
        const contentRadius = minDim * 0.5
        const targetRadius = Math.min(w, h) / 2 - 40
        setZoom(Math.min(1, targetRadius / contentRadius))
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
      setZoom((z) => Math.max(0.2, Math.min(4, z * (e.deltaY > 0 ? 0.92 : 1.08))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function svgPoint(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - size.w / 2 - pan.x) / zoom,
      y: (clientY - rect.top - size.h / 2 - pan.y) / zoom,
    }
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    svgRef.current?.setPointerCapture(e.pointerId)
    if (activePointers.current.size > 1) return

    if (drawMode) {
      isDrawing.current = true
      const pt = svgPoint(e.clientX, e.clientY)
      const d = `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
      currentPoints.current = [d]
      setCurrentPath(d)
    } else {
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointers.current.size === 2) {
      isDragging.current = false
      isDrawing.current = false
      const pts = Array.from(activePointers.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (lastPinchDist.current !== null) {
        const ratio = dist / lastPinchDist.current
        setZoom((z) => Math.max(0.2, Math.min(4, z * ratio)))
      }
      lastPinchDist.current = dist
      return
    }
    lastPinchDist.current = null

    if (drawMode && isDrawing.current) {
      const pt = svgPoint(e.clientX, e.clientY)
      currentPoints.current.push(`L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      setCurrentPath(currentPoints.current.join(' '))
    } else if (isDragging.current) {
      setPan({
        x: dragStart.current.px + e.clientX - dragStart.current.x,
        y: dragStart.current.py + e.clientY - dragStart.current.y,
      })
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    activePointers.current.delete(e.pointerId)
    lastPinchDist.current = null
    if (drawMode && isDrawing.current && currentPath) {
      setDrawings((d) => [...d, { d: currentPath, color: drawColor }])
      setCurrentPath('')
      currentPoints.current = []
    }
    isDrawing.current = false
    isDragging.current = false
  }

  const { centro, ramas } = mapaJson
  const branchCount = ramas.length
  const angleStep = (2 * Math.PI) / branchCount
  const startAngle = -Math.PI / 2
  const minDim = Math.min(size.w, size.h)
  const BRANCH_DIST = minDim * 0.27
  const CHILD_DIST = minDim * 0.46
  const CENTER_R = minDim * 0.088
  const BRANCH_R = minDim * 0.063
  const CHILD_W = 168
  const LINE_H = 20

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
          <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.06)" />
          </pattern>
          <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="rgba(0,0,0,0.65)" />
          </filter>
        </defs>
        <rect width={size.w} height={size.h} fill="#1a1a2e" />
        <rect width={size.w} height={size.h} fill="url(#dots)" />

        <g transform={tfm}>

          {/* Connector lines */}
          {ramas.map((branch, i) => {
            const angle = startAngle + i * angleStep
            const bp = polarToXY(angle, BRANCH_DIST)
            return (
              <g key={`ln-${i}`}>
                <line x1={0} y1={0} x2={bp.x} y2={bp.y}
                  stroke={branch.color} strokeWidth={2.5} strokeOpacity={0.45} strokeDasharray="7 4" />
                {(branch.hijos ?? []).map((child, j) => {
                  const sp = branchCount <= 4 ? 0.38 : 0.30
                  const ca = angle + (j - (branch.hijos.length - 1) / 2) * sp
                  const cp = polarToXY(ca, CHILD_DIST)
                  return (
                    <line key={j} x1={bp.x} y1={bp.y} x2={cp.x} y2={cp.y}
                      stroke={branch.color} strokeWidth={1.5} strokeOpacity={0.35} />
                  )
                })}
              </g>
            )
          })}

          {/* Child nodes */}
          {ramas.map((branch, i) => {
            const angle = startAngle + i * angleStep
            const bp = polarToXY(angle, BRANCH_DIST)
            return (branch.hijos ?? []).map((child, j) => {
              const sp = branchCount <= 4 ? 0.38 : 0.30
              const ca = angle + (j - (branch.hijos.length - 1) / 2) * sp
              const cp = polarToXY(ca, CHILD_DIST)
              const lines = wrapText(child.texto, 17)
              const rh = Math.max(34, lines.length * LINE_H + 14)
              return (
                <g key={`child-${branch.id}-${j}`}>
                  <rect x={cp.x - CHILD_W / 2} y={cp.y - rh / 2}
                    width={CHILD_W} height={rh} rx={rh / 2}
                    fill={branch.color} fillOpacity={0.2}
                    stroke={branch.color} strokeWidth={1.5} strokeOpacity={0.6} />
                  {lines.map((line, li) => (
                    <text key={li}
                      x={cp.x}
                      y={cp.y - ((lines.length - 1) * LINE_H) / 2 + li * LINE_H}
                      textAnchor="middle" dominantBaseline="central"
                      fill="rgba(255,255,255,0.9)" fontSize={13}
                      fontFamily={FONT}>
                      {line}
                    </text>
                  ))}
                </g>
              )
            })
          })}

          {/* Branch nodes */}
          {ramas.map((branch, i) => {
            const angle = startAngle + i * angleStep
            const bp = polarToXY(angle, BRANCH_DIST)
            const labelLines = wrapText(branch.texto, 11)
            return (
              <g key={`br-${i}`}>
                <circle cx={bp.x} cy={bp.y} r={BRANCH_R}
                  fill={branch.color} filter="url(#sh)" />
                <text x={bp.x} y={bp.y - (labelLines.length > 1 ? 13 : 8)}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={BRANCH_R * 0.52} fontFamily={FONT}>
                  {branch.emoji}
                </text>
                {labelLines.map((line, li) => (
                  <text key={li}
                    x={bp.x}
                    y={bp.y + (labelLines.length > 1 ? 8 : 14) + li * 15 - ((labelLines.length - 1) * 7)}
                    textAnchor="middle" dominantBaseline="central"
                    fill="white" fontSize={BRANCH_R * 0.265}
                    fontFamily={FONT} fontWeight="700">
                    {line}
                  </text>
                ))}
              </g>
            )
          })}

          {/* Center node */}
          <circle cx={0} cy={0} r={CENTER_R} fill={centro.color} filter="url(#sh)" />
          <text x={0} y={-CENTER_R * 0.28}
            textAnchor="middle" dominantBaseline="central"
            fontSize={CENTER_R * 0.52} fontFamily={FONT}>
            {centro.emoji}
          </text>
          {wrapText(centro.texto, 13).map((line, li, arr) => (
            <text key={li}
              x={0}
              y={CENTER_R * 0.22 + li * CENTER_R * 0.33 - ((arr.length - 1) * CENTER_R * 0.165)}
              textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize={CENTER_R * 0.255}
              fontFamily={FONT} fontWeight="700">
              {line}
            </text>
          ))}

          {/* Drawings */}
          {drawings.map((p, idx) => (
            <path key={idx} d={p.d} stroke={p.color} strokeWidth={3.5}
              fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.88} />
          ))}
          {currentPath && (
            <path d={currentPath} stroke={drawColor} strokeWidth={3.5}
              fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.88} />
          )}
        </g>
      </svg>

      {/* Controls — left side, won't overlap audio buttons (right) */}
      <div style={{
        position: 'absolute', left: 16, bottom: 32,
        display: 'flex', flexDirection: 'column-reverse', gap: 10,
        zIndex: 30, alignItems: 'center',
      }}>
        {/* Draw/Move toggle */}
        <button onClick={() => setDrawMode((d) => !d)}
          title={drawMode ? 'Modo mover' : 'Modo dibujar'}
          style={fabStyle(drawMode ? '#f59e0b' : 'rgba(255,255,255,0.1)', drawMode ? '#fbbf24' : 'rgba(255,255,255,0.2)')}>
          {drawMode ? '✏️' : '✋'}
        </button>

        {!drawMode && (
          <>
            <button onClick={() => setZoom((z) => Math.min(4, z + 0.2))} title="Acercar" style={fabStyle()}>
              <span style={{ color: 'white', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>+</span>
            </button>
            <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))} title="Alejar" style={fabStyle()}>
              <span style={{ color: 'white', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>−</span>
            </button>
            <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1) }} title="Centrar" style={fabStyle()}>
              <span style={{ fontSize: 18 }}>⊙</span>
            </button>
          </>
        )}

        {drawMode && (
          <>
            {DRAW_COLORS.map((c) => (
              <div key={c} onClick={() => setDrawColor(c)} style={{
                width: drawColor === c ? 36 : 28, height: drawColor === c ? 36 : 28,
                borderRadius: '50%', background: c, cursor: 'pointer',
                border: drawColor === c ? '3px solid white' : '2px solid rgba(255,255,255,0.25)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)', transition: 'all 0.15s',
              }} />
            ))}
            <button onClick={() => setDrawings([])} title="Borrar trazos" style={fabStyle('rgba(239,68,68,0.2)', 'rgba(239,68,68,0.5)')}>
              🗑️
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function fabStyle(bg = 'rgba(255,255,255,0.1)', border = 'rgba(255,255,255,0.2)'): React.CSSProperties {
  return {
    width: 52, height: 52, borderRadius: '50%',
    background: bg, border: `1px solid ${border}`,
    cursor: 'pointer', fontSize: 22,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 14px rgba(0,0,0,0.45)',
    padding: 0,
  }
}

'use client'

import { useEffect, useRef, useState } from 'react'

interface Child  { id: string; texto: string; color: string }
interface Branch { id: string; emoji: string; texto: string; color: string; hijos: Child[] }
interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string }
  ramas: Branch[]
}
interface Props {
  mapaJson: MapaJson
  activeNodeId?: string | null
}
interface DrawPath { d: string; color: string }

// ─── constants ────────────────────────────────────────────────
const FONT    = "'Inter', system-ui, sans-serif"
const FONT_CH = 0.54
const DRAW_COLORS = ['#f59e0b','#ef4444','#22c55e','#3b82f6','#a855f7','#1a1a2e']

// ─── helpers ──────────────────────────────────────────────────
function polar(a: number, r: number) { return { x: r * Math.cos(a), y: r * Math.sin(a) } }

function wrap(text: string, maxCh: number): string[] {
  // Honour explicit \n line breaks from the prompt
  const segments = text.split('\n').filter(s => s.length > 0)
  const result: string[] = []
  for (const seg of segments) {
    const words = seg.split(' ').filter(w => w.length > 0)
    let cur = ''
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w
      if (t.length > maxCh && cur) { result.push(cur); cur = w } else cur = t
    }
    if (cur) result.push(cur)
  }
  return result.length > 0 ? result : [text]
}

function measureNode(
  text: string, emoji: string | null,
  fontSize: number, maxCh: number,
  padX: number, padY: number,
  minW: number, maxW: number, minH: number, maxH: number,
): { lines: string[]; w: number; h: number } {
  const lines  = wrap(text, maxCh)
  const textW  = Math.max(...lines.map(l => l.length)) * fontSize * FONT_CH
  const lineH  = fontSize * 1.30
  const textH  = lines.length * lineH
  const emojiH = emoji ? fontSize * 1.25 : 0
  return {
    lines,
    w: Math.max(minW, Math.min(maxW, textW + padX * 2)),
    h: Math.max(minH, Math.min(maxH, emojiH + textH + padY * 2)),
  }
}

interface Box { x: number; y: number; w: number; h: number }
function overlaps(a: Box, b: Box, margin = 10): boolean {
  return !(
    a.x + a.w/2 + margin < b.x - b.w/2 ||
    b.x + b.w/2 + margin < a.x - a.w/2 ||
    a.y + a.h/2 + margin < b.y - b.h/2 ||
    b.y + b.h/2 + margin < a.y - a.h/2
  )
}

function spreadStep(childCount: number, branchSectorDeg: number): number {
  if (childCount <= 1) return 0
  const maxHalf = Math.min(62, branchSectorDeg * 0.82 / 2)
  return (maxHalf * Math.PI / 180) / ((childCount - 1) / 2)
}

// CSS effects applied to inner <g> via style (supports CSS transition)
function nodeStyle(isActive: boolean, isAnyActive: boolean, color: string): React.CSSProperties {
  return {
    transformBox: 'fill-box' as const,
    transformOrigin: 'center' as const,
    transform: isActive ? 'scale(1.13)' : 'scale(1)',
    opacity: isAnyActive ? (isActive ? 1 : 0.22) : 1,
    filter: isActive ? `drop-shadow(0 0 14px ${color}95)` : 'none',
    transition: 'transform 0.4s ease, opacity 0.4s ease, filter 0.4s ease',
  }
}

// ─── component ────────────────────────────────────────────────
export default function StudioMap({ mapaJson, activeNodeId }: Props) {
  const svgRef       = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [pan,  setPan]  = useState({ x: 0,   y: 0 })
  const [zoom, setZoom] = useState(1)

  const [drawMode,  setDrawMode]  = useState(false)
  const [drawings,  setDrawings]  = useState<DrawPath[]>([])
  const [curPath,   setCurPath]   = useState('')
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0])

  const isDragging    = useRef(false)
  const dragStart     = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const isDrawing     = useRef(false)
  const curPts        = useRef<string[]>([])
  const activePtr     = useRef(new Map<number, { x: number; y: number }>())
  const lastPinch     = useRef<number | null>(null)
  const autoFitDone   = useRef(false)

  // refs for autopan (avoid stale closures)
  const panRef        = useRef({ x: 0, y: 0 })
  const zoomRef       = useRef(1)
  const panAnimRef    = useRef<number | null>(null)
  const nodePositions = useRef<Record<string, { x: number; y: number }>>({})
  const firstFit      = useRef(false)

  // keep refs in sync
  useEffect(() => { panRef.current  = pan  }, [pan])
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // ── ResizeObserver ──
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width: rw, height: rh } = entries[0].contentRect
      const w = Math.max(rw, 320), h = Math.max(rh, 240)
      setSize({ w, h })
      if (!autoFitDone.current && rw > 100) autoFitDone.current = true
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Wheel zoom ──
  useEffect(() => {
    const el = svgRef.current; if (!el) return
    const fn = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => Math.max(0.2, Math.min(4, z * (e.deltaY > 0 ? 0.93 : 1.07))))
    }
    el.addEventListener('wheel', fn, { passive: false })
    return () => el.removeEventListener('wheel', fn)
  }, [])

  // ── Auto-pan to active node ──
  useEffect(() => {
    if (!activeNodeId) return
    const pos = nodePositions.current[activeNodeId]
    if (!pos) return

    if (panAnimRef.current) cancelAnimationFrame(panAnimRef.current)
    const startPan  = { ...panRef.current }
    const targetPan = { x: -(pos.x * zoomRef.current), y: -(pos.y * zoomRef.current) }
    const t0 = performance.now()
    const DUR = 500

    function step(now: number) {
      const t = Math.min((now - t0) / DUR, 1)
      const e = 1 - Math.pow(1 - t, 3)
      const newPan = {
        x: startPan.x + (targetPan.x - startPan.x) * e,
        y: startPan.y + (targetPan.y - startPan.y) * e,
      }
      panRef.current = newPan
      setPan(newPan)
      if (t < 1) panAnimRef.current = requestAnimationFrame(step)
    }
    panAnimRef.current = requestAnimationFrame(step)
    return () => { if (panAnimRef.current) cancelAnimationFrame(panAnimRef.current) }
  }, [activeNodeId])

  // ── SVG point helper ──
  function svgPt(cx: number, cy: number) {
    const r = svgRef.current!.getBoundingClientRect()
    return {
      x: (cx - r.left - size.w/2 - pan.x) / zoom,
      y: (cy - r.top  - size.h/2 - pan.y) / zoom,
    }
  }

  // ── Pointer handlers ──
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // Cancel autopan on manual interaction
    if (panAnimRef.current) { cancelAnimationFrame(panAnimRef.current); panAnimRef.current = null }
    activePtr.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    svgRef.current?.setPointerCapture(e.pointerId)
    if (activePtr.current.size > 1) return
    if (drawMode) {
      isDrawing.current = true
      const p = svgPt(e.clientX, e.clientY)
      const d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
      curPts.current = [d]; setCurPath(d)
    } else {
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    activePtr.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activePtr.current.size === 2) {
      isDragging.current = false; isDrawing.current = false
      const pts  = Array.from(activePtr.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (lastPinch.current !== null)
        setZoom(z => Math.max(0.2, Math.min(4, z * dist / lastPinch.current!)))
      lastPinch.current = dist; return
    }
    lastPinch.current = null
    if (drawMode && isDrawing.current) {
      const p = svgPt(e.clientX, e.clientY)
      curPts.current.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      setCurPath(curPts.current.join(' '))
    } else if (isDragging.current) {
      const newPan = {
        x: dragStart.current.px + e.clientX - dragStart.current.x,
        y: dragStart.current.py + e.clientY - dragStart.current.y,
      }
      panRef.current = newPan
      setPan(newPan)
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    activePtr.current.delete(e.pointerId)
    lastPinch.current = null
    if (drawMode && isDrawing.current && curPath) {
      setDrawings(d => [...d, { d: curPath, color: drawColor }])
      setCurPath(''); curPts.current = []
    }
    isDrawing.current = isDragging.current = false
  }

  // ══════════════════════════════════════════════════════════════
  //  DYNAMIC LAYOUT
  // ══════════════════════════════════════════════════════════════
  const { centro, ramas } = mapaJson
  const nBranch   = ramas.length
  const minDim    = Math.min(size.w, size.h)
  const sectorDeg = 360 / nBranch
  const startA    = -Math.PI / 2
  const stepA     = (2 * Math.PI) / nBranch

  const CF = Math.max(15, minDim * 0.023)
  const BF = Math.max(13, minDim * 0.020)
  const HF = Math.max(12, minDim * 0.017)

  const cNode = measureNode(centro.texto, centro.emoji, CF, 15, 14, 10, 150, 190, 130, 165)
  const bNodes = ramas.map(br => ({
    br,
    m: measureNode(br.texto, br.emoji, BF, 12, 12, 8, 130, 160, 110, 140),
    hijos: br.hijos.map(h => ({
      h,
      m: measureNode(h.texto, null, HF, 15, 14, 8, 110, 140, 85, 108),
    })),
    spread: spreadStep(br.hijos.length, sectorDeg),
  }))

  // Iterative collision resolution — expand until no overlaps remain
  let BDIST = minDim * 0.28
  let CADD  = minDim * 0.22

  for (let iter = 0; iter < 50; iter++) {
    const CDIST = BDIST + CADD
    const boxes: Box[] = [{ x: 0, y: 0, w: cNode.w, h: cNode.h }]
    for (let i = 0; i < bNodes.length; i++) {
      const a  = startA + i * stepA
      const bp = polar(a, BDIST)
      const { m, hijos, spread } = bNodes[i]
      boxes.push({ x: bp.x, y: bp.y, w: m.w, h: m.h })
      for (let j = 0; j < hijos.length; j++) {
        const ca = a + (j - (hijos.length - 1) / 2) * spread
        const cp = polar(ca, CDIST)
        boxes.push({ x: cp.x, y: cp.y, w: hijos[j].m.w, h: hijos[j].m.h })
      }
    }
    let col = false
    outer: for (let a2 = 0; a2 < boxes.length; a2++)
      for (let b2 = a2 + 1; b2 < boxes.length; b2++)
        if (overlaps(boxes[a2], boxes[b2])) { col = true; break outer }
    if (!col) break
    if (iter % 3 !== 2) CADD  += minDim * 0.018
    else                BDIST += minDim * 0.012
  }

  const CDIST = BDIST + CADD

  // Compute fit zoom based on actual max node radius
  const maxNodeR = Math.max(
    Math.max(cNode.w, cNode.h) / 2,
    ...bNodes.flatMap(bn => [
      Math.max(bn.m.w, bn.m.h) / 2,
      ...bn.hijos.map(hj => Math.max(hj.m.w, hj.m.h) / 2),
    ]),
  )
  const contentR = CDIST + maxNodeR + 16
  const targetR  = Math.min(size.w, size.h) / 2 - 24
  const fitZoom  = Math.min(1, targetR / contentR)

  useEffect(() => {
    if (!firstFit.current && size.w !== 800) {
      firstFit.current = true
      setZoom(fitZoom)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w])

  // Build nodePositions for autopan
  const positions: Record<string, { x: number; y: number }> = { [centro.id]: { x: 0, y: 0 } }
  for (let i = 0; i < bNodes.length; i++) {
    const a  = startA + i * stepA
    const bp = polar(a, BDIST)
    positions[bNodes[i].br.id] = { x: bp.x, y: bp.y }
    for (let j = 0; j < bNodes[i].hijos.length; j++) {
      const ca = a + (j - (bNodes[i].hijos.length - 1) / 2) * bNodes[i].spread
      const cp = polar(ca, CDIST)
      positions[bNodes[i].hijos[j].h.id] = { x: cp.x, y: cp.y }
    }
  }
  nodePositions.current = positions

  const isAnyActive = !!activeNodeId
  const tfm = `translate(${(size.w/2 + pan.x).toFixed(1)},${(size.h/2 + pan.y).toFixed(1)}) scale(${zoom})`

  // Helper: which branch index "owns" the active node?
  function activeBranchIdx(): number {
    if (!activeNodeId) return -1
    for (let i = 0; i < bNodes.length; i++) {
      if (bNodes[i].br.id === activeNodeId) return i
      if (bNodes[i].hijos.some(h => h.h.id === activeNodeId)) return i
    }
    return -1
  }
  const activeBranch = activeBranchIdx()

  // ── render ──────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        width={size.w} height={size.h}
        overflow="visible"
        style={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none',
                 cursor: drawMode ? 'crosshair' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="sdots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="1" fill="#ccc" />
          </pattern>
          <filter id="nsh" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.16)" />
          </filter>
        </defs>

        <rect width={size.w} height={size.h} fill="#fafaf8" />
        <rect width={size.w} height={size.h} fill="url(#sdots)" opacity={0.3} />

        <g transform={tfm}>

          {/* ── Connectors ─────────────────────────────── */}
          {bNodes.map(({ br, m: bm, hijos, spread }, i) => {
            const a   = startA + i * stepA
            const bp  = polar(a, BDIST)
            const ux  = bp.x / BDIST, uy = bp.y / BDIST
            const tension = CADD * 0.45
            const qx  = bp.x + ux * tension, qy = bp.y + uy * tension
            const cx0 = ux * (cNode.w / 2 * 0.90), cy0 = uy * (cNode.h / 2 * 0.90)
            const bex = bp.x - ux * (bm.w / 2 * 0.85), bey = bp.y - uy * (bm.h / 2 * 0.85)

            const isBranchActive = activeBranch === i
            const spokeOpacity = !isAnyActive ? 0.5 : isBranchActive ? 0.85 : 0.12
            const spokeWidth   = isBranchActive && activeNodeId === br.id ? 4 : 2.5

            return (
              <g key={`cn${i}`}>
                <line x1={cx0} y1={cy0} x2={bex} y2={bey}
                  stroke={br.color}
                  strokeWidth={spokeWidth}
                  strokeOpacity={spokeOpacity}
                  style={{ transition: 'stroke-opacity 0.4s ease, stroke-width 0.4s ease' }} />
                {hijos.map((hj, j) => {
                  const ca = a + (j - (hijos.length - 1) / 2) * spread
                  const cp = polar(ca, CDIST)
                  const isChildActive = activeNodeId === hj.h.id
                  return (
                    <path key={j}
                      d={`M ${bp.x.toFixed(1)} ${bp.y.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${cp.x.toFixed(1)} ${cp.y.toFixed(1)}`}
                      stroke={br.color}
                      strokeWidth={isChildActive ? 3.5 : 1.6}
                      strokeOpacity={!isAnyActive ? 0.42 : isBranchActive ? (isChildActive ? 0.9 : 0.35) : 0.08}
                      fill="none"
                      style={{ transition: 'stroke-opacity 0.4s ease, stroke-width 0.4s ease' }} />
                  )
                })}
              </g>
            )
          })}

          {/* ── Child nodes ────────────────────────────── */}
          {bNodes.map(({ br, hijos, spread }, i) => {
            const a = startA + i * stepA
            return hijos.map(({ h, m }, j) => {
              const ca   = a + (j - (hijos.length - 1) / 2) * spread
              const cp   = polar(ca, CDIST)
              const lh   = HF * 1.30
              const lines = m.lines
              const rr   = m.h / 2
              const isActive = activeNodeId === h.id
              return (
                <g key={`hj${i}-${j}`} transform={`translate(${cp.x},${cp.y})`}>
                  <g style={nodeStyle(isActive, isAnyActive, h.color)}>
                    <rect x={-m.w/2} y={-m.h/2}
                      width={m.w} height={m.h} rx={rr}
                      fill={h.color} fillOpacity={isActive ? 0.22 : 0.13}
                      stroke={h.color} strokeWidth={isActive ? 2.5 : 1.5} strokeOpacity={0.65} />
                    {lines.map((line, li) => (
                      <text key={li}
                        x={0}
                        y={-((lines.length - 1) * lh) / 2 + li * lh}
                        textAnchor="middle" dominantBaseline="central"
                        fill="#333" fontSize={HF} fontFamily={FONT}>
                        {line}
                      </text>
                    ))}
                  </g>
                </g>
              )
            })
          })}

          {/* ── Branch nodes ───────────────────────────── */}
          {bNodes.map(({ br, m, hijos: _h }, i) => {
            const a    = startA + i * stepA
            const bp   = polar(a, BDIST)
            const lh   = BF * 1.25
            const eH   = BF * 1.25
            const emojiY  = -m.h / 2 + 8 + BF * 0.60
            const textY0  = emojiY + eH / 2 + BF * 0.70
            const lines   = m.lines
            const rr   = Math.min(m.w, m.h) * 0.35
            const isActive = activeNodeId === br.id
            return (
              <g key={`br${i}`} transform={`translate(${bp.x},${bp.y})`}>
                <g style={nodeStyle(isActive, isAnyActive, br.color)}>
                  <rect x={-m.w/2} y={-m.h/2}
                    width={m.w} height={m.h} rx={rr}
                    fill={br.color} fillOpacity={isActive ? 0.95 : 0.88}
                    stroke={br.color} strokeWidth={isActive ? 3.5 : 0}
                    filter="url(#nsh)" />
                  <text x={0} y={emojiY}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={BF * 1.10} fontFamily={FONT}>{br.emoji}</text>
                  {lines.map((line, li) => (
                    <text key={li}
                      x={0} y={textY0 + li * lh}
                      textAnchor="middle" dominantBaseline="central"
                      fill="white" fontSize={BF} fontFamily={FONT} fontWeight="700">
                      {line}
                    </text>
                  ))}
                </g>
              </g>
            )
          })}

          {/* ── Center node ────────────────────────────── */}
          {(() => {
            const { lines, w, h } = cNode
            const lh     = CF * 1.25
            const eH     = CF * 1.25
            const rr     = Math.min(w, h) * 0.35
            const emojiY = -h / 2 + 10 + CF * 0.60
            const textY0 = emojiY + eH / 2 + CF * 0.70
            const isActive = activeNodeId === centro.id
            return (
              <g>
                <g style={nodeStyle(isActive, isAnyActive, centro.color)}>
                  <rect x={-w/2} y={-h/2} width={w} height={h} rx={rr}
                    fill={centro.color} fillOpacity={isActive ? 0.95 : 0.88}
                    stroke={centro.color} strokeWidth={isActive ? 3.5 : 0}
                    filter="url(#nsh)" />
                  <text x={0} y={emojiY}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={CF * 1.15} fontFamily={FONT}>{centro.emoji}</text>
                  {lines.map((line, li) => (
                    <text key={li}
                      x={0} y={textY0 + li * lh}
                      textAnchor="middle" dominantBaseline="central"
                      fill="white" fontSize={CF} fontFamily={FONT} fontWeight="700">
                      {line}
                    </text>
                  ))}
                </g>
              </g>
            )
          })()}

          {/* ── Drawings ───────────────────────────────── */}
          {drawings.map((p, i) => (
            <path key={i} d={p.d} stroke={p.color} strokeWidth={3}
              fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          ))}
          {curPath && (
            <path d={curPath} stroke={drawColor} strokeWidth={3}
              fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          )}
        </g>
      </svg>

      {/* ── Controls ──────────────────────────────────── */}
      <div style={{ position: 'absolute', left: 14, bottom: 28, display: 'flex',
                    flexDirection: 'column-reverse', gap: 9, zIndex: 30, alignItems: 'center' }}>
        <Fab bg={drawMode ? '#f59e0b' : undefined} border={drawMode ? '#fbbf24' : undefined}
          onClick={() => setDrawMode(v => !v)} title={drawMode ? 'Mover' : 'Dibujar'}>
          {drawMode ? '✏️' : '✋'}
        </Fab>
        {!drawMode && (
          <>
            <Fab onClick={() => setZoom(z => Math.min(4, z + 0.2))} title="Acercar">
              <span style={{ color: '#1a1a2e', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>+</span>
            </Fab>
            <Fab onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} title="Alejar">
              <span style={{ color: '#1a1a2e', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>−</span>
            </Fab>
            <Fab onClick={() => { setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 }; setZoom(fitZoom) }} title="Centrar">
              <span style={{ fontSize: 17 }}>⊙</span>
            </Fab>
          </>
        )}
        {drawMode && (
          <>
            {DRAW_COLORS.map(c => (
              <div key={c} onClick={() => setDrawColor(c)} style={{
                width: drawColor === c ? 36 : 28, height: drawColor === c ? 36 : 28,
                borderRadius: '50%', background: c, cursor: 'pointer',
                border: drawColor === c ? '3px solid #1a1a2e' : '2px solid rgba(0,0,0,0.15)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)', transition: 'all .15s',
              }} />
            ))}
            <Fab bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.4)"
              onClick={() => setDrawings([])} title="Borrar trazos">🗑️</Fab>
          </>
        )}
      </div>
    </div>
  )
}

function Fab({ children, onClick, title, bg = 'rgba(0,0,0,0.07)', border = 'rgba(0,0,0,0.14)' }: {
  children: React.ReactNode; onClick: () => void; title?: string; bg?: string; border?: string
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 50, height: 50, borderRadius: '50%',
      background: bg, border: `1px solid ${border}`, cursor: 'pointer', fontSize: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 10px rgba(0,0,0,0.12)', padding: 0,
    }}>
      {children}
    </button>
  )
}

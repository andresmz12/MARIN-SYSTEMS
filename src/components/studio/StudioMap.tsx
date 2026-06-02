'use client'

import { useEffect, useRef, useState } from 'react'

interface Child  { id: string; texto: string; color: string }
interface Branch { id: string; emoji: string; texto: string; color: string; hijos: Child[] }
interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string }
  ramas: Branch[]
}
interface Props { mapaJson: MapaJson }
interface DrawPath { d: string; color: string }
interface Box { x: number; y: number; w: number; h: number }

// ─── constants ────────────────────────────────────────────────
const FONT        = "'Caveat','Comic Sans MS',cursive"
const FONT_CH     = 0.54   // estimated char-width / fontSize for Caveat
const DRAW_COLORS = ['#f59e0b','#ef4444','#22c55e','#3b82f6','#a855f7','#1a1a2e']

// ─── helpers ──────────────────────────────────────────────────
function polar(a: number, r: number) {
  return { x: r * Math.cos(a), y: r * Math.sin(a) }
}

function wrap(text: string, maxCh: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (t.length > maxCh && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}

/** Estimate bounding box a node needs for its text content */
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

/** AABB overlap check with safety margin */
function overlaps(a: Box, b: Box, margin = 10): boolean {
  return !(
    a.x + a.w / 2 + margin < b.x - b.w / 2 ||
    b.x + b.w / 2 + margin < a.x - a.w / 2 ||
    a.y + a.h / 2 + margin < b.y - b.h / 2 ||
    b.y + b.h / 2 + margin < a.y - a.h / 2
  )
}

/** Spread per step so outermost child is at ≤ maxHalfDeg from branch axis */
function spreadStep(childCount: number, branchSectorDeg: number): number {
  if (childCount <= 1) return 0
  // Cap half-angle to 45-55° (user req.) but also leave gap between sectors
  const maxHalf = Math.min(52, branchSectorDeg * 0.82 / 2)
  return (maxHalf * Math.PI / 180) / ((childCount - 1) / 2)
}

// ─── component ────────────────────────────────────────────────
export default function StudioMap({ mapaJson }: Props) {
  const svgRef       = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize]           = useState({ w: 800, h: 600 })
  const [pan,  setPan]            = useState({ x: 0,   y: 0 })
  const [zoom, setZoom]           = useState(1)
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

  // ── ResizeObserver ──
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width: rw, height: rh } = entries[0].contentRect
      const w = Math.max(rw, 320), h = Math.max(rh, 240)
      setSize({ w, h })
      if (!autoFitDone.current && rw > 100) {
        autoFitDone.current = true
        // will be refined after layout is computed (see zoom memo below)
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Wheel zoom ──
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const fn = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => Math.max(0.2, Math.min(4, z * (e.deltaY > 0 ? 0.93 : 1.07))))
    }
    el.addEventListener('wheel', fn, { passive: false })
    return () => el.removeEventListener('wheel', fn)
  }, [])

  function svgPt(cx: number, cy: number) {
    const r = svgRef.current!.getBoundingClientRect()
    return {
      x: (cx - r.left - size.w / 2 - pan.x) / zoom,
      y: (cy - r.top  - size.h / 2 - pan.y) / zoom,
    }
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
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
      lastPinch.current = dist
      return
    }
    lastPinch.current = null
    if (drawMode && isDrawing.current) {
      const p = svgPt(e.clientX, e.clientY)
      curPts.current.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      setCurPath(curPts.current.join(' '))
    } else if (isDragging.current) {
      setPan({ x: dragStart.current.px + e.clientX - dragStart.current.x,
               y: dragStart.current.py + e.clientY - dragStart.current.y })
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
  //  DYNAMIC LAYOUT  (computed every render, no state)
  // ══════════════════════════════════════════════════════════════
  const { centro, ramas } = mapaJson
  const nBranch   = ramas.length
  const minDim    = Math.min(size.w, size.h)
  const sectorDeg = 360 / nBranch
  const startA    = -Math.PI / 2
  const stepA     = (2 * Math.PI) / nBranch

  // Font sizes (responsive, with minimums)
  const CF = Math.max(15, minDim * 0.023)  // center font
  const BF = Math.max(13, minDim * 0.020)  // branch font
  const HF = Math.max(12, minDim * 0.017)  // hijo (child) font

  // Measure every node
  const cNode = measureNode(centro.texto, centro.emoji, CF, 15, 14, 10, 110, 160, 80, 100)

  const bNodes = ramas.map(br => ({
    br,
    m: measureNode(br.texto, br.emoji, BF, 12, 12, 8, 95, 130, 70, 85),
    hijos: br.hijos.map(h => ({
      h,
      m: measureNode(h.texto, null, HF, 15, 14, 8, 80, 110, 55, 65),
    })),
    spread: spreadStep(br.hijos.length, sectorDeg),
  }))

  // Iterative collision resolution — expand BDIST / CDIST until no overlap
  let BDIST = minDim * 0.28
  let CADD  = minDim * 0.22  // additional branch→child distance

  for (let iter = 0; iter < 14; iter++) {
    const CDIST = BDIST + CADD
    const boxes: Box[] = [{ x: 0, y: 0, w: cNode.w, h: cNode.h }]

    for (let i = 0; i < bNodes.length; i++) {
      const a   = startA + i * stepA
      const bp  = polar(a, BDIST)
      const { m, hijos, spread } = bNodes[i]
      boxes.push({ x: bp.x, y: bp.y, w: m.w, h: m.h })
      for (let j = 0; j < hijos.length; j++) {
        const ca = a + (j - (hijos.length - 1) / 2) * spread
        const cp = polar(ca, CDIST)
        boxes.push({ x: cp.x, y: cp.y, w: hijos[j].m.w, h: hijos[j].m.h })
      }
    }

    let collision = false
    outer: for (let a2 = 0; a2 < boxes.length; a2++)
      for (let b2 = a2 + 1; b2 < boxes.length; b2++)
        if (overlaps(boxes[a2], boxes[b2])) { collision = true; break outer }

    if (!collision) break
    // Grow both radii — prefer growing CADD first, then BDIST
    if (iter % 3 !== 2) CADD  += minDim * 0.018
    else                BDIST += minDim * 0.012
  }

  const CDIST = BDIST + CADD

  // Compute auto-fit zoom once we know the resolved layout extents
  const contentR = CDIST + 66  // child center + estimated half-diagonal
  const targetR  = Math.min(size.w, size.h) / 2 - 24
  const fitZoom  = Math.min(1, targetR / contentR)

  // Apply fit zoom the first time (only if user hasn't manually zoomed)
  // We use a ref so this only triggers once per page load
  const firstFit = useRef(false)
  useEffect(() => {
    if (!firstFit.current && size.w !== 800) {
      firstFit.current = true
      setZoom(fitZoom)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w])

  const tfm = `translate(${(size.w / 2 + pan.x).toFixed(1)},${(size.h / 2 + pan.y).toFixed(1)}) scale(${zoom})`

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
            const ux  = bp.x / BDIST, uy = bp.y / BDIST          // unit outward vector
            const tension = CADD * 0.45
            const qx  = bp.x + ux * tension, qy = bp.y + uy * tension  // bezier ctrl pt

            // line from center ellipse edge → branch ellipse edge
            const cx0  = ux * (cNode.w / 2 * 0.90)
            const cy0  = uy * (cNode.h / 2 * 0.90)
            const bex  = bp.x - ux * (bm.w / 2 * 0.85)
            const bey  = bp.y - uy * (bm.h / 2 * 0.85)

            return (
              <g key={`cn${i}`}>
                <line x1={cx0} y1={cy0} x2={bex} y2={bey}
                  stroke={br.color} strokeWidth={2.5} strokeOpacity={0.5} />
                {hijos.map((_, j) => {
                  const ca = a + (j - (hijos.length - 1) / 2) * spread
                  const cp = polar(ca, CDIST)
                  return (
                    <path key={j}
                      d={`M ${bp.x.toFixed(1)} ${bp.y.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${cp.x.toFixed(1)} ${cp.y.toFixed(1)}`}
                      stroke={br.color} strokeWidth={1.6} strokeOpacity={0.42} fill="none" />
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
              const rr   = m.h / 2   // pill radius
              return (
                <g key={`hj${i}-${j}`}>
                  <rect x={cp.x - m.w / 2} y={cp.y - m.h / 2}
                    width={m.w} height={m.h} rx={rr}
                    fill={h.color} fillOpacity={0.13}
                    stroke={h.color} strokeWidth={1.5} strokeOpacity={0.6} />
                  {lines.map((line, li) => (
                    <text key={li}
                      x={cp.x}
                      y={cp.y - ((lines.length - 1) * lh) / 2 + li * lh}
                      textAnchor="middle" dominantBaseline="central"
                      fill="#333" fontSize={HF} fontFamily={FONT}>
                      {line}
                    </text>
                  ))}
                </g>
              )
            })
          })}

          {/* ── Branch nodes ───────────────────────────── */}
          {bNodes.map(({ br, m, hijos: _h }, i) => {
            const a    = startA + i * stepA
            const bp   = polar(a, BDIST)
            const lh   = BF * 1.25
            const eH   = BF * 1.25   // emoji row height
            const emojiY  = bp.y - m.h / 2 + 8 + BF * 0.60
            const textY0  = emojiY + eH / 2 + BF * 0.70
            const lines   = m.lines
            const rr   = Math.min(m.w, m.h) * 0.35

            return (
              <g key={`br${i}`}>
                <rect x={bp.x - m.w / 2} y={bp.y - m.h / 2}
                  width={m.w} height={m.h} rx={rr}
                  fill={br.color} filter="url(#nsh)" />
                {/* emoji */}
                <text x={bp.x} y={emojiY}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={BF * 1.10} fontFamily={FONT}>
                  {br.emoji}
                </text>
                {/* label lines */}
                {lines.map((line, li) => (
                  <text key={li}
                    x={bp.x} y={textY0 + li * lh}
                    textAnchor="middle" dominantBaseline="central"
                    fill="white" fontSize={BF} fontFamily={FONT} fontWeight="700">
                    {line}
                  </text>
                ))}
              </g>
            )
          })}

          {/* ── Center node ────────────────────────────── */}
          {(() => {
            const { lines, w, h } = cNode
            const lh    = CF * 1.25
            const eH    = CF * 1.25
            const rr    = Math.min(w, h) * 0.35
            const emojiY  = -h / 2 + 10 + CF * 0.60
            const textY0  = emojiY + eH / 2 + CF * 0.70
            return (
              <g>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={rr}
                  fill={centro.color} filter="url(#nsh)" />
                <text x={0} y={emojiY}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={CF * 1.15} fontFamily={FONT}>
                  {centro.emoji}
                </text>
                {lines.map((line, li) => (
                  <text key={li}
                    x={0} y={textY0 + li * lh}
                    textAnchor="middle" dominantBaseline="central"
                    fill="white" fontSize={CF} fontFamily={FONT} fontWeight="700">
                    {line}
                  </text>
                ))}
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

      {/* ── Controls (left side) ──────────────────────── */}
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
            <Fab onClick={() => { setPan({ x: 0, y: 0 }); setZoom(fitZoom) }} title="Centrar">
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

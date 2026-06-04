'use client'

import { useEffect, useRef, useState } from 'react'

interface HijoNode  { id: string; texto: string; color: string; explicacion?: string; guion?: string }
interface RamaNode  { id: string; emoji?: string; texto: string; color: string; explicacion?: string; guion?: string; hijos: HijoNode[] }
export interface MapaJsonStudio {
  centro: { id: string; emoji?: string; texto: string; color: string; explicacion?: string; guion?: string }
  ramas: RamaNode[]
  cta?: string
}

interface Props { mapaJson: MapaJsonStudio; activeNodeId?: string | null }

const DRAW_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#111827']

function rad(deg: number) { return (deg * Math.PI) / 180 }

function qbez(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const cx = mx + (my - y1) * 0.3, cy = my - (mx - x1) * 0.3
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`
}

function s2w(sx: number, sy: number, pan: { x: number; y: number }, zoom: number, w: number, h: number) {
  return { x: (sx - w / 2 - pan.x) / zoom, y: (sy - h / 2 - pan.y) / zoom }
}

function computeFitZoom(w: number, h: number): number {
  const R    = Math.min(w, h)
  const maxE = R * 0.46 + 50
  const avail = Math.min(w / 2 - 20, h / 2 - 60)
  return Math.min(0.95, Math.max(0.4, avail / maxE))
}

interface Stroke { color: string; d: string }

const BTN: React.CSSProperties = {
  width: 32, height: 32, border: 'none', borderRadius: 8, cursor: 'pointer',
  fontSize: 15, background: 'transparent', color: '#333', display: 'flex',
  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

type NodeOffset = { x: number; y: number }
type DragNodeState = { id: string; startWx: number; startWy: number; origX: number; origY: number }

export default function StudioMap({ mapaJson }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef  = useRef<SVGSVGElement>(null)
  const [size, setSize]   = useState({ w: 800, h: 600 })
  const [pan,  setPan]    = useState({ x: 0, y: 0 })
  const [zoom, setZoom]   = useState(0.85)
  const panRef  = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)

  const [drawMode,  setDrawMode]  = useState(false)
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0])
  const [strokes,   setStrokes]   = useState<Stroke[]>([])
  const [curPath,   setCurPath]   = useState('')

  const [nodeOffsets,    setNodeOffsets]    = useState<Record<string, NodeOffset>>({})
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)

  const fitted      = useRef(false)
  const drawing     = useRef(false)
  const curPts      = useRef<string[]>([])
  const dragOrigin  = useRef<{ px: number; py: number; panX: number; panY: number } | null>(null)
  const dragNode    = useRef<DragNodeState | null>(null)
  const pinchRef    = useRef<{ dist: number; z: number } | null>(null)
  const lastTapRef  = useRef<number>(0)

  // load Caveat font
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap'
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  // keep refs in sync
  useEffect(() => { panRef.current  = pan  }, [pan])
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // resize observer
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setSize({ w: width, h: height })
      if (!fitted.current) {
        fitted.current = true
        const fz = computeFitZoom(width, height)
        zoomRef.current = fz; setZoom(fz)
        panRef.current  = { x: 0, y: 0 }; setPan({ x: 0, y: 0 })
      }
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // wheel zoom toward cursor
  useEffect(() => {
    const el = svgRef.current; if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left - rect.width  / 2
      const cy = e.clientY - rect.top  - rect.height / 2
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const oldZ = zoomRef.current
      const newZ = Math.max(0.2, Math.min(5, oldZ * factor))
      const newPan = {
        x: cx - (cx - panRef.current.x) * (newZ / oldZ),
        y: cy - (cy - panRef.current.y) * (newZ / oldZ),
      }
      panRef.current  = newPan
      zoomRef.current = newZ
      setPan(newPan); setZoom(newZ)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // native touch pinch
  useEffect(() => {
    const el = svgRef.current; if (!el) return
    const onTS = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchRef.current = { dist: Math.hypot(dx, dy), z: zoomRef.current }
        drawing.current = false; curPts.current = []
        setCurPath(''); dragOrigin.current = null; dragNode.current = null
      }
    }
    const onTM = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const newZ = Math.max(0.2, Math.min(5, pinchRef.current.z * Math.hypot(dx, dy) / pinchRef.current.dist))
        zoomRef.current = newZ; setZoom(newZ)
      }
    }
    const onTE = (e: TouchEvent) => { if (e.touches.length < 2) pinchRef.current = null }
    el.addEventListener('touchstart', onTS, { passive: true })
    el.addEventListener('touchmove',  onTM, { passive: false })
    el.addEventListener('touchend',   onTE, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTS)
      el.removeEventListener('touchmove',  onTM)
      el.removeEventListener('touchend',   onTE)
    }
  }, [])

  // ─── Layout helpers ────────────────────────────────────────────
  const { w, h } = size
  const R      = Math.min(w, h)
  const BD     = R * 0.26
  const CD     = R * 0.20
  const CHW    = 81, GAP = 14
  const rawStep = Math.asin(Math.min(1, (CHW + GAP) / (2 * CD))) * (180 / Math.PI)
  const SPREAD  = Math.max(rawStep, 28)
  const { centro, ramas } = mapaJson
  const nRamas  = ramas.length
  const angs    = ramas.map((_, i) => -90 + (360 / nRamas) * i)

  // Compute branch position (includes nodeOffset)
  function branchPos(i: number): { bx: number; by: number } {
    const a = rad(angs[i])
    const off = nodeOffsets[ramas[i].id] ?? { x: 0, y: 0 }
    return { bx: Math.cos(a) * BD + off.x, by: Math.sin(a) * BD + off.y }
  }

  // Compute child position (includes nodeOffset of both rama and hijo)
  function hijoPos(i: number, j: number): { hx: number; hy: number } {
    const { bx, by } = branchPos(i)
    const a  = rad(angs[i])
    const sp = ramas[i].hijos.length === 1 ? 0 : (j - (ramas[i].hijos.length - 1) / 2)
    const ca = a + rad(sp * SPREAD)
    const off = nodeOffsets[ramas[i].hijos[j].id] ?? { x: 0, y: 0 }
    return { hx: bx + Math.cos(ca) * CD + off.x, hy: by + Math.sin(ca) * CD + off.y }
  }

  // ─── Hit test (world coords) ────────────────────────────────────
  function hitNode(wx: number, wy: number): string | null {
    for (let i = 0; i < ramas.length; i++) {
      const { bx, by } = branchPos(i)
      // hijos first (rendered on top)
      for (let j = 0; j < ramas[i].hijos.length; j++) {
        const { hx, hy } = hijoPos(i, j)
        if (Math.abs(wx - hx) < 81 / 2 + 4 && Math.abs(wy - hy) < 46 / 2 + 4)
          return ramas[i].hijos[j].id
      }
      if (Math.abs(wx - bx) < 99 / 2 + 4 && Math.abs(wy - by) < 63 / 2 + 4)
        return ramas[i].id
    }
    return null
  }

  // ─── Pointer events ────────────────────────────────────────────
  function onPtrDown(e: React.PointerEvent<SVGSVGElement>) {
    if (pinchRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    e.currentTarget.setPointerCapture(e.pointerId)

    if (drawMode) {
      const pt = s2w(sx, sy, panRef.current, zoomRef.current, size.w, size.h)
      drawing.current = true
      curPts.current = [`M${pt.x.toFixed(2)},${pt.y.toFixed(2)}`]
      setCurPath(curPts.current[0])
      return
    }

    // Convert to world coords
    const wx = (sx - size.w / 2 - panRef.current.x) / zoomRef.current
    const wy = (sy - size.h / 2 - panRef.current.y) / zoomRef.current

    const nodeId = hitNode(wx, wy)
    if (nodeId) {
      const orig = nodeOffsets[nodeId] ?? { x: 0, y: 0 }
      dragNode.current = { id: nodeId, startWx: wx, startWy: wy, origX: orig.x, origY: orig.y }
      setDraggingNodeId(nodeId)
    } else {
      // Double-tap on background = reset positions
      const now = Date.now()
      if (now - lastTapRef.current < 300) setNodeOffsets({})
      lastTapRef.current = now
      dragOrigin.current = { px: e.clientX, py: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
    }
  }

  function onPtrMove(e: React.PointerEvent<SVGSVGElement>) {
    if (drawMode && drawing.current) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pt = s2w(e.clientX - rect.left, e.clientY - rect.top, panRef.current, zoomRef.current, size.w, size.h)
      curPts.current.push(`L${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
      setCurPath(curPts.current.join(' '))
      return
    }

    if (dragNode.current) {
      const rect = e.currentTarget.getBoundingClientRect()
      const wx = (e.clientX - rect.left  - size.w / 2 - panRef.current.x) / zoomRef.current
      const wy = (e.clientY - rect.top   - size.h / 2 - panRef.current.y) / zoomRef.current
      const dx = wx - dragNode.current.startWx
      const dy = wy - dragNode.current.startWy
      const { id, origX, origY } = dragNode.current
      setNodeOffsets(prev => ({
        ...prev,
        [id]: { x: origX + dx, y: origY + dy },
      }))
      return
    }

    if (dragOrigin.current) {
      const newPan = {
        x: dragOrigin.current.panX + e.clientX - dragOrigin.current.px,
        y: dragOrigin.current.panY + e.clientY - dragOrigin.current.py,
      }
      panRef.current = newPan; setPan(newPan)
    }
  }

  function onPtrUp() {
    if (drawing.current && curPts.current.length > 1) {
      setStrokes(s => [...s, { color: drawColor, d: curPts.current.join(' ') }])
    }
    drawing.current = false; curPts.current = []
    setCurPath(''); dragOrigin.current = null
    dragNode.current = null; setDraggingNodeId(null)
  }

  function doZoom(factor: number) {
    const newZ = Math.max(0.2, Math.min(5, zoomRef.current * factor))
    zoomRef.current = newZ; setZoom(newZ)
  }

  function center() {
    const fz = computeFitZoom(size.w, size.h)
    panRef.current = { x: 0, y: 0 }; setPan({ x: 0, y: 0 })
    zoomRef.current = fz; setZoom(fz)
    setNodeOffsets({})
  }

  const tfm = `translate(${w / 2 + pan.x},${h / 2 + pan.y}) scale(${zoom})`

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#fafaf8', overflow: 'hidden' }}>

      {/* Static dot grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.9" fill="#bbb" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Interactive SVG */}
      <svg ref={svgRef} width={w} height={h}
        style={{ display: 'block', position: 'relative', touchAction: 'none',
          cursor: drawMode ? 'crosshair' : draggingNodeId ? 'grabbing' : 'grab' }}
        onPointerDown={onPtrDown} onPointerMove={onPtrMove} onPointerUp={onPtrUp} onPointerCancel={onPtrUp}>
        <defs>
          <filter id="nsh" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.11)" />
          </filter>
        </defs>

        <g transform={tfm}>
          {/* center→branch lines */}
          {ramas.map((r, i) => {
            const { bx, by } = branchPos(i)
            return <path key={`cl${i}`} d={qbez(0, 0, bx, by)} stroke={r.color} strokeWidth={2.2} fill="none" opacity={0.4} />
          })}

          {/* branch→child lines */}
          {ramas.map((r, i) =>
            r.hijos.map((h, j) => {
              const { bx, by } = branchPos(i)
              const { hx, hy } = hijoPos(i, j)
              return <path key={`bl${i}${j}`} d={qbez(bx, by, hx, hy)} stroke={h.color} strokeWidth={1.5} fill="none" opacity={0.4} />
            })
          )}

          {/* child nodes */}
          {ramas.map((r, i) =>
            r.hijos.map((h, j) => {
              const { hx, hy } = hijoPos(i, j)
              const nw = 81, nh = 46
              const isDragging = draggingNodeId === h.id
              return (
                <g key={h.id} filter="url(#nsh)" style={{ opacity: isDragging ? 0.75 : 1, cursor: 'grab' }}>
                  <rect x={hx - nw/2} y={hy - nh/2} width={nw} height={nh} rx={9} fill="white" stroke={h.color}
                    strokeWidth={isDragging ? 2.4 : 1.6} />
                  <foreignObject x={hx - nw/2 + 2} y={hy - nh/2 + 2} width={nw - 4} height={nh - 4}>
                    {/* @ts-expect-error xmlns */}
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <span style={{ fontFamily: "'Caveat','Comic Sans MS',cursive", fontSize: 11, fontWeight: 500, color: h.color, textAlign: 'center', lineHeight: 1.25, wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
                        {h.texto}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              )
            })
          )}

          {/* branch nodes */}
          {ramas.map((r, i) => {
            const { bx, by } = branchPos(i)
            const nw = 99, nh = 63
            const isDragging = draggingNodeId === r.id
            return (
              <g key={r.id} filter="url(#nsh)" style={{ opacity: isDragging ? 0.75 : 1, cursor: 'grab' }}>
                <rect x={bx - nw/2} y={by - nh/2} width={nw} height={nh} rx={13} fill="white" stroke={r.color}
                  strokeWidth={isDragging ? 3 : 2.2} />
                <foreignObject x={bx - nw/2 + 3} y={by - nh/2 + 3} width={nw - 6} height={nh - 6}>
                  {/* @ts-expect-error xmlns */}
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 1 }}>
                    {r.emoji && <span style={{ fontSize: 13, lineHeight: 1 }}>{r.emoji}</span>}
                    <span style={{ fontFamily: "'Caveat','Comic Sans MS',cursive", fontSize: 13, fontWeight: 700, color: r.color, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
                      {r.texto}
                    </span>
                  </div>
                </foreignObject>
              </g>
            )
          })}

          {/* center node */}
          {(() => {
            const nw = 115, nh = 75
            return (
              <g filter="url(#nsh)">
                <rect x={-nw/2} y={-nh/2} width={nw} height={nh} rx={18} fill="white" stroke={centro.color} strokeWidth={2.8} />
                <foreignObject x={-nw/2 + 4} y={-nh/2 + 4} width={nw - 8} height={nh - 8}>
                  {/* @ts-expect-error xmlns */}
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 2 }}>
                    {centro.emoji && <span style={{ fontSize: 17, lineHeight: 1 }}>{centro.emoji}</span>}
                    <span style={{ fontFamily: "'Caveat','Comic Sans MS',cursive", fontSize: 14, fontWeight: 700, color: centro.color, textAlign: 'center', lineHeight: 1.25, wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
                      {centro.texto}
                    </span>
                  </div>
                </foreignObject>
              </g>
            )
          })()}

          {/* saved strokes */}
          {strokes.map((s, i) => (
            <path key={i} d={s.d} stroke={s.color} strokeWidth={3 / zoom} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {/* active stroke */}
          {curPath && <path d={curPath} stroke={drawColor} strokeWidth={3 / zoom} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        </g>
      </svg>

      {/* Floating toolbar */}
      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(0,0,0,0.09)', borderRadius: 18,
        padding: '7px 12px', boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
        zIndex: 100, userSelect: 'none', flexWrap: 'nowrap',
      }}>
        <button onClick={() => doZoom(1 / 1.25)} style={BTN} title="Alejar">−</button>
        <button onClick={center}                  style={BTN} title="Centrar y resetear">⊙</button>
        <button onClick={() => doZoom(1.25)}      style={BTN} title="Acercar">+</button>

        <div style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.12)', margin: '0 2px' }} />

        <button
          onClick={() => setDrawMode(m => !m)}
          style={{ ...BTN, background: drawMode ? '#e11d48' : 'transparent', color: drawMode ? 'white' : '#333', borderRadius: 8 }}
          title={drawMode ? 'Salir de dibujo' : 'Modo dibujo'}
        >✏️</button>

        {drawMode && (
          <>
            {DRAW_COLORS.map(c => (
              <button key={c} onClick={() => setDrawColor(c)} style={{
                width: 20, height: 20, borderRadius: '50%', background: c, border: 'none',
                outline: drawColor === c ? `3px solid ${c}` : '2px solid rgba(0,0,0,0.1)',
                outlineOffset: drawColor === c ? 2 : 0,
                cursor: 'pointer', flexShrink: 0,
              }} />
            ))}
            <div style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.12)', margin: '0 2px' }} />
            <button onClick={() => setStrokes([])} style={BTN} title="Borrar todo">🗑️</button>
          </>
        )}
      </div>
    </div>
  )
}

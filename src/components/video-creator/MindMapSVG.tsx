'use client'

import { useEffect, useRef, useState, useCallback, memo } from 'react'

const NOOP_CLICK = () => {}

/* ── Types ── */
export interface MapaHijo { id: string; texto: string; color: string; explicacion: string }
export interface MapaRama { id: string; emoji: string; texto: string; color: string; explicacion: string; hijos: MapaHijo[] }
export interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string; explicacion: string }
  ramas: MapaRama[]
}
export interface DrawPath { d: string; color: string; size: number }
export interface Alignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

export interface FocusedNode {
  id: string; emoji: string; texto: string; color: string; explicacion: string
  type: 'center' | 'branch' | 'child'
  children?: Array<{ id: string; texto: string; color: string; explicacion: string }>
  navIndex: number
}

/* ── Map layout ── */
export const CX = 1200; export const CY = 750
export const BRANCH_R = 450; export const CHILD_R = 270
export const RAD = (d: number) => (d * Math.PI) / 180
export const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
export const PEN_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#ffffff', '#000000']

export const BRANCH_ANGLES_MAP: Record<number, number[]> = {
  3: [-90, 30, 150],
  4: [-135, -45, 45, 135],
  5: [-126, -54, 18, 90, 162],
}

export function bp(a: number) { return { x: CX + BRANCH_R * Math.cos(RAD(a)), y: CY + BRANCH_R * Math.sin(RAD(a)) } }
export function cp(a: number, idx: number, childCount: number = 3) {
  const { x: bx, y: by } = bp(a)
  const dx = Math.cos(RAD(a)), dy = Math.sin(RAD(a))
  const px = -dy, py = dx // perpendicular unit vector
  let spread: number
  if (childCount === 2) {
    spread = ([-120, 120][idx] ?? 0)
  } else {
    spread = ([-145, 0, 145][idx] ?? 0)
  }
  return { x: bx + CHILD_R * dx + spread * px, y: by + CHILD_R * dy + spread * py }
}
export function qcurve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1
  return `M ${x1} ${y1} Q ${mx - dy * 0.18} ${my + dx * 0.18} ${x2} ${y2}`
}
export function wrap(text: string, max: number): string[] {
  const words = text.split(' '); const lines: string[] = []; let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= max) cur = next
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text.slice(0, max)]
}

export function buildNodeList(mapa: MapaJson): FocusedNode[] {
  const list: FocusedNode[] = []
  list.push({
    id: mapa.centro.id, emoji: mapa.centro.emoji, texto: mapa.centro.texto,
    color: mapa.centro.color, explicacion: mapa.centro.explicacion, type: 'center',
    children: mapa.ramas.map(r => ({ id: r.id, texto: r.texto, color: r.color, explicacion: r.explicacion })),
    navIndex: 0,
  })
  mapa.ramas.slice(0, 5).forEach((rama, bi) => {
    list.push({
      id: rama.id, emoji: rama.emoji, texto: rama.texto, color: rama.color,
      explicacion: rama.explicacion, type: 'branch',
      children: rama.hijos.slice(0, 3).map(h => ({ id: h.id, texto: h.texto, color: h.color, explicacion: h.explicacion })),
      navIndex: list.length,
    })
    rama.hijos.slice(0, 3).forEach(hijo => {
      list.push({ id: hijo.id, emoji: '•', texto: hijo.texto, color: hijo.color, explicacion: hijo.explicacion, type: 'child', navIndex: list.length })
    })
    void bi
  })
  return list
}

export function extractSectionTimestamps(alignment: Alignment, script: string, markers: string[]): number[] {
  const cleanScript = script
  const timestamps: number[] = []

  for (const marker of markers) {
    const charIdx = cleanScript.indexOf(marker)
    if (charIdx === -1) { timestamps.push(-1); continue }
    const aligned = alignment.character_start_times_seconds
    const chars = alignment.characters
    let accumulated = 0
    let found = -1
    for (let i = 0; i < chars.length; i++) {
      if (accumulated >= charIdx) { found = aligned[i] ?? -1; break }
      accumulated += chars[i].length
    }
    timestamps.push(found)
  }

  return timestamps
}

/* ════════════════════════
   Mind Map SVG
════════════════════════ */
export const MindMap = memo(function MindMap({
  mapa, focusedId, presentationMode, onNodeClick, onExportRef,
}: {
  mapa: MapaJson
  focusedId: string | null
  presentationMode: boolean
  onNodeClick: (node: FocusedNode, all: FocusedNode[]) => void
  onExportRef?: (fn: () => void) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [tf, setTf] = useState({ x: 0, y: 0, scale: 1 })
  const tfRef = useRef({ x: 0, y: 0, scale: 1 })
  const dragState = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const downPos = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)
  const [mode, setMode] = useState<'pan' | 'draw'>('pan')
  const [penColor, setPenColor] = useState('#dc2626')
  const [penSize, setPenSize] = useState(4)
  const [drawings, setDrawings] = useState<DrawPath[]>([])
  const [liveD, setLiveD] = useState<string | null>(null)
  const isDrawing = useRef(false)
  const livePts = useRef('')
  const activePointers = useRef(new Set<number>())
  const allNodes = buildNodeList(mapa)
  const nodeNavIndex = new Map(allNodes.map(n => [n.id, n.navIndex]))

  const branchCount = Math.min(5, Math.max(3, mapa.ramas.length))
  const angles = BRANCH_ANGLES_MAP[branchCount] ?? BRANCH_ANGLES_MAP[5]

  useEffect(() => { tfRef.current = tf }, [tf])

  const center = useCallback(() => {
    const el = containerRef.current; if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const mapR = BRANCH_R + CHILD_R + 130 // actual content radius in SVG coords
    const scale = Math.min(width / (mapR * 2), height / (mapR * 2)) * 0.92
    setTf({ x: width / 2 - CX * scale, y: height / 2 - CY * scale, scale })
  }, [])

  useEffect(() => { center() }, [center, presentationMode])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      setTf(t => { const ns = Math.min(5, Math.max(0.1, t.scale * factor)); return { scale: ns, x: mx - (mx - t.x) * (ns / t.scale), y: my - (my - t.y) * (ns / t.scale) } })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  function exportPng() {
    const svg = svgRef.current; if (!svg) return

    const OUT_W = 3840; const OUT_H = 2160
    const PAD = 160

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(OUT_W))
    clone.setAttribute('height', String(OUT_H))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    const MAP_SPAN_X = (CX + BRANCH_R + CHILD_R + 220) * 2
    const MAP_SPAN_Y = (CY + BRANCH_R + CHILD_R + 160) * 2
    const fitScale = Math.min((OUT_W - PAD * 2) / MAP_SPAN_X, (OUT_H - PAD * 2) / MAP_SPAN_Y)
    const tx = OUT_W / 2 - CX * fitScale
    const ty = OUT_H / 2 - CY * fitScale

    const g = clone.querySelector('g')
    if (g) g.setAttribute('transform', `translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${fitScale.toFixed(5)})`)

    const svgStr = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = OUT_W; canvas.height = OUT_H
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = presentationMode ? '#0f172a' : '#f9fafb'
      ctx.fillRect(0, 0, OUT_W, OUT_H)
      ctx.drawImage(img, 0, 0, OUT_W, OUT_H)
      URL.revokeObjectURL(url)
      canvas.toBlob(pb => {
        if (!pb) return
        const a = document.createElement('a'); a.href = URL.createObjectURL(pb); a.download = 'mapa.png'; a.click()
      }, 'image/png')
    }
    img.onerror = () => { const a = document.createElement('a'); a.href = url; a.download = 'mapa.svg'; a.click() }
    img.src = url
  }

  useEffect(() => { if (onExportRef) onExportRef(exportPng) })

  function toMap(cx: number, cy: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const t = tfRef.current
    return { x: (cx - rect.left - t.x) / t.scale, y: (cy - rect.top - t.y) / t.scale }
  }

  function onPointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    activePointers.current.add(e.pointerId)
    downPos.current = { x: e.clientX, y: e.clientY }; didDrag.current = false
    const multiTouch = activePointers.current.size > 1
    if (mode === 'pan' || multiTouch) {
      if (activePointers.current.size === 1)
        dragState.current = { sx: e.clientX, sy: e.clientY, ox: tfRef.current.x, oy: tfRef.current.y }
      // stop any active drawing stroke when second finger touches
      if (multiTouch && isDrawing.current) {
        if (livePts.current) {
          setDrawings(prev => [...prev, { d: livePts.current, color: penColor, size: penSize }])
          livePts.current = ''; setLiveD(null)
        }
        isDrawing.current = false
      }
    } else {
      isDrawing.current = true
      const { x, y } = toMap(e.clientX, e.clientY)
      livePts.current = `M ${x.toFixed(1)} ${y.toFixed(1)}`; setLiveD(livePts.current)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (downPos.current) {
      const dx = e.clientX - downPos.current.x, dy = e.clientY - downPos.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 8) didDrag.current = true
    }
    const multiTouch = activePointers.current.size > 1
    const ds = dragState.current
    if ((mode === 'pan' || multiTouch) && ds)
      setTf(t => ({ ...t, x: ds.ox + e.clientX - ds.sx, y: ds.oy + e.clientY - ds.sy }))
    else if (mode === 'draw' && isDrawing.current && !multiTouch) {
      const { x, y } = toMap(e.clientX, e.clientY)
      livePts.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`; setLiveD(livePts.current)
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    activePointers.current.delete(e.pointerId)
    dragState.current = null; downPos.current = null
    if (mode === 'draw' && isDrawing.current && livePts.current) {
      setDrawings(prev => [...prev, { d: livePts.current, color: penColor, size: penSize }])
      livePts.current = ''; setLiveD(null)
    }
    isDrawing.current = false
  }

  function handleNodeClick(node: FocusedNode) {
    if (didDrag.current || mode === 'draw') return
    onNodeClick(node, allNodes)
  }

  const gTransform = `translate(${tf.x.toFixed(1)},${tf.y.toFixed(1)}) scale(${tf.scale.toFixed(4)})`
  const branches = mapa.ramas.slice(0, 5)
  const branchAngles = angles.slice(0, branches.length)

  const bg = presentationMode ? '#0f172a' : '#f9fafb'
  const gridColor = presentationMode ? '#1e293b' : '#e5e7eb'

  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar — normal mode */}
      {!presentationMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 flex-wrap flex-shrink-0">
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button onClick={() => setMode('pan')} className={`px-3 py-1.5 text-xs font-medium ${mode === 'pan' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>🖐 Mover</button>
            <button onClick={() => setMode('draw')} className={`px-3 py-1.5 text-xs font-medium ${mode === 'draw' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>✏️ Rayar</button>
          </div>
          {mode === 'draw' && <>
            <div className="flex gap-1">{PEN_COLORS.map(c => <button key={c} onClick={() => setPenColor(c)} style={{ background: c, border: penColor === c ? '3px solid #1d4ed8' : '2px solid #d1d5db' }} className="w-6 h-6 rounded-full" />)}</div>
            <div className="flex gap-1">{[2, 4, 7, 12].map(s => <button key={s} onClick={() => setPenSize(s)} className={`w-7 h-7 rounded flex items-center justify-center ${penSize === s ? 'bg-blue-100' : 'hover:bg-gray-100'}`}><div style={{ width: s * 2, height: s * 2, background: penColor, borderRadius: '50%' }} /></button>)}</div>
            <button onClick={() => setDrawings([])} className="text-xs text-red-500 border border-red-200 rounded px-2 py-1">🗑 Borrar</button>
          </>}
          <div className="ml-auto flex gap-2">
            <button onClick={exportPng} className="text-xs text-gray-500 border border-gray-200 rounded px-2.5 py-1 hover:bg-gray-50">⬇ PNG</button>
            <button onClick={center} className="text-xs text-gray-500 border border-gray-200 rounded px-2.5 py-1 hover:bg-gray-50">⊙ Centrar</button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden"
        style={{ background: bg, cursor: mode === 'draw' ? 'crosshair' : 'grab', touchAction: 'none', userSelect: 'none' }}>
        <svg ref={svgRef} width="100%" height="100%"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerLeave={e => { activePointers.current.delete(e.pointerId); onPointerUp(e) }} style={{ display: 'block' }}>
          <defs>
            <pattern id="grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.2" fill={gridColor} />
            </pattern>
            <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="6" floodOpacity={presentationMode ? 0.5 : 0.12} /></filter>
            <filter id="glow">
              <feGaussianBlur stdDeviation="18" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glowStrong">
              <feGaussianBlur stdDeviation="28" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="coloredBlur" /><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill={bg} />
          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={gTransform}>
            {/* Lines center → branches */}
            {branches.map((rama, i) => {
              const b = bp(branchAngles[i] ?? 0)
              const active = focusedId === rama.id || rama.hijos.some(h => h.id === focusedId)
              return <path key={`lc${i}`} d={qcurve(CX, CY, b.x, b.y)} stroke={rama.color} strokeWidth={active && presentationMode ? 11 : (presentationMode ? 8 : 6)} fill="none" strokeLinecap="round" strokeOpacity={presentationMode && focusedId && !active ? 0.12 : 0.85} />
            })}

            {/* Lines branches → children */}
            {branches.map((rama, i) =>
              rama.hijos.slice(0, 3).map((hijo, j) => {
                const b = bp(branchAngles[i] ?? 0)
                const childCount = rama.hijos.slice(0, 3).length
                const c = cp(branchAngles[i] ?? 0, j, childCount)
                const active = focusedId === hijo.id || focusedId === rama.id
                return <path key={`lch${i}${j}`} d={qcurve(b.x, b.y, c.x, c.y)} stroke={rama.color} strokeWidth={presentationMode ? 4 : 2.5} fill="none" strokeLinecap="round" strokeOpacity={presentationMode && focusedId && !active ? 0.08 : (presentationMode ? 0.85 : 0.4)} strokeDasharray={presentationMode ? undefined : "8 4"} />
              })
            )}

            {/* Center */}
            {(() => {
              const lines = wrap(mapa.centro.texto, 12)
              const ry = Math.max(72, lines.length * 28 + 48)
              const selected = focusedId === mapa.centro.id
              const dim = presentationMode && focusedId && !selected
              return (
                <g onClick={() => handleNodeClick({ id: mapa.centro.id, emoji: mapa.centro.emoji, texto: mapa.centro.texto, color: mapa.centro.color, explicacion: mapa.centro.explicacion, type: 'center', children: mapa.ramas.map(r => ({ id: r.id, texto: r.texto, color: r.color, explicacion: r.explicacion })), navIndex: 0 })}
                  style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1 }}
                  filter={selected ? 'url(#glowStrong)' : 'url(#sh)'}>
                  {presentationMode && <ellipse cx={CX} cy={CY} rx={152} ry={ry + 18} fill={mapa.centro.color} opacity="0.18" />}
                  <ellipse cx={CX} cy={CY} rx={142} ry={ry + 6} fill={mapa.centro.color} />
                  <ellipse cx={CX} cy={CY} rx={148} ry={ry + 12} fill="none" stroke={mapa.centro.color} strokeWidth="4" strokeOpacity={presentationMode ? '0.6' : '0'} />
                  <text x={CX} y={CY - ry + 32} textAnchor="middle" fontSize={presentationMode ? 40 : 28} fontFamily={FONT}>{mapa.centro.emoji}</text>
                  {lines.map((line, li) => <text key={li} x={CX} y={CY - ry + 78 + li * 30} textAnchor="middle" fontFamily={FONT} fontSize={presentationMode ? 24 : 18} fontWeight="900" fill="white" letterSpacing={presentationMode ? '0.5' : '0'}>{line}</text>)}
                </g>
              )
            })()}

            {/* Branches */}
            {branches.map((rama, i) => {
              const b = bp(branchAngles[i] ?? 0); const lines = wrap(rama.texto, 13)
              const ry = Math.max(62, lines.length * 25 + 44)
              const selected = focusedId === rama.id
              const dim = presentationMode && focusedId && !selected && !rama.hijos.some(h => h.id === focusedId)
              const navIdx = nodeNavIndex.get(rama.id) ?? (1 + i * 4)
              const nodeObj: FocusedNode = { id: rama.id, emoji: rama.emoji, texto: rama.texto, color: rama.color, explicacion: rama.explicacion, type: 'branch', children: rama.hijos.map(h => ({ id: h.id, texto: h.texto, color: h.color, explicacion: h.explicacion })), navIndex: navIdx }
              const fill = rama.color
              const textFill = 'white'
              const activeScale = selected && presentationMode ? `translate(${b.x},${b.y}) scale(1.12) translate(${-b.x},${-b.y})` : undefined
              return (
                <g key={`b${i}`} onClick={() => handleNodeClick(nodeObj)}
                  style={{ cursor: 'pointer', opacity: dim ? 0.18 : 1, transition: 'opacity 0.4s' }}
                  transform={activeScale}
                  filter={selected && presentationMode ? 'url(#glowStrong)' : 'url(#sh)'}>
                  {presentationMode && <ellipse cx={b.x} cy={b.y} rx={128} ry={ry + 12} fill={rama.color} opacity={selected ? '0.22' : '0.1'} />}
                  <ellipse cx={b.x} cy={b.y} rx={120} ry={ry + 2} fill={fill} stroke="rgba(0,0,0,0.12)" strokeWidth="2" />
                  {selected && presentationMode && <ellipse cx={b.x} cy={b.y} rx={126} ry={ry + 8} fill="none" stroke={rama.color} strokeWidth="3" strokeOpacity="0.7" />}
                  {selected && !presentationMode && <ellipse cx={b.x} cy={b.y} rx={126} ry={ry + 9} fill="none" stroke={rama.color} strokeWidth="3" strokeOpacity="0.5" />}
                  <text x={b.x} y={b.y - ry + 30} textAnchor="middle" fontSize={presentationMode ? 32 : 22} fontFamily={FONT}>{rama.emoji}</text>
                  {lines.map((line, li) => <text key={li} x={b.x} y={b.y - ry + 64 + li * 27} textAnchor="middle" fontFamily={FONT} fontSize={presentationMode ? 20 : 15} fontWeight="900" fill={textFill}>{line}</text>)}
                </g>
              )
            })}

            {/* Children */}
            {branches.map((rama, i) => {
              const childCount = rama.hijos.slice(0, 3).length
              return rama.hijos.slice(0, 3).map((hijo, j) => {
                const c = cp(branchAngles[i] ?? 0, j, childCount); const lines = wrap(hijo.texto, 16)
                const rw = 200; const rh = Math.max(50, lines.length * 24 + 22)
                const selected = focusedId === hijo.id
                const dim = presentationMode && focusedId && !selected && focusedId !== rama.id
                const navIdx = nodeNavIndex.get(hijo.id) ?? (1 + i * 4 + 1 + j)
                const nodeObj: FocusedNode = { id: hijo.id, emoji: '•', texto: hijo.texto, color: hijo.color, explicacion: hijo.explicacion, type: 'child', navIndex: navIdx }
                return (
                  <g key={`ch${i}${j}`} onClick={() => handleNodeClick(nodeObj)}
                    style={{ cursor: 'pointer', opacity: dim ? 0.15 : 1, transition: 'opacity 0.4s' }}
                    filter={selected ? 'url(#glow)' : 'url(#sh)'}>
                    <rect x={c.x - rw / 2} y={c.y - rh / 2} width={rw} height={rh} rx="14" fill="white" stroke={rama.color} strokeWidth={selected ? 5 : (presentationMode ? 3.5 : 1.5)} />
                    <rect x={c.x - rw / 2} y={c.y - rh / 2} width={presentationMode ? 14 : 7} height={rh} rx="7" fill={rama.color} />
                    {lines.map((line, li) => <text key={li} x={c.x + (presentationMode ? 10 : 6)} y={c.y + (li - (lines.length - 1) / 2) * 24 + 6} textAnchor="middle" fontFamily={FONT} fontSize={presentationMode ? 17 : 13} fontWeight={presentationMode ? '800' : '600'} fill="#111827">{line}</text>)}
                  </g>
                )
              })
            })}

            {/* Drawings */}
            {drawings.map((dr, i) => <path key={i} d={dr.d} stroke={dr.color} strokeWidth={dr.size} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />)}
            {liveD && <path d={liveD} stroke={penColor} strokeWidth={penSize} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />}
          </g>
        </svg>

        {!presentationMode && (
          <div className="absolute bottom-3 left-3 text-xs text-gray-400 pointer-events-none select-none">
            Toca un nodo para ver la explicación · Arrastra para mover · Scroll para zoom
          </div>
        )}

        {/* Presentation mode — floating draw toolbar */}
        {presentationMode && (
          <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-2 rounded-2xl bg-white shadow-lg border border-gray-200">
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              <button onClick={() => setMode('pan')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mode === 'pan' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>🖐</button>
              <button onClick={() => setMode('draw')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mode === 'draw' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>✏️</button>
            </div>
            {mode === 'draw' && (
              <>
                <div className="flex gap-1.5">{PEN_COLORS.filter(c => c !== '#ffffff').map(c => <button key={c} onClick={() => setPenColor(c)} style={{ background: c, outline: penColor === c ? `3px solid ${c}` : '2px solid #e5e7eb', outlineOffset: '2px' }} className="w-6 h-6 rounded-full" />)}</div>
                <div className="w-px h-5 bg-gray-200" />
                <div className="flex gap-1">{[2, 4, 7, 12].map(s => <button key={s} onClick={() => setPenSize(s)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${penSize === s ? 'bg-gray-100' : 'hover:bg-gray-50'}`}><div style={{ width: s * 2, height: s * 2, background: penColor, borderRadius: '50%' }} /></button>)}</div>
                <div className="w-px h-5 bg-gray-200" />
                <button onClick={() => setDrawings([])} className="text-xs text-red-500 hover:text-red-700 font-medium px-1">🗑</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

/* ════════════════════════
   Node Info Panel (normal mode)
════════════════════════ */
export function NodePanel({
  node, allNodes, onNavigate, onClose,
}: {
  node: FocusedNode; allNodes: FocusedNode[]
  onNavigate: (n: FocusedNode) => void; onClose: () => void
}) {
  const prev = allNodes[node.navIndex - 1]
  const next = allNodes[node.navIndex + 1]

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-white border-t-4 shadow-2xl max-h-[52%] flex flex-col"
      style={{ borderColor: node.color }}>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-shrink-0" style={{ background: node.color + '12' }}>
        <span className="text-3xl leading-none">{node.type === 'child' ? '•' : node.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: node.color }}>
            {node.type === 'center' ? 'Tema central' : node.type === 'branch' ? 'Categoría' : 'Punto específico'}
          </p>
          <h2 className="text-base font-bold text-gray-900 leading-tight">{node.texto}</h2>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="text-sm text-gray-700 leading-relaxed">{node.explicacion}</p>
        {node.children && node.children.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {node.type === 'center' ? 'Temas del mapa' : 'Puntos clave'}
            </p>
            <ul className="space-y-2">
              {node.children.map(c => (
                <li key={c.id} className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: c.color }} />
                  <span className="text-sm text-gray-600">{c.texto}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 bg-gray-50 flex-shrink-0">
        <span className="text-xs text-gray-400">{node.navIndex + 1}/{allNodes.length}</span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => prev && onNavigate(prev)} disabled={!prev}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30">← Anterior</button>
          <button onClick={() => next && onNavigate(next)} disabled={!next}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-30"
            style={{ background: next ? node.color : '#9ca3af' }}>Siguiente →</button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════
   Presentation Mode Overlay
════════════════════════ */
export function PresentationOverlay({
  mapa, script, audioSrc, alignment, sectionTimestamps, markers,
  onExit,
}: {
  mapa: MapaJson
  script: string
  audioSrc: string | null
  alignment: Alignment | null
  sectionTimestamps: number[]
  markers: string[]
  onExit: () => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [displayTime, setDisplayTime] = useState(0)   // throttled — only for progress bar
  const [duration, setDuration] = useState(0)
  const [activeBranchIdx, setActiveBranchIdx] = useState(-1) // -1 = center/intro
  const lastDisplayRef = useRef(0)

  // Single handler: throttle progress bar updates + only update branch when it changes
  function handleTimeUpdate(e: React.SyntheticEvent<HTMLAudioElement>) {
    const t = (e.target as HTMLAudioElement).currentTime
    const dur = (e.target as HTMLAudioElement).duration || 0

    // Refresh progress bar at most once per 400ms
    if (t - lastDisplayRef.current >= 0.4) {
      lastDisplayRef.current = t
      setDisplayTime(t)
    }

    // Calculate active branch
    let active = -1
    if (audioSrc && sectionTimestamps.some(ts => ts >= 0)) {
      for (let i = sectionTimestamps.length - 1; i >= 0; i--) {
        const ts = sectionTimestamps[i]
        if (ts >= 0 && t >= ts) { active = i - 1; break }
      }
    } else if (dur > 0) {
      // Fallback: uniform timing
      const secDur = dur / markers.length
      active = Math.min(Math.floor(t / secDur) - 1, mapa.ramas.length - 1)
    }

    setActiveBranchIdx(prev => prev === active ? prev : active)
  }

  const activeFocusId = activeBranchIdx < 0
    ? mapa.centro.id
    : (mapa.ramas[activeBranchIdx]?.id ?? mapa.centro.id)

  const activeName = activeBranchIdx < 0
    ? mapa.centro.texto
    : (mapa.ramas[activeBranchIdx] ? `${mapa.ramas[activeBranchIdx].emoji} ${mapa.ramas[activeBranchIdx].texto}` : '')

  const activeColor = activeBranchIdx < 0
    ? mapa.centro.color
    : (mapa.ramas[activeBranchIdx]?.color ?? mapa.centro.color)

  function togglePlay() {
    const a = audioRef.current; if (!a) return
    if (a.paused) { a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
  }

  function restart() {
    const a = audioRef.current; if (!a) return
    a.currentTime = 0; a.play(); setPlaying(true)
  }

  const progress = duration > 0 ? (displayTime / duration) * 100 : 0

  // Silence unused script param warning
  void script

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0f172a' }}>
      <button onClick={onExit}
        className="absolute top-4 right-4 z-10 rounded-full px-4 py-2 text-sm font-semibold transition-colors shadow-sm"
        style={{ background: 'rgba(255,255,255,0.12)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.18)' }}>
        ✕ Salir
      </button>

      {/* Map area */}
      <div className="flex-1 min-h-0">
        <MindMap
          mapa={mapa} focusedId={activeFocusId}
          presentationMode={true}
          onNodeClick={NOOP_CLICK}
        />
      </div>

      {/* Bottom HUD */}
      <div className="flex-shrink-0 px-6 py-4 flex flex-col gap-2.5 border-t-2" style={{ background: '#0f172a', borderColor: activeColor }}>
        {activeName && (
          <div className="flex items-center gap-2.5">
            <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: activeColor, boxShadow: `0 0 10px ${activeColor}` }} />
            <span className="font-bold text-xl tracking-wide" style={{ color: activeColor }}>{activeName}</span>
          </div>
        )}

        <div className="flex items-center gap-4">
          {audioSrc ? (
            <>
              <button onClick={togglePlay} className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 font-bold text-white shadow-lg transition-transform active:scale-95" style={{ background: activeColor }}>
                {playing ? '⏸' : '▶'}
              </button>
              <button onClick={restart} className="text-lg transition-colors flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>↺</button>
              <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: activeColor }} />
              </div>
              <span className="text-sm flex-shrink-0 tabular-nums font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {Math.floor(displayTime / 60)}:{String(Math.floor(displayTime % 60)).padStart(2, '0')} / {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
              </span>
            </>
          ) : (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Genera el audio del video primero para sincronizar el mapa</p>
          )}
        </div>
      </div>

      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/* ── Types ── */
interface NewsItem {
  id: string; title: string; summary: string
  spanishSummary?: string | null; url: string; publishedAt: string
}
interface HistoryItem {
  id: string; titulo: string; guionCompleto: string; mapaJson: MapaJson; createdAt: string
}
interface MapaHijo { id: string; texto: string; color: string; explicacion: string }
interface MapaRama { id: string; emoji: string; texto: string; color: string; explicacion: string; hijos: MapaHijo[] }
interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string; explicacion: string }
  ramas: MapaRama[]
}
interface ElevenVoice { voice_id: string; name: string }
interface DrawPath { d: string; color: string; size: number }
interface Alignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

interface FocusedNode {
  id: string; emoji: string; texto: string; color: string; explicacion: string
  type: 'center' | 'branch' | 'child'
  children?: Array<{ id: string; texto: string; color: string; explicacion: string }>
  navIndex: number
}

/* ── Section markers in the script ── */
const MARKERS = ['[INTRO]', '[R1]', '[R2]', '[R3]', '[R4]', '[R5]', '[CTA]']

function extractSectionTimestamps(alignment: Alignment, script: string): number[] {
  // Find the character index of each marker in the script
  // then look up the corresponding timestamp from alignment
  const cleanScript = script
  const timestamps: number[] = []

  for (const marker of MARKERS) {
    const charIdx = cleanScript.indexOf(marker)
    if (charIdx === -1) { timestamps.push(-1); continue }
    // Find the closest character in alignment to this position
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

function buildNodeList(mapa: MapaJson): FocusedNode[] {
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

/* ── Map layout ── */
const CX = 1200; const CY = 750
const BRANCH_R = 450; const CHILD_R = 270
const BRANCH_ANGLES = [-126, -54, 18, 90, 162]
const RAD = (d: number) => (d * Math.PI) / 180
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"

function bp(a: number) { return { x: CX + BRANCH_R * Math.cos(RAD(a)), y: CY + BRANCH_R * Math.sin(RAD(a)) } }
function cp(a: number, idx: number) {
  const { x: bx, y: by } = bp(a)
  // Place children radially outward + perpendicular spread so they never overlap adjacent branches
  const dx = Math.cos(RAD(a)), dy = Math.sin(RAD(a))
  const px = -dy, py = dx // perpendicular unit vector
  const spread = ([-145, 0, 145][idx] ?? 0)
  return { x: bx + CHILD_R * dx + spread * px, y: by + CHILD_R * dy + spread * py }
}
function qcurve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1
  return `M ${x1} ${y1} Q ${mx - dy * 0.18} ${my + dx * 0.18} ${x2} ${y2}`
}
function wrap(text: string, max: number): string[] {
  const words = text.split(' '); const lines: string[] = []; let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= max) cur = next
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text.slice(0, max)]
}

const PEN_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#ffffff', '#000000']

/* ════════════════════════
   Mind Map SVG
════════════════════════ */
function MindMap({
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
  const allNodes = buildNodeList(mapa)

  useEffect(() => { tfRef.current = tf }, [tf])

  const center = useCallback(() => {
    const el = containerRef.current; if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const scale = Math.min(width / (CX * 2 + 400), height / (CY * 2 + 300)) * 0.82
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
    const svg = svgRef.current; const el = containerRef.current; if (!svg || !el) return
    const { width, height } = el.getBoundingClientRect()
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const scale = Math.min(width / (CX * 2 + 400), height / (CY * 2 + 300)) * 0.82
    const g = clone.querySelector('g')
    if (g) g.setAttribute('transform', `translate(${(width / 2 - CX * scale).toFixed(1)},${(height / 2 - CY * scale).toFixed(1)}) scale(${scale.toFixed(4)})`)
    const svgStr = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const dpr = Math.max(window.devicePixelRatio, 2)
      const canvas = document.createElement('canvas')
      canvas.width = width * dpr; canvas.height = height * dpr
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.fillStyle = presentationMode ? '#0f172a' : '#f9fafb'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url)
      canvas.toBlob(pb => { if (!pb) return; const a = document.createElement('a'); a.href = URL.createObjectURL(pb); a.download = 'mapa-irs.png'; a.click() }, 'image/png')
    }
    img.onerror = () => { const a = document.createElement('a'); a.href = url; a.download = 'mapa-irs.svg'; a.click() }
    img.src = url
  }

  useEffect(() => { if (onExportRef) onExportRef(exportPng) })

  function toMap(cx: number, cy: number) {
    const rect = svgRef.current!.getBoundingClientRect(); const t = tfRef.current
    return { x: (cx - rect.left - t.x) / t.scale, y: (cy - rect.top - t.y) / t.scale }
  }

  function onPointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    downPos.current = { x: e.clientX, y: e.clientY }; didDrag.current = false
    if (mode === 'pan') dragState.current = { sx: e.clientX, sy: e.clientY, ox: tfRef.current.x, oy: tfRef.current.y }
    else {
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
    if (mode === 'pan' && dragState.current)
      setTf(t => ({ ...t, x: dragState.current!.ox + e.clientX - dragState.current!.sx, y: dragState.current!.oy + e.clientY - dragState.current!.sy }))
    else if (mode === 'draw' && isDrawing.current) {
      const { x, y } = toMap(e.clientX, e.clientY)
      livePts.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`; setLiveD(livePts.current)
    }
  }

  function onPointerUp() {
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
  const angles = BRANCH_ANGLES.slice(0, branches.length)

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
          onPointerUp={onPointerUp} onPointerLeave={onPointerUp} style={{ display: 'block' }}>
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
          {!presentationMode && <rect width="100%" height="100%" fill="url(#grid)" />}

          <g transform={gTransform}>
            {/* Lines center → branches */}
            {branches.map((rama, i) => {
              const b = bp(angles[i] ?? 0)
              const active = focusedId === rama.id || rama.hijos.some(h => h.id === focusedId)
              return <path key={`lc${i}`} d={qcurve(CX, CY, b.x, b.y)} stroke={rama.color} strokeWidth={active ? 7 : 5} fill="none" strokeLinecap="round" strokeOpacity={presentationMode && focusedId && !active ? 0.2 : (presentationMode ? 0.8 : 0.45)} />
            })}

            {/* Lines branches → children */}
            {branches.map((rama, i) =>
              rama.hijos.slice(0, 3).map((hijo, j) => {
                const b = bp(angles[i] ?? 0); const c = cp(angles[i] ?? 0, j)
                const active = focusedId === hijo.id || focusedId === rama.id
                return <path key={`lch${i}${j}`} d={qcurve(b.x, b.y, c.x, c.y)} stroke={hijo.color} strokeWidth={3} fill="none" strokeLinecap="round" strokeOpacity={presentationMode && focusedId && !active ? 0.12 : (presentationMode ? 0.65 : 0.4)} strokeDasharray={presentationMode ? undefined : "8 4"} />
              })
            )}

            {/* Center */}
            {(() => {
              const lines = wrap(mapa.centro.texto, 12)
              const ry = Math.max(68, lines.length * 26 + 44)
              const selected = focusedId === mapa.centro.id
              const dim = presentationMode && focusedId && !selected
              return (
                <g onClick={() => handleNodeClick({ id: mapa.centro.id, emoji: mapa.centro.emoji, texto: mapa.centro.texto, color: mapa.centro.color, explicacion: mapa.centro.explicacion, type: 'center', children: mapa.ramas.map(r => ({ id: r.id, texto: r.texto, color: r.color, explicacion: r.explicacion })), navIndex: 0 })}
                  style={{ cursor: 'pointer', opacity: dim ? 0.35 : 1 }}
                  filter={selected ? 'url(#glowStrong)' : 'url(#sh)'}>
                  <ellipse cx={CX} cy={CY} rx={135} ry={ry} fill={mapa.centro.color} />
                  <ellipse cx={CX} cy={CY} rx={142} ry={ry + 8} fill="none" stroke="white" strokeWidth={selected ? '4' : '2'} strokeOpacity={selected ? '1' : (presentationMode ? '0.35' : '0')} />
                  <text x={CX} y={CY - ry + 30} textAnchor="middle" fontSize={presentationMode ? 36 : 28} fontFamily={FONT}>{mapa.centro.emoji}</text>
                  {lines.map((line, li) => <text key={li} x={CX} y={CY - ry + 70 + li * 28} textAnchor="middle" fontFamily={FONT} fontSize={presentationMode ? 22 : 18} fontWeight="800" fill="white">{line}</text>)}
                </g>
              )
            })()}

            {/* Branches */}
            {branches.map((rama, i) => {
              const b = bp(angles[i] ?? 0); const lines = wrap(rama.texto, 13)
              const ry = Math.max(58, lines.length * 23 + 40)
              const selected = focusedId === rama.id
              const dim = presentationMode && focusedId && !selected && !rama.hijos.some(h => h.id === focusedId)
              const navIdx = 1 + i * 4
              const nodeObj: FocusedNode = { id: rama.id, emoji: rama.emoji, texto: rama.texto, color: rama.color, explicacion: rama.explicacion, type: 'branch', children: rama.hijos.slice(0, 3).map(h => ({ id: h.id, texto: h.texto, color: h.color, explicacion: h.explicacion })), navIndex: navIdx }
              const fill = presentationMode ? rama.color : 'white'
              const textFill = presentationMode ? 'white' : rama.color
              const strokeW = selected ? (presentationMode ? 0 : 5) : 3.5
              return (
                <g key={`b${i}`} onClick={() => handleNodeClick(nodeObj)} style={{ cursor: 'pointer', opacity: dim ? 0.3 : 1 }} filter={selected ? 'url(#glowStrong)' : 'url(#sh)'}>
                  <ellipse cx={b.x} cy={b.y} rx={118} ry={ry} fill={fill} stroke={presentationMode ? 'none' : rama.color} strokeWidth={strokeW} />
                  {selected && presentationMode && <ellipse cx={b.x} cy={b.y} rx={128} ry={ry + 10} fill="none" stroke="white" strokeWidth="4" strokeOpacity="0.9" />}
                  {selected && !presentationMode && <ellipse cx={b.x} cy={b.y} rx={124} ry={ry + 7} fill="none" stroke={rama.color} strokeWidth="3" strokeOpacity="0.5" />}
                  <text x={b.x} y={b.y - ry + 26} textAnchor="middle" fontSize={presentationMode ? 28 : 22} fontFamily={FONT}>{rama.emoji}</text>
                  {lines.map((line, li) => <text key={li} x={b.x} y={b.y - ry + 58 + li * 25} textAnchor="middle" fontFamily={FONT} fontSize={presentationMode ? 18 : 15} fontWeight="800" fill={textFill}>{line}</text>)}
                </g>
              )
            })}

            {/* Children */}
            {branches.map((rama, i) =>
              rama.hijos.slice(0, 3).map((hijo, j) => {
                const c = cp(angles[i] ?? 0, j); const lines = wrap(hijo.texto, 18)
                const rw = 190; const rh = Math.max(46, lines.length * 22 + 18)
                const selected = focusedId === hijo.id
                const dim = presentationMode && focusedId && !selected && focusedId !== rama.id
                const navIdx = 1 + i * 4 + 1 + j
                const nodeObj: FocusedNode = { id: hijo.id, emoji: '•', texto: hijo.texto, color: hijo.color, explicacion: hijo.explicacion, type: 'child', navIndex: navIdx }
                const fill = presentationMode ? hijo.color + '28' : 'white'
                const textColor = presentationMode ? 'white' : '#111827'
                const borderColor = hijo.color
                return (
                  <g key={`ch${i}${j}`} onClick={() => handleNodeClick(nodeObj)} style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1 }} filter={selected ? 'url(#glow)' : 'url(#sh)'}>
                    <rect x={c.x - rw / 2} y={c.y - rh / 2} width={rw} height={rh} rx="14" fill={presentationMode ? '#1e3a5f' : fill} stroke={borderColor} strokeWidth={selected ? 3.5 : (presentationMode ? 2.5 : 1.5)} />
                    <rect x={c.x - rw / 2} y={c.y - rh / 2} width={presentationMode ? 10 : 7} height={rh} rx="6" fill={hijo.color} />
                    {lines.map((line, li) => <text key={li} x={c.x + (presentationMode ? 8 : 6)} y={c.y + (li - (lines.length - 1) / 2) * 22 + 5} textAnchor="middle" fontFamily={FONT} fontSize={presentationMode ? 16 : 13} fontWeight={presentationMode ? '700' : '600'} fill={textColor}>{line}</text>)}
                  </g>
                )
              })
            )}

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

        {/* Presentation mode — floating draw toolbar (top-left, semi-transparent) */}
        {presentationMode && (
          <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-2 rounded-2xl" style={{ background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex rounded-lg overflow-hidden border border-white/20">
              <button onClick={() => setMode('pan')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mode === 'pan' ? 'bg-white text-gray-900' : 'text-white/70 hover:text-white'}`}>🖐</button>
              <button onClick={() => setMode('draw')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mode === 'draw' ? 'bg-white text-gray-900' : 'text-white/70 hover:text-white'}`}>✏️</button>
            </div>
            {mode === 'draw' && (
              <>
                <div className="flex gap-1.5">{PEN_COLORS.map(c => <button key={c} onClick={() => setPenColor(c)} style={{ background: c, outline: penColor === c ? '3px solid white' : '2px solid rgba(255,255,255,0.25)', outlineOffset: '2px' }} className="w-6 h-6 rounded-full" />)}</div>
                <div className="w-px h-5 bg-white/20" />
                <div className="flex gap-1">{[2, 4, 7, 12].map(s => <button key={s} onClick={() => setPenSize(s)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${penSize === s ? 'bg-white/20' : 'hover:bg-white/10'}`}><div style={{ width: s * 2, height: s * 2, background: penColor, borderRadius: '50%' }} /></button>)}</div>
                <div className="w-px h-5 bg-white/20" />
                <button onClick={() => setDrawings([])} className="text-xs text-red-400 hover:text-red-300 font-medium px-1">🗑</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════
   Node Info Panel (normal mode)
════════════════════════ */
function NodePanel({
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
function PresentationOverlay({
  mapa, script, audioSrc, alignment, sectionTimestamps,
  onExit,
}: {
  mapa: MapaJson
  script: string
  audioSrc: string | null
  alignment: Alignment | null
  sectionTimestamps: number[]
  onExit: () => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [activeBranchIdx, setActiveBranchIdx] = useState(-1) // -1 = center/intro

  // Determine active branch from current time
  useEffect(() => {
    if (!audioSrc) return
    // sectionTimestamps: [INTRO, R1, R2, R3, R4, R5, CTA]
    // index 0=intro/center, 1=R1, 2=R2, 3=R3, 4=R4, 5=R5, 6=CTA
    let active = -1
    for (let i = sectionTimestamps.length - 1; i >= 0; i--) {
      const ts = sectionTimestamps[i]
      if (ts >= 0 && currentTime >= ts) { active = i - 1; break } // -1 because [0]=INTRO maps to center
    }
    setActiveBranchIdx(active)
  }, [currentTime, sectionTimestamps, audioSrc])

  // Fallback: uniform timing when no alignment
  useEffect(() => {
    if (alignment || !duration || sectionTimestamps.every(t => t < 0)) {
      // Already handled by sectionTimestamps
      return
    }
    // Simple fallback: divide duration by 7 sections
    const secDur = duration / 7
    const t = currentTime
    const idx = Math.floor(t / secDur) - 1 // -1 for INTRO = center
    setActiveBranchIdx(Math.min(idx, 4))
  }, [currentTime, duration, alignment, sectionTimestamps])

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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0f172a' }}>
      {/* Exit button */}
      <button onClick={onExit}
        className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full px-4 py-2 text-sm font-medium transition-colors">
        ✕ Salir
      </button>

      {/* Map area */}
      <div className="flex-1 min-h-0">
        <MindMap
          mapa={mapa} focusedId={activeFocusId}
          presentationMode={true}
          onNodeClick={() => {}}
        />
      </div>

      {/* Bottom HUD */}
      <div className="flex-shrink-0 px-6 py-4 flex flex-col gap-3" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
        {/* Current section name */}
        {activeName && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0 animate-pulse" style={{ background: activeColor }} />
            <span className="text-white font-semibold text-lg tracking-wide">{activeName}</span>
          </div>
        )}

        {/* Progress bar + controls */}
        <div className="flex items-center gap-4">
          {audioSrc ? (
            <>
              <button onClick={togglePlay} className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 font-bold transition-colors" style={{ background: activeColor }}>
                {playing ? '⏸' : '▶'}
              </button>
              <button onClick={restart} className="text-white/50 hover:text-white text-sm transition-colors flex-shrink-0">↺</button>
              <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: activeColor }} />
              </div>
              <span className="text-white/60 text-sm flex-shrink-0 tabular-nums">
                {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')} / {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
              </span>
            </>
          ) : (
            <p className="text-white/50 text-sm">Genera el audio del video primero para sincronizar el mapa</p>
          )}
        </div>
      </div>

      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} preload="auto"
          onTimeUpdate={e => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
          onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  )
}

/* ════════════════════════
   Main Page
════════════════════════ */
export default function IrsVideoPage() {
  const [noticias, setNoticias] = useState<NewsItem[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loadingNews, setLoadingNews] = useState(false)
  const [mapa, setMapa] = useState<MapaJson | null>(null)
  const [guion, setGuion] = useState('')
  const [generating, setGenerating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [scriptOpen, setScriptOpen] = useState(false)
  const [elevenKey, setElevenKey] = useState('')
  const [voices, setVoices] = useState<ElevenVoice[]>([])
  const [voiceId, setVoiceId] = useState('')
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [generatingAudio, setGeneratingAudio] = useState(false)
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [alignment, setAlignment] = useState<Alignment | null>(null)
  const [sectionTimestamps, setSectionTimestamps] = useState<number[]>([])
  const [presentationMode, setPresentationMode] = useState(false)
  const [focusedNode, setFocusedNode] = useState<FocusedNode | null>(null)
  const [allNodes, setAllNodes] = useState<FocusedNode[]>([])

  useEffect(() => {
    const k = localStorage.getItem('elevenlabs_key')
    const v = localStorage.getItem('elevenlabs_voice')
    if (k) setElevenKey(k)
    if (v) setVoiceId(v)
    loadNoticias()
  }, [])

  async function loadNoticias() {
    setLoadingNews(true); setMapa(null); setGuion(''); setAudioSrc(null); setAlignment(null); setFocusedNode(null)
    const res = await fetch('/api/irs-news')
    if (res.ok) { const data: NewsItem[] = await res.json(); setNoticias(data); setSelectedIdx(0) }
    setLoadingNews(false)
  }

  async function loadHistory() {
    setLoadingHistory(true)
    const res = await fetch('/api/irs-video/history')
    if (res.ok) setHistory(await res.json())
    setLoadingHistory(false)
  }

  async function generateContent() {
    const item = noticias[selectedIdx]; if (!item) return
    setGenerating(true); setMapa(null); setGuion(''); setAudioSrc(null); setAlignment(null); setFocusedNode(null)
    const res = await fetch('/api/irs-video/noticias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: item.title, summary: item.summary, spanishSummary: item.spanishSummary }),
    })
    if (res.ok) { const data = await res.json(); setMapa(data.mapaJson); setGuion(data.guionCompleto) }
    setGenerating(false)
  }

  async function generateAudio() {
    if (!guion || !voiceId || !elevenKey) return
    setGeneratingAudio(true)
    if (audioSrc) { URL.revokeObjectURL(audioSrc); setAudioSrc(null) }

    // Clean guion (remove markers for cleaner TTS)
    const cleanGuion = guion.replace(/\[(INTRO|R[1-5]|CTA)\]\s*/g, '')

    try {
      const res = await fetch('/api/irs-video/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanGuion, voiceId, apiKey: elevenKey, withTimestamps: true }),
      })
      if (res.ok) {
        const data: { audioBase64: string; alignment: Alignment } = await res.json()
        const binary = atob(data.audioBase64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: 'audio/mpeg' })
        const url = URL.createObjectURL(blob)
        setAudioSrc(url)
        setAlignment(data.alignment)
        // Extract timestamps for each section marker
        const ts = extractSectionTimestamps(data.alignment, guion)
        setSectionTimestamps(ts)
      }
    } catch { /* ignore */ }
    setGeneratingAudio(false)
  }

  async function loadVoices() {
    if (!elevenKey) return
    localStorage.setItem('elevenlabs_key', elevenKey)
    setLoadingVoices(true)
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': elevenKey } })
    if (res.ok) {
      const data = await res.json(); const list: ElevenVoice[] = data.voices ?? []
      setVoices(list)
      if (list.length && !voiceId) { setVoiceId(list[0].voice_id); localStorage.setItem('elevenlabs_voice', list[0].voice_id) }
    }
    setLoadingVoices(false)
  }

  const selected = noticias[selectedIdx]
  const hasAudio = !!audioSrc
  const hasMap = !!mapa

  return (
    <>
      {/* Presentation Mode */}
      {presentationMode && mapa && (
        <PresentationOverlay
          mapa={mapa} script={guion} audioSrc={audioSrc}
          alignment={alignment} sectionTimestamps={sectionTimestamps}
          onExit={() => setPresentationMode(false)}
        />
      )}

      <div className="flex flex-col" style={{ height: 'calc(100vh - 80px)', minHeight: 600 }}>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)] flex-shrink-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-lg">🎬</span>
            <h1 className="text-base font-bold text-[var(--text-primary)]">IRS Video Creator</h1>
          </div>

          {noticias.length > 0 ? (
            <select value={selectedIdx} onChange={e => setSelectedIdx(Number(e.target.value))} className="input flex-1 min-w-0 max-w-sm text-xs">
              {noticias.map((n, i) => <option key={n.id} value={i}>{n.title.slice(0, 70)}{n.title.length > 70 ? '…' : ''}</option>)}
            </select>
          ) : (
            <p className="text-xs text-gray-500 flex-1">Ve a IRS News y actualiza las noticias primero</p>
          )}

          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
            <button onClick={loadNoticias} disabled={loadingNews} className="btn-secondary text-xs px-2.5 py-1.5">{loadingNews ? '…' : '↺'} Cargar</button>
            {selected?.spanishSummary && <button onClick={() => setSummaryOpen(v => !v)} className={`btn-secondary text-xs px-2.5 py-1.5 ${summaryOpen ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : ''}`}>📰</button>}
            <button onClick={() => { setShowHistory(v => !v); if (!showHistory) loadHistory() }} className={`btn-secondary text-xs px-2.5 py-1.5 ${showHistory ? 'bg-[var(--bg-hover)]' : ''}`}>🕒 Historial</button>
            <button onClick={() => setShowSettings(v => !v)} className={`btn-secondary text-xs px-2.5 py-1.5 ${showSettings ? 'bg-[var(--bg-hover)]' : ''}`}>⚙️</button>
            <button onClick={generateContent} disabled={!selected || generating} className="btn-primary text-xs flex items-center gap-1.5">
              {generating ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando…</> : '⚡ Generar mapa'}
            </button>
            {hasMap && (
              <button onClick={generateAudio} disabled={generatingAudio || !voiceId || !elevenKey} className="btn-secondary text-xs flex items-center gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 disabled:opacity-50">
                {generatingAudio ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando…</> : `🎙 ${hasAudio ? 'Regenerar audio' : 'Generar audio'}`}
              </button>
            )}
            {hasMap && (
              <button onClick={() => setPresentationMode(true)}
                className="btn-primary text-xs flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-blue-600 border-0">
                🎬 Modo Presentación
              </button>
            )}
          </div>
        </div>

        {/* Settings */}
        {showSettings && (
          <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)] flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <p className="label">API Key ElevenLabs</p>
              <input type="password" value={elevenKey} onChange={e => setElevenKey(e.target.value)} placeholder="sk-..." className="input text-xs" />
            </div>
            <button onClick={loadVoices} disabled={!elevenKey || loadingVoices} className="btn-secondary text-xs whitespace-nowrap mb-0.5">{loadingVoices ? '…' : 'Cargar voces'}</button>
            {voices.length > 0 && (
              <div className="flex-1 min-w-40">
                <p className="label">Voz</p>
                <select value={voiceId} onChange={e => { setVoiceId(e.target.value); localStorage.setItem('elevenlabs_voice', e.target.value) }} className="input text-xs">
                  {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                </select>
              </div>
            )}
            {hasAudio && <p className="text-xs text-green-500 mb-0.5">✓ Audio listo · sincronización activada</p>}
            {hasMap && !voiceId && <p className="text-xs text-amber-500 mb-0.5">Configura ElevenLabs para activar el audio</p>}
          </div>
        )}

        {/* Summary */}
        {summaryOpen && selected?.spanishSummary && (
          <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--bg-border)] bg-blue-500/5">
            <p className="text-xs text-gray-400 leading-relaxed">{selected.spanishSummary}</p>
          </div>
        )}

        {/* Script */}
        {guion && (
          <div className="flex-shrink-0 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)]">
            <button onClick={() => setScriptOpen(v => !v)} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] text-left">
              <span className="text-xs font-medium text-[var(--text-secondary)]">📜 Guion ({guion.split(' ').length} palabras)</span>
              {hasAudio && <span className="text-xs text-green-500 ml-1">🎙 Audio sincronizado</span>}
              <svg className={`w-3.5 h-3.5 text-gray-500 ml-auto transition-transform ${scriptOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {scriptOpen && (
              <div className="px-4 pb-3 flex gap-2 items-start">
                <textarea readOnly value={guion} className="input resize-none text-xs leading-relaxed flex-1" rows={5} />
                {audioSrc && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <audio src={audioSrc} controls className="w-56" />
                    <button onClick={() => { const a = document.createElement('a'); a.href = audioSrc!; a.download = 'guion-irs.mp3'; a.click() }} className="btn-secondary text-xs">⬇ MP3</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-1 min-h-0">
          {/* History sidebar */}
          {showHistory && (
            <div className="w-64 flex-shrink-0 border-r border-[var(--bg-border)] bg-[var(--bg-sidebar)] flex flex-col overflow-hidden">
              <div className="px-3 py-2.5 border-b border-[var(--bg-border)] flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--text-primary)]">Mapas guardados</p>
                <button onClick={() => setShowHistory(false)} className="text-gray-600 hover:text-gray-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-[var(--bg-border)]">
                {loadingHistory ? <div className="py-8 text-center text-xs text-gray-600">Cargando…</div>
                  : history.length === 0 ? <div className="py-8 px-3 text-center text-xs text-gray-600">Aún no hay mapas.</div>
                  : history.map(item => (
                    <button key={item.id} onClick={() => { setMapa(item.mapaJson); setGuion(item.guionCompleto); setAudioSrc(null); setAlignment(null); setFocusedNode(null); setShowHistory(false) }}
                      className="w-full text-left px-3 py-3 hover:bg-[var(--bg-hover)]">
                      <p className="text-xs font-medium text-[var(--text-primary)] line-clamp-2 leading-snug">{item.titulo}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{new Date(item.createdAt).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Map */}
          <div className="flex-1 min-w-0 relative">
            {!mapa && !generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-gray-400 bg-gray-50">
                <svg className="w-16 h-16 opacity-15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15a1 1 0 01-.553.894L15 18M15 10l-6 2.7M15 10V18M9 12.7L4.447 10.631A1 1 0 014 9.82V4a1 1 0 011.447-.894L9 5M9 12.7V5m0 7.7l6-2.7" /></svg>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-medium text-gray-500">Selecciona una noticia y genera el mapa</p>
                  <p className="text-xs text-gray-400">Luego genera el audio → activa el Modo Presentación → graba con tu celular</p>
                </div>
              </div>
            )}
            {generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-50">
                <svg className="w-10 h-10 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                <div className="text-center">
                  <p className="text-sm text-gray-600 font-medium">Generando mapa educativo con IA…</p>
                  <p className="text-xs text-gray-400 mt-1">5 temas · 15 puntos · explicaciones detalladas · guion estructurado</p>
                </div>
              </div>
            )}
            {mapa && (
              <>
                <MindMap mapa={mapa} focusedId={focusedNode?.id ?? null} presentationMode={false} onNodeClick={(node, all) => { setFocusedNode(node); setAllNodes(all) }} />
                {focusedNode && (
                  <NodePanel node={focusedNode} allNodes={allNodes} onNavigate={n => setFocusedNode(n)} onClose={() => setFocusedNode(null)} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

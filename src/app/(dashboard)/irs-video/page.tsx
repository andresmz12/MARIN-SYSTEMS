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

interface FocusedNode {
  id: string; emoji: string; texto: string; color: string; explicacion: string
  type: 'center' | 'branch' | 'child'
  children?: Array<{ id: string; texto: string; color: string; explicacion: string }>
  navIndex: number  // position in flat node list for prev/next
}

/* ── Map layout ── */
const CX = 1200; const CY = 750
const BRANCH_R = 370; const CHILD_R = 255
const BRANCH_ANGLES = [-126, -54, 18, 90, 162]
const RAD = (d: number) => (d * Math.PI) / 180
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"

function bp(angle: number) {
  return { x: CX + BRANCH_R * Math.cos(RAD(angle)), y: CY + BRANCH_R * Math.sin(RAD(angle)) }
}
function cp(angle: number, idx: number) {
  const { x: bx, y: by } = bp(angle)
  const a = angle + ([-40, 0, 40][idx] ?? 0)
  return { x: bx + CHILD_R * Math.cos(RAD(a)), y: by + CHILD_R * Math.sin(RAD(a)) }
}
function qcurve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
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
      list.push({
        id: hijo.id, emoji: '•', texto: hijo.texto, color: hijo.color,
        explicacion: hijo.explicacion, type: 'child', navIndex: list.length,
      })
    })
    void bi
  })
  return list
}

const PEN_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#000000', '#ffffff']

/* ════════════════════════════
   Mind Map SVG
════════════════════════════ */
function MindMap({
  mapa, focusedId, onNodeClick,
}: {
  mapa: MapaJson
  focusedId: string | null
  onNodeClick: (node: FocusedNode, allNodes: FocusedNode[]) => void
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

  useEffect(() => { center() }, [center])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      setTf(t => {
        const ns = Math.min(5, Math.max(0.1, t.scale * factor))
        return { scale: ns, x: mx - (mx - t.x) * (ns / t.scale), y: my - (my - t.y) * (ns / t.scale) }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  function toMap(cx: number, cy: number) {
    const rect = svgRef.current!.getBoundingClientRect(); const t = tfRef.current
    return { x: (cx - rect.left - t.x) / t.scale, y: (cy - rect.top - t.y) / t.scale }
  }

  function onPointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    downPos.current = { x: e.clientX, y: e.clientY }
    didDrag.current = false
    if (mode === 'pan') dragState.current = { sx: e.clientX, sy: e.clientY, ox: tfRef.current.x, oy: tfRef.current.y }
    else {
      isDrawing.current = true
      const { x, y } = toMap(e.clientX, e.clientY)
      livePts.current = `M ${x.toFixed(1)} ${y.toFixed(1)}`
      setLiveD(livePts.current)
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
      livePts.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
      setLiveD(livePts.current)
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
      ctx.scale(dpr, dpr); ctx.fillStyle = '#f9fafb'; ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url)
      canvas.toBlob(pb => { if (!pb) return; const a = document.createElement('a'); a.href = URL.createObjectURL(pb); a.download = 'mapa-irs.png'; a.click() }, 'image/png')
    }
    img.onerror = () => { const a = document.createElement('a'); a.href = url; a.download = 'mapa-irs.svg'; a.click() }
    img.src = url
  }

  const gTransform = `translate(${tf.x.toFixed(1)},${tf.y.toFixed(1)}) scale(${tf.scale.toFixed(4)})`
  const branches = mapa.ramas.slice(0, 5)
  const angles = BRANCH_ANGLES.slice(0, branches.length)

  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 flex-wrap">
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

      {/* SVG canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden"
        style={{ background: '#f9fafb', cursor: mode === 'draw' ? 'crosshair' : 'grab', touchAction: 'none', userSelect: 'none' }}>
        <svg ref={svgRef} width="100%" height="100%"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerLeave={onPointerUp} style={{ display: 'block' }}>
          <defs>
            <pattern id="grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.2" fill="#e5e7eb" />
            </pattern>
            <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="6" floodOpacity="0.12" /></filter>
            <filter id="sh-selected"><feDropShadow dx="0" dy="0" stdDeviation="10" floodOpacity="0.5" /></filter>
          </defs>
          <rect width="100%" height="100%" fill="#f9fafb" />
          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={gTransform}>
            {/* Lines */}
            {branches.map((rama, i) => {
              const b = bp(angles[i] ?? 0)
              return <path key={`lc${i}`} d={qcurve(CX, CY, b.x, b.y)} stroke={rama.color} strokeWidth="5" fill="none" strokeLinecap="round" strokeOpacity="0.4" />
            })}
            {branches.map((rama, i) =>
              rama.hijos.slice(0, 3).map((hijo, j) => {
                const b = bp(angles[i] ?? 0); const c = cp(angles[i] ?? 0, j)
                return <path key={`lch${i}${j}`} d={qcurve(b.x, b.y, c.x, c.y)} stroke={hijo.color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeOpacity="0.45" strokeDasharray="8 4" />
              })
            )}

            {/* Center */}
            {(() => {
              const lines = wrap(mapa.centro.texto, 12)
              const ry = Math.max(68, lines.length * 25 + 44)
              const selected = focusedId === mapa.centro.id
              return (
                <g onClick={() => handleNodeClick({ id: mapa.centro.id, emoji: mapa.centro.emoji, texto: mapa.centro.texto, color: mapa.centro.color, explicacion: mapa.centro.explicacion, type: 'center', children: mapa.ramas.map(r => ({ id: r.id, texto: r.texto, color: r.color, explicacion: r.explicacion })), navIndex: 0 })} style={{ cursor: 'pointer' }} filter={selected ? 'url(#sh-selected)' : 'url(#sh)'}>
                  <ellipse cx={CX} cy={CY} rx={132} ry={ry} fill={mapa.centro.color} opacity={selected ? 1 : 0.95} />
                  {selected && <ellipse cx={CX} cy={CY} rx={138} ry={ry + 6} fill="none" stroke="white" strokeWidth="3" strokeOpacity="0.8" />}
                  <text x={CX} y={CY - ry + 30} textAnchor="middle" fontSize="28" fontFamily={FONT}>{mapa.centro.emoji}</text>
                  {lines.map((line, li) => <text key={li} x={CX} y={CY - ry + 65 + li * 25} textAnchor="middle" fontFamily={FONT} fontSize="18" fontWeight="800" fill="white">{line}</text>)}
                </g>
              )
            })()}

            {/* Branches */}
            {branches.map((rama, i) => {
              const b = bp(angles[i] ?? 0); const lines = wrap(rama.texto, 13)
              const ry = Math.max(58, lines.length * 22 + 40)
              const selected = focusedId === rama.id
              const nodeObj: FocusedNode = { id: rama.id, emoji: rama.emoji, texto: rama.texto, color: rama.color, explicacion: rama.explicacion, type: 'branch', children: rama.hijos.slice(0, 3).map(h => ({ id: h.id, texto: h.texto, color: h.color, explicacion: h.explicacion })), navIndex: 1 + i * 4 }
              return (
                <g key={`b${i}`} onClick={() => handleNodeClick(nodeObj)} style={{ cursor: 'pointer' }} filter={selected ? 'url(#sh-selected)' : 'url(#sh)'}>
                  <ellipse cx={b.x} cy={b.y} rx={116} ry={ry} fill="white" stroke={rama.color} strokeWidth={selected ? 4.5 : 3} />
                  {selected && <ellipse cx={b.x} cy={b.y} rx={122} ry={ry + 6} fill="none" stroke={rama.color} strokeWidth="3" strokeOpacity="0.4" />}
                  <text x={b.x} y={b.y - ry + 26} textAnchor="middle" fontSize="22" fontFamily={FONT}>{rama.emoji}</text>
                  {lines.map((line, li) => <text key={li} x={b.x} y={b.y - ry + 54 + li * 22} textAnchor="middle" fontFamily={FONT} fontSize="15" fontWeight="700" fill={rama.color}>{line}</text>)}
                </g>
              )
            })}

            {/* Children */}
            {branches.map((rama, i) =>
              rama.hijos.slice(0, 3).map((hijo, j) => {
                const c = cp(angles[i] ?? 0, j); const lines = wrap(hijo.texto, 20)
                const rw = 205; const rh = Math.max(46, lines.length * 22 + 18)
                const selected = focusedId === hijo.id
                const navIdx = 1 + i * 4 + 1 + j
                const nodeObj: FocusedNode = { id: hijo.id, emoji: '•', texto: hijo.texto, color: hijo.color, explicacion: hijo.explicacion, type: 'child', navIndex: navIdx }
                return (
                  <g key={`ch${i}${j}`} onClick={() => handleNodeClick(nodeObj)} style={{ cursor: 'pointer' }} filter={selected ? 'url(#sh-selected)' : 'url(#sh)'}>
                    <rect x={c.x - rw / 2} y={c.y - rh / 2} width={rw} height={rh} rx="12" fill="white" stroke={hijo.color} strokeWidth={selected ? 3 : 2} />
                    <rect x={c.x - rw / 2} y={c.y - rh / 2} width={7} height={rh} rx="6" fill={hijo.color} />
                    {lines.map((line, li) => <text key={li} x={c.x + 5} y={c.y + (li - (lines.length - 1) / 2) * 22 + 5} textAnchor="middle" fontFamily={FONT} fontSize="13" fontWeight="600" fill="#111827">{line}</text>)}
                  </g>
                )
              })
            )}

            {/* Drawings */}
            {drawings.map((dr, i) => <path key={i} d={dr.d} stroke={dr.color} strokeWidth={dr.size} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />)}
            {liveD && <path d={liveD} stroke={penColor} strokeWidth={penSize} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />}
          </g>
        </svg>

        <div className="absolute bottom-3 left-3 text-xs text-gray-400 pointer-events-none select-none">
          {mode === 'pan' ? 'Toca un nodo para ver la explicación · Arrastra para mover · Scroll para zoom' : 'Dibuja sobre el mapa'}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════
   Node Info Panel
════════════════════════════ */
function NodePanel({
  node, allNodes, elevenKey, voiceId,
  onNavigate, onClose,
}: {
  node: FocusedNode
  allNodes: FocusedNode[]
  elevenKey: string
  voiceId: string
  onNavigate: (node: FocusedNode) => void
  onClose: () => void
}) {
  const [genAudio, setGenAudio] = useState(false)
  const [audio, setAudio] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioCache = useRef<Map<string, string>>(new Map())

  // Reset audio when node changes
  useEffect(() => {
    const cached = audioCache.current.get(node.id)
    setAudio(cached ?? null)
  }, [node.id])

  async function generateAudio() {
    if (!elevenKey || !voiceId) return
    const cached = audioCache.current.get(node.id)
    if (cached) { setAudio(cached); setTimeout(() => audioRef.current?.play(), 100); return }

    setGenAudio(true)
    const bulletText = node.children?.map(c => c.texto).join('. ') ?? ''
    const text = node.explicacion + (bulletText ? ` Los puntos clave son: ${bulletText}.` : '')

    try {
      const res = await fetch('/api/irs-video/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId, apiKey: elevenKey }),
      })
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob())
        audioCache.current.set(node.id, url)
        setAudio(url)
        setTimeout(() => audioRef.current?.play(), 100)
      }
    } catch { /* ignore */ }
    setGenAudio(false)
  }

  const prev = allNodes[node.navIndex - 1]
  const next = allNodes[node.navIndex + 1]
  const isCenter = node.type === 'center'

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-white border-t-4 shadow-2xl max-h-[55%] flex flex-col"
      style={{ borderColor: node.color }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100" style={{ background: node.color + '12' }}>
        <span className="text-3xl leading-none">{isCenter ? node.emoji : (node.type === 'branch' ? node.emoji : '•')}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: node.color }}>
            {node.type === 'center' ? 'Tema central' : node.type === 'branch' ? 'Categoría' : 'Punto específico'}
          </p>
          <h2 className="text-base font-bold text-gray-900 leading-tight">{node.texto}</h2>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="text-sm text-gray-700 leading-relaxed">{node.explicacion}</p>

        {node.children && node.children.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {node.type === 'center' ? 'Temas del mapa' : 'Puntos clave'}
            </p>
            <ul className="space-y-2">
              {node.children.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: c.color }} />
                  <span className="text-sm text-gray-600">{c.texto}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 flex-wrap bg-gray-50">
        {/* Audio */}
        <div className="flex items-center gap-2">
          {!audio ? (
            <button
              onClick={generateAudio}
              disabled={genAudio || !elevenKey || !voiceId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: node.color }}
            >
              {genAudio
                ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando…</>
                : <>🎙 Generar audio</>}
            </button>
          ) : (
            <>
              <button onClick={() => audioRef.current?.paused ? audioRef.current.play() : audioRef.current?.pause()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: node.color }}>
                ▶ Reproducir
              </button>
              <button onClick={generateAudio} disabled={genAudio}
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2.5 py-1.5">
                {genAudio ? '…' : '↺ Regenerar'}
              </button>
            </>
          )}
          {!elevenKey && (
            <span className="text-xs text-gray-400">Configura ElevenLabs para activar audio</span>
          )}
          {audio && <audio ref={audioRef} src={audio} className="hidden" />}
        </div>

        {/* Navigation */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-gray-400 mr-1">{node.navIndex + 1}/{allNodes.length}</span>
          <button onClick={() => prev && onNavigate(prev)} disabled={!prev}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-30">
            ← Anterior
          </button>
          <button onClick={() => next && onNavigate(next)} disabled={!next}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-30"
            style={{ background: next ? node.color : '#9ca3af' }}>
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════
   Main Page
════════════════════════════ */
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
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [elevenKey, setElevenKey] = useState('')
  const [voices, setVoices] = useState<ElevenVoice[]>([])
  const [voiceId, setVoiceId] = useState('')
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [scriptOpen, setScriptOpen] = useState(false)
  const [focusedNode, setFocusedNode] = useState<FocusedNode | null>(null)
  const [allNodes, setAllNodes] = useState<FocusedNode[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('elevenlabs_key')
    const savedVoice = localStorage.getItem('elevenlabs_voice')
    if (saved) setElevenKey(saved)
    if (savedVoice) setVoiceId(savedVoice)
    loadNoticias()
  }, [])

  async function loadNoticias() {
    setLoadingNews(true); setMapa(null); setGuion(''); setFocusedNode(null)
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
    setGenerating(true); setMapa(null); setGuion(''); setFocusedNode(null)
    const res = await fetch('/api/irs-video/noticias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: item.title, summary: item.summary, spanishSummary: item.spanishSummary }),
    })
    if (res.ok) { const data = await res.json(); setMapa(data.mapaJson); setGuion(data.guionCompleto) }
    setGenerating(false)
  }

  async function loadVoices() {
    if (!elevenKey) return
    localStorage.setItem('elevenlabs_key', elevenKey)
    setLoadingVoices(true)
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': elevenKey } })
    if (res.ok) {
      const data = await res.json(); const list: ElevenVoice[] = data.voices ?? []
      setVoices(list); if (list.length && !voiceId) { setVoiceId(list[0].voice_id); localStorage.setItem('elevenlabs_voice', list[0].voice_id) }
    }
    setLoadingVoices(false)
  }

  function handleNodeClick(node: FocusedNode, nodes: FocusedNode[]) {
    setFocusedNode(node); setAllNodes(nodes)
  }

  function handleNavigate(node: FocusedNode) {
    setFocusedNode(node)
  }

  const selected = noticias[selectedIdx]

  return (
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

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={loadNoticias} disabled={loadingNews} className="btn-secondary text-xs px-2.5 py-1.5">
            {loadingNews ? '…' : '↺'} Cargar
          </button>
          {selected?.spanishSummary && (
            <button onClick={() => setSummaryOpen(v => !v)} className={`btn-secondary text-xs px-2.5 py-1.5 ${summaryOpen ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : ''}`}>📰 Resumen</button>
          )}
          <button onClick={() => { setShowHistory(v => !v); if (!showHistory) loadHistory() }} className={`btn-secondary text-xs px-2.5 py-1.5 ${showHistory ? 'bg-[var(--bg-hover)]' : ''}`}>🕒 Historial</button>
          <button onClick={() => setShowSettings(v => !v)} className={`btn-secondary text-xs px-2.5 py-1.5 ${showSettings ? 'bg-[var(--bg-hover)]' : ''}`}>⚙️</button>
          <button onClick={generateContent} disabled={!selected || generating} className="btn-primary text-xs flex items-center gap-1.5">
            {generating ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando…</> : '⚡ Generar mapa'}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)] flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <p className="label">API Key ElevenLabs</p>
            <input type="password" value={elevenKey} onChange={e => setElevenKey(e.target.value)} placeholder="sk-..." className="input text-xs" />
          </div>
          <button onClick={loadVoices} disabled={!elevenKey || loadingVoices} className="btn-secondary text-xs whitespace-nowrap mb-0.5">
            {loadingVoices ? '…' : 'Cargar voces'}
          </button>
          {voices.length > 0 && (
            <div className="flex-1 min-w-40">
              <p className="label">Voz</p>
              <select value={voiceId} onChange={e => { setVoiceId(e.target.value); localStorage.setItem('elevenlabs_voice', e.target.value) }} className="input text-xs">
                {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
              </select>
            </div>
          )}
          {voiceId && <p className="text-xs text-green-500 mb-0.5">✓ Audio listo por nodo</p>}
        </div>
      )}

      {/* Summary */}
      {summaryOpen && selected?.spanishSummary && (
        <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--bg-border)] bg-blue-500/5">
          <p className="text-xs text-gray-400 leading-relaxed">{selected.spanishSummary}</p>
        </div>
      )}

      {/* Script (collapsible) */}
      {guion && (
        <div className="flex-shrink-0 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)]">
          <button onClick={() => setScriptOpen(v => !v)} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] text-left">
            <span className="text-xs font-medium text-[var(--text-secondary)]">📜 Guion narrado ({guion.split(' ').length} palabras)</span>
            <svg className={`w-3.5 h-3.5 text-gray-500 ml-auto transition-transform ${scriptOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {scriptOpen && <div className="px-4 pb-3"><textarea readOnly value={guion} className="input resize-none text-xs leading-relaxed w-full" rows={4} /></div>}
        </div>
      )}

      {/* Main: history sidebar + map */}
      <div className="flex flex-1 min-h-0">
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
                  <button key={item.id} onClick={() => { setMapa(item.mapaJson); setGuion(item.guionCompleto); setShowHistory(false); setFocusedNode(null) }}
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
              <svg className="w-16 h-16 opacity-15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-gray-500">Selecciona una noticia y genera el mapa</p>
                <p className="text-xs text-gray-400">Cada nodo tendrá una explicación detallada y audio profesional</p>
              </div>
            </div>
          )}
          {generating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-50">
              <svg className="w-10 h-10 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              <div className="text-center">
                <p className="text-sm text-gray-600 font-medium">Generando mapa educativo con IA…</p>
                <p className="text-xs text-gray-400 mt-1">5 temas · 15 puntos · explicaciones detalladas</p>
              </div>
            </div>
          )}
          {mapa && (
            <>
              <MindMap mapa={mapa} focusedId={focusedNode?.id ?? null} onNodeClick={handleNodeClick} />
              {focusedNode && (
                <NodePanel
                  node={focusedNode}
                  allNodes={allNodes}
                  elevenKey={elevenKey}
                  voiceId={voiceId}
                  onNavigate={handleNavigate}
                  onClose={() => setFocusedNode(null)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

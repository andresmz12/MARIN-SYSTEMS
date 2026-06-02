'use client'

import { useEffect, useRef, useState } from 'react'

/* ── Types ── */
interface NewsItem {
  id: string
  title: string
  summary: string
  spanishSummary?: string | null
  url: string
  publishedAt: string
}
interface HistoryItem {
  id: string
  titulo: string
  guionCompleto: string
  mapaJson: MapaJson
  createdAt: string
}
interface MapaHijo { id: string; texto: string; color: string }
interface MapaRama { id: string; emoji: string; texto: string; color: string; hijos: MapaHijo[] }
interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string }
  ramas: MapaRama[]
}
interface ElevenVoice { voice_id: string; name: string }
interface DrawPath { d: string; color: string; size: number }

/* ── Map layout — 5 branches × 3 children ── */
const CX = 1200
const CY = 750
const BRANCH_R = 370
const CHILD_R = 255
const BRANCH_ANGLES = [-126, -54, 18, 90, 162]
const RAD = (d: number) => (d * Math.PI) / 180
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"

function bp(angle: number) {
  return { x: CX + BRANCH_R * Math.cos(RAD(angle)), y: CY + BRANCH_R * Math.sin(RAD(angle)) }
}
function cp(angle: number, idx: number) {
  const { x: bx, y: by } = bp(angle)
  const offsets = [-40, 0, 40]
  const a = angle + (offsets[idx] ?? 0)
  return { x: bx + CHILD_R * Math.cos(RAD(a)), y: by + CHILD_R * Math.sin(RAD(a)) }
}
function qcurve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  return `M ${x1} ${y1} Q ${mx - dy * 0.18} ${my + dx * 0.18} ${x2} ${y2}`
}
function wrap(text: string, max: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= max) cur = next
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text.slice(0, max)]
}

const PEN_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#000000', '#ffffff']

/* ════════════════════════════════════════
   Interactive Mind Map
════════════════════════════════════════ */
function MindMap({ mapa, onExport }: { mapa: MapaJson; onExport?: (fn: () => void) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const [tf, setTf] = useState({ x: 0, y: 0, scale: 1 })
  const tfRef = useRef({ x: 0, y: 0, scale: 1 })
  const dragState = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

  const [mode, setMode] = useState<'pan' | 'draw'>('pan')
  const [penColor, setPenColor] = useState('#dc2626')
  const [penSize, setPenSize] = useState(4)
  const [drawings, setDrawings] = useState<DrawPath[]>([])
  const [liveD, setLiveD] = useState<string | null>(null)
  const isDrawing = useRef(false)
  const livePts = useRef('')

  useEffect(() => { tfRef.current = tf }, [tf])

  function center() {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const scale = Math.min(width / (CX * 2 + 400), height / (CY * 2 + 300)) * 0.82
    setTf({ x: width / 2 - CX * scale, y: height / 2 - CY * scale, scale })
  }

  useEffect(() => { center() }, [])

  // Register export callback
  useEffect(() => {
    if (onExport) onExport(exportPng)
  })

  // Non-passive wheel for zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      setTf(t => {
        const ns = Math.min(5, Math.max(0.1, t.scale * factor))
        return { scale: ns, x: mx - (mx - t.x) * (ns / t.scale), y: my - (my - t.y) * (ns / t.scale) }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  function toMap(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect()
    const t = tfRef.current
    return { x: (clientX - rect.left - t.x) / t.scale, y: (clientY - rect.top - t.y) / t.scale }
  }

  function onPointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (mode === 'pan') {
      dragState.current = { sx: e.clientX, sy: e.clientY, ox: tfRef.current.x, oy: tfRef.current.y }
    } else {
      isDrawing.current = true
      const { x, y } = toMap(e.clientX, e.clientY)
      livePts.current = `M ${x.toFixed(1)} ${y.toFixed(1)}`
      setLiveD(livePts.current)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (mode === 'pan' && dragState.current) {
      setTf(t => ({ ...t, x: dragState.current!.ox + e.clientX - dragState.current!.sx, y: dragState.current!.oy + e.clientY - dragState.current!.sy }))
    } else if (mode === 'draw' && isDrawing.current) {
      const { x, y } = toMap(e.clientX, e.clientY)
      livePts.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
      setLiveD(livePts.current)
    }
  }

  function onPointerUp() {
    dragState.current = null
    if (mode === 'draw' && isDrawing.current && livePts.current) {
      setDrawings(prev => [...prev, { d: livePts.current, color: penColor, size: penSize }])
      livePts.current = ''
      setLiveD(null)
    }
    isDrawing.current = false
  }

  function exportPng() {
    const svg = svgRef.current
    const el = containerRef.current
    if (!svg || !el) return
    const { width, height } = el.getBoundingClientRect()

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(width))
    clone.setAttribute('height', String(height))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    // Reset transform to centered view
    const scale = Math.min(width / (CX * 2 + 400), height / (CY * 2 + 300)) * 0.82
    const tx = width / 2 - CX * scale
    const ty = height / 2 - CY * scale
    const g = clone.querySelector('g')
    if (g) g.setAttribute('transform', `translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${scale.toFixed(4)})`)

    const svgStr = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const dpr = Math.max(window.devicePixelRatio, 2)
      const canvas = document.createElement('canvas')
      canvas.width = width * dpr
      canvas.height = height * dpr
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#fafafa'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      canvas.toBlob(pngBlob => {
        if (!pngBlob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(pngBlob)
        a.download = 'mapa-irs.png'
        a.click()
      }, 'image/png')
    }
    img.onerror = () => {
      // Fallback: download SVG
      const a = document.createElement('a')
      a.href = url
      a.download = 'mapa-irs.svg'
      a.click()
    }
    img.src = url
  }

  const gTransform = `translate(${tf.x.toFixed(1)},${tf.y.toFixed(1)}) scale(${tf.scale.toFixed(4)})`

  // Use actual branches from mapa (up to 5)
  const branches = mapa.ramas.slice(0, 5)
  const angles = BRANCH_ANGLES.slice(0, branches.length)

  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-gray-200">
          <button onClick={() => setMode('pan')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'pan' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>🖐 Mover</button>
          <button onClick={() => setMode('draw')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'draw' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>✏️ Rayar</button>
        </div>

        {mode === 'draw' && (
          <>
            <div className="flex gap-1 items-center">
              {PEN_COLORS.map(c => (
                <button key={c} onClick={() => setPenColor(c)}
                  style={{ background: c, border: penColor === c ? '3px solid #1d4ed8' : '2px solid #d1d5db' }}
                  className="w-6 h-6 rounded-full transition-all" />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Grosor</span>
              {[2, 4, 7, 12].map(s => (
                <button key={s} onClick={() => setPenSize(s)} className={`flex items-center justify-center rounded ${penSize === s ? 'bg-blue-100' : 'hover:bg-gray-100'} w-7 h-7`}>
                  <div style={{ width: s * 2, height: s * 2, background: penColor, borderRadius: '50%' }} />
                </button>
              ))}
            </div>
            <button onClick={() => setDrawings([])} className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded px-2 py-1 transition-colors">🗑 Borrar</button>
          </>
        )}

        <div className="ml-auto flex gap-2">
          <button onClick={exportPng} className="text-xs text-gray-500 border border-gray-200 rounded px-2.5 py-1 hover:bg-gray-50 transition-colors">⬇ PNG</button>
          <button onClick={center} className="text-xs text-gray-500 border border-gray-200 rounded px-2.5 py-1 hover:bg-gray-50 transition-colors">⊙ Centrar</button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden"
        style={{ background: '#fafafa', cursor: mode === 'draw' ? 'crosshair' : 'grab', touchAction: 'none', userSelect: 'none' }}>
        <svg ref={svgRef} width="100%" height="100%"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
          style={{ display: 'block' }}>
          <defs>
            <pattern id="grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.2" fill="#e5e7eb" />
            </pattern>
            <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="6" floodOpacity="0.10" /></filter>
          </defs>

          <rect width="100%" height="100%" fill="#fafafa" />
          <rect width="100%" height="100%" fill="url(#grid)" />

          <g transform={gTransform}>
            {/* Lines center → branches */}
            {branches.map((rama, i) => {
              const b = bp(angles[i] ?? 0)
              return <path key={`lc${i}`} d={qcurve(CX, CY, b.x, b.y)} stroke={rama.color} strokeWidth="5" fill="none" strokeLinecap="round" strokeOpacity="0.4" />
            })}

            {/* Lines branches → children */}
            {branches.map((rama, i) =>
              rama.hijos.slice(0, 3).map((hijo, j) => {
                const b = bp(angles[i] ?? 0)
                const c = cp(angles[i] ?? 0, j)
                return <path key={`lch${i}${j}`} d={qcurve(b.x, b.y, c.x, c.y)} stroke={hijo.color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeOpacity="0.45" strokeDasharray="8 4" />
              })
            )}

            {/* Center node */}
            {(() => {
              const lines = wrap(mapa.centro.texto, 12)
              const ry = Math.max(65, lines.length * 24 + 42)
              return (
                <g filter="url(#sh)">
                  <ellipse cx={CX} cy={CY} rx={128} ry={ry} fill={mapa.centro.color} />
                  <text x={CX} y={CY - ry + 30} textAnchor="middle" fontSize="28" fontFamily={FONT}>{mapa.centro.emoji}</text>
                  {lines.map((line, li) => (
                    <text key={li} x={CX} y={CY - ry + 64 + li * 24}
                      textAnchor="middle" fontFamily={FONT} fontSize="17" fontWeight="800" fill="white" letterSpacing="0.3">{line}</text>
                  ))}
                </g>
              )
            })()}

            {/* Branch nodes */}
            {branches.map((rama, i) => {
              const b = bp(angles[i] ?? 0)
              const lines = wrap(rama.texto, 13)
              const ry = Math.max(56, lines.length * 21 + 40)
              return (
                <g key={`b${i}`} filter="url(#sh)">
                  <ellipse cx={b.x} cy={b.y} rx={112} ry={ry} fill="white" stroke={rama.color} strokeWidth="3.5" />
                  <text x={b.x} y={b.y - ry + 26} textAnchor="middle" fontSize="22" fontFamily={FONT}>{rama.emoji}</text>
                  {lines.map((line, li) => (
                    <text key={li} x={b.x} y={b.y - ry + 52 + li * 21}
                      textAnchor="middle" fontFamily={FONT} fontSize="15" fontWeight="700" fill={rama.color}>{line}</text>
                  ))}
                </g>
              )
            })}

            {/* Child nodes */}
            {branches.map((rama, i) =>
              rama.hijos.slice(0, 3).map((hijo, j) => {
                const c = cp(angles[i] ?? 0, j)
                const lines = wrap(hijo.texto, 20)
                const rw = 200
                const rh = Math.max(44, lines.length * 21 + 18)
                return (
                  <g key={`ch${i}${j}`} filter="url(#sh)">
                    <rect x={c.x - rw / 2} y={c.y - rh / 2} width={rw} height={rh} rx="12" fill="white" stroke={hijo.color} strokeWidth="2" />
                    <rect x={c.x - rw / 2} y={c.y - rh / 2} width={6} height={rh} rx="6" fill={hijo.color} />
                    {lines.map((line, li) => (
                      <text key={li} x={c.x + 5} y={c.y + (li - (lines.length - 1) / 2) * 21 + 5}
                        textAnchor="middle" fontFamily={FONT} fontSize="13" fontWeight="600" fill="#111827">{line}</text>
                    ))}
                  </g>
                )
              })
            )}

            {/* User drawings */}
            {drawings.map((dr, i) => (
              <path key={i} d={dr.d} stroke={dr.color} strokeWidth={dr.size} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
            ))}
            {liveD && (
              <path d={liveD} stroke={penColor} strokeWidth={penSize} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
            )}
          </g>
        </svg>

        <div className="absolute bottom-3 left-3 text-xs text-gray-400 pointer-events-none">
          {mode === 'pan' ? 'Arrastra para mover · Scroll para zoom' : 'Dibuja sobre el mapa'}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   Main Page
════════════════════════════════════════ */
export default function IrsVideoPage() {
  const [noticias, setNoticias] = useState<NewsItem[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loadingNews, setLoadingNews] = useState(false)
  const [mapa, setMapa] = useState<MapaJson | null>(null)
  const [guion, setGuion] = useState('')
  const [generating, setGenerating] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [summaryOpen, setSummaryOpen] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [elevenKey, setElevenKey] = useState('')
  const [voices, setVoices] = useState<ElevenVoice[]>([])
  const [voiceId, setVoiceId] = useState('')
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [generatingAudio, setGeneratingAudio] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioReady, setAudioReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('elevenlabs_key')
    if (saved) setElevenKey(saved)
    loadNoticias()
  }, [])

  async function loadNoticias() {
    setLoadingNews(true)
    setMapa(null); setGuion(''); setAudioUrl(null); setAudioReady(false)
    const res = await fetch('/api/irs-news')
    if (res.ok) {
      const data: NewsItem[] = await res.json()
      setNoticias(data)
      setSelectedIdx(0)
    }
    setLoadingNews(false)
  }

  async function loadHistory() {
    setLoadingHistory(true)
    const res = await fetch('/api/irs-video/history')
    if (res.ok) setHistory(await res.json())
    setLoadingHistory(false)
  }

  async function generateContent() {
    const item = noticias[selectedIdx]
    if (!item) return
    setGenerating(true); setMapa(null); setGuion(''); setAudioUrl(null); setAudioReady(false)
    const res = await fetch('/api/irs-video/noticias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        summary: item.summary,
        spanishSummary: item.spanishSummary,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setMapa(data.mapaJson)
      setGuion(data.guionCompleto)
    }
    setGenerating(false)
  }

  async function loadVoices() {
    if (!elevenKey) return
    localStorage.setItem('elevenlabs_key', elevenKey)
    setLoadingVoices(true)
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': elevenKey } })
    if (res.ok) {
      const data = await res.json()
      const list: ElevenVoice[] = data.voices ?? []
      setVoices(list)
      if (list.length) setVoiceId(list[0].voice_id)
    }
    setLoadingVoices(false)
  }

  async function generateAudio() {
    if (!guion || !voiceId || !elevenKey) return
    setGeneratingAudio(true); setAudioReady(false)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }
    const res = await fetch('/api/irs-video/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: guion, voiceId, apiKey: elevenKey }),
    })
    if (res.ok) { setAudioUrl(URL.createObjectURL(await res.blob())); setAudioReady(true) }
    setGeneratingAudio(false)
  }

  const selected = noticias[selectedIdx]

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 80px)', minHeight: 600 }}>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)]">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg">🎬</span>
          <h1 className="text-base font-bold text-[var(--text-primary)]">IRS Video Creator</h1>
        </div>

        {noticias.length > 0 ? (
          <select value={selectedIdx} onChange={e => setSelectedIdx(Number(e.target.value))} className="input flex-1 min-w-0 max-w-sm text-xs">
            {noticias.map((n, i) => (
              <option key={n.id} value={i}>{n.title.slice(0, 70)}{n.title.length > 70 ? '…' : ''}</option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-gray-500">Ve a IRS News y actualiza las noticias primero</p>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={loadNoticias} disabled={loadingNews} className="btn-secondary text-xs flex items-center gap-1.5">
            {loadingNews ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg> : '↺'}
            Cargar
          </button>

          <button
            onClick={() => { setShowHistory(v => !v); if (!showHistory) loadHistory() }}
            className={`btn-secondary text-xs flex items-center gap-1.5 ${showHistory ? 'bg-[var(--bg-hover)]' : ''}`}
          >🕒 Historial</button>

          <button onClick={generateContent} disabled={!selected || generating} className="btn-primary text-xs flex items-center gap-1.5">
            {generating
              ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando…</>
              : '⚡ Generar mapa'}
          </button>
        </div>
      </div>

      {/* Spanish summary of selected article */}
      {selected?.spanishSummary && (
        <div className="border-b border-[var(--bg-border)] bg-blue-500/5">
          <button
            onClick={() => setSummaryOpen(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-blue-500/10 transition-colors text-left"
          >
            <span className="text-xs text-blue-400 font-medium">📰 Resumen del artículo seleccionado</span>
            <svg className={`w-3.5 h-3.5 text-blue-400 ml-auto transition-transform ${summaryOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {summaryOpen && (
            <p className="px-4 pb-3 text-xs text-gray-400 leading-relaxed">{selected.spanishSummary}</p>
          )}
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* History sidebar */}
        {showHistory && (
          <div className="w-72 flex-shrink-0 border-r border-[var(--bg-border)] bg-[var(--bg-sidebar)] flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 border-b border-[var(--bg-border)] flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--text-primary)]">Mapas generados</p>
              <button onClick={() => setShowHistory(false)} className="text-gray-600 hover:text-gray-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8 text-gray-600 text-xs">Cargando…</div>
              ) : history.length === 0 ? (
                <div className="py-8 px-3 text-center text-xs text-gray-600">Aún no hay mapas guardados.<br />Genera uno para verlo aquí.</div>
              ) : (
                <div className="divide-y divide-[var(--bg-border)]">
                  {history.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setMapa(item.mapaJson); setGuion(item.guionCompleto); setShowHistory(false) }}
                      className="w-full text-left px-3 py-3 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <p className="text-xs font-medium text-[var(--text-primary)] line-clamp-2 leading-snug">{item.titulo}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(item.createdAt).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Map area */}
        <div className="flex-1 min-w-0 relative">
          {!mapa && !generating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400 bg-gray-50">
              <svg className="w-14 h-14 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
              <p className="text-sm font-medium">Selecciona una noticia y haz clic en <strong>⚡ Generar mapa</strong></p>
              <p className="text-xs">5 ramas · 15 puntos · mapa interactivo</p>
            </div>
          )}
          {generating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50">
              <svg className="w-10 h-10 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              <p className="text-sm text-gray-500 font-medium">Generando mapa con 5 ramas y 15 puntos…</p>
              <p className="text-xs text-gray-400">Esto tarda unos segundos</p>
            </div>
          )}
          {mapa && <MindMap mapa={mapa} />}
        </div>
      </div>

      {/* Audio panel */}
      <div className="border-t border-[var(--bg-border)] bg-[var(--bg-sidebar)] flex-shrink-0">
        <button onClick={() => setPanelOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-hover)] transition-colors">
          <div className="flex items-center gap-2">
            <span>🎧</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">Panel de audio</span>
            {audioReady && <span className="text-xs text-green-500 font-medium">✅ Audio listo</span>}
          </div>
          <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${panelOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>

        {panelOpen && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="label">Guion ({guion ? `${guion.split(' ').length} palabras` : 'no generado'})</p>
                <textarea readOnly value={guion} placeholder="El guion aparecerá aquí…" className="input resize-none text-xs leading-relaxed" rows={4} />
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="label">API Key de ElevenLabs</p>
                    <input type="password" value={elevenKey} onChange={e => setElevenKey(e.target.value)} placeholder="sk-..." className="input text-xs" />
                  </div>
                  <div className="pt-5">
                    <button onClick={loadVoices} disabled={!elevenKey || loadingVoices} className="btn-secondary text-xs whitespace-nowrap">
                      {loadingVoices ? '…' : 'Cargar voces'}
                    </button>
                  </div>
                </div>
                {voices.length > 0 && (
                  <div>
                    <p className="label">Voz</p>
                    <select value={voiceId} onChange={e => setVoiceId(e.target.value)} className="input text-xs">
                      {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button onClick={generateAudio} disabled={!guion || !voiceId || !elevenKey || generatingAudio} className="btn-primary text-xs flex items-center gap-1.5">
                    {generatingAudio ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando…</> : '🎙 Generar Audio'}
                  </button>
                  {audioUrl && (
                    <>
                      <button onClick={() => audioRef.current?.paused ? audioRef.current.play() : audioRef.current?.pause()} className="btn-secondary text-xs">▶ Reproducir</button>
                      <button onClick={() => { const a = document.createElement('a'); a.href = audioUrl!; a.download = 'guion-irs.mp3'; a.click() }} className="btn-secondary text-xs">⬇ MP3</button>
                    </>
                  )}
                </div>
                {audioUrl && <audio ref={audioRef} src={audioUrl} className="w-full mt-1" controls />}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

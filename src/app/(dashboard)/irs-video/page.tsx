'use client'

import { useEffect, useRef, useState } from 'react'

/* ── Types ── */
interface NewsItem { id: string; title: string; summary: string; url: string; publishedAt: string }
interface MapaHijo { id: string; texto: string; color: string }
interface MapaRama { id: string; emoji: string; texto: string; color: string; hijos: MapaHijo[] }
interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string }
  ramas: MapaRama[]
}
interface ElevenVoice { voice_id: string; name: string }

/* ── Layout constants ── */
const W = 1400
const H = 860
const CX = W / 2
const CY = H / 2
const BRANCH_R = 290
const CHILD_R = 175
const BRANCH_ANGLES = [-115, -40, 40, 115]
const RAD = (d: number) => (d * Math.PI) / 180
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"

function branchPos(angle: number) {
  return { x: CX + BRANCH_R * Math.cos(RAD(angle)), y: CY + BRANCH_R * Math.sin(RAD(angle)) }
}
function childPos(angle: number, idx: number) {
  const { x: bx, y: by } = branchPos(angle)
  const a = angle + ([-30, 30][idx] ?? 0)
  return { x: bx + CHILD_R * Math.cos(RAD(a)), y: by + CHILD_R * Math.sin(RAD(a)) }
}
function curve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  return `M ${x1} ${y1} Q ${mx - dy * 0.15} ${my + dx * 0.15} ${x2} ${y2}`
}
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= maxChars) cur = next
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text.slice(0, maxChars)]
}

/* ── Interactive Mind Map ── */
function MindMap({ mapa }: { mapa: MapaJson }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tf, setTf] = useState({ x: 0, y: 0, scale: 1 })
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    drag.current = { startX: e.clientX, startY: e.clientY, ox: tf.x, oy: tf.y }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current) return
    setTf(t => ({ ...t, x: drag.current!.ox + e.clientX - drag.current!.startX, y: drag.current!.oy + e.clientY - drag.current!.startY }))
  }
  function onMouseUp() { drag.current = null }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setTf(t => {
      const ns = Math.min(4, Math.max(0.25, t.scale * delta))
      return {
        scale: ns,
        x: mx - (mx - t.x) * (ns / t.scale),
        y: my - (my - t.y) * (ns / t.scale),
      }
    })
  }

  function resetView() { setTf({ x: 0, y: 0, scale: 1 }) }

  // Touch support
  const lastTouchDist = useRef<number | null>(null)
  const lastTouchMid = useRef<{ x: number; y: number } | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      drag.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, ox: tf.x, oy: tf.y }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastTouchDist.current = Math.hypot(dx, dy)
      lastTouchMid.current = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 }
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 1 && drag.current) {
      setTf(t => ({ ...t, x: drag.current!.ox + e.touches[0].clientX - drag.current!.startX, y: drag.current!.oy + e.touches[0].clientY - drag.current!.startY }))
    } else if (e.touches.length === 2 && lastTouchDist.current && lastTouchMid.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const mid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 }
      const delta = dist / lastTouchDist.current
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        const mx = mid.x - rect.left, my = mid.y - rect.top
        setTf(t => {
          const ns = Math.min(4, Math.max(0.25, t.scale * delta))
          return { scale: ns, x: mx - (mx - t.x) * (ns / t.scale), y: my - (my - t.y) * (ns / t.scale) }
        })
      }
      lastTouchDist.current = dist
      lastTouchMid.current = mid
    }
  }
  function onTouchEnd() { drag.current = null; lastTouchDist.current = null }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative select-none overflow-hidden bg-white"
      style={{ cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Reset button */}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={resetView}
        className="absolute top-3 right-3 z-10 bg-white/90 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors shadow-sm"
      >
        ⊙ Restablecer
      </button>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', width: '100%', height: '100%', transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`, transformOrigin: '0 0', willChange: 'transform' }}
      >
        <defs>
          <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.3" fill="#e5e7eb" />
          </pattern>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* Background */}
        <rect width={W} height={H} fill="#fafafa" />
        <rect width={W} height={H} fill="url(#dots)" />

        {/* Lines center → branches */}
        {mapa.ramas.map((rama, i) => {
          const bp = branchPos(BRANCH_ANGLES[i] ?? 0)
          return <path key={`lc${i}`} d={curve(CX, CY, bp.x, bp.y)} stroke={rama.color} strokeWidth="4" fill="none" strokeLinecap="round" strokeOpacity="0.5" />
        })}

        {/* Lines branches → children */}
        {mapa.ramas.map((rama, i) =>
          rama.hijos.map((hijo, j) => {
            const bp = branchPos(BRANCH_ANGLES[i] ?? 0)
            const cp = childPos(BRANCH_ANGLES[i] ?? 0, j)
            return <path key={`lr${i}h${j}`} d={curve(bp.x, bp.y, cp.x, cp.y)} stroke={hijo.color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeOpacity="0.5" strokeDasharray="6 3" />
          })
        )}

        {/* ── Center node ── */}
        {(() => {
          const lines = wrapText(mapa.centro.texto, 12)
          const totalH = 28 + lines.length * 22
          const ry = Math.max(58, totalH / 2 + 14)
          return (
            <g filter="url(#shadow)">
              <ellipse cx={CX} cy={CY} rx={115} ry={ry} fill={mapa.centro.color} />
              {/* emoji */}
              <text x={CX} y={CY - ry + 32} textAnchor="middle" fontSize="24" fontFamily={FONT}>{mapa.centro.emoji}</text>
              {/* text lines */}
              {lines.map((line, li) => (
                <text key={li}
                  x={CX}
                  y={CY - ry + 32 + 28 + li * 22}
                  textAnchor="middle"
                  fontFamily={FONT}
                  fontSize="17"
                  fontWeight="700"
                  fill="white"
                  letterSpacing="0.3"
                >{line}</text>
              ))}
            </g>
          )
        })()}

        {/* ── Branch nodes ── */}
        {mapa.ramas.map((rama, i) => {
          const bp = branchPos(BRANCH_ANGLES[i] ?? 0)
          const lines = wrapText(rama.texto, 12)
          const totalH = 26 + lines.length * 20
          const ry = Math.max(50, totalH / 2 + 12)
          return (
            <g key={`rama${i}`} filter="url(#shadow)">
              <ellipse cx={bp.x} cy={bp.y} rx={100} ry={ry} fill="white" stroke={rama.color} strokeWidth="3" />
              {/* colored top band */}
              <ellipse cx={bp.x} cy={bp.y - ry + 16} rx={100} ry={16} fill={rama.color} opacity="0.15" />
              {/* emoji */}
              <text x={bp.x} y={bp.y - ry + 22} textAnchor="middle" fontSize="20" fontFamily={FONT}>{rama.emoji}</text>
              {/* text */}
              {lines.map((line, li) => (
                <text key={li}
                  x={bp.x}
                  y={bp.y - ry + 22 + 26 + li * 20}
                  textAnchor="middle"
                  fontFamily={FONT}
                  fontSize="14"
                  fontWeight="700"
                  fill={rama.color}
                  letterSpacing="0.2"
                >{line}</text>
              ))}
            </g>
          )
        })}

        {/* ── Child nodes ── */}
        {mapa.ramas.map((rama, i) =>
          rama.hijos.map((hijo, j) => {
            const cp = childPos(BRANCH_ANGLES[i] ?? 0, j)
            const lines = wrapText(hijo.texto, 16)
            const rw = 148
            const rh = 16 + lines.length * 19 + 10
            return (
              <g key={`h${i}${j}`} filter="url(#shadow)">
                <rect x={cp.x - rw / 2} y={cp.y - rh / 2} width={rw} height={rh} rx="10" fill="white" stroke={hijo.color} strokeWidth="2.5" />
                {/* left color bar */}
                <rect x={cp.x - rw / 2} y={cp.y - rh / 2} width={5} height={rh} rx="10" fill={hijo.color} opacity="0.8" />
                {lines.map((line, li) => (
                  <text key={li}
                    x={cp.x + 3}
                    y={cp.y + (li - (lines.length - 1) / 2) * 19 + 6}
                    textAnchor="middle"
                    fontFamily={FONT}
                    fontSize="13"
                    fontWeight="600"
                    fill="#1f2937"
                  >{line}</text>
                ))}
              </g>
            )
          })
        )}
      </svg>
    </div>
  )
}

/* ══════════════════════════════════════════════════
   Main Page
════════════════════════════════════════════════════ */
export default function IrsVideoPage() {
  const [noticias, setNoticias] = useState<NewsItem[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loadingNews, setLoadingNews] = useState(false)
  const [mapa, setMapa] = useState<MapaJson | null>(null)
  const [guion, setGuion] = useState('')
  const [generating, setGenerating] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
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
    // Use the same saved IRS news as the IRS News page
    const res = await fetch('/api/irs-news')
    if (res.ok) {
      const data: NewsItem[] = await res.json()
      setNoticias(data)
      setSelectedIdx(0)
    }
    setLoadingNews(false)
  }

  async function generateContent() {
    if (!noticias[selectedIdx]) return
    const { title, summary } = noticias[selectedIdx]
    setGenerating(true); setMapa(null); setGuion(''); setAudioUrl(null); setAudioReady(false)
    const res = await fetch('/api/irs-video/noticias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary }),
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
    if (res.ok) {
      const blob = await res.blob()
      setAudioUrl(URL.createObjectURL(blob))
      setAudioReady(true)
    }
    setGeneratingAudio(false)
  }

  function downloadAudio() {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl; a.download = 'guion-irs.mp3'; a.click()
  }

  const selected = noticias[selectedIdx]

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 80px)', minHeight: 600 }}>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap py-3 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">🎬</span>
          <h1 className="text-base font-bold text-[var(--text-primary)] truncate">IRS Video Creator</h1>
        </div>

        {noticias.length > 0 && (
          <select value={selectedIdx} onChange={(e) => setSelectedIdx(Number(e.target.value))} className="input max-w-xs text-xs">
            {noticias.map((n, i) => (
              <option key={n.id} value={i}>{n.title.slice(0, 60)}{n.title.length > 60 ? '…' : ''}</option>
            ))}
          </select>
        )}

        <button onClick={loadNoticias} disabled={loadingNews} className="btn-secondary text-xs flex items-center gap-1.5">
          {loadingNews
            ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
            : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          }
          Cargar noticias
        </button>

        <button onClick={generateContent} disabled={!selected || generating} className="btn-primary text-xs flex items-center gap-1.5">
          {generating
            ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando mapa…</>
            : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Generar mapa</>
          }
        </button>
      </div>

      {/* Map area */}
      <div className="flex-1 min-h-0 bg-white relative">
        {!mapa && !generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-gray-400">
            <svg className="w-16 h-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            <p className="text-sm font-medium">Carga noticias y haz clic en <strong>Generar mapa</strong></p>
            <p className="text-xs text-gray-400">Arrastra para mover · Scroll para zoom · Pellizca en iPad</p>
          </div>
        )}
        {generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
            <svg className="w-10 h-10 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
            <p className="text-sm font-medium text-gray-500">Generando mapa conceptual con IA…</p>
          </div>
        )}
        {mapa && <MindMap mapa={mapa} />}
      </div>

      {/* Audio panel */}
      <div className="border-t border-[var(--bg-border)] bg-[var(--bg-sidebar)]">
        <button onClick={() => setPanelOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-hover)] transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-sm">🎧</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">Panel de audio</span>
            {audioReady && <span className="text-xs font-medium text-green-500">✅ Audio listo — pon el audio en tus AirPods y graba el mapa</span>}
          </div>
          <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${panelOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {panelOpen && (
          <div className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="label">Guion ({guion ? `${guion.split(' ').length} palabras` : 'no generado'})</p>
                <textarea readOnly value={guion} placeholder="El guion aparecerá aquí después de generar el mapa…" className="input resize-none text-xs leading-relaxed" rows={4} />
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="label">API Key de ElevenLabs</p>
                    <input type="password" value={elevenKey} onChange={(e) => setElevenKey(e.target.value)} placeholder="sk-..." className="input text-xs" />
                  </div>
                  <div className="pt-5">
                    <button onClick={loadVoices} disabled={!elevenKey || loadingVoices} className="btn-secondary text-xs whitespace-nowrap">
                      {loadingVoices ? '…' : 'Cargar mis voces'}
                    </button>
                  </div>
                </div>
                {voices.length > 0 && (
                  <div>
                    <p className="label">Voz</p>
                    <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="input text-xs">
                      {voices.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button onClick={generateAudio} disabled={!guion || !voiceId || !elevenKey || generatingAudio} className="btn-primary text-xs flex items-center gap-1.5">
                    {generatingAudio ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando audio…</> : '🎙 Generar Audio'}
                  </button>
                  {audioUrl && (
                    <>
                      <button onClick={() => audioRef.current?.paused ? audioRef.current.play() : audioRef.current?.pause()} className="btn-secondary text-xs">▶ Reproducir</button>
                      <button onClick={downloadAudio} className="btn-secondary text-xs">⬇ Descargar MP3</button>
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

'use client'

import { useEffect, useRef, useState } from 'react'

/* ── Types ── */
interface RssItem { title: string; summary: string; url: string; pubDate: string }
interface MapaHijo { id: string; texto: string; color: string }
interface MapaRama { id: string; emoji: string; texto: string; color: string; hijos: MapaHijo[] }
interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string }
  ramas: MapaRama[]
}
interface ElevenVoice { voice_id: string; name: string }

/* ── Layout constants ── */
const W = 1200
const H = 750
const CX = W / 2
const CY = H / 2
const BRANCH_R = 240
const CHILD_R = 145
const BRANCH_ANGLES = [-120, -45, 45, 120]
const RAD = (d: number) => (d * Math.PI) / 180

/* ── Helpers ── */
function branchPos(angle: number) {
  return { x: CX + BRANCH_R * Math.cos(RAD(angle)), y: CY + BRANCH_R * Math.sin(RAD(angle)) }
}
function childPos(angle: number, idx: number) {
  const { x: bx, y: by } = branchPos(angle)
  const spread = [-28, 28][idx] ?? 0
  const a = angle + spread
  return { x: bx + CHILD_R * Math.cos(RAD(a)), y: by + CHILD_R * Math.sin(RAD(a)) }
}
function curve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  const cpx = mx - dy * 0.12, cpy = my + dx * 0.12
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`
}

/* Wrap text at maxChars per line */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= maxChars) { cur = next }
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text.slice(0, maxChars)]
}

/* ── Mind Map SVG ── */
function MindMap({ mapa }: { mapa: MapaJson }) {
  const fontStyle = "'Caveat', cursive"

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      style={{ display: 'block', background: 'white' }}
    >
      <defs>
        {/* GoodNotes dot pattern */}
        <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#d1d5db" />
        </pattern>
      </defs>

      {/* Background */}
      <rect width={W} height={H} fill="white" />
      <rect width={W} height={H} fill="url(#dots)" />

      {/* ── Lines center → branches ── */}
      {mapa.ramas.map((rama, i) => {
        const angle = BRANCH_ANGLES[i] ?? 0
        const bp = branchPos(angle)
        return (
          <path key={`lc${i}`}
            d={curve(CX, CY, bp.x, bp.y)}
            stroke={rama.color} strokeWidth="3.5" fill="none"
            strokeLinecap="round" strokeOpacity="0.7"
          />
        )
      })}

      {/* ── Lines branches → children ── */}
      {mapa.ramas.map((rama, i) => {
        const angle = BRANCH_ANGLES[i] ?? 0
        const bp = branchPos(angle)
        return rama.hijos.map((hijo, j) => {
          const cp = childPos(angle, j)
          return (
            <path key={`lr${i}h${j}`}
              d={curve(bp.x, bp.y, cp.x, cp.y)}
              stroke={hijo.color} strokeWidth="2" fill="none"
              strokeLinecap="round" strokeOpacity="0.8"
            />
          )
        })
      })}

      {/* ── Center node ── */}
      <ellipse cx={CX} cy={CY} rx={96} ry={52}
        fill={mapa.centro.color} />
      <text x={CX} y={CY - 10} textAnchor="middle"
        fontFamily={fontStyle} fontSize="26" fill="white">
        {mapa.centro.emoji}
      </text>
      {wrapText(mapa.centro.texto, 14).map((line, i, arr) => (
        <text key={i} x={CX}
          y={CY + 8 + (i - (arr.length - 1) / 2) * 19}
          textAnchor="middle"
          fontFamily={fontStyle} fontSize="17" fontWeight="700" fill="white">
          {line}
        </text>
      ))}

      {/* ── Branch nodes ── */}
      {mapa.ramas.map((rama, i) => {
        const angle = BRANCH_ANGLES[i] ?? 0
        const bp = branchPos(angle)
        const lines = wrapText(rama.texto, 13)
        return (
          <g key={`rama${i}`}>
            <ellipse cx={bp.x} cy={bp.y} rx={82} ry={44}
              fill="white" stroke={rama.color} strokeWidth="3" />
            <text x={bp.x} y={bp.y - 8} textAnchor="middle"
              fontFamily={fontStyle} fontSize="22">
              {rama.emoji}
            </text>
            {lines.map((line, li) => (
              <text key={li} x={bp.x}
                y={bp.y + 8 + (li - (lines.length - 1) / 2) * 17}
                textAnchor="middle"
                fontFamily={fontStyle} fontSize="15" fontWeight="700" fill={rama.color}>
                {line}
              </text>
            ))}
          </g>
        )
      })}

      {/* ── Child nodes ── */}
      {mapa.ramas.map((rama, i) => {
        const angle = BRANCH_ANGLES[i] ?? 0
        return rama.hijos.map((hijo, j) => {
          const cp = childPos(angle, j)
          const lines = wrapText(hijo.texto, 15)
          const rw = 118, rh = 18 + lines.length * 18
          return (
            <g key={`h${i}${j}`}>
              <rect x={cp.x - rw / 2} y={cp.y - rh / 2} width={rw} height={rh}
                rx="10" fill="white" stroke={hijo.color} strokeWidth="2" />
              {lines.map((line, li) => (
                <text key={li} x={cp.x}
                  y={cp.y + (li - (lines.length - 1) / 2) * 17 + 6}
                  textAnchor="middle"
                  fontFamily={fontStyle} fontSize="13" fontWeight="600" fill={hijo.color}>
                  {line}
                </text>
              ))}
            </g>
          )
        })
      })}
    </svg>
  )
}

/* ══════════════════════════════════════════════════
   Main Page
════════════════════════════════════════════════════ */
export default function IrsVideoPage() {
  /* News */
  const [noticias, setNoticias] = useState<RssItem[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loadingNews, setLoadingNews] = useState(false)

  /* Map / script */
  const [mapa, setMapa] = useState<MapaJson | null>(null)
  const [guion, setGuion] = useState('')
  const [generating, setGenerating] = useState(false)

  /* Audio panel */
  const [panelOpen, setPanelOpen] = useState(true)
  const [elevenKey, setElevenKey] = useState('')
  const [voices, setVoices] = useState<ElevenVoice[]>([])
  const [voiceId, setVoiceId] = useState('')
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [generatingAudio, setGeneratingAudio] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioReady, setAudioReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  /* Load saved ElevenLabs key */
  useEffect(() => {
    const saved = localStorage.getItem('elevenlabs_key')
    if (saved) setElevenKey(saved)
  }, [])

  async function loadNoticias() {
    setLoadingNews(true)
    setMapa(null)
    setGuion('')
    setAudioUrl(null)
    setAudioReady(false)
    const res = await fetch('/api/irs-video/noticias')
    if (res.ok) {
      const data = await res.json()
      setNoticias(data)
      setSelectedIdx(0)
    }
    setLoadingNews(false)
  }

  async function generateContent() {
    if (!noticias[selectedIdx]) return
    const { title, summary } = noticias[selectedIdx]
    setGenerating(true)
    setMapa(null)
    setGuion('')
    setAudioUrl(null)
    setAudioReady(false)
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
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': elevenKey },
    })
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
    setGeneratingAudio(true)
    setAudioReady(false)
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    const res = await fetch('/api/irs-video/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: guion, voiceId, apiKey: elevenKey }),
    })

    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setAudioReady(true)
    }
    setGeneratingAudio(false)
  }

  function downloadAudio() {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = 'guion-irs.mp3'
    a.click()
  }

  const selected = noticias[selectedIdx]

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 80px)', minHeight: 600 }}>

      {/* ── Top toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap py-3 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">🎬</span>
          <h1 className="text-base font-bold text-[var(--text-primary)] truncate">IRS Video Creator</h1>
        </div>

        {/* News selector */}
        {noticias.length > 0 && (
          <select
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
            className="input max-w-xs text-xs"
          >
            {noticias.map((n, i) => (
              <option key={i} value={i}>{n.title.slice(0, 55)}{n.title.length > 55 ? '…' : ''}</option>
            ))}
          </select>
        )}

        <button
          onClick={loadNoticias}
          disabled={loadingNews}
          className="btn-secondary text-xs flex items-center gap-1.5"
        >
          {loadingNews ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Cargar noticias
        </button>

        <button
          onClick={generateContent}
          disabled={!selected || generating}
          className="btn-primary text-xs flex items-center gap-1.5"
        >
          {generating ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Generando mapa…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generar mapa
            </>
          )}
        </button>
      </div>

      {/* ── Map area ── */}
      <div className="flex-1 min-h-0 overflow-hidden bg-white relative">
        {!mapa && !generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-gray-400">
            <svg className="w-16 h-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-sm font-medium">Carga noticias y haz clic en <strong>Generar mapa</strong></p>
            <p className="text-xs text-gray-400">El mapa se optimiza para iPad horizontal</p>
          </div>
        )}

        {generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400 bg-white">
            <svg className="w-10 h-10 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm font-medium text-gray-500">Generando mapa conceptual con IA…</p>
          </div>
        )}

        {mapa && <MindMap mapa={mapa} />}
      </div>

      {/* ── Audio panel ── */}
      <div className="border-t border-[var(--bg-border)] bg-[var(--bg-sidebar)]">
        {/* Panel toggle header */}
        <button
          onClick={() => setPanelOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-hover)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🎧</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">Panel de audio</span>
            {audioReady && (
              <span className="text-xs font-medium text-green-500 flex items-center gap-1">
                ✅ Audio listo — pon el audio en tus AirPods y graba el mapa
              </span>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${panelOpen ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {panelOpen && (
          <div className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Left: Script preview */}
              <div>
                <p className="label">Guion ({guion ? `${guion.split(' ').length} palabras` : 'no generado'})</p>
                <textarea
                  readOnly
                  value={guion}
                  placeholder="El guion aparecerá aquí después de generar el mapa…"
                  className="input resize-none text-xs leading-relaxed"
                  rows={4}
                />
              </div>

              {/* Right: ElevenLabs controls */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="label">API Key de ElevenLabs</p>
                    <input
                      type="password"
                      value={elevenKey}
                      onChange={(e) => setElevenKey(e.target.value)}
                      placeholder="sk-..."
                      className="input text-xs"
                    />
                  </div>
                  <div className="pt-5">
                    <button
                      onClick={loadVoices}
                      disabled={!elevenKey || loadingVoices}
                      className="btn-secondary text-xs whitespace-nowrap"
                    >
                      {loadingVoices ? '…' : 'Cargar mis voces'}
                    </button>
                  </div>
                </div>

                {voices.length > 0 && (
                  <div>
                    <p className="label">Voz</p>
                    <select
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      className="input text-xs"
                    >
                      {voices.map((v) => (
                        <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    onClick={generateAudio}
                    disabled={!guion || !voiceId || !elevenKey || generatingAudio}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    {generatingAudio ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Generando audio…
                      </>
                    ) : '🎙 Generar Audio'}
                  </button>

                  {audioUrl && (
                    <>
                      <button
                        onClick={() => audioRef.current?.paused ? audioRef.current.play() : audioRef.current?.pause()}
                        className="btn-secondary text-xs flex items-center gap-1.5"
                      >
                        ▶ Reproducir
                      </button>
                      <button
                        onClick={downloadAudio}
                        className="btn-secondary text-xs flex items-center gap-1.5"
                      >
                        ⬇ Descargar MP3
                      </button>
                    </>
                  )}
                </div>

                {audioUrl && (
                  <audio ref={audioRef} src={audioUrl} className="w-full mt-1" controls />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { MindMap, NodePanel, PresentationOverlay, MapaJson, FocusedNode, Alignment } from '@/components/video-creator/MindMapSVG'
import { useToast } from '@/components/ui/Toast'

/* ── Types ── */
interface HistoryItem {
  id: string
  tema: string
  redSocial: string
  duracion: string
  mapaJson: MapaJson
  guion: string
  titulo: string
  hashtags: string[]
  createdAt: string
}

const SOCIAL_OPTIONS = ['TikTok', 'Instagram', 'Facebook', 'YouTube'] as const
const DURATION_OPTIONS = ['30s', '45s', '60s'] as const
const MARKERS = ['[INTRO]', '[R1]', '[R2]', '[R3]', '[R4]', '[CTA]']
const MAX_RECENT = 10

type SocialOption = typeof SOCIAL_OPTIONS[number]
type DurationOption = typeof DURATION_OPTIONS[number]

export default function ContentCreatorPage() {
  const { toast } = useToast()
  /* ── Form state ── */
  const [tema, setTema] = useState('')
  const [redSocial, setRedSocial] = useState<SocialOption>('TikTok')
  const [duracion, setDuracion] = useState<DurationOption>('60s')

  /* ── Generation state ── */
  const [generating, setGenerating] = useState(false)
  const [mapa, setMapa] = useState<MapaJson | null>(null)
  const [guion, setGuion] = useState('')
  const [titulo, setTitulo] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])

  /* ── Audio state ── */
  const [generatingAudio, setGeneratingAudio] = useState(false)
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [alignment, setAlignment] = useState<Alignment | null>(null)
  const [sectionTimestamps, setSectionTimestamps] = useState<number[]>([])

  /* ── UI state ── */
  const [scriptOpen, setScriptOpen] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const [focusedNode, setFocusedNode] = useState<FocusedNode | null>(null)
  const [allNodes, setAllNodes] = useState<FocusedNode[]>([])

  /* ── Studio Link state ── */
  const [generatingStudio, setGeneratingStudio] = useState(false)
  const [studioUrl, setStudioUrl] = useState<string | null>(null)
  const [studioCopied, setStudioCopied] = useState(false)

  /* ── History ── */
  const [recentTopics, setRecentTopics] = useState<string[]>([])
  const [dbHistory, setDbHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cc_recent_topics')
      if (saved) setRecentTopics(JSON.parse(saved) as string[])
    } catch { /* ignore */ }
  }, [])

  function saveRecentTopic(t: string) {
    setRecentTopics(prev => {
      const updated = [t, ...prev.filter(x => x !== t)].slice(0, MAX_RECENT)
      localStorage.setItem('cc_recent_topics', JSON.stringify(updated))
      return updated
    })
  }

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/content-creator/generar')
      if (res.ok) setDbHistory(await res.json())
    } catch { /* ignore */ }
    setLoadingHistory(false)
  }

  async function generateContent() {
    if (!tema.trim()) return
    setGenerating(true)
    setMapa(null); setGuion(''); setTitulo(''); setHashtags([])
    setAudioSrc(null); setAlignment(null); setFocusedNode(null)

    try {
      const res = await fetch('/api/content-creator/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema: tema.trim(), redSocial, duracion }),
      })
      if (res.ok) {
        const data: { mapaJson: MapaJson; guion: string; titulo: string; hashtags: string[] } = await res.json()
        if (data.mapaJson) {
          setMapa(data.mapaJson)
          setGuion(data.guion ?? '')
          setTitulo(data.titulo ?? '')
          setHashtags(data.hashtags ?? [])
          saveRecentTopic(tema.trim())
        } else {
          toast.error('La IA no generó un mapa válido. Intenta de nuevo.')
        }
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? `Error al generar contenido (${res.status})`)
      }
    } catch {
      toast.error('Error de conexión. Verifica tu internet e intenta de nuevo.')
    }
    setGenerating(false)
  }

  async function generateAudio() {
    if (!guion) return
    setGeneratingAudio(true)
    if (audioSrc) { URL.revokeObjectURL(audioSrc); setAudioSrc(null) }
    const cleanGuion = guion.replace(/\[(INTRO|R[1-4]|CTA)\]\s*/g, '')
    try {
      const res = await fetch('/api/irs-video/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanGuion }),
      })
      if (res.ok) {
        const blob = await res.blob()
        setAudioSrc(URL.createObjectURL(blob))
        setAlignment(null)
        setSectionTimestamps([])
        toast.success('Audio listo — ponlo en AirPods y graba')
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? `Error al generar audio (${res.status})`)
      }
    } catch {
      toast.error('Error de conexión al generar audio.')
    }
    setGeneratingAudio(false)
  }

  function loadFromHistory(item: HistoryItem) {
    setMapa(item.mapaJson)
    setGuion(item.guion)
    setTitulo(item.titulo)
    setHashtags(item.hashtags)
    setTema(item.tema)
    setRedSocial(item.redSocial as SocialOption)
    setDuracion(item.duracion as DurationOption)
    setAudioSrc(null); setAlignment(null); setFocusedNode(null)
    setShowHistory(false)
  }

  async function generateStudioLink() {
    if (!mapa || !guion) return
    setGeneratingStudio(true)
    setStudioUrl(null)
    try {
      const res = await fetch('/api/studio/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapaJson: mapa, guion, tema, redSocial, duracion }),
      })
      const body = await res.json() as { url?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setStudioUrl(body.url!)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error generando Studio Link')
    }
    setGeneratingStudio(false)
  }

  function copyStudioUrl() {
    if (!studioUrl) return
    navigator.clipboard.writeText(studioUrl).then(() => {
      setStudioCopied(true)
      setTimeout(() => setStudioCopied(false), 2000)
    })
  }

  const hasMap = !!mapa
  const hasAudio = !!audioSrc

  return (
    <>
      {/* Presentation Mode */}
      {presentationMode && mapa && (
        <PresentationOverlay
          mapa={mapa} script={guion} audioSrc={audioSrc}
          alignment={alignment} sectionTimestamps={sectionTimestamps}
          markers={MARKERS}
          onExit={() => setPresentationMode(false)}
        />
      )}

      {/* Studio Link modal */}
      {studioUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">📱 Studio Link listo</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Ábrelo en tu iPad — mapa fullscreen + audio</p>
              </div>
              <button onClick={() => setStudioUrl(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl leading-none">×</button>
            </div>
            <div className="flex gap-2">
              <input readOnly value={studioUrl} className="input flex-1 text-xs font-mono" />
              <button onClick={copyStudioUrl} className="btn-primary text-xs px-3 whitespace-nowrap">
                {studioCopied ? '✅' : '📋 Copiar'}
              </button>
            </div>
            <a href={studioUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs w-full flex items-center justify-center gap-1.5">
              🔗 Abrir en nueva pestaña
            </a>
            <p className="text-[10px] text-[var(--text-muted)] text-center">Expira en 24 horas</p>
          </div>
        </div>
      )}

      <div className="flex flex-col" style={{ height: 'calc(100vh - 80px)', minHeight: 600 }}>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)] flex-shrink-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-lg">🎬</span>
            <h1 className="text-base font-bold text-[var(--text-primary)]">Content Creator</h1>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
            <button onClick={() => { setShowHistory(v => !v); if (!showHistory) loadHistory() }} className={`btn-secondary text-xs px-2.5 py-1.5 ${showHistory ? 'bg-[var(--bg-hover)]' : ''}`}>🕒 Historial</button>
            {hasMap && (
              <button onClick={generateAudio} disabled={generatingAudio} className="btn-secondary text-xs flex items-center gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 disabled:opacity-50">
                {generatingAudio
                  ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando…</>
                  : `🎙 ${hasAudio ? 'Regenerar audio' : 'Generar audio con Angie'}`}
              </button>
            )}
            {hasMap && (
              <button
                onClick={generateStudioLink}
                disabled={generatingStudio}
                className="btn-secondary text-xs flex items-center gap-1.5 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-50"
              >
                {generatingStudio
                  ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando…</>
                  : '📱 Studio Link'}
              </button>
            )}
            {hasMap && (
              <button onClick={() => setPresentationMode(true)} className="btn-primary text-xs flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-blue-600 border-0">
                🎬 Modo Presentación
              </button>
            )}
          </div>
        </div>

        {/* Script panel */}
        {guion && (
          <div className="flex-shrink-0 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)]">
            <button onClick={() => setScriptOpen(v => !v)} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] text-left">
              <span className="text-xs font-medium text-[var(--text-secondary)]">📜 Guion ({guion.split(' ').length} palabras)</span>
              {hasAudio && <span className="text-xs text-green-500 ml-1">🎙 Audio listo — Angie 🇨🇴</span>}
              <svg className={`w-3.5 h-3.5 text-gray-500 ml-auto transition-transform ${scriptOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {scriptOpen && (
              <div className="px-4 pb-3 flex gap-2 items-start">
                <textarea readOnly value={guion} className="input resize-none text-xs leading-relaxed flex-1" rows={5} />
                {audioSrc && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <audio src={audioSrc} controls className="w-56" />
                    <button onClick={() => { const a = document.createElement('a'); a.href = audioSrc!; a.download = 'audio-angie.mp3'; a.click() }} className="btn-secondary text-xs">⬇ MP3</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Main layout */}
        <div className="flex flex-1 min-h-0">

          {/* Left panel */}
          <div className="w-80 flex-shrink-0 border-r border-[var(--bg-border)] bg-[var(--bg-sidebar)] flex flex-col overflow-y-auto">
            <div className="p-4 space-y-4">

              {/* Topic input */}
              <div>
                <label className="label">Tema del video</label>
                <textarea
                  value={tema}
                  onChange={e => setTema(e.target.value)}
                  placeholder="Ej: Cómo abrir una LLC siendo indocumentado"
                  className="input resize-none text-sm"
                  rows={3}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generateContent() }}
                />
              </div>

              {/* Social network */}
              <div>
                <label className="label">Red social</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {SOCIAL_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => setRedSocial(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        redSocial === s
                          ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                          : 'border-[var(--bg-border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="label">Duración objetivo</label>
                <div className="flex gap-2 mt-1">
                  {DURATION_OPTIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setDuracion(d)}
                      className={`flex-1 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        duracion === d
                          ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                          : 'border-[var(--bg-border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={generateContent}
                disabled={!tema.trim() || generating}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
              >
                {generating
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Generando…</>
                  : '✨ Generar'}
              </button>

              {/* Recent topics */}
              {recentTopics.length > 0 && (
                <div>
                  <p className="label mb-2">Recientes</p>
                  <div className="space-y-1">
                    {recentTopics.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => setTema(t)}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors truncate border border-transparent hover:border-[var(--bg-border)]"
                        title={t}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* DB History sidebar */}
          {showHistory && (
            <div className="w-64 flex-shrink-0 border-r border-[var(--bg-border)] bg-[var(--bg-sidebar)] flex flex-col overflow-hidden">
              <div className="px-3 py-2.5 border-b border-[var(--bg-border)] flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--text-primary)]">Historial</p>
                <button onClick={() => setShowHistory(false)} className="text-gray-600 hover:text-gray-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-[var(--bg-border)]">
                {loadingHistory
                  ? <div className="py-8 text-center text-xs text-gray-600">Cargando…</div>
                  : dbHistory.length === 0
                  ? <div className="py-8 px-3 text-center text-xs text-gray-600">Aún no hay mapas guardados.</div>
                  : dbHistory.map(item => (
                    <button key={item.id} onClick={() => loadFromHistory(item)}
                      className="w-full text-left px-3 py-3 hover:bg-[var(--bg-hover)]">
                      <p className="text-xs font-medium text-[var(--text-primary)] line-clamp-2 leading-snug">{item.titulo || item.tema}</p>
                      <div className="flex gap-1 mt-1">
                        <span className="text-[10px] text-gray-500 bg-gray-700/30 px-1.5 py-0.5 rounded">{item.redSocial}</span>
                        <span className="text-[10px] text-gray-500 bg-gray-700/30 px-1.5 py-0.5 rounded">{item.duracion}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{new Date(item.createdAt).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Main map area */}
          <div className="flex-1 min-w-0 flex flex-col relative">

            {/* Title & hashtags when map is generated */}
            {titulo && (
              <div className="flex-shrink-0 px-5 py-3 border-b border-[var(--bg-border)] bg-[var(--bg-sidebar)]">
                <h2 className="text-sm font-bold text-[var(--text-primary)] leading-snug">{titulo}</h2>
                {hashtags.length > 0 && (
                  <p className="text-xs text-blue-400 mt-1">{hashtags.join(' ')}</p>
                )}
              </div>
            )}

            {/* Empty state */}
            {!mapa && !generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-gray-400 bg-gray-50">
                <svg className="w-16 h-16 opacity-15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-medium text-gray-500">Escribe un tema y genera tu mapa</p>
                  <p className="text-xs text-gray-400">Luego genera el audio → Modo Presentación → graba con tu celular</p>
                </div>
              </div>
            )}

            {/* Loading state */}
            {generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-50">
                <svg className="w-10 h-10 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <div className="text-center">
                  <p className="text-sm text-gray-600 font-medium">Generando mapa de contenido con IA…</p>
                  <p className="text-xs text-gray-400 mt-1">4 categorías · 8 puntos · guion estructurado</p>
                </div>
              </div>
            )}

            {/* Mind map */}
            {mapa && (
              <div className="flex-1 min-h-0 relative">
                <MindMap
                  mapa={mapa}
                  focusedId={focusedNode?.id ?? null}
                  presentationMode={false}
                  onNodeClick={(node, all) => { setFocusedNode(node); setAllNodes(all) }}
                />
                {focusedNode && (
                  <NodePanel
                    node={focusedNode}
                    allNodes={allNodes}
                    onNavigate={n => setFocusedNode(n)}
                    onClose={() => setFocusedNode(null)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

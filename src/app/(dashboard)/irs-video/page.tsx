'use client'

import { useEffect, useState } from 'react'
import { MindMap, NodePanel, PresentationOverlay, MapaJson, FocusedNode, Alignment, extractSectionTimestamps } from '@/components/video-creator/MindMapSVG'

/* ── Page-specific types ── */
interface NewsItem {
  id: string; title: string; summary: string
  spanishSummary?: string | null; url: string; publishedAt: string
}
interface HistoryItem {
  id: string; titulo: string; guionCompleto: string; mapaJson: MapaJson; createdAt: string
}
interface ElevenVoice { voice_id: string; name: string }

/* ── Section markers for IRS Video (5 branches) ── */
const MARKERS = ['[INTRO]', '[R1]', '[R2]', '[R3]', '[R4]', '[R5]', '[CTA]']

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
        const ts = extractSectionTimestamps(data.alignment, guion, MARKERS)
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
          markers={MARKERS}
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

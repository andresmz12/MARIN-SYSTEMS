'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const MapEditor = dynamic(() => import('@/components/studio/MapEditor'), { ssr: false })

interface NewsItem {
  id: string; title: string; summary: string
  spanishSummary?: string | null; url: string; publishedAt: string
}

const LOADING_MSGS = ['Generando mapa educativo...', 'Elaborando el guion...', 'Preparando tu Studio...']
type PageState = 'form' | 'loading' | 'edit' | 'done'

export default function IrsVideoPage() {
  const { toast } = useToast()
  const [pageState,  setPageState]  = useState<PageState>('form')
  const [noticias,   setNoticias]   = useState<NewsItem[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loadingNews, setLoadingNews] = useState(false)
  const [loadingIdx,  setLoadingIdx]  = useState(0)
  const [studioUrl,  setStudioUrl]  = useState('')
  const [token,      setToken]      = useState('')
  const [mapaJson,   setMapaJson]   = useState<any>(null)
  const [guion,      setGuion]      = useState('')
  const [copied,     setCopied]     = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)

  useEffect(() => { loadNoticias() }, [])

  useEffect(() => {
    if (pageState !== 'loading') return
    const id = setInterval(() => setLoadingIdx(i => (i + 1) % LOADING_MSGS.length), 3000)
    return () => clearInterval(id)
  }, [pageState])

  async function loadNoticias() {
    setLoadingNews(true)
    try {
      const res = await fetch('/api/irs-video/noticias')
      if (res.ok) { const data: NewsItem[] = await res.json(); setNoticias(data); setSelectedIdx(0) }
    } catch { /* ignore */ }
    setLoadingNews(false)
  }

  async function handleGenerate() {
    const item = noticias[selectedIdx]
    if (!item) return
    setPageState('loading'); setLoadingIdx(0); setShowEdit(false)
    try {
      const res  = await fetch('/api/irs-video/noticias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, summary: item.summary, spanishSummary: item.spanishSummary }),
      })
      const data = await res.json() as { url?: string; token?: string; guionCompleto?: string; mapaJson?: any; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? `Error al generar mapa (${res.status})`)
        setPageState('form'); return
      }
      setStudioUrl(data.url); setToken(data.token ?? '')
      setMapaJson(data.mapaJson ?? null); setGuion(data.guionCompleto ?? '')
      setPageState('edit')
    } catch {
      toast.error('Error de conexión. Verifica tu internet e intenta de nuevo.')
      setPageState('form')
    }
  }

  function handleSaved(newMapa: any, newGuion: string) { setMapaJson(newMapa); setGuion(newGuion) }

  function handleCopyGuion() {
    navigator.clipboard.writeText(guion).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  function handleCopyLink() {
    navigator.clipboard.writeText(studioUrl).then(() => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000) })
  }
  function handleReset() {
    setPageState('form'); setStudioUrl(''); setToken(''); setMapaJson(null)
    setGuion(''); setCopied(false); setCopiedLink(false); setShowEdit(false)
  }

  return (
    <div className="flex flex-col items-center justify-start px-4 py-10 min-h-full">
      <div className="w-full max-w-xl">

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏛</span>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">IRS Video Creator</h1>
          </div>
          <Link href="/mis-mapas" className="text-xs text-cyan-300 hover:underline">📋 Mis Mapas</Link>
        </div>

        {/* FORM */}
        {pageState === 'form' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label">Noticia del IRS</label>
                <button onClick={loadNoticias} disabled={loadingNews} className="btn-secondary text-xs px-2.5 py-1">
                  {loadingNews ? '…' : '↺ Actualizar'}
                </button>
              </div>

              {loadingNews ? (
                <div className="input text-xs text-[var(--text-secondary)] py-3 text-center">Cargando noticias…</div>
              ) : noticias.length === 0 ? (
                <div className="input text-xs text-[var(--text-secondary)] py-3 text-center">
                  Ve a IRS News y actualiza las noticias primero
                </div>
              ) : (
                <select value={selectedIdx} onChange={e => setSelectedIdx(Number(e.target.value))} className="input text-sm mt-1">
                  {noticias.map((n, i) => (
                    <option key={n.id} value={i}>{n.title.length > 80 ? n.title.slice(0, 80) + '…' : n.title}</option>
                  ))}
                </select>
              )}

              {noticias[selectedIdx]?.spanishSummary && (
                <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
                  {noticias[selectedIdx].spanishSummary}
                </p>
              )}
            </div>

            <button onClick={handleGenerate} disabled={noticias.length === 0 || loadingNews}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-50">
              ⚡ Generar Video
            </button>
          </div>
        )}

        {/* LOADING */}
        {pageState === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-6 py-16">
            <svg className="w-10 h-10 animate-spin text-cyan-300" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-[var(--text-secondary)] font-medium">{LOADING_MSGS[loadingIdx]}</p>
          </div>
        )}

        {/* EDIT */}
        {pageState === 'edit' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-green-500 font-bold text-base">
              <span>✅</span><span>¡Mapa generado!</span>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowEdit(e => !e)}
                className="btn-secondary flex-1 py-2.5 text-sm flex items-center justify-center gap-1.5">
                ✏️ {showEdit ? 'Ocultar edición' : 'Editar mapa y guion'}
              </button>
              <button onClick={handleGenerate}
                className="btn-secondary px-4 py-2.5 text-sm flex items-center justify-center gap-1.5">
                🔄 Regenerar
              </button>
            </div>

            {!showEdit && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Guion</p>
                <textarea readOnly value={guion} className="input resize-none text-sm leading-relaxed" rows={6} style={{ minHeight: 100 }} />
              </div>
            )}

            {showEdit && mapaJson && (
              <div className="rounded-xl border border-[var(--bg-border)] p-4 bg-[var(--bg-sidebar)]">
                <MapEditor mapaJson={mapaJson} guion={guion} token={token} onSaved={handleSaved} />
              </div>
            )}

            <button onClick={() => setPageState('done')}
              className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
              ✅ Ver Studio Link
            </button>

            <button onClick={handleReset} className="btn-secondary w-full text-sm py-2.5 text-[var(--text-secondary)]">
              ✕ Descartar y crear otro
            </button>
          </div>
        )}

        {/* DONE */}
        {pageState === 'done' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-green-500 font-bold text-base">
              <span>✅</span><span>¡Video listo para grabar!</span>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">PASO 1 — Copia el guion</p>
              <textarea readOnly value={guion} className="input resize-none text-sm leading-relaxed" style={{ minHeight: 120 }} rows={8} />
              <button onClick={handleCopyGuion}
                className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
                {copied ? '✅ ¡Copiado!' : '📋 Copiar Guion para ElevenLabs'}
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">PASO 2 — Genera el audio</p>
              <button onClick={() => window.open('https://elevenlabs.io/app/speech-synthesis', '_blank')}
                className="btn-secondary w-full py-3 text-sm flex items-center justify-center gap-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                🎙 Abrir ElevenLabs
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">PASO 3 — Abre el mapa en iPad</p>
              <p className="text-xs text-cyan-300 break-all font-mono bg-[var(--bg-sidebar)] rounded-lg px-3 py-2 border border-[var(--bg-border)]">
                {studioUrl}
              </p>
              <div className="flex gap-2">
                <button onClick={() => window.open(studioUrl, '_blank')}
                  className="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2">
                  📱 Abrir Studio en iPad
                </button>
                <button onClick={handleCopyLink} className="btn-secondary px-4 py-3 text-sm whitespace-nowrap">
                  {copiedLink ? '✅ Copiado!' : '📋 Copiar Link'}
                </button>
              </div>
            </div>

            <button onClick={() => setPageState('edit')}
              className="btn-secondary w-full text-sm py-2.5 flex items-center justify-center gap-2">
              ✏️ Editar mapa
            </button>

            <hr className="border-[var(--bg-border)]" />

            <button onClick={handleReset} className="btn-secondary w-full text-sm py-3">
              + Crear otro video
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

interface RssItem { title: string; summary: string; url: string; pubDate: string }

type PageState = 'form' | 'loading' | 'done'

export default function IrsVideoPage() {
  const [noticias, setNoticias] = useState<RssItem[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loadingNews, setLoadingNews] = useState(false)
  const [pageState, setPageState] = useState<PageState>('form')
  const [studioUrl, setStudioUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => { loadNoticias() }, [])

  async function loadNoticias() {
    setLoadingNews(true)
    try {
      const res = await fetch('/api/irs-video/noticias')
      if (res.ok) {
        const data = await res.json()
        setNoticias(data)
        setSelectedIdx(0)
      }
    } finally {
      setLoadingNews(false)
    }
  }

  async function generate() {
    const item = noticias[selectedIdx]
    if (!item) return
    setPageState('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/irs-video/noticias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, summary: item.summary }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setStudioUrl(body.url)
      setPageState('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error desconocido')
      setPageState('form')
    }
  }

  function copy() {
    navigator.clipboard.writeText(studioUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const selected = noticias[selectedIdx]

  /* ── Loading state ── */
  if (pageState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-6" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <svg className="w-12 h-12 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <div className="text-center">
          <p className="text-[var(--text-primary)] font-semibold text-lg">Generando mapa + audio…</p>
          <p className="text-[var(--text-muted)] text-sm mt-1">Esto puede tomar hasta 30 segundos</p>
        </div>
      </div>
    )
  }

  /* ── Done state ── */
  if (pageState === 'done') {
    return (
      <div className="flex flex-col items-center justify-center gap-8 px-4" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <div className="text-center">
          <div className="text-5xl mb-4">🎬</div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">¡Tu estudio está listo!</h2>
          <p className="text-[var(--text-muted)] text-sm mt-1">Abre este enlace en tu iPad para ver el mapa y escuchar el audio</p>
        </div>

        <div className="card w-full max-w-lg p-4 flex items-center gap-3">
          <input
            readOnly
            value={studioUrl}
            className="input flex-1 text-xs font-mono"
          />
          <button onClick={copy} className="btn-primary text-sm whitespace-nowrap flex items-center gap-1.5">
            {copied ? '✅ Copiado' : '📋 Copiar'}
          </button>
        </div>

        <a
          href={studioUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm flex items-center gap-2"
        >
          <span>🔗</span> Abrir en nueva pestaña
        </a>

        <button
          onClick={() => { setPageState('form'); setStudioUrl('') }}
          className="text-[var(--text-muted)] text-sm hover:text-[var(--text-primary)] transition-colors"
        >
          ← Generar otro
        </button>
      </div>
    )
  }

  /* ── Form state ── */
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🎬</span>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">IRS Video Creator</h1>
          <p className="text-xs text-[var(--text-muted)]">Genera un mapa educativo + audio para TikTok desde noticias del IRS</p>
        </div>
      </div>

      {errorMsg && (
        <div className="card border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>
        </div>
      )}

      {/* News selector */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="label">Noticia del IRS</p>
          <button
            onClick={loadNoticias}
            disabled={loadingNews}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            {loadingNews ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : '↻'} Recargar
          </button>
        </div>

        {loadingNews ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm py-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Cargando noticias…
          </div>
        ) : noticias.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm">No se pudieron cargar noticias. Intenta recargar.</p>
        ) : (
          <div className="space-y-2">
            {noticias.map((n, i) => (
              <label
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedIdx === i
                    ? 'bg-indigo-500/15 border border-indigo-500/30'
                    : 'hover:bg-[var(--bg-hover)] border border-transparent'
                }`}
              >
                <input
                  type="radio"
                  name="noticia"
                  value={i}
                  checked={selectedIdx === i}
                  onChange={() => setSelectedIdx(i)}
                  className="mt-1 accent-indigo-500"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">{n.title}</p>
                  {n.summary && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{n.summary}</p>
                  )}
                  <p className="text-xs text-[var(--text-muted)] mt-1 opacity-60">
                    {new Date(n.pubDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="card p-4 space-y-2 border border-indigo-500/20">
          <p className="label">Seleccionada</p>
          <p className="text-sm text-[var(--text-primary)] font-medium">{selected.title}</p>
          {selected.summary && (
            <p className="text-xs text-[var(--text-muted)] line-clamp-3">{selected.summary}</p>
          )}
        </div>
      )}

      <button
        onClick={generate}
        disabled={!selected}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3"
      >
        <span>⚡</span>
        Generar mapa + audio
      </button>
    </div>
  )
}

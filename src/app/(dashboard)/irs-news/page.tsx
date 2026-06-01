'use client'

import { useEffect, useState } from 'react'

interface IrsNewsItem {
  id: string
  title: string
  summary: string
  url: string
  publishedAt: string
  used: boolean
}

type Platform = 'tiktok' | 'youtube' | 'facebook'

interface GeneratedContent {
  platform: Platform
  content: Record<string, unknown>
}

const PLATFORM_CONFIG: Record<Platform, { label: string; color: string; icon: string }> = {
  tiktok: { label: 'TikTok / Reels', color: 'bg-pink-500/20 border-pink-500/30 text-pink-400 hover:bg-pink-500/30', icon: '🎵' },
  youtube: { label: 'YouTube', color: 'bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30', icon: '▶' },
  facebook: { label: 'Facebook', color: 'bg-blue-500/20 border-blue-500/30 text-blue-400 hover:bg-blue-500/30', icon: 'f' },
}

export default function IrsNewsPage() {
  const [news, setNews] = useState<IrsNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ added: number; skipped: number } | null>(null)
  const [selectedNews, setSelectedNews] = useState<IrsNewsItem | null>(null)
  const [generating, setGenerating] = useState<Platform | null>(null)
  const [generated, setGenerated] = useState<GeneratedContent | null>(null)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unused' | 'used'>('all')

  useEffect(() => {
    loadNews()
  }, [])

  async function loadNews() {
    setLoading(true)
    const res = await fetch('/api/irs-news')
    if (res.ok) setNews(await res.json())
    setLoading(false)
  }

  async function handleFetch() {
    setFetching(true)
    setFetchResult(null)
    const res = await fetch('/api/irs-news/fetch', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setFetchResult(data)
      await loadNews()
    }
    setFetching(false)
  }

  async function handleGenerate(platform: Platform) {
    if (!selectedNews) return
    setGenerating(platform)
    setGenerated(null)
    const res = await fetch('/api/irs-news/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newsId: selectedNews.id, platform }),
    })
    if (res.ok) {
      const data = await res.json()
      setGenerated(data)
    }
    setGenerating(null)
  }

  async function toggleUsed(item: IrsNewsItem) {
    const res = await fetch('/api/irs-news', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, used: !item.used }),
    })
    if (res.ok) {
      setNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, used: !n.used } : n)))
      if (selectedNews?.id === item.id) setSelectedNews({ ...selectedNews, used: !selectedNews.used })
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function renderGeneratedContent(data: GeneratedContent) {
    const { platform, content } = data
    const c = content as Record<string, unknown>

    if (platform === 'tiktok') {
      const fullText = [
        `🎬 GUION (30-45 seg):\n${c.guion}`,
        `\n📝 PUNTOS CLAVE:\n${(c.puntosClave as string[])?.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
        `\n#️⃣ HASHTAGS:\n${(c.hashtags as string[])?.join(' ')}`,
      ].join('')

      return (
        <div className="space-y-4">
          <div>
            <p className="label">Guion (30-45 seg)</p>
            <p className="text-sm text-gray-300 bg-[#111] border border-[#2a2a2a] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{String(c.guion ?? '')}</p>
          </div>
          <div>
            <p className="label">Puntos clave para pantalla</p>
            <ul className="space-y-1">
              {(c.puntosClave as string[] ?? []).map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-pink-400 font-bold flex-shrink-0">{i + 1}.</span> {p}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label">Hashtags</p>
            <p className="text-sm text-pink-400">{(c.hashtags as string[] ?? []).join(' ')}</p>
          </div>
          <button onClick={() => copyToClipboard(fullText)} className="btn-secondary w-full">
            {copied ? '✓ Copiado' : 'Copiar todo'}
          </button>
        </div>
      )
    }

    if (platform === 'youtube') {
      const fullText = [
        `📹 TÍTULO:\n${c.titulo}`,
        `\n\n🎬 GUION (60-90 seg):\n${c.guion}`,
        `\n\n📄 DESCRIPCIÓN:\n${c.descripcion}`,
        `\n\n#️⃣ HASHTAGS:\n${(c.hashtags as string[])?.join(' ')}`,
      ].join('')

      return (
        <div className="space-y-4">
          <div>
            <p className="label">Título del video</p>
            <p className="text-sm text-white font-semibold bg-[#111] border border-[#2a2a2a] rounded-lg p-3">{String(c.titulo ?? '')}</p>
          </div>
          <div>
            <p className="label">Guion (60-90 seg)</p>
            <p className="text-sm text-gray-300 bg-[#111] border border-[#2a2a2a] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{String(c.guion ?? '')}</p>
          </div>
          <div>
            <p className="label">Descripción</p>
            <p className="text-sm text-gray-300 bg-[#111] border border-[#2a2a2a] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{String(c.descripcion ?? '')}</p>
          </div>
          <div>
            <p className="label">Hashtags</p>
            <p className="text-sm text-red-400">{(c.hashtags as string[] ?? []).join(' ')}</p>
          </div>
          <button onClick={() => copyToClipboard(fullText)} className="btn-secondary w-full">
            {copied ? '✓ Copiado' : 'Copiar todo'}
          </button>
        </div>
      )
    }

    const fullText = [
      `📣 CAPTION CORTO:\n${c.captionCorto}`,
      `\n\n📝 POST LARGO:\n${c.postLargo}`,
      `\n\n#️⃣ HASHTAGS:\n${(c.hashtags as string[])?.join(' ')}`,
    ].join('')

    return (
      <div className="space-y-4">
        <div>
          <p className="label">Caption corto</p>
          <p className="text-sm text-white font-medium bg-[#111] border border-[#2a2a2a] rounded-lg p-3">{String(c.captionCorto ?? '')}</p>
        </div>
        <div>
          <p className="label">Post largo</p>
          <p className="text-sm text-gray-300 bg-[#111] border border-[#2a2a2a] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{String(c.postLargo ?? '')}</p>
        </div>
        <div>
          <p className="label">Hashtags</p>
          <p className="text-sm text-blue-400">{(c.hashtags as string[] ?? []).join(' ')}</p>
        </div>
        <button onClick={() => copyToClipboard(fullText)} className="btn-secondary w-full">
          {copied ? '✓ Copiado' : 'Copiar todo'}
        </button>
      </div>
    )
  }

  const filtered = news.filter((n) => {
    if (filter === 'unused') return !n.used
    if (filter === 'used') return n.used
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">IRS News</h1>
          <p className="text-gray-500 text-sm mt-0.5">Noticias del IRS con generación de contenido para redes sociales</p>
        </div>
        <button
          onClick={handleFetch}
          disabled={fetching}
          className="btn-primary flex items-center gap-2"
        >
          {fetching ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Actualizando...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualizar noticias
            </>
          )}
        </button>
      </div>

      {fetchResult && (
        <div className="card border-green-500/30 bg-green-500/10">
          <p className="text-sm text-green-400">
            ✓ {fetchResult.added} noticia{fetchResult.added !== 1 ? 's' : ''} nueva{fetchResult.added !== 1 ? 's' : ''} agregada{fetchResult.added !== 1 ? 's' : ''} · {fetchResult.skipped} omitida{fetchResult.skipped !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'unused', 'used'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                : 'text-gray-500 hover:text-gray-300 bg-[#1a1a1a] border border-[#2a2a2a]'
            }`}
          >
            {f === 'all' ? 'Todas' : f === 'unused' ? 'Sin usar' : 'Usadas'}
            {f === 'all' && <span className="ml-1.5 text-gray-600">{news.length}</span>}
            {f === 'unused' && <span className="ml-1.5 text-gray-600">{news.filter((n) => !n.used).length}</span>}
            {f === 'used' && <span className="ml-1.5 text-gray-600">{news.filter((n) => n.used).length}</span>}
          </button>
        ))}
      </div>

      {/* News grid */}
      {loading ? (
        <div className="text-center py-16 text-gray-600">Cargando noticias...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500">No hay noticias. Haz clic en "Actualizar noticias" para obtener las últimas del IRS.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`card hover:border-[#3a3a3a] transition-colors flex flex-col gap-3 ${item.used ? 'opacity-60' : ''}`}
            >
              {/* Title & date */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">{item.title}</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    {new Date(item.publishedAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {item.used && (
                  <span className="badge-win flex-shrink-0">Usado</span>
                )}
              </div>

              {/* Summary */}
              {item.summary && (
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{item.summary}</p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[#2a2a2a]">
                <button
                  onClick={() => { setSelectedNews(item); setGenerated(null) }}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generar contenido
                </button>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  Ver original ↗
                </a>
                <button
                  onClick={() => toggleUsed(item)}
                  className="ml-auto text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  {item.used ? 'Marcar sin usar' : 'Marcar como usado'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Modal */}
      {selectedNews && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal header */}
            <div className="p-5 border-b border-[#2a2a2a] flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Generar contenido para redes</p>
                <h2 className="text-sm font-semibold text-white leading-snug line-clamp-2">{selectedNews.title}</h2>
              </div>
              <button
                onClick={() => { setSelectedNews(null); setGenerated(null) }}
                className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0 mt-0.5"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Platform buttons */}
            <div className="p-4 border-b border-[#2a2a2a] flex gap-2 flex-wrap">
              {(Object.entries(PLATFORM_CONFIG) as [Platform, typeof PLATFORM_CONFIG[Platform]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => handleGenerate(key)}
                  disabled={!!generating}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cfg.color} ${generated?.platform === key ? 'ring-1 ring-current' : ''}`}
                >
                  <span>{cfg.icon}</span>
                  {generating === key ? 'Generando...' : cfg.label}
                </button>
              ))}
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto p-5">
              {generating && !generated && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-3">
                  <svg className="w-8 h-8 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <p className="text-sm">Generando contenido con IA...</p>
                </div>
              )}

              {!generating && !generated && (
                <p className="text-sm text-gray-600 text-center py-8">
                  Selecciona una plataforma para generar el contenido.
                </p>
              )}

              {generated && !generating && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">{PLATFORM_CONFIG[generated.platform].icon}</span>
                    <p className="text-sm font-semibold text-white">{PLATFORM_CONFIG[generated.platform].label}</p>
                  </div>
                  {renderGeneratedContent(generated)}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="p-4 border-t border-[#2a2a2a] flex justify-between items-center">
              <button
                onClick={() => toggleUsed(selectedNews)}
                className={`text-xs transition-colors ${selectedNews.used ? 'text-gray-500 hover:text-gray-300' : 'text-green-400 hover:text-green-300'}`}
              >
                {selectedNews.used ? 'Marcar como no usado' : '✓ Marcar como usado'}
              </button>
              <button
                onClick={() => { setSelectedNews(null); setGenerated(null) }}
                className="btn-secondary text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

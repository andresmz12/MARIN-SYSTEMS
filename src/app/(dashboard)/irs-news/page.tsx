'use client'

import { useEffect, useState } from 'react'

interface IrsNewsItem {
  id: string
  title: string
  summary: string
  spanishSummary?: string | null
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

function SkeletonCard() {
  return (
    <div className="card animate-pulse flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[#2a2a2a] rounded w-full" />
          <div className="h-4 bg-[#2a2a2a] rounded w-3/4" />
          <div className="h-3 bg-[#2a2a2a] rounded w-1/4 mt-1" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-3 bg-[#2a2a2a] rounded w-full" />
        <div className="h-3 bg-[#2a2a2a] rounded w-5/6" />
        <div className="h-3 bg-[#2a2a2a] rounded w-4/5" />
      </div>
      <div className="flex gap-2 pt-1 border-t border-[#2a2a2a]">
        <div className="h-7 bg-[#2a2a2a] rounded w-28" />
        <div className="h-7 bg-[#2a2a2a] rounded w-20" />
      </div>
    </div>
  )
}

export default function IrsNewsPage() {
  const [news, setNews] = useState<IrsNewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ added: number; skipped: number } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedNews, setSelectedNews] = useState<IrsNewsItem | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [generating, setGenerating] = useState<Platform | null>(null)
  const [generated, setGenerated] = useState<GeneratedContent | null>(null)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unused' | 'used'>('all')
  const [autoEnriching, setAutoEnriching] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 })

  useEffect(() => { loadNews() }, [])

  async function autoEnrich(articles: IrsNewsItem[]) {
    const toEnrich = articles.filter(n => !n.spanishSummary)
    if (toEnrich.length === 0) return

    setAutoEnriching(true)
    setEnrichProgress({ current: 0, total: toEnrich.length })

    for (let i = 0; i < toEnrich.length; i++) {
      try {
        const res = await fetch(`/api/irs-news/${toEnrich[i].id}`)
        if (res.ok) {
          const enriched: IrsNewsItem = await res.json()
          setNews(prev => prev.map(n => n.id === enriched.id ? enriched : n))
        }
      } catch { /* ignore — continue with next */ }
      setEnrichProgress({ current: i + 1, total: toEnrich.length })
    }

    setAutoEnriching(false)
  }

  async function loadNews() {
    setLoading(true)
    const res = await fetch('/api/irs-news')
    if (res.ok) {
      const data: IrsNewsItem[] = await res.json()
      setNews(data)
      autoEnrich(data)
    }
    setLoading(false)
  }

  async function openArticle(item: IrsNewsItem) {
    setSelectedNews(item)
    setGenerated(null)
    if (item.spanishSummary) return

    setEnriching(true)
    try {
      const res = await fetch(`/api/irs-news/${item.id}`)
      if (res.ok) {
        const enriched: IrsNewsItem = await res.json()
        setSelectedNews(enriched)
        setNews(prev => prev.map(n => n.id === enriched.id ? enriched : n))
      }
    } catch { /* ignore */ }
    setEnriching(false)
  }

  async function handleFetch() {
    setFetching(true)
    setFetchResult(null)
    setFetchError(null)
    try {
      const res = await fetch('/api/irs-news/fetch', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setFetchError(data?.error ?? `Error ${res.status}`)
      } else {
        setFetchResult(data)
        const newsRes = await fetch('/api/irs-news')
        if (newsRes.ok) {
          const fresh: IrsNewsItem[] = await newsRes.json()
          setNews(fresh)
          autoEnrich(fresh)
        }
      }
    } catch {
      setFetchError('Error de red al contactar el servidor')
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
    if (res.ok) setGenerated(await res.json())
    setGenerating(null)
  }

  async function toggleUsed(item: IrsNewsItem) {
    const res = await fetch('/api/irs-news', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, used: !item.used }),
    })
    if (res.ok) {
      setNews(prev => prev.map(n => n.id === item.id ? { ...n, used: !n.used } : n))
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
          <button onClick={() => copyToClipboard(fullText)} className="btn-secondary w-full">{copied ? '✓ Copiado' : 'Copiar todo'}</button>
        </div>
      )
    }

    if (platform === 'youtube') {
      const fullText = [`📹 TÍTULO:\n${c.titulo}`, `\n\n🎬 GUION (60-90 seg):\n${c.guion}`, `\n\n📄 DESCRIPCIÓN:\n${c.descripcion}`, `\n\n#️⃣ HASHTAGS:\n${(c.hashtags as string[])?.join(' ')}`].join('')
      return (
        <div className="space-y-4">
          <div><p className="label">Título del video</p><p className="text-sm text-white font-semibold bg-[#111] border border-[#2a2a2a] rounded-lg p-3">{String(c.titulo ?? '')}</p></div>
          <div><p className="label">Guion (60-90 seg)</p><p className="text-sm text-gray-300 bg-[#111] border border-[#2a2a2a] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{String(c.guion ?? '')}</p></div>
          <div><p className="label">Descripción</p><p className="text-sm text-gray-300 bg-[#111] border border-[#2a2a2a] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{String(c.descripcion ?? '')}</p></div>
          <div><p className="label">Hashtags</p><p className="text-sm text-red-400">{(c.hashtags as string[] ?? []).join(' ')}</p></div>
          <button onClick={() => copyToClipboard(fullText)} className="btn-secondary w-full">{copied ? '✓ Copiado' : 'Copiar todo'}</button>
        </div>
      )
    }

    const fullText = [`📣 CAPTION CORTO:\n${c.captionCorto}`, `\n\n📝 POST LARGO:\n${c.postLargo}`, `\n\n#️⃣ HASHTAGS:\n${(c.hashtags as string[])?.join(' ')}`].join('')
    return (
      <div className="space-y-4">
        <div><p className="label">Caption corto</p><p className="text-sm text-white font-medium bg-[#111] border border-[#2a2a2a] rounded-lg p-3">{String(c.captionCorto ?? '')}</p></div>
        <div><p className="label">Post largo</p><p className="text-sm text-gray-300 bg-[#111] border border-[#2a2a2a] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{String(c.postLargo ?? '')}</p></div>
        <div><p className="label">Hashtags</p><p className="text-sm text-blue-400">{(c.hashtags as string[] ?? []).join(' ')}</p></div>
        <button onClick={() => copyToClipboard(fullText)} className="btn-secondary w-full">{copied ? '✓ Copiado' : 'Copiar todo'}</button>
      </div>
    )
  }

  const filtered = news.filter(n => {
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
        <button onClick={handleFetch} disabled={fetching} className="btn-primary flex items-center gap-2">
          {fetching ? (
            <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Actualizando...</>
          ) : (
            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Actualizar noticias</>
          )}
        </button>
      </div>

      {fetchResult && (
        <div className="card border-green-500/30 bg-green-500/10">
          <p className="text-sm text-green-400">✓ {fetchResult.added} noticia{fetchResult.added !== 1 ? 's' : ''} nueva{fetchResult.added !== 1 ? 's' : ''} · {fetchResult.skipped} omitida{fetchResult.skipped !== 1 ? 's' : ''}</p>
        </div>
      )}

      {fetchError && (
        <div className="card border-red-500/30 bg-red-500/10">
          <p className="text-sm text-red-400">⚠ {fetchError}</p>
        </div>
      )}

      {/* Auto-enrich progress */}
      {autoEnriching && (
        <div className="card border-blue-500/20 bg-blue-500/5 flex items-center gap-3">
          <svg className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-400 font-medium">
              Generando resúmenes en español… {enrichProgress.current}/{enrichProgress.total}
            </p>
            <div className="mt-1.5 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${(enrichProgress.current / enrichProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'unused', 'used'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30' : 'text-gray-500 hover:text-gray-300 bg-[#1a1a1a] border border-[#2a2a2a]'}`}>
            {f === 'all' ? 'Todas' : f === 'unused' ? 'Sin usar' : 'Usadas'}
            <span className="ml-1.5 text-gray-600">{f === 'all' ? news.length : f === 'unused' ? news.filter(n => !n.used).length : news.filter(n => n.used).length}</span>
          </button>
        ))}
      </div>

      {/* News grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500">No hay noticias. Haz clic en &quot;Actualizar noticias&quot; para obtener las últimas del IRS.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <div key={item.id} className={`card hover:border-[#3a3a3a] transition-colors flex flex-col gap-3 ${item.used ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">{item.title}</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    {new Date(item.publishedAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {item.used && <span className="badge-win flex-shrink-0">Usado</span>}
              </div>

              {item.spanishSummary ? (
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 italic">{item.spanishSummary}</p>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                  Generando resumen…
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[#2a2a2a]">
                <button onClick={() => openArticle(item)} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Generar contenido
                </button>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs px-3 py-1.5">Ver original ↗</a>
                <button onClick={() => toggleUsed(item)} className="ml-auto text-xs text-gray-600 hover:text-gray-400 transition-colors">
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
            {/* Header */}
            <div className="p-5 border-b border-[#2a2a2a] flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Generar contenido para redes</p>
                <h2 className="text-sm font-semibold text-white leading-snug">{selectedNews.title}</h2>
                <p className="text-xs text-gray-600 mt-1">
                  {new Date(selectedNews.publishedAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button onClick={() => { setSelectedNews(null); setGenerated(null) }} className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Spanish summary */}
            <div className="px-5 py-4 border-b border-[#2a2a2a] bg-blue-500/5">
              <p className="text-xs text-blue-400 font-medium uppercase tracking-wider mb-2">📰 Resumen en español</p>
              {enriching ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <svg className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Analizando la noticia...
                </div>
              ) : selectedNews.spanishSummary ? (
                <p className="text-sm text-gray-300 leading-relaxed">{selectedNews.spanishSummary}</p>
              ) : (
                <p className="text-sm text-gray-600 italic">No se pudo obtener el resumen.</p>
              )}
            </div>

            {/* Platform buttons */}
            <div className="p-4 border-b border-[#2a2a2a] flex gap-2 flex-wrap">
              {(Object.entries(PLATFORM_CONFIG) as [Platform, typeof PLATFORM_CONFIG[Platform]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => handleGenerate(key)}
                  disabled={!!generating || enriching}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cfg.color} ${generated?.platform === key ? 'ring-1 ring-current' : ''}`}
                >
                  <span>{cfg.icon}</span>
                  {generating === key ? 'Generando...' : cfg.label}
                </button>
              ))}
            </div>

            {/* Generated content */}
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
                <p className="text-sm text-gray-600 text-center py-8">Selecciona una plataforma para generar el contenido.</p>
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

            <div className="p-4 border-t border-[#2a2a2a] flex justify-between items-center">
              <button onClick={() => toggleUsed(selectedNews)} className={`text-xs transition-colors ${selectedNews.used ? 'text-gray-500 hover:text-gray-300' : 'text-green-400 hover:text-green-300'}`}>
                {selectedNews.used ? 'Marcar como no usado' : '✓ Marcar como usado'}
              </button>
              <button onClick={() => { setSelectedNews(null); setGenerated(null) }} className="btn-secondary text-xs">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

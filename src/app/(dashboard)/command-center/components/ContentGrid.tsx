'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany, GeneratedPost, PostPlatform } from '../types'
import {
  isoWeekNumber, todayKey, addDaysKey, weekStartKey, fromKey,
  DOW_LABELS, PLATFORM_CONFIG, CONTENT_TYPE_CONFIG, POST_STATUS_CONFIG,
} from '../utils'

const GRID_PLATFORMS: PostPlatform[] = ['instagram', 'tiktok']
const ALL_PLATFORMS: PostPlatform[] = ['instagram', 'tiktok', 'email', 'whatsapp']

interface Props {
  companies: CEOCompany[]
}

export function ContentGrid({ companies }: Props) {
  const { showToast } = useToast()
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current week
  const [posts, setPosts] = useState<GeneratedPost[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedPost, setSelectedPost] = useState<GeneratedPost | null>(null)
  const [marking, setMarking] = useState(false)

  const weekNumber = isoWeekNumber(addDaysKey(todayKey(), weekOffset * 7))
  const weekStart = weekStartKey(addDaysKey(todayKey(), weekOffset * 7))

  const loadGrid = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/ceo/content-grid?companyId=${companyId}&weekNumber=${weekNumber}`)
      if (res.ok) setPosts(await res.json())
    } catch {
      showToast('Error al cargar la parrilla', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, weekNumber, showToast])

  useEffect(() => { loadGrid() }, [loadGrid])

  const company = companies.find((c) => c.id === companyId)

  async function generateCell(dayOfWeek: number, platform: PostPlatform) {
    try {
      const res = await fetch('/api/ceo/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, platform, contentType: platform === 'instagram' ? 'reel' : 'post', topic: '', weekNumber, dayOfWeek }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      const post: GeneratedPost = await res.json()
      setPosts((prev) => [...prev.filter((p) => !(p.dayOfWeek === dayOfWeek && p.platform === platform)), post])
      return post
    } catch (e) {
      throw e
    }
  }

  async function generateWeek() {
    if (!companyId) return
    setGenerating(true)
    setProgress(0)
    // Indeterminate progress: the server generates the whole week with a coherent
    // pillar/angle strategy and topic dedup, so we can't track per-cell here.
    const tick = setInterval(() => setProgress((p) => Math.min(p + 7, 90)), 900)
    try {
      const res = await fetch('/api/ceo/generate-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, weekNumber }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      setProgress(100)
      await loadGrid()
      showToast('⚡ Semana generada con estrategia', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al generar la semana', 'error')
    } finally {
      clearInterval(tick)
      setGenerating(false)
      setProgress(0)
    }
  }

  async function markPublished() {
    if (!selectedPost) return
    setMarking(true)
    try {
      const res = await fetch(`/api/ceo/content/${selectedPost.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      })
      if (!res.ok) throw new Error()
      setPosts((prev) => prev.map((p) => p.id === selectedPost.id ? { ...p, status: 'published' } : p))
      setSelectedPost((p) => p ? { ...p, status: 'published' } : p)
      showToast('Marcado como publicado', 'success')
    } catch {
      showToast('Error al actualizar', 'error')
    } finally {
      setMarking(false)
    }
  }

  function getPost(day: number, platform: string) {
    return posts.find((p) => p.dayOfWeek === day && p.platform === platform) ?? null
  }

  // Week label
  const weekLabel = (() => {
    const mon = fromKey(weekStart)
    const fri = fromKey(addDaysKey(weekStart, 4))
    const fmt = (d: Date) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
    return `${fmt(mon)} – ${fmt(fri)}`
  })()

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>

        {/* Week nav */}
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset((w) => w - 1)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-sm border border-zinc-700 hover:border-zinc-600">
            ‹
          </button>
          <span className="text-xs text-zinc-400 min-w-[130px] text-center">{weekLabel}</span>
          <button onClick={() => setWeekOffset((w) => w + 1)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-sm border border-zinc-700 hover:border-zinc-600">
            ›
          </button>
        </div>

        <button onClick={generateWeek} disabled={generating || !companyId}
          className="ml-auto px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-40"
        >
          {generating ? `⚡ Generando… ${progress}%` : '⚡ Generar semana completa'}
        </button>
      </div>

      {/* Progress bar */}
      {generating && (
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div className="h-full bg-indigo-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-zinc-800/60 animate-pulse col-span-1" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <div className="min-w-[640px]">
            {/* Column headers (days) */}
            <div className="grid grid-cols-5 gap-2 mb-2 pl-[88px]">
              {[1, 2, 3, 4, 5].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  {DOW_LABELS[d]}
                </div>
              ))}
            </div>
            {/* Rows (platforms) */}
            {GRID_PLATFORMS.map((platform) => {
              const cfg = PLATFORM_CONFIG[platform]
              return (
                <div key={platform} className="grid grid-cols-[88px_1fr_1fr_1fr_1fr_1fr] gap-2 mb-2">
                  {/* Row label */}
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 pr-2">
                    <span>{cfg.emoji}</span> {cfg.label}
                  </div>
                  {/* Cells */}
                  {[1, 2, 3, 4, 5].map((day) => {
                    const post = getPost(day, platform)
                    const statusCfg = post ? POST_STATUS_CONFIG[post.status] ?? POST_STATUS_CONFIG.draft : null
                    const typeCfg = post ? CONTENT_TYPE_CONFIG[post.contentType] ?? null : null
                    return (
                      <div key={day} className="min-h-[96px]">
                        {post ? (
                          <button onClick={() => setSelectedPost(post)}
                            className="w-full h-full min-h-[96px] text-left rounded-xl border border-zinc-700 bg-zinc-800/60 hover:border-zinc-600 hover:bg-zinc-800 transition-colors p-2.5 space-y-1.5"
                          >
                            <div className="flex items-center gap-1">
                              {typeCfg && <span className={`text-[9px] px-1.5 py-0.5 rounded border ${typeCfg.cls}`}>{typeCfg.label}</span>}
                              {statusCfg && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusCfg.dot}`} />}
                            </div>
                            <p className="text-xs text-zinc-200 line-clamp-2 leading-relaxed">{post.topic}</p>
                          </button>
                        ) : (
                          <button onClick={() => generateCell(day, platform).then(() => showToast('Contenido generado', 'success')).catch(() => showToast('Error — ¿configuraste el perfil de marca?', 'error'))}
                            className="group w-full h-full min-h-[96px] rounded-xl border border-dashed border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors flex items-center justify-center"
                          >
                            <span className="text-zinc-700 group-hover:text-indigo-400 text-xs transition-colors">＋ Generar</span>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Post detail modal */}
      <AnimatePresence>
        {selectedPost && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedPost(null) }}
          >
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">{PLATFORM_CONFIG[selectedPost.platform]?.emoji} {PLATFORM_CONFIG[selectedPost.platform]?.label}</p>
                  <h3 className="text-base font-bold text-white mt-0.5">{selectedPost.topic}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const s = POST_STATUS_CONFIG[selectedPost.status]
                    return s ? <span className="flex items-center gap-1.5 text-xs text-zinc-400"><span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}</span> : null
                  })()}
                  <button onClick={() => setSelectedPost(null)} className="text-zinc-500 hover:text-white ml-2">✕</button>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Copy</p>
                  <p className="text-sm text-zinc-200 whitespace-pre-line leading-relaxed bg-zinc-800 rounded-lg px-3 py-2">{selectedPost.copy}</p>
                </div>
                {selectedPost.hashtags.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">Hashtags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPost.hashtags.map((h) => (
                        <button key={h}
                          onClick={async () => { await navigator.clipboard.writeText(h); showToast(`Copiado: ${h}`, 'success') }}
                          className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600"
                        >{h}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 p-3">
                  <p className="text-xs text-zinc-500 mb-1">🎯 CTA</p>
                  <p className="text-sm font-semibold text-indigo-300">{selectedPost.cta}</p>
                </div>
                {selectedPost.contentNotes && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                    <p className="text-xs text-zinc-500 mb-1">🎬 Notas de producción</p>
                    <p className="text-sm text-amber-200/80 leading-relaxed">{selectedPost.contentNotes}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={async () => {
                    const text = `${selectedPost.copy}\n\n${selectedPost.hashtags.join(' ')}\n\n👉 ${selectedPost.cta}`
                    await navigator.clipboard.writeText(text)
                    showToast('📋 Copiado al portapapeles', 'success')
                  }} className="flex-1 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium transition-colors">
                    📋 Copiar todo
                  </button>
                  {selectedPost.status !== 'published' && (
                    <button onClick={markPublished} disabled={marking}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-40"
                    >
                      {marking ? 'Guardando…' : '✅ Marcar publicado'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

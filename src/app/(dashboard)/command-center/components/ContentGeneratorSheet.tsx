'use client'

import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'
import type { GeneratedPost, PostPlatform, PostContentType } from '../types'
import { isoWeekNumber, todayKey, PLATFORM_CONFIG, CONTENT_TYPE_CONFIG } from '../utils'

type Platform = PostPlatform
type ContentType = PostContentType

interface Props {
  companyId: string
  companyName: string
  workBlockId: string
  linkedTopic?: string
  onClose: () => void
}

const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'email', 'whatsapp']
const CONTENT_TYPES: ContentType[] = ['reel', 'post', 'story', 'caption', 'email']

export function ContentGeneratorSheet({ companyId, companyName, workBlockId, linkedTopic, onClose }: Props) {
  const { showToast } = useToast()
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [contentType, setContentType] = useState<ContentType>('reel')
  const [topic, setTopic] = useState(linkedTopic ?? '')
  const [loading, setLoading] = useState(false)
  const [post, setPost] = useState<GeneratedPost | null>(null)
  const [editCopy, setEditCopy] = useState('')
  const [marking, setMarking] = useState(false)

  const generate = useCallback(async () => {
    setLoading(true)
    setPost(null)
    try {
      const weekNumber = isoWeekNumber(todayKey())
      const today = new Date()
      const dow = today.getDay() === 0 ? 5 : today.getDay() // Sun → treat as Fri

      const res = await fetch('/api/ceo/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, workBlockId, platform, contentType, topic, weekNumber, dayOfWeek: dow }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        showToast(err.error ?? 'Error al generar', 'error')
        return
      }
      const data: GeneratedPost = await res.json()
      setPost(data)
      setEditCopy(data.copy)
    } catch {
      showToast('Error al conectar con el servidor', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, workBlockId, platform, contentType, topic, showToast])

  async function copyAll() {
    if (!post) return
    const text = `${editCopy}\n\n${post.hashtags.join(' ')}\n\n👉 ${post.cta}`
    await navigator.clipboard.writeText(text)
    showToast('📋 Copiado al portapapeles', 'success')
  }

  async function markReady() {
    if (!post) return
    setMarking(true)
    try {
      // Save edited copy first
      if (editCopy !== post.copy) {
        await fetch(`/api/ceo/content/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ copy: editCopy }),
        })
      }
      const res = await fetch(`/api/ceo/content/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      })
      if (!res.ok) throw new Error()
      setPost((p) => p ? { ...p, status: 'ready' } : p)
      showToast('✅ Marcado como listo para publicar', 'success')
    } catch {
      showToast('Error al actualizar', 'error')
    } finally {
      setMarking(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 h-full overflow-y-auto flex flex-col"
        >
          {/* Header */}
          <div className="sticky top-0 bg-zinc-900/95 backdrop-blur px-5 py-4 border-b border-zinc-800 flex items-center justify-between z-10">
            <div>
              <h2 className="text-base font-bold text-white">✨ Generar contenido</h2>
              <p className="text-xs text-zinc-500">{companyName}</p>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
          </div>

          <div className="flex-1 p-5 space-y-5">
            {/* Platform */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">Plataforma</label>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map((p) => {
                  const cfg = PLATFORM_CONFIG[p]
                  return (
                    <button key={p} onClick={() => setPlatform(p)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                        platform === p ? `${cfg.cls}` : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <span>{cfg.emoji}</span> {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Content type */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">Tipo de contenido</label>
              <div className="flex flex-wrap gap-2">
                {CONTENT_TYPES.map((t) => {
                  const cfg = CONTENT_TYPE_CONFIG[t]
                  return (
                    <button key={t} onClick={() => setContentType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        contentType === t ? cfg.cls : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                      }`}
                    >{cfg.label}</button>
                  )
                })}
              </div>
            </div>

            {/* Topic */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">Tema (opcional)</label>
              <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200}
                placeholder="Déjalo vacío y la IA elegirá el mejor tema"
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
              />
            </div>

            {/* Generate button */}
            <button onClick={generate} disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creando tu contenido…
                </>
              ) : '✨ Generar'}
            </button>

            {/* Generated result */}
            <AnimatePresence>
              {post && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  {/* Topic */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">📌 Tema</p>
                    <p className="text-sm font-semibold text-white">{post.topic}</p>
                  </div>

                  {/* Copy editable */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">✍️ Copy</p>
                    <textarea value={editCopy} onChange={(e) => setEditCopy(e.target.value)} rows={8}
                      className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-y"
                    />
                  </div>

                  {/* Hashtags */}
                  {post.hashtags.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-2">#️⃣ Hashtags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {post.hashtags.map((h) => (
                          <button key={h}
                            onClick={async () => { await navigator.clipboard.writeText(h); showToast(`Copiado: ${h}`, 'success') }}
                            className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600 transition-colors"
                          >{h}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CTA */}
                  <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 p-3">
                    <p className="text-xs text-zinc-500 mb-1">🎯 Call to Action</p>
                    <p className="text-sm font-semibold text-indigo-300">{post.cta}</p>
                  </div>

                  {/* Production notes */}
                  {post.contentNotes && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                      <p className="text-xs text-zinc-500 mb-1">🎬 Notas de producción</p>
                      <p className="text-sm text-amber-200/80 leading-relaxed">{post.contentNotes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={copyAll}
                      className="flex-1 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium transition-colors"
                    >📋 Copiar todo</button>
                    <button onClick={markReady} disabled={marking || post.status === 'ready'}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${
                        post.status === 'ready'
                          ? 'bg-green-600/30 text-green-400 border border-green-500/40'
                          : 'bg-green-600 hover:bg-green-500 text-white'
                      }`}
                    >
                      {post.status === 'ready' ? '✅ Listo para publicar' : marking ? 'Guardando…' : '✅ Listo para publicar'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

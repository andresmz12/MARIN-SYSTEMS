'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany, GeneratedPost } from '../types'
import { PLATFORM_CONFIG, POST_STATUS_CONFIG } from '../utils'

interface Props {
  companies: CEOCompany[]
}

interface AutoState {
  autoEnabled: boolean
  autoPlatforms: string[]
}

interface Reference { type: 'link' | 'text'; value: string; note?: string }

export function ContentReviewQueue({ companies }: Props) {
  const { showToast } = useToast()
  const [posts, setPosts] = useState<GeneratedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [auto, setAuto] = useState<AutoState | null>(null)
  const [refs, setRefs] = useState<Reference[]>([])
  const [refInput, setRefInput] = useState('')
  const [refNote, setRefNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ceo/content-queue')
      if (res.ok) setPosts(await res.json())
    } catch {
      showToast('Error al cargar la bandeja', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!companyId) return
    setAuto(null)
    fetch(`/api/ceo/brand-profile?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: (AutoState & { id: string; references?: Reference[] | null }) | null) => {
        setAuto(p ? { autoEnabled: p.autoEnabled, autoPlatforms: p.autoPlatforms } : null)
        setRefs(Array.isArray(p?.references) ? p.references : [])
      })
      .catch(() => setAuto(null))
  }, [companyId])

  async function toggleAuto() {
    if (!auto) return
    const next = !auto.autoEnabled
    const res = await fetch('/api/ceo/brand-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, autoEnabled: next }),
    })
    if (res.ok) {
      setAuto({ ...auto, autoEnabled: next })
      showToast(next ? 'Piloto automático activado' : 'Piloto automático pausado', 'success')
    } else {
      showToast('No se pudo cambiar el piloto automático', 'error')
    }
  }

  async function saveRefs(next: Reference[]) {
    const res = await fetch('/api/ceo/brand-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, references: next }),
    })
    if (res.ok) setRefs(next)
    else showToast('No se pudieron guardar las referencias', 'error')
  }

  function addRef() {
    const value = refInput.trim()
    if (!value) return
    const type = /^https?:\/\//i.test(value) ? 'link' : 'text'
    saveRefs([...refs, { type, value, ...(refNote.trim() ? { note: refNote.trim() } : {}) }])
    setRefInput('')
    setRefNote('')
  }

  async function uploadImage(id: string, file: File) {
    setBusyId(id)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/ceo/content/${id}/image`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      showToast('Imagen subida', 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo subir la imagen', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function removeImage(id: string) {
    const res = await fetch(`/api/ceo/content/${id}/image`, { method: 'DELETE' })
    if (res.ok) await load()
    else showToast('No se pudo quitar la imagen', 'error')
  }

  function copyText(text: string, msg: string) {
    navigator.clipboard?.writeText(text)
    showToast(msg, 'success')
  }

  async function patch(id: string, body: Record<string, unknown>, okMsg: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/ceo/content/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      showToast(okMsg, 'success')
      await load()
    } catch {
      showToast('No se pudo actualizar el post', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function regenerate(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/ceo/content/${id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: notes[id] ?? '' }),
      })
      if (!res.ok) throw new Error()
      setEdits((e) => { const { [id]: _, ...rest } = e; return rest })
      showToast('Post regenerado', 'success')
      await load()
    } catch {
      showToast('No se pudo regenerar', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const pending = posts.filter((p) => p.status === 'pending_review')
  const approved = posts.filter((p) => p.status === 'approved')
  const missingImages = posts.filter((p) => !p.imageUrl && p.imagePrompt)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold text-zinc-100">🤖 Piloto automático</p>
          <p className="text-xs text-zinc-400">
            Cada domingo genera los posts de lunes, miércoles y viernes (Instagram, Facebook, LinkedIn y TikTok). Nada se publica sin tu aprobación.
          </p>
        </div>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200"
        >
          {companies.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <button
          onClick={toggleAuto}
          disabled={!auto}
          title={auto ? undefined : 'Configura primero el perfil de marca de esta empresa'}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all disabled:opacity-40 ${
            auto?.autoEnabled
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
              : 'text-zinc-300 border-zinc-700 hover:border-zinc-500'
          }`}
        >
          {auto?.autoEnabled ? 'Activado ✓' : 'Activar'}
        </button>
      </div>

      {auto && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">📎 Referencias de estilo</p>
            <p className="text-xs text-zinc-400">
              Links a posts que te gustan, o texto de ejemplos. Se usan como guía de estilo en cada generación (máx. 15).
            </p>
          </div>
          {refs.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-zinc-300">
              <span>{r.type === 'link' ? '🔗' : '📝'}</span>
              <span className="flex-1 truncate">{r.value}{r.note ? ` — ${r.note}` : ''}</span>
              <button onClick={() => saveRefs(refs.filter((_, j) => j !== i))} className="text-red-300 hover:text-red-200">Quitar</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <input
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
              placeholder="Link o texto de ejemplo"
              className="flex-1 min-w-[200px] bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
            />
            <input
              value={refNote}
              onChange={(e) => setRefNote(e.target.value)}
              placeholder="Qué te gusta de esto (opcional)"
              className="flex-1 min-w-[200px] bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
            />
            <button onClick={addRef} className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 border border-zinc-700 hover:border-zinc-500">
              Agregar
            </button>
          </div>
        </div>
      )}

      {missingImages.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-semibold text-amber-200">🖼️ Faltan {missingImages.length} imagen{missingImages.length > 1 ? 'es' : ''}</p>
            <p className="text-xs text-zinc-400">
              Copia todos los prompts, genéralos en ChatGPT en una sola sesión y sube cada imagen en su post. Se convierten a JPEG solas.
            </p>
          </div>
          <button
            onClick={() => copyText(
              missingImages.map((p, i) => `${i + 1}. [${PLATFORM_CONFIG[p.platform]?.label ?? p.platform}] ${p.imagePrompt}`).join('\n\n'),
              'Prompts copiados',
            )}
            className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-amber-200 border border-amber-500/40 hover:bg-amber-500/10"
          >
            Copiar todos los prompts
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-zinc-500">Cargando…</p>}
      {!loading && pending.length === 0 && (
        <p className="text-sm text-zinc-500">No hay posts por revisar. Los nuevos aparecen aquí cuando el piloto automático los genere.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {pending.map((post) => {
          const plat = PLATFORM_CONFIG[post.platform]
          const busy = busyId === post.id
          const copy = edits[post.id] ?? post.copy
          return (
            <div key={post.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${plat?.cls ?? ''}`}>
                  {plat?.emoji} {plat?.label ?? post.platform}
                </span>
                <span className="text-xs text-zinc-500">
                  {post.company?.name}{post.scheduledDate ? ` · ${new Date(post.scheduledDate).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}
                </span>
              </div>
              <p className="text-xs text-zinc-400">Tema: {post.topic}</p>
              <textarea
                value={copy}
                onChange={(e) => setEdits((x) => ({ ...x, [post.id]: e.target.value }))}
                rows={8}
                className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg p-2.5 text-sm text-zinc-100 resize-y"
              />
              {post.hashtags.length > 0 && <p className="text-xs text-indigo-300">{post.hashtags.join(' ')}</p>}
              <p className="text-xs text-zinc-300">CTA: {post.cta}</p>
              <div className="rounded-lg border border-dashed border-zinc-700 p-2.5 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">🖼️ Imagen</p>
                {post.imageUrl ? (
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.imageUrl} alt="" className="w-24 h-24 rounded-md object-cover border border-zinc-700" />
                    <button onClick={() => removeImage(post.id)} className="text-xs text-red-300 hover:text-red-200">Quitar</button>
                  </div>
                ) : (
                  <>
                    {post.imagePrompt && <p className="text-xs text-zinc-300">{post.imagePrompt}</p>}
                    <div className="flex flex-wrap gap-2">
                      {post.imagePrompt && (
                        <button
                          onClick={() => copyText(post.imagePrompt as string, 'Prompt copiado')}
                          className="text-xs text-zinc-200 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500"
                        >
                          Copiar prompt
                        </button>
                      )}
                      <label className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 cursor-pointer">
                        {busy ? 'Subiendo…' : 'Subir imagen'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) uploadImage(post.id, f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
              <input
                value={notes[post.id] ?? ''}
                onChange={(e) => setNotes((x) => ({ ...x, [post.id]: e.target.value }))}
                placeholder="Ajuste para regenerar (ej: más corto, menos formal)"
                className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() => patch(post.id, { status: 'approved', ...(edits[post.id] !== undefined ? { copy: edits[post.id] } : {}) }, 'Post aprobado')}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 disabled:opacity-40"
                >
                  Aprobar
                </button>
                <button
                  disabled={busy}
                  onClick={() => regenerate(post.id)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-200 border border-zinc-700 hover:border-zinc-500 disabled:opacity-40"
                >
                  {busy ? 'Trabajando…' : 'Regenerar'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => patch(post.id, { status: 'rejected', reviewNote: notes[post.id] || null }, 'Post rechazado')}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-300 border border-red-500/40 hover:bg-red-500/10 disabled:opacity-40"
                >
                  Rechazar
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {approved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">Aprobados — se publican a su hora (o súbelos a mano)</h3>
          {approved.map((post) => {
            const plat = PLATFORM_CONFIG[post.platform]
            const cfg = POST_STATUS_CONFIG[post.status]
            return (
              <div key={post.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                <span className={`w-2 h-2 rounded-full ${cfg?.dot ?? ''}`} />
                <span className="text-sm text-zinc-200 flex-1 truncate">{plat?.emoji} {post.topic}</span>
                <span className={`text-xs ${post.imageUrl ? 'text-emerald-300' : 'text-amber-300'}`}>{post.imageUrl ? '🖼️ con imagen' : 'sin imagen'}</span>
                <button
                  onClick={() => { navigator.clipboard?.writeText(`${post.copy}\n\n${post.hashtags.join(' ')}`); showToast('Copy copiado', 'success') }}
                  className="text-xs text-zinc-300 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500"
                >
                  Copiar
                </button>
                <button
                  onClick={() => patch(post.id, { status: 'published' }, 'Marcado como publicado')}
                  className="text-xs text-emerald-300 border border-emerald-500/40 rounded-md px-2 py-1 hover:bg-emerald-500/10"
                >
                  Marcar publicado
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

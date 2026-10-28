'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany, GeneratedPost } from '../types'
import { PLATFORM_CONFIG, POST_STATUS_CONFIG } from '../utils'
import { AUTO_PLATFORMS, TWEET_MAX, composePostText } from '@/lib/platforms'
import { IMAGE_SPECS, buildImagePrompt, parseImageText, parseVisualStyle, type ImageText } from '@/lib/image-prompt'

interface Props {
  companies: CEOCompany[]
}

interface AutoState {
  autoEnabled: boolean
  autoPlatforms: string[]
}

interface Reference { type: 'link' | 'text'; value: string; note?: string }

// La URL guardada es absoluta (para las redes); en pantalla se usa la ruta relativa
// para no depender de que NEXT_PUBLIC_APP_URL coincida con el dominio actual (CSP).
function localImagePath(url: string): string {
  try { return new URL(url).pathname } catch { return url }
}

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
  const [imgText, setImgText] = useState<Record<string, ImageText>>({})
  const [vs, setVs] = useState({ style: '', handle: '', avoid: '', palette: [] as string[] })
  const [vsColor, setVsColor] = useState('#22d3ee')
  const [publishOn, setPublishOn] = useState(false)
  const [publishPlatforms, setPublishPlatforms] = useState<string[]>([])
  const [autoLoaded, setAutoLoaded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number | null; ms: number; body: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ceo/content-queue')
      if (res.ok) {
        const d = (await res.json()) as { posts: GeneratedPost[]; publishConfigured: boolean; publishPlatforms: string[] }
        setPosts(d.posts)
        setPublishOn(d.publishConfigured)
        setPublishPlatforms(d.publishPlatforms ?? [])
      }
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
    setAutoLoaded(false)
    fetch(`/api/ceo/brand-profile?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: (AutoState & { id: string; references?: Reference[] | null; visualStyle?: unknown }) | null) => {
        setAuto(p ? { autoEnabled: p.autoEnabled, autoPlatforms: p.autoPlatforms } : null)
        setRefs(Array.isArray(p?.references) ? p.references : [])
        const v = parseVisualStyle(p?.visualStyle)
        setVs({ style: v.style ?? '', handle: v.handle ?? '', avoid: v.avoid ?? '', palette: v.palette ?? [] })
      })
      .catch(() => setAuto(null))
      .finally(() => setAutoLoaded(true))
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

  const brandOf = (p: GeneratedPost) => p.company?.name ?? 'la marca'
  const textOf = (p: GeneratedPost): ImageText => imgText[p.id] ?? parseImageText(p.imageText) ?? { headline: '' }
  const promptFor = (p: GeneratedPost): string => {
    const t = textOf(p)
    return buildImagePrompt({
      platform: p.platform,
      brandName: brandOf(p),
      scene: p.imagePrompt,
      text: t.headline.trim() ? t : null,
      style: parseVisualStyle(p.brandProfile?.visualStyle),
    })
  }

  async function saveImageText(p: GeneratedPost) {
    const t = textOf(p)
    if (!t.headline.trim()) return
    const res = await fetch(`/api/ceo/content/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageText: {
          headline: t.headline.trim(),
          ...(t.subheadline?.trim() ? { subheadline: t.subheadline.trim() } : {}),
          ...(t.bullets?.length ? { bullets: t.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 3) } : {}),
        },
      }),
    })
    if (!res.ok) showToast('No se pudo guardar el texto de la imagen', 'error')
  }

  async function saveVisualStyle() {
    const res = await fetch('/api/ceo/brand-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, visualStyle: { palette: vs.palette, style: vs.style, handle: vs.handle, avoid: vs.avoid } }),
    })
    if (res.ok) { showToast('Estilo visual guardado: ya está en todos los prompts', 'success'); await load() }
    else showToast('No se pudo guardar el estilo visual', 'error')
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
      const d = await res.json().catch(() => null) as { platform?: string; fit?: { action: string; from: { width: number; height: number }; to: { width: number; height: number }; target: string | null } } | null
      const fit = d?.fit
      if (fit?.action === 'crop') showToast(`Imagen ajustada al formato de la red: ${fit.from.width}×${fit.from.height} → ${fit.to.width}×${fit.to.height}`, 'success')
      else if (fit?.action === 'mismatch') showToast(`La imagen (${fit.from.width}×${fit.from.height}) no tiene la orientación de ${IMAGE_SPECS[d?.platform ?? '']?.label ?? 'la red'}${fit.target ? ` (${fit.target})` : ''}. Genérala otra vez con el formato que pide el prompt.`, 'error')
      else showToast('Imagen subida', 'success')
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

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/publish/test', { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { ok?: boolean; status?: number | null; ms?: number; body?: string; error?: string }
      if (!res.ok) setTestResult({ ok: false, status: null, ms: 0, body: d.error ?? 'Error' })
      else setTestResult({ ok: !!d.ok, status: d.status ?? null, ms: d.ms ?? 0, body: d.body ?? '' })
    } catch {
      setTestResult({ ok: false, status: null, ms: 0, body: 'No se pudo contactar al servidor' })
    } finally {
      setTesting(false)
    }
  }

  async function togglePlatform(platform: string) {
    if (!auto) return
    const has = auto.autoPlatforms.includes(platform)
    const next = has ? auto.autoPlatforms.filter((p) => p !== platform) : [...auto.autoPlatforms, platform]
    if (next.length === 0) { showToast('Deja al menos una red activa', 'error'); return }
    const res = await fetch('/api/ceo/brand-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, autoPlatforms: next }),
    })
    if (res.ok) setAuto({ ...auto, autoPlatforms: next })
    else showToast('No se pudieron cambiar las redes', 'error')
  }

  async function publishNow(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/ceo/content/${id}/publish`, { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(d.error ?? 'No se pudo publicar')
      showToast('Enviado a publicar', 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo publicar', 'error')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  // <input type="datetime-local"> trabaja en hora local, sin zona: se arma con los componentes locales.
  function toLocalInput(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
      setImgText((m) => { const { [id]: _, ...rest } = m; return rest })
      showToast('Post regenerado', 'success')
      await load()
    } catch {
      showToast('No se pudo regenerar', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const pending = posts.filter((p) => p.status === 'pending_review')
  const scheduled = posts.filter((p) => p.status === 'approved' || p.status === 'publishing')
  const failed = posts.filter((p) => p.status === 'failed')
  const published = posts.filter((p) => p.status === 'published')
  const missingImages = posts.filter((p) => !p.imageUrl && (p.imagePrompt || p.imageText))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold text-zinc-100">🤖 Piloto automático</p>
          <p className="text-xs text-zinc-400">
            Cada domingo genera los posts de lunes, miércoles y viernes (solo imágenes). Los videos los subes tú. Nada se publica sin tu aprobación.
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

      <div className={`rounded-xl border p-4 space-y-3 ${publishOn ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-zinc-100 flex-1">🔌 Conexión de publicación automática</p>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${publishOn ? 'text-emerald-300 border-emerald-500/40' : 'text-amber-300 border-amber-500/40'}`}>
            {publishOn ? 'Conectada' : 'No conectada'}
          </span>
          {publishOn && (
            <button
              onClick={testConnection}
              disabled={testing}
              className="text-xs text-zinc-200 border border-zinc-700 rounded-md px-2.5 py-1 hover:border-zinc-500 disabled:opacity-40"
            >
              {testing ? 'Probando…' : 'Probar conexión'}
            </button>
          )}
        </div>
        {publishOn ? (
          <p className="text-xs text-zinc-400">
            Lo aprobado con imagen se envía solo a su hora al webhook que publica en tus redes. Redes automáticas: {publishPlatforms.map((p) => PLATFORM_CONFIG[p]?.label ?? p).join(', ')}; las demás se suben a mano. El botón manda un mensaje de prueba
            (<code>test: true</code>) que no publica nada.
          </p>
        ) : (
          <div className="text-xs text-zinc-400 space-y-1">
            <p>Mientras no esté conectada, lo aprobado queda en "Programados" y lo subes tú a mano con el botón Copiar. Para conectarla:</p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Crea un escenario en Make (o Zapier/n8n) que reciba un webhook y publique en cada red. Guía paso a paso: <code>docs/publicacion-automatica.md</code> en el repo.</li>
              <li>En Railway → Variables, agrega <code>PUBLISH_WEBHOOK_URL</code> (la URL del webhook) y <code>PUBLISH_WEBHOOK_SECRET</code> (una clave inventada por ti).</li>
              <li>Cuando Railway termine de reiniciar, vuelve aquí: el estado cambia a "Conectada" y aparece "Probar conexión".</li>
            </ol>
          </div>
        )}
        {testResult && (
          <p className={`text-xs ${testResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {testResult.ok
              ? `✓ El webhook respondió ${testResult.status} en ${testResult.ms} ms.`
              : `✗ Falló${testResult.status ? ` (HTTP ${testResult.status})` : ''}: ${testResult.body || 'sin detalle'}`}
          </p>
        )}
      </div>

      {autoLoaded && !auto && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 text-xs text-zinc-300 space-y-1">
          <p className="text-sm font-semibold text-zinc-100">Esta empresa todavía no tiene perfil de marca</p>
          <p>
            El piloto automático, las redes y las referencias aparecen cuando existe el perfil. Ve a la pestaña <strong>🏢 Empresas</strong>,
            abre la empresa y completa su perfil de marca (tono, audiencia y pilares de contenido).
          </p>
        </div>
      )}

      {auto && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="text-sm font-semibold text-zinc-100">🌐 Redes donde se publica</p>
          <div className="flex flex-wrap gap-2">
            {AUTO_PLATFORMS.map((pl) => {
              const on = auto.autoPlatforms.includes(pl)
              return (
                <button
                  key={pl}
                  onClick={() => togglePlatform(pl)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${on ? (PLATFORM_CONFIG[pl]?.cls ?? '') : 'text-zinc-500 border-zinc-700'}`}
                >
                  {PLATFORM_CONFIG[pl]?.emoji} {PLATFORM_CONFIG[pl]?.label ?? pl}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-zinc-500">
            {publishOn
              ? 'Publicación automática conectada: lo aprobado sale solo a su hora.'
              : 'Publicación automática NO conectada todavía (falta PUBLISH_WEBHOOK_URL): lo aprobado queda listo para subir a mano.'}
          </p>
        </div>
      )}

      {auto && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">🎨 Estilo visual de la marca</p>
            <p className="text-xs text-zinc-400">Se agrega a TODOS los prompts de imagen de esta marca: colores, estilo y el @ que sale en el pie de cada imagen.</p>
          </div>
          <input
            value={vs.style}
            onChange={(e) => setVs({ ...vs, style: e.target.value })}
            placeholder="Estilo (ej: futurista, azul marino oscuro con acentos cian, limpio y profesional)"
            className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
          />
          <div className="flex flex-wrap items-center gap-2">
            {vs.palette.map((c) => (
              <span key={c} className="flex items-center gap-1.5 text-xs text-zinc-300 border border-zinc-700 rounded-full pl-1 pr-2 py-0.5">
                <span className="w-4 h-4 rounded-full border border-zinc-600" style={{ backgroundColor: c }} />
                {c}
                <button onClick={() => setVs({ ...vs, palette: vs.palette.filter((x) => x !== c) })} className="text-zinc-500 hover:text-red-300">×</button>
              </span>
            ))}
            {vs.palette.length < 5 && (
              <>
                <input type="color" value={vsColor} onChange={(e) => setVsColor(e.target.value)} className="w-8 h-7 bg-transparent border border-zinc-700 rounded cursor-pointer" />
                <button
                  onClick={() => { if (!vs.palette.includes(vsColor)) setVs({ ...vs, palette: [...vs.palette, vsColor] }) }}
                  className="text-xs text-zinc-200 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500"
                >
                  + Agregar color
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={vs.handle}
              onChange={(e) => setVs({ ...vs, handle: e.target.value })}
              placeholder="Pie de la imagen (ej: @ismconsulting · ismconsulting.com)"
              className="flex-1 min-w-[220px] bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
            />
            <input
              value={vs.avoid}
              onChange={(e) => setVs({ ...vs, avoid: e.target.value })}
              placeholder="Evitar (ej: personas de stock, símbolos de dólar)"
              className="flex-1 min-w-[220px] bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
            />
            <button onClick={saveVisualStyle} className="px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/10">
              Guardar estilo
            </button>
          </div>
        </div>
      )}

      {auto && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">📎 Referencias de estilo</p>
            <p className="text-xs text-zinc-400">
              Pega el TEXTO de posts que te gustan (la IA no puede abrir links). Si pones un link, añade en la nota qué te gusta de él. Se usan como guía de estilo (máx. 15).
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
              placeholder="Texto de un post que te gusta (o un link + nota)"
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
              Copia todos los prompts y pega CADA bloque como un mensaje nuevo en ChatGPT. Descarga cada imagen y súbela en su post: se recorta al tamaño exacto de la red y se convierte a JPEG sola.
            </p>
          </div>
          <button
            onClick={() => copyText(
              missingImages
                .map((p, i) => `━━━ IMAGEN ${i + 1} de ${missingImages.length} · ${PLATFORM_CONFIG[p.platform]?.label ?? p.platform} · ${brandOf(p)} ━━━\n${promptFor(p)}`)
                .join('\n\n'),
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
              {post.platform === 'twitter' && (() => {
                const len = composePostText('twitter', copy, post.hashtags).length
                const raw = copy.length + (post.hashtags.length ? post.hashtags.slice(0, 2).join(' ').length + 2 : 0)
                return (
                  <p className={`text-xs ${raw > TWEET_MAX ? 'text-red-300' : 'text-zinc-400'}`}>
                    {raw}/{TWEET_MAX} caracteres{raw > TWEET_MAX ? ` — se recortará a ${len} al publicar` : ''}
                  </p>
                )
              })()}
              <p className="text-xs text-zinc-300">CTA: {post.cta}</p>
              {post.facts && post.facts.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-amber-300 mb-1">✅ Verifica antes de aprobar</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs text-zinc-300">
                    {post.facts.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                  <p className="text-[11px] text-zinc-500 mt-1">Confirma estos datos en IRS.gov o con tu contador.</p>
                </div>
              )}
              <div className="rounded-lg border border-dashed border-zinc-700 p-2.5 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">🖼️ Imagen · {IMAGE_SPECS[post.platform]?.width}×{IMAGE_SPECS[post.platform]?.height} ({IMAGE_SPECS[post.platform]?.ratio})</p>
                {post.imageUrl ? (
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={localImagePath(post.imageUrl)} alt="" className="w-24 h-24 rounded-md object-cover border border-zinc-700" />
                    <div className="space-y-1">
                      {post.imageWidth && post.imageHeight && <p className="text-xs text-zinc-400">{post.imageWidth}×{post.imageHeight}</p>}
                      <button onClick={() => removeImage(post.id)} className="text-xs text-red-300 hover:text-red-200">Quitar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-zinc-500">Texto que aparecerá escrito en la imagen (editable; el prompt se actualiza solo):</p>
                    <input
                      value={textOf(post).headline}
                      onChange={(e) => setImgText((m) => ({ ...m, [post.id]: { ...textOf(post), headline: e.target.value } }))}
                      onBlur={() => saveImageText(post)}
                      placeholder="Titular"
                      className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-100"
                    />
                    <input
                      value={textOf(post).subheadline ?? ''}
                      onChange={(e) => setImgText((m) => ({ ...m, [post.id]: { ...textOf(post), subheadline: e.target.value } }))}
                      onBlur={() => saveImageText(post)}
                      placeholder="Subtítulo (opcional)"
                      className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                    />
                    <textarea
                      value={(textOf(post).bullets ?? []).join('\n')}
                      onChange={(e) => setImgText((m) => ({ ...m, [post.id]: { ...textOf(post), bullets: e.target.value.split('\n').slice(0, 3) } }))}
                      onBlur={() => saveImageText(post)}
                      rows={3}
                      placeholder="Hasta 3 puntos, uno por línea (opcional)"
                      className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 resize-none"
                    />
                    <details className="text-xs text-zinc-400">
                      <summary className="cursor-pointer text-zinc-300">Ver el prompt completo</summary>
                      <pre className="mt-1.5 whitespace-pre-wrap rounded-md bg-zinc-950/60 border border-zinc-800 p-2 text-[11px] text-zinc-400">{promptFor(post)}</pre>
                    </details>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => copyText(promptFor(post), 'Prompt copiado')}
                        className="text-xs text-zinc-200 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500"
                      >
                        Copiar prompt
                      </button>
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

      {scheduled.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">
            Programados {publishOn ? '— salen solos a su hora' : '— súbelos a mano (publicación automática sin conectar)'}
          </h3>
          {scheduled.map((post) => {
            const plat = PLATFORM_CONFIG[post.platform]
            const cfg = POST_STATUS_CONFIG[post.status]
            const busy = busyId === post.id
            return (
              <div key={post.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                <span className={`w-2 h-2 rounded-full ${cfg?.dot ?? ''}`} />
                <span className="text-sm text-zinc-200 flex-1 min-w-[160px] truncate">{plat?.emoji} {post.topic}</span>
                <input
                  type="datetime-local"
                  defaultValue={toLocalInput(post.scheduledDate)}
                  disabled={post.status === 'publishing'}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value !== toLocalInput(post.scheduledDate)) {
                      patch(post.id, { scheduledDate: new Date(e.target.value).toISOString() }, 'Reprogramado')
                    }
                  }}
                  className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200"
                />
                <span className={`text-xs ${post.imageUrl ? 'text-emerald-300' : 'text-amber-300'}`}>{post.imageUrl ? '🖼️' : 'sin imagen'}</span>
                {post.status === 'publishing' && <span className="text-xs text-indigo-300">Publicando…</span>}
                {post.publishError && post.status === 'approved' && (
                  <span className="text-xs text-amber-300" title={post.publishError}>reintento {post.publishAttempts}/3</span>
                )}
                {publishOn && !publishPlatforms.includes(post.platform) && (
                  <span className="text-xs text-zinc-400">súbelo a mano</span>
                )}
                {publishOn && publishPlatforms.includes(post.platform) && post.imageUrl && post.status === 'approved' && (
                  <button
                    disabled={busy}
                    onClick={() => publishNow(post.id)}
                    className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 disabled:opacity-40"
                  >
                    {busy ? 'Enviando…' : 'Publicar ahora'}
                  </button>
                )}
                <button
                  onClick={() => copyText(composePostText(post.platform, post.copy, post.hashtags), 'Texto copiado')}
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

      {failed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-300">Fallaron al publicar</h3>
          {failed.map((post) => {
            const plat = PLATFORM_CONFIG[post.platform]
            const busy = busyId === post.id
            return (
              <div key={post.id} className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-zinc-200 flex-1 min-w-[160px] truncate">{plat?.emoji} {post.topic}</span>
                  {publishOn && publishPlatforms.includes(post.platform) && post.imageUrl && (
                    <button
                      disabled={busy}
                      onClick={() => publishNow(post.id)}
                      className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 disabled:opacity-40"
                    >
                      {busy ? 'Enviando…' : 'Reintentar'}
                    </button>
                  )}
                  <button
                    onClick={() => copyText(composePostText(post.platform, post.copy, post.hashtags), 'Texto copiado')}
                    className="text-xs text-zinc-300 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500"
                  >
                    Copiar
                  </button>
                  <button
                    onClick={() => patch(post.id, { status: 'published' }, 'Marcado como publicado')}
                    className="text-xs text-emerald-300 border border-emerald-500/40 rounded-md px-2 py-1 hover:bg-emerald-500/10"
                  >
                    Lo subí a mano
                  </button>
                </div>
                {post.publishError && <p className="text-xs text-red-300/80">{post.publishError}</p>}
              </div>
            )
          })}
        </div>
      )}

      {published.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-zinc-300">Publicados esta semana</h3>
          {published.map((post) => (
            <div key={post.id} className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="flex-1 truncate">{PLATFORM_CONFIG[post.platform]?.emoji} {post.topic}</span>
              {post.externalUrl && (
                <a href={post.externalUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200">Ver post ↗</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

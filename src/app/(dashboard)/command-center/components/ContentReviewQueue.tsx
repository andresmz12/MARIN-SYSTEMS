'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany, GeneratedPost } from '../types'
import { PLATFORM_CONFIG, POST_STATUS_CONFIG } from '../utils'
import { AUTO_PLATFORMS, TWEET_MAX, composePostText } from '@/lib/platforms'
import { FactCheckPanel } from './FactCheckPanel'
import { MetricsForm } from './MetricsForm'
import { PostPreview } from './PostPreview'
import { lintPost } from '@/lib/compliance'
import { KIND_LABEL, type PostKind } from '@/lib/post-kinds'
import { PublishBoard } from './PublishBoard'
import { AgentReportsPanel } from './AgentReportsPanel'
import { IMAGE_SPECS, buildCarouselPrompt, buildImagePrompt, imagePlatformOf, parseImageText, parseSlides, parseVisualStyle, type ImageText, type Slide } from '@/lib/image-prompt'

interface Props {
  /** La empresa que se está viendo: todo en esta pantalla es de ella. */
  company: CEOCompany
  /** Lleva a la pestaña Empresas (donde se crea el perfil de marca). */
  onOpenCompanies?: () => void
}

interface AutoState {
  autoEnabled: boolean
  newsEnabled: boolean
  autoPlatforms: string[]
}

interface Reference { type: 'link' | 'text'; value: string; note?: string }

// La URL guardada es absoluta (para las redes); en pantalla se usa la ruta relativa
// para no depender de que NEXT_PUBLIC_APP_URL coincida con el dominio actual (CSP).
function localImagePath(url: string): string {
  try { return new URL(url).pathname } catch { return url }
}

export function ContentReviewQueue({ company, onOpenCompanies }: Props) {
  const { showToast } = useToast()
  const [posts, setPosts] = useState<GeneratedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const companyId = company.id
  const [auto, setAuto] = useState<AutoState | null>(null)
  const [refs, setRefs] = useState<Reference[]>([])
  const [refInput, setRefInput] = useState('')
  const [refNote, setRefNote] = useState('')
  const [imgText, setImgText] = useState<Record<string, ImageText>>({})
  const [cropMode, setCropMode] = useState(false)
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [imgAi, setImgAi] = useState<{ openaiReady: boolean; model: string; logo: string | null; face: string | null } | null>(null)
  const [assetVer, setAssetVer] = useState(0)
  const [slideDraft, setSlideDraft] = useState<Record<string, Slide[]>>({})
  const [vs, setVs] = useState({ style: '', handle: '', avoid: '', palette: [] as string[] })
  const [vsColor, setVsColor] = useState('#22d3ee')
  const [publishOn, setPublishOn] = useState(false)
  const [publishPlatforms, setPublishPlatforms] = useState<string[]>([])
  const [autoLoaded, setAutoLoaded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState<boolean | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number | null; ms: number; body: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ceo/content-queue')
      if (res.ok) {
        const d = (await res.json()) as { posts: GeneratedPost[]; publishConfigured: boolean; publishPlatforms: string[] }
        setPosts(d.posts.filter((p) => p.companyId === companyId))
        setPublishOn(d.publishConfigured)
        setPublishPlatforms(d.publishPlatforms ?? [])
      }
    } catch {
      showToast('Error al cargar la bandeja', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, companyId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!companyId) return
    setAuto(null)
    setAutoLoaded(false)
    fetch(`/api/ceo/brand-profile?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: (AutoState & { id: string; references?: Reference[] | null; visualStyle?: unknown }) | null) => {
        setAuto(p ? { autoEnabled: p.autoEnabled, newsEnabled: !!p.newsEnabled, autoPlatforms: p.autoPlatforms } : null)
        setRefs(Array.isArray(p?.references) ? p.references : [])
        const v = parseVisualStyle(p?.visualStyle)
        setVs({ style: v.style ?? '', handle: v.handle ?? '', avoid: v.avoid ?? '', palette: v.palette ?? [] })
      })
      .catch(() => setAuto(null))
      .finally(() => setAutoLoaded(true))
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    fetch(`/api/ceo/brand-assets?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setImgAi(d))
      .catch(() => setImgAi(null))
  }, [companyId, assetVer])

  async function uploadAsset(kind: 'logo' | 'face', file: File) {
    const form = new FormData()
    form.append('companyId', companyId)
    form.append('kind', kind)
    form.append('file', file)
    const res = await fetch('/api/ceo/brand-assets', { method: 'POST', body: form })
    if (res.ok) { showToast(kind === 'logo' ? 'Logo guardado' : 'Foto guardada', 'success'); setAssetVer((v) => v + 1) }
    else showToast(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'No se pudo guardar', 'error')
  }
  async function removeAsset(kind: 'logo' | 'face') {
    await fetch(`/api/ceo/brand-assets?companyId=${companyId}&kind=${kind}`, { method: 'DELETE' })
    setAssetVer((v) => v + 1)
  }

  const [generating, setGenerating] = useState(false)
  const [newsBusy, setNewsBusy] = useState(false)
  const [newsResult, setNewsResult] = useState<{
    found?: number; fresh?: number; latest?: string | null; undated?: number; skipped?: string; feedErrors?: string[]; sample?: { title: string; date: string | null }[]
    summary?: { company: string; created: number; news?: number; web?: number; skipped?: string; error?: string; rejected?: string[] }[]
  } | null>(null)

  async function checkNews() {
    setNewsBusy(true)
    setNewsResult(null)
    try {
      const res = await fetch('/api/ceo/news/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const d = await res.json().catch(() => ({})) as NonNullable<typeof newsResult> & { error?: string }
      if (!res.ok) throw new Error(d.error ?? 'No se pudo buscar noticias')
      setNewsResult(d)
      const created = d.summary?.reduce((n, r) => n + r.created, 0) ?? 0
      showToast(created > 0 ? `${created > 1 ? 'Hay noticias nuevas' : 'Hay una noticia nueva'}: revísala abajo` : 'No hay noticias nuevas que sirvan por ahora', created > 0 ? 'success' : 'info')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo buscar noticias', 'error')
    } finally {
      setNewsBusy(false)
    }
  }

  async function generateWeek(force = false) {
    setGenerating(true)
    try {
      const res = await fetch('/api/ceo/content/generate-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ...(force ? { force: true } : {}) }),
      })
      const d = await res.json().catch(() => ({})) as { created?: number; skipped?: string | null; error?: string }
      if (!res.ok) throw new Error(d.error ?? 'No se pudo generar la tanda')
      if (d.skipped) {
        showToast(`No se generó: ${d.skipped}.`, 'info')
        if (!force && window.confirm(`No se generó porque ${d.skipped}.\n\n¿Generar la tanda nueva igual? Se sumará a lo que ya tienes.`)) {
          setGenerating(false)
          await generateWeek(true)
          return
        }
      }
      else showToast(`Tanda nueva lista: ${d.created} posts. Revísala abajo.`, 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo generar la tanda', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function discardAll(list: GeneratedPost[]) {
    if (!window.confirm(`¿Descartar los ${list.length} posts de la tanda anterior? Quedan rechazados y no se publican.`)) return
    setBusyId('discard')
    try {
      const results = await Promise.all(list.map((p) => fetch(`/api/ceo/content/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })))
      if (results.some((r) => !r.ok)) throw new Error()
      showToast('Tanda anterior descartada', 'success')
      await load()
    } catch {
      showToast('No se pudieron descartar todos', 'error')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function toggleNews() {
    if (!auto) return
    const next = !auto.newsEnabled
    const res = await fetch('/api/ceo/brand-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, newsEnabled: next }),
    })
    if (res.ok) {
      setAuto({ ...auto, newsEnabled: next })
      showToast(next ? 'Noticias automáticas activadas' : 'Noticias automáticas pausadas', 'success')
    } else {
      showToast('No se pudo cambiar el aviso de noticias', 'error')
    }
  }

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
      platform: imagePlatformOf(p),
      brandName: brandOf(p),
      scene: p.imagePrompt,
      text: t.headline.trim() ? t : null,
      style: parseVisualStyle(p.brandProfile?.visualStyle),
    })
  }

  const carouselPromptFor = (p: GeneratedPost): string =>
    buildCarouselPrompt({ brandName: brandOf(p), slides: slidesOf(p), style: parseVisualStyle(p.brandProfile?.visualStyle), face: !!textOf(p).face })

  async function saveImageText(p: GeneratedPost, override?: ImageText) {
    const t = override ?? textOf(p)
    if (!t.headline.trim()) return
    const res = await fetch(`/api/ceo/content/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageText: {
          headline: t.headline.trim(),
          ...(t.subheadline?.trim() ? { subheadline: t.subheadline.trim() } : {}),
          ...(t.keyFact?.trim() ? { keyFact: t.keyFact.trim() } : {}),
          ...(t.bullets?.some((b) => b.trim()) ? { bullets: t.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 5) } : {}),
          ...(t.cta?.trim() ? { cta: t.cta.trim() } : {}),
          ...(t.face !== undefined ? { face: t.face } : {}),
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

  // Genera la imagen con OpenAI (solo posts de una imagen). Devuelve true si quedó lista.
  async function generateImageAI(post: GeneratedPost, quiet = false): Promise<boolean> {
    setBusyId(post.id)
    if (!quiet) showToast('Generando la imagen con IA… tarda de 30 a 90 segundos', 'success')
    try {
      const res = await fetch(`/api/ceo/content/${post.id}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptFor(post), mode: cropMode ? 'crop' : 'complete' }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        showToast(err.error ?? 'No se pudo generar la imagen', 'error')
        return false
      }
      if (!quiet) showToast('Imagen lista. Ábrela y revisa que el texto salga bien escrito.', 'success')
      await load()
      return true
    } catch {
      showToast('No se pudo generar la imagen', 'error')
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function generateAllAI(list: GeneratedPost[]) {
    if (!window.confirm(`Voy a generar ${list.length} ${list.length === 1 ? 'imagen' : 'imágenes'} con la IA de OpenAI (cada una cuesta unos centavos de dólar y tarda ~1 minuto). ¿Seguimos?`)) return
    let ok = 0
    for (let i = 0; i < list.length; i++) {
      showToast(`Generando imagen ${i + 1} de ${list.length}…`, 'success')
      if (await generateImageAI(list[i], true)) ok++
      else break
    }
    showToast(ok === list.length ? `${ok} ${ok === 1 ? 'imagen lista' : 'imágenes listas'}. Revísalas antes de aprobar.` : `Se generaron ${ok} de ${list.length}`, ok === list.length ? 'success' : 'error')
  }

  async function uploadImage(id: string, file: File) {
    setBusyId(id)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mode', cropMode ? 'crop' : 'complete')
      const res = await fetch(`/api/ceo/content/${id}/image`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      const d = await res.json().catch(() => null) as { fit?: { platform?: string; action: string; from: { width: number; height: number }; to: { width: number; height: number }; target: string | null } } | null
      const fit = d?.fit
      if (fit?.action === 'complete') showToast('Imagen completa: no se cortó nada. Los lados se rellenaron con la misma imagen difuminada.', 'success')
      else if (fit?.action === 'crop') {
        // Cuánto se recortó por lado: así se sabe si el logo o el texto pudieron quedar pegados al borde.
        const tall = fit.from.height / fit.from.width > fit.to.height / fit.to.width
        const pct = Math.round((tall ? (1 - (fit.from.width * fit.to.height) / fit.to.width / fit.from.height) : (1 - (fit.from.height * fit.to.width) / fit.to.height / fit.from.width)) * 50)
        showToast(`Imagen ajustada: se recortó ~${pct}% ${tall ? 'arriba y abajo' : 'a cada lado'}. Ábrela y revisa que el logo y el texto no queden pegados al borde.`, 'success')
      }
      else if (fit?.action === 'mismatch') showToast(`La imagen (${fit.from.width}×${fit.from.height}) no tiene la orientación de ${IMAGE_SPECS[d?.fit?.platform ?? '']?.label ?? 'la red'}${fit.target ? ` (${fit.target})` : ''}. Genérala otra vez con el formato que pide el prompt.`, 'error')
      else showToast('Imagen subida', 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo subir la imagen', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const slidesOf = (p: GeneratedPost): Slide[] => slideDraft[p.id] ?? parseSlides(p.slides)

  async function planCarousel(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/ceo/content/${id}/slides/plan`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      setSlideDraft((m) => { const n = { ...m }; delete n[id]; return n })
      showToast('Carrusel armado: revisa el texto de cada lámina', 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo armar el carrusel', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function saveSlides(id: string, slides: Slide[]) {
    const clean = slides.map((x) => ({ title: x.title.trim(), ...(x.body?.trim() ? { body: x.body.trim() } : {}), ...(x.visual?.trim() ? { visual: x.visual.trim() } : {}) })).filter((x) => x.title)
    const res = await fetch(`/api/ceo/content/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: clean }),
    })
    if (!res.ok) { showToast('No se pudo guardar el texto de las láminas', 'error'); return false }
    return true
  }

  async function uploadSlides(id: string, files: File[]) {
    setBusyId(id)
    try {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      const res = await fetch(`/api/ceo/content/${id}/slides`, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      showToast(`Carrusel subido: ${files.length} láminas`, 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudieron subir las láminas', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function removeCarousel(id: string, keepText: boolean) {
    if ((posts.find((p) => p.id === id)?.slideImageUrls?.length ?? 0) > 1) {
      const res = await fetch(`/api/ceo/content/${id}/slides`, { method: 'DELETE' })
      if (!res.ok) { showToast('No se pudo quitar el carrusel', 'error'); return }
    }
    if (!keepText) {
      await saveSlides(id, [])
      setSlideDraft((m) => { const n = { ...m }; delete n[id]; return n })
    }
    await load()
  }

  /** Devuelve el contenido (todas sus redes) a "Por aprobar" para poder cambiar texto, imagen o carrusel y volver a aprobarlo. */
  async function reopenPost(post: GeneratedPost) {
    const warn = post.status === 'published'
      ? `Este post ya salió publicado${post.platform === 'linkedin' ? ' en LinkedIn' : ''}. Si lo editas y lo vuelves a aprobar, se publicará OTRA VEZ (quedaría duplicado en la red): borra antes el anterior en la red.\n\n`
      : ''
    if (!window.confirm(`${warn}¿Volver "${post.topic}" a "Por aprobar" para editarlo? Cambiarás texto e imagen allí y lo apruebas de nuevo.`)) return
    await patch(post.id, { status: 'pending_review', publishedAt: null }, 'Listo: está en "Por aprobar" para editarlo')
  }

  async function deletePost(post: GeneratedPost) {
    const was = post.status === 'published' ? '\n\nSi ya estaba publicado en una red, tendrás que borrarlo allá a mano: aquí solo se elimina de la app y del calendario.' : ''
    if (!window.confirm(`¿Eliminar "${post.topic}" en todas las redes?${was}`)) return
    const res = await fetch(`/api/ceo/content/${post.id}?group=1`, { method: 'DELETE' })
    if (res.ok) { showToast('Post eliminado', 'success'); await load() }
    else showToast('No se pudo eliminar el post', 'error')
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

  async function regenerate(id: string, only?: 'image') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/ceo/content/${id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: notes[id] ?? '', ...(only ? { only } : {}) }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        showToast(data.error ?? 'No se pudo regenerar', 'error')
        return
      }
      setEdits((e) => { const { [id]: _, ...rest } = e; return rest })
      setImgText((m) => { const { [id]: _, ...rest } = m; return rest })
      showToast(only === 'image' ? 'Propuesta de imagen nueva (el texto no cambió)' : 'Post regenerado', 'success')
      await load()
    } catch {
      showToast('No se pudo regenerar', 'error')
    } finally {
      setBusyId(null)
    }
  }

  // La IA reescribe solo lo que marcó la revisión de cumplimiento (sin cambiar datos) y guarda la versión anterior.
  async function fixCompliance(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/ceo/content/${id}/compliance-fix`, { method: 'POST' })
      const d = (await res.json().catch(() => ({}))) as { error?: string; remaining?: { message: string }[] }
      if (!res.ok) { showToast(d.error ?? 'No se pudo corregir', 'error'); return }
      setEdits((e) => { const { [id]: _, ...rest } = e; return rest })
      setImgText((m) => { const { [id]: _, ...rest } = m; return rest })
      showToast(d.remaining?.length ? `Corregido, pero quedan ${d.remaining.length} puntos: revísalos.` : 'Corregido. Lee el texto y la imagen antes de aprobar.', d.remaining?.length ? 'info' : 'success')
      await load()
    } catch {
      showToast('No se pudo corregir', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function restoreVersion(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/ceo/content/${id}/restore`, { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        showToast(data.error ?? 'No se pudo volver a la versión anterior', 'error')
        return
      }
      setEdits((e) => { const { [id]: _, ...rest } = e; return rest })
      setImgText((m) => { const { [id]: _, ...rest } = m; return rest })
      showToast('Texto anterior recuperado', 'success')
      await load()
    } catch {
      showToast('No se pudo volver a la versión anterior', 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Aprueba varios posts a la vez (solo los que tienen imagen y sin error de datos).
  async function approveMany(ids: string[]) {
    let ok = 0
    for (const id of ids) {
      const res = await fetch(`/api/ceo/content/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', ...(edits[id] !== undefined ? { copy: edits[id] } : {}) }),
      }).catch(() => null)
      if (res?.ok) ok++
    }
    setSelected([])
    showToast(ok === ids.length ? `${ok} ${ok === 1 ? 'post aprobado' : 'posts aprobados'}` : `Se aprobaron ${ok} de ${ids.length}`, ok === ids.length ? 'success' : 'error')
    await load()
  }

  // Un mismo contenido para varias redes se muestra como UNA tarjeta (la primera del grupo).
  const membersOf = (p: GeneratedPost) => (p.groupId ? posts.filter((x) => x.groupId === p.groupId) : [p])
  const pending = posts.filter((p) => p.status === 'pending_review' && (!p.groupId || posts.find((x) => x.groupId === p.groupId && x.status === 'pending_review') === p))
  const scheduledAll = posts.filter((p) => p.status === 'approved' || p.status === 'publishing')
  const manualTikTok = scheduledAll.filter((p) => p.platform === 'tiktok')
  const scheduled = scheduledAll.filter((p) => p.platform !== 'tiktok')
  const failed = posts.filter((p) => p.status === 'failed')
  const published = posts.filter((p) => p.status === 'published')
  // Asistente de configuración: lo mínimo para que el sistema trabaje solo.
  const hasStyle = !!(vs.style || vs.handle || vs.palette.length)
  const steps: { key: string; done: boolean; optional?: boolean; title: string; help: string; action?: { label: string; run: () => void } }[] = [
    {
      key: 'brand',
      done: !!auto,
      title: 'Crea el perfil de marca',
      help: 'En Empresas, pulsa "Configurar marca" y completa tono, público y temas.',
      action: onOpenCompanies ? { label: 'Ir a Empresas', run: onOpenCompanies } : undefined,
    },
    {
      key: 'style',
      done: hasStyle,
      title: 'Elige el estilo visual',
      help: 'Colores, estilo y @usuario que salen en cada imagen. Está en ⚙️ Configuración.',
      action: auto ? { label: 'Abrir configuración', run: () => setSettingsOpen(true) } : undefined,
    },
    {
      key: 'auto',
      done: !!auto?.autoEnabled,
      title: 'Activa el piloto automático',
      help: 'Cada sábado genera los posts de la semana. Nada se publica sin que lo apruebes.',
      action: auto && !auto.autoEnabled ? { label: 'Activar', run: toggleAuto } : undefined,
    },
    {
      key: 'publish',
      done: publishOn,
      optional: true,
      title: 'Conecta la publicación (opcional)',
      help: 'Sin esto, tú copias el texto y subes cada post. Con esto, sale solo a su hora.',
      action: { label: 'Ver cómo', run: () => setSettingsOpen(true) },
    },
  ]
  const required = steps.filter((st) => !st.optional)
  const setupDone = required.every((st) => st.done)
  const doneCount = required.filter((st) => st.done).length
  const missingImages = pending.filter((p) => !p.imageUrl && (p.imagePrompt || p.imageText))

  return (
    <div className="space-y-5">
      {!setupDone ? (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-indigo-100">🚀 Empieza aquí · {doneCount} de {required.length} listos</p>
            <div className="h-1.5 w-32 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-indigo-400 transition-all" style={{ width: `${(doneCount / required.length) * 100}%` }} />
            </div>
          </div>
          <ol className="space-y-2">
            {steps.map((st, i) => (
              <li key={st.key} className="flex items-start gap-3">
                <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full text-[11px] flex items-center justify-center border ${st.done ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'border-zinc-600 text-zinc-400'}`}>
                  {st.done ? '✓' : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${st.done ? 'text-zinc-500 line-through' : 'text-zinc-100 font-medium'}`}>{st.title}</p>
                  {!st.done && <p className="text-xs text-zinc-400">{st.help}</p>}
                </div>
                {!st.done && st.action && (
                  <button onClick={st.action.run} className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2.5 py-1 hover:bg-indigo-500/10 whitespace-nowrap">
                    {st.action.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-xs text-emerald-300/80">
          ✓ Todo configurado.{!publishOn && ' Publicación automática sin conectar: copia y sube tú los posts aprobados (opcional conectarla en ⚙️ Configuración).'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold text-zinc-100">🤖 Piloto automático</p>
          <p className="text-xs text-zinc-400">
            Cada sábado genera los posts de lunes, miércoles y viernes (solo imágenes). Los videos los subes tú. Nada se publica sin tu aprobación.
          </p>
        </div>
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
        {auto?.autoEnabled && (
          <button
            onClick={() => generateWeek()}
            disabled={generating}
            title="Crea ahora la tanda de la semana, sin esperar al sábado"
            className="px-3.5 py-1.5 rounded-lg text-sm font-medium border border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-50"
          >
            {generating ? 'Generando… (2-3 min)' : '✨ Generar tanda ahora'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold text-zinc-100">📰 Noticias automáticas</p>
          <p className="text-xs text-zinc-400">
            Los lunes y jueves revisa las noticias oficiales (IRS) y la web. Si hay una de los últimos 7 días que sirva, te prepara el post y te avisa por correo. Tú lo revisas y apruebas.
          </p>
        </div>
        <button
          onClick={toggleNews}
          disabled={!auto}
          title={auto ? undefined : 'Configura primero el perfil de marca de esta empresa'}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all disabled:opacity-40 ${
            auto?.newsEnabled
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
              : 'text-zinc-300 border-zinc-700 hover:border-zinc-500'
          }`}
        >
          {auto?.newsEnabled ? 'Activadas ✓' : 'Activar'}
        </button>
        <button
          onClick={checkNews}
          disabled={!auto?.newsEnabled || newsBusy}
          title={auto?.newsEnabled ? undefined : 'Activa primero las noticias automáticas'}
          className="px-3.5 py-1.5 rounded-lg text-sm font-medium border border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-40"
        >
          {newsBusy ? 'Buscando… (1-2 min)' : '🔎 Buscar noticias ahora'}
        </button>
        {newsResult && (
          <div className="basis-full rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-300 space-y-1.5">
            {newsResult.skipped ? (
              <p>{newsResult.skipped}</p>
            ) : (
              <>
                <p>
                  Vi <b>{newsResult.found ?? 0}</b> enlaces en la fuente; <b>{newsResult.fresh ?? 0}</b> son noticias de los últimos 7 días con su fecha.
                  {newsResult.latest ? <> La más reciente que encontré es del <b>{newsResult.latest.split('-').reverse().join('/')}</b>.</> : null}
                  {(newsResult.undated ?? 0) > 0 ? <span className="text-zinc-500"> ({newsResult.undated} enlaces sin fecha, como menús, se ignoran.)</span> : null}
                </p>
                {newsResult.summary?.map((r) => (
                  <div key={r.company}>
                    <p>{r.error ? `⚠️ ${r.error}` : r.created > 0 ? `✅ Creé ${r.news ?? 1} ${(r.news ?? 1) === 1 ? 'noticia nueva' : 'noticias nuevas'}. Revísa${(r.news ?? 1) === 1 ? 'la' : 'las'} abajo.` : `Sin posts nuevos${r.skipped ? `: ${r.skipped}` : '.'}`}</p>
                    {typeof r.web === 'number' && <p className="pl-3 text-zinc-500">🌐 La búsqueda en la web propuso {r.web} {r.web === 1 ? 'noticia' : 'noticias'}.</p>}
                    {r.rejected?.map((x) => <p key={x} className="pl-3 text-zinc-500">✕ {x}</p>)}
                  </div>
                ))}
                {(newsResult.feedErrors?.length ?? 0) > 0 && newsResult.feedErrors!.map((e) => <p key={e} className="text-red-300">⚠️ {e}</p>)}
                {(newsResult.sample?.length ?? 0) > 0 && (
                  <details>
                    <summary className="cursor-pointer text-zinc-400">Las noticias con fecha que leí</summary>
                    <ul className="mt-1 space-y-0.5 pl-3 text-zinc-500">
                      {newsResult.sample!.map((x) => <li key={x.title}>{x.date} · {x.title}</li>)}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <AgentReportsPanel companyId={companyId} />

      <details open={settingsOpen ?? !setupDone} className="rounded-xl border border-zinc-800 bg-zinc-900/30">
        {/* Solo cuenta el clic del usuario: así se abre sola mientras falta configurar y se cierra cuando todo está listo. */}
        <summary
          onClick={(e) => { e.preventDefault(); setSettingsOpen(!(settingsOpen ?? !setupDone)) }}
          className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-200"
        >
          ⚙️ Configuración de la marca y de la publicación
        </summary>
        <div className="space-y-4 p-4 pt-1">
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
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(vsColor) ? vsColor : "#000000"} onChange={(e) => setVsColor(e.target.value)} className="w-8 h-7 bg-transparent border border-zinc-700 rounded cursor-pointer" />
                <input
                  value={vsColor}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    setVsColor(v.startsWith('#') ? v : `#${v}`)
                  }}
                  maxLength={7}
                  placeholder="#c99a2e"
                  aria-label="Código del color"
                  className="w-24 bg-zinc-800/70 border border-zinc-700 rounded-md px-2 py-1 text-xs font-mono text-zinc-200"
                />
                <button
                  onClick={() => { const c = vsColor.toLowerCase(); if (/^#[0-9a-f]{6}$/.test(c) && !vs.palette.includes(c)) setVs({ ...vs, palette: [...vs.palette, c] }); else if (!/^#[0-9a-f]{6}$/.test(c)) showToast('Escribe el color con 6 letras o números, ej: #c99a2e', 'error') }}
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
      {imgAi && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-zinc-100">✨ Imágenes con IA (OpenAI)</p>
            <p className="text-xs text-zinc-500">
              {imgAi.openaiReady
                ? `Activado (modelo ${imgAi.model}). Cada post de una imagen tendrá el botón "Generar imagen con IA". Los carruseles se siguen haciendo en Gemini.`
                : 'Para activarlo agrega la variable OPENAI_API_KEY en Railway (la clave sale de platform.openai.com → API keys; la cuenta de API se recarga aparte de ChatGPT).'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([['logo', 'Logo de la marca', 'Se manda como referencia en TODAS las imágenes.'], ['face', 'Foto de la vocera (la cara de ISM)', 'Solo en los posts marcados "Con la cara de la marca".']] as const).map(([kind, title, hint]) => (
              <div key={kind} className="rounded-lg border border-dashed border-zinc-700 p-2.5 space-y-2">
                <p className="text-xs font-medium text-zinc-200">{title}</p>
                <div className="flex items-center gap-3">
                  {imgAi[kind] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/ceo/brand-assets?companyId=${companyId}&kind=${kind}&v=${imgAi[kind]}`} alt={title} className="h-16 w-16 rounded-md border border-zinc-700 bg-white object-contain" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-md border border-zinc-700 text-[10px] text-zinc-500">Sin imagen</span>
                  )}
                  <div className="space-y-1">
                    <label className="inline-block cursor-pointer text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10">
                      {imgAi[kind] ? 'Cambiar' : 'Subir'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAsset(kind, f); e.target.value = '' }} />
                    </label>
                    {imgAi[kind] && <button onClick={() => removeAsset(kind)} className="ml-2 text-xs text-red-300 hover:text-red-200">Quitar</button>}
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500">{hint}</p>
              </div>
            ))}
          </div>
        </div>
      )}
        </div>
      </details>

      {missingImages.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-semibold text-amber-200">🖼️ Faltan {missingImages.length} imagen{missingImages.length > 1 ? 'es' : ''}</p>
            <p className="text-xs text-zinc-400">
              Genera cada imagen con IA, o copia todos los prompts y pega CADA bloque como un mensaje nuevo en ChatGPT. Descarga cada imagen y súbela en su post: se recorta al tamaño exacto de la red y se convierte a JPEG sola.
            </p>
          </div>
          {imgAi?.openaiReady && missingImages.some((p) => slidesOf(p).length === 0) && (
            <button
              disabled={busyId !== null}
              onClick={() => generateAllAI(missingImages.filter((p) => slidesOf(p).length === 0))}
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/10 disabled:opacity-40"
            >
              ✨ Generar todas con IA
            </button>
          )}
          <button
            onClick={() => copyText(
              missingImages
                .map((p, i) => `━━━ IMAGEN ${i + 1} de ${missingImages.length} · ${brandOf(p)} ━━━\n${promptFor(p)}`)
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

      {(() => {
        const renderPost = (post: GeneratedPost) => {
          const members = membersOf(post).filter((m) => m.status === 'pending_review')
          const specPlatform = imagePlatformOf(post)
          const busy = busyId === post.id
          const copy = edits[post.id] ?? post.copy
          const tx = textOf(post)
          const issues = lintPost({ copy, imageText: tx.headline.trim() ? tx : null })
          const hasError = issues.some((i) => i.level === 'error')
          return (
            <div key={post.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1">
                  <input
                    type="checkbox"
                    checked={selected.includes(post.id)}
                    onChange={(e) => setSelected((x) => (e.target.checked ? [...x, post.id] : x.filter((i) => i !== post.id)))}
                    className="mr-1 h-4 w-4 accent-indigo-500"
                    title="Seleccionar para aprobar varios a la vez"
                  />
                  {members.map((m) => (
                    <span key={m.id} className={`text-xs px-2 py-0.5 rounded-full border ${PLATFORM_CONFIG[m.platform]?.cls ?? ''}`}>
                      {PLATFORM_CONFIG[m.platform]?.emoji} {PLATFORM_CONFIG[m.platform]?.label ?? m.platform}
                    </span>
                  ))}
                </span>
                <span className="text-xs text-zinc-500">
                  {post.company?.name}{post.scheduledDate ? ` · ${new Date(post.scheduledDate).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {post.kind && KIND_LABEL[post.kind as PostKind] ? `${KIND_LABEL[post.kind as PostKind]} · ` : post.source === 'recycled' ? '♻️ Reutilizado · ' : ''}{post.source === 'news' ? '📰 Noticia' : 'Tema'}: {post.topic}
                {post.sourceUrl && (
                  <> · <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200">Fuente ↗</a></>
                )}
              </p>
              <textarea
                value={copy}
                onChange={(e) => setEdits((x) => ({ ...x, [post.id]: e.target.value }))}
                rows={8}
                className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg p-2.5 text-sm text-zinc-100 resize-y"
              />
              {post.hashtags.length > 0 && (
                <p className="text-xs text-indigo-300">
                  {post.hashtags.join(' ')}
                  {post.hashtags.length > 3 && <span className="block text-[11px] text-zinc-500">Instagram usa hasta 8; Facebook y LinkedIn solo los 3 primeros; X, 2.</span>}
                </p>
              )}
              {members.some((m) => m.platform === 'twitter') && (() => {
                const len = composePostText('twitter', copy, post.hashtags).length
                const raw = copy.length + (post.hashtags.length ? post.hashtags.slice(0, 2).join(' ').length + 2 : 0)
                return (
                  <p className={`text-xs ${raw > TWEET_MAX ? 'text-red-300' : 'text-zinc-400'}`}>
                    X: {raw}/{TWEET_MAX} caracteres{raw > TWEET_MAX ? ` — en X se recortará a ${len} (en las demás redes sale completo)` : ''}
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
              <FactCheckPanel key={`${post.id}-${post.factCheckedAt ?? ''}`} post={post} onDone={load} />
              <div className="rounded-lg border border-dashed border-zinc-700 p-2.5 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">🖼️ Imagen · {IMAGE_SPECS[specPlatform]?.width}×{IMAGE_SPECS[specPlatform]?.height} ({IMAGE_SPECS[specPlatform]?.ratio}){post.groupId ? ' · la misma imagen para todas las redes' : ''}</p>
                {post.imageUrl ? (
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <a href={localImagePath(post.imageUrl)} target="_blank" rel="noreferrer" title="Abrir la imagen completa">
                      <img src={localImagePath(post.imageUrl)} alt="" className="w-32 rounded-md border border-zinc-700 bg-zinc-900 object-contain" style={{ aspectRatio: post.imageWidth && post.imageHeight ? `${post.imageWidth} / ${post.imageHeight}` : undefined }} />
                    </a>
                    <div className="space-y-1">
                      {post.imageWidth && post.imageHeight && <p className="text-xs text-zinc-400">{post.imageWidth}×{post.imageHeight}</p>}
                      <button onClick={() => removeImage(post.id)} className="text-xs text-red-300 hover:text-red-200">Quitar</button>
                      {imgAi?.openaiReady && slidesOf(post).length === 0 && (
                        <button disabled={busy} onClick={() => generateImageAI(post)} className="block text-xs text-indigo-200 hover:text-indigo-100 disabled:opacity-40">
                          {busy ? 'Generando…' : '✨ Generar otra con IA'}
                        </button>
                      )}
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
                    <input
                      value={textOf(post).keyFact ?? ''}
                      onChange={(e) => setImgText((m) => ({ ...m, [post.id]: { ...textOf(post), keyFact: e.target.value } }))}
                      onBlur={() => saveImageText(post)}
                      placeholder="Dato destacado en grande: monto, fecha o formulario (opcional)"
                      className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-200"
                    />
                    <textarea
                      value={(textOf(post).bullets ?? []).join('\n')}
                      onChange={(e) => setImgText((m) => ({ ...m, [post.id]: { ...textOf(post), bullets: e.target.value.split('\n').slice(0, 5) } }))}
                      onBlur={() => saveImageText(post)}
                      rows={4}
                      placeholder="De 3 a 5 puntos, uno por línea (opcional)"
                      className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 resize-none"
                    />
                    <input
                      value={textOf(post).cta ?? ''}
                      onChange={(e) => setImgText((m) => ({ ...m, [post.id]: { ...textOf(post), cta: e.target.value } }))}
                      onBlur={() => saveImageText(post)}
                      placeholder="Acción final, ej: Agenda tu cita hoy (opcional)"
                      className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                    />
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={!!textOf(post).face}
                        onChange={(e) => {
                          const next = { ...textOf(post), face: e.target.checked }
                          setImgText((m) => ({ ...m, [post.id]: next }))
                          void saveImageText(post, next)
                        }}
                      />
                      Con la cara de la marca <span className="text-zinc-500">{imgAi?.openaiReady && imgAi.face ? '(la foto se adjunta sola al generar con IA)' : '(adjunta su foto en ChatGPT junto al prompt)'}</span>
                    </label>
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
                      <label className="flex items-center gap-1 text-[11px] text-zinc-400" title="Por defecto la imagen entra completa y los lados se rellenan con ella difuminada, sin cortar el logo ni el texto">
                        <input type="checkbox" checked={cropMode} onChange={(e) => setCropMode(e.target.checked)} /> recortar en vez de completar
                      </label>
                      {imgAi?.openaiReady && slidesOf(post).length === 0 && (
                        <button
                          disabled={busy}
                          onClick={() => generateImageAI(post)}
                          className="text-xs text-emerald-200 border border-emerald-500/40 rounded-md px-2 py-1 hover:bg-emerald-500/10 disabled:opacity-40"
                          title="Crea la imagen con la IA de OpenAI usando este prompt, el logo y la foto de la marca"
                        >
                          {busy ? 'Generando… (hasta 90 s)' : '✨ Generar imagen con IA'}
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
              <div className="rounded-lg border border-dashed border-amber-500/30 p-2.5 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-amber-300/80">🎠 Carrusel (opcional)</p>
                {slidesOf(post).length === 0 ? (
                  <>
                    <p className="text-[11px] text-zinc-500">Convierte este post en varias láminas deslizables. Instagram las guarda y comparte más que una sola imagen.</p>
                    <button
                      disabled={busy}
                      onClick={() => planCarousel(post.id)}
                      className="text-xs text-amber-200 border border-amber-500/40 rounded-md px-2 py-1 hover:bg-amber-500/10 disabled:opacity-40"
                    >
                      {busy ? 'Armando…' : '🎠 Crear carrusel de este post'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-zinc-500">{slidesOf(post).length} láminas. Edita el texto (queda exacto en las imágenes). Después cópialo a Gemini, exporta las láminas y súbelas todas juntas.</p>
                    <div className="space-y-1.5">
                      {slidesOf(post).map((sl, i) => (
                        <div key={i} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-1.5 space-y-1">
                          <p className="text-[10px] text-zinc-500">Lámina {i + 1}{i === 0 ? ' · portada' : i === slidesOf(post).length - 1 ? ' · cierre' : ''}</p>
                          <input
                            value={sl.title}
                            onChange={(e) => setSlideDraft((m) => ({ ...m, [post.id]: slidesOf(post).map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))}
                            onBlur={() => saveSlides(post.id, slidesOf(post))}
                            className="w-full bg-zinc-800/70 border border-zinc-700 rounded-md px-2 py-1 text-xs font-semibold text-zinc-100"
                          />
                          <textarea
                            value={sl.body ?? ''}
                            onChange={(e) => setSlideDraft((m) => ({ ...m, [post.id]: slidesOf(post).map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) }))}
                            onBlur={() => saveSlides(post.id, slidesOf(post))}
                            rows={2}
                            placeholder="Texto de apoyo (opcional)"
                            className="w-full bg-zinc-800/70 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200 resize-none"
                          />
                          <input
                            value={sl.visual ?? ''}
                            onChange={(e) => setSlideDraft((m) => ({ ...m, [post.id]: slidesOf(post).map((x, j) => (j === i ? { ...x, visual: e.target.value } : x)) }))}
                            onBlur={() => saveSlides(post.id, slidesOf(post))}
                            placeholder="Imagen que generará Gemini (en inglés, sin texto)"
                            className="w-full bg-zinc-800/70 border border-zinc-700 rounded-md px-2 py-1 text-[11px] text-sky-200"
                          />
                        </div>
                      ))}
                    </div>
                    <details className="text-xs text-zinc-400">
                      <summary className="cursor-pointer text-zinc-300">Ver el prompt para Gemini</summary>
                      <pre className="mt-1.5 whitespace-pre-wrap rounded-md bg-zinc-950/60 border border-zinc-800 p-2 text-[11px] text-zinc-400">{carouselPromptFor(post)}</pre>
                    </details>
                    {(post.slideImageUrls?.length ?? 0) > 1 && (
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {post.slideImageUrls!.map((u, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={u} src={localImagePath(u)} alt={`Lámina ${i + 1}`} className="h-24 w-[77px] shrink-0 rounded-md object-cover border border-zinc-700" />
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => copyText(carouselPromptFor(post), 'Prompt del carrusel copiado: pégalo en Gemini')}
                        className="text-xs text-zinc-200 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500"
                      >
                        Copiar slides para Gemini
                      </button>
                      <label className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 cursor-pointer">
                        {busy ? 'Subiendo…' : (post.slideImageUrls?.length ?? 0) > 1 ? 'Cambiar láminas' : 'Subir todas las láminas'}
                        <input
                          type="file"
                          multiple
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={busy}
                          onChange={(e) => {
                            const fs = Array.from(e.target.files ?? [])
                            if (fs.length) uploadSlides(post.id, fs)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      <button onClick={() => removeCarousel(post.id, false)} className="text-xs text-red-300 hover:text-red-200">Quitar carrusel</button>
                    </div>
                  </>
                )}
              </div>
              {(() => {
                const comp = Math.max(0, 100 - issues.filter((i) => i.level === 'error').length * 30 - issues.filter((i) => i.level === 'warn').length * 10)
                const v = post.factCheck?.verdict
                const datos = v === 'ok' ? 100 : v === 'revisar' ? 60 : v === 'error' ? 20 : null
                const overall = datos === null ? comp : Math.round((comp + datos) / 2)
                const tone = overall >= 85 ? 'text-emerald-300 border-emerald-500/40' : overall >= 60 ? 'text-amber-300 border-amber-500/40' : 'text-red-300 border-red-500/40'
                return (
                  <div className={`inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border px-2.5 py-1 text-xs ${tone}`} title="Nota de Felipe: promedio de la revisión de cumplimiento y la verificación de datos">
                    <span>✅ Felipe: <b>{overall}/100</b></span>
                    <span className="text-zinc-400">cumplimiento {comp}</span>
                    <span className="text-zinc-400">datos {datos === null ? 'sin verificar' : datos}</span>
                  </div>
                )
              })()}
              {issues.length > 0 ? (
                <div className={`rounded-lg border p-2.5 ${hasError ? 'border-red-500/40 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                  <p className={`text-[11px] uppercase tracking-wide mb-1 ${hasError ? 'text-red-300' : 'text-amber-300'}`}>🛡️ Revisión de cumplimiento · {issues.length} {issues.length === 1 ? 'punto' : 'puntos'}</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-xs text-zinc-300">
                    {issues.map((i, k) => <li key={k}><span className="text-zinc-500">{i.where === 'imagen' ? 'Imagen' : 'Texto'}:</span> {i.message}</li>)}
                  </ul>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <button
                      disabled={busy || !!edits[post.id]}
                      onClick={() => fixCompliance(post.id)}
                      className="text-xs text-emerald-200 border border-emerald-500/40 rounded-md px-2 py-1 hover:bg-emerald-500/10 disabled:opacity-40"
                      title={edits[post.id] ? 'Guarda o descarta tus cambios al texto antes' : 'La IA reescribe solo lo marcado, sin cambiar los datos'}
                    >
                      {busy ? 'Corrigiendo…' : '🛠 Corregir con IA'}
                    </button>
                    <span className="text-[11px] text-zinc-500">o edítalo tú en el texto o en los campos de la imagen. La revisión se actualiza sola.</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-emerald-300/80">🛡️ Cumplimiento: sin observaciones automáticas.</p>
              )}
              {previewOpen[post.id] && (
                <PostPreview copy={copy} post={post} platforms={members.map((m) => m.platform)} brand={brandOf(post)} />
              )}
              <input
                value={notes[post.id] ?? ''}
                onChange={(e) => setNotes((x) => ({ ...x, [post.id]: e.target.value }))}
                placeholder="Ajuste para regenerar (ej: más corto, menos formal)"
                className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() => {
                    if (post.factCheck?.verdict === 'error' && !window.confirm('El verificador encontró un dato INCORRECTO en este post. Revisa el recuadro de verificación. ¿Aprobarlo de todos modos?')) return
                    if (hasError && !window.confirm('La revisión de cumplimiento encontró problemas (promesas o cifras que pueden comprometerte). ¿Aprobarlo de todos modos?')) return
                    patch(post.id, { status: 'approved', ...(edits[post.id] !== undefined ? { copy: edits[post.id] } : {}) }, 'Post aprobado')
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 disabled:opacity-40"
                >
                  Aprobar
                </button>
                <button
                  disabled={busy}
                  onClick={() => regenerate(post.id)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-200 border border-zinc-700 hover:border-zinc-500 disabled:opacity-40"
                >
                  {busy ? 'Trabajando…' : 'Regenerar texto'}
                </button>
                {post.previousVersion && (
                  <button
                    disabled={busy}
                    onClick={() => restoreVersion(post.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-amber-200 border border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-40"
                    title="Recupera el texto que había antes de regenerar"
                  >
                    ↩ Volver a la versión anterior
                  </button>
                )}
                <button
                  onClick={() => setPreviewOpen((x) => ({ ...x, [post.id]: !x[post.id] }))}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-200 border border-zinc-700 hover:border-zinc-500"
                >
                  👁 {previewOpen[post.id] ? 'Ocultar vista previa' : 'Vista previa'}
                </button>
                <button
                  disabled={busy}
                  onClick={() => regenerate(post.id, 'image')}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-200 border border-zinc-700 hover:border-zinc-500 disabled:opacity-40"
                >
                  Regenerar solo imagen
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
        }
        // Los posts se agrupan por día de publicación; los de la tanda anterior (una tarjeta por red)
        // van aparte de los nuevos (todas las redes en una sola tarjeta).
        const dayKey = (p: GeneratedPost) => (p.scheduledDate ? p.scheduledDate.slice(0, 10) : 'sin-fecha')
        const dayLabel = (k: string) => {
          if (k === 'sin-fecha') return 'Sin fecha'
          const s = new Date(`${k}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
          return s.charAt(0).toUpperCase() + s.slice(1)
        }
        const byDay = (list: GeneratedPost[]) => {
          const keys = Array.from(new Set(list.map(dayKey))).sort()
          return keys.map((k) => ({ key: k, items: list.filter((p) => dayKey(p) === k) }))
        }
        const fresh = pending.filter((p) => !!p.groupId)
        const legacy = pending.filter((p) => !p.groupId)
        const section = (title: string | null, hint: string | null, list: GeneratedPost[], action?: ReactNode) => list.length === 0 ? null : (
          <div className="space-y-4">
            {title && (
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-800 pb-2">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">{title} <span className="font-normal text-zinc-500">· {list.length}</span></h3>
                  {hint && <p className="text-xs text-zinc-500">{hint}</p>}
                </div>
                {action}
              </div>
            )}
            {byDay(list).map((d) => (
              <div key={d.key} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">📅 {dayLabel(d.key)}</p>
                <div className="grid gap-4 md:grid-cols-2">{d.items.map(renderPost)}</div>
              </div>
            ))}
          </div>
        )
        const both = fresh.length > 0 && legacy.length > 0
        const readyIds = pending.filter((p) => !!p.imageUrl && p.factCheck?.verdict !== 'error' && !p.copy.includes('[Contenido de ') && !lintPost({ copy: edits[p.id] ?? p.copy, imageText: textOf(p).headline.trim() ? textOf(p) : null }).some((i) => i.level === 'error')).map((p) => p.id)
        const selIds = selected.filter((id) => pending.some((p) => p.id === id))
        return (
          <div className="space-y-8">
            {pending.length > 1 && (
              <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/95 backdrop-blur px-3 py-2">
                <span className="text-xs text-zinc-400 flex-1 min-w-[180px]">
                  {selIds.length > 0 ? `${selIds.length} seleccionados` : `${readyIds.length} de ${pending.length} están listos (con imagen, sin errores de datos ni de cumplimiento)`}
                </span>
                {selIds.length > 0 ? (
                  <>
                    <button onClick={() => approveMany(selIds)} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">Aprobar seleccionados</button>
                    <button onClick={() => setSelected([])} className="text-xs text-zinc-400 hover:text-zinc-200">Quitar selección</button>
                  </>
                ) : (
                  <button
                    disabled={readyIds.length === 0}
                    onClick={() => { if (window.confirm(`¿Aprobar los ${readyIds.length} posts que están listos? Revisa antes que los datos estén verificados.`)) approveMany(readyIds) }}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/10 disabled:opacity-40"
                  >
                    Aprobar todos los listos
                  </button>
                )}
              </div>
            )}
            {section(both ? 'Tanda nueva' : null, 'Un solo post para todas las redes', fresh)}
            {section('Tanda anterior', 'Posts viejos: una tarjeta por red. Apruébalos o recházalos para dejar paso a la tanda nueva.', legacy, (
              <button
                onClick={() => discardAll(legacy)}
                disabled={busyId === 'discard'}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              >
                {busyId === 'discard' ? 'Descartando…' : '🗑️ Descartar toda la tanda anterior'}
              </button>
            ))}
          </div>
        )
      })()}

      {manualTikTok.length > 0 && (
        <div className="space-y-2 rounded-xl border border-pink-500/30 bg-pink-500/5 p-4">
          <h3 className="text-sm font-semibold text-pink-200">🎵 TikTok — lo subes tú</h3>
          <p className="text-xs text-zinc-400">Copia el texto, descarga la imagen (o tu video) y súbelo en TikTok. Luego pulsa "Ya lo subí".</p>
          {manualTikTok.map((post) => (
            <div key={post.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <span className="text-sm text-zinc-200 flex-1 min-w-[160px] truncate">{post.topic}</span>
              {post.imageUrl && (
                <a href={localImagePath(post.imageUrl)} download className="text-xs text-zinc-200 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500">Descargar imagen</a>
              )}
              <button
                onClick={() => copyText(composePostText(post.platform, post.copy, post.hashtags), 'Texto copiado')}
                className="text-xs text-zinc-300 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500"
              >
                Copiar texto
              </button>
              <button
                onClick={() => patch(post.id, { status: 'published' }, 'Marcado como publicado')}
                className="text-xs text-emerald-300 border border-emerald-500/40 rounded-md px-2 py-1 hover:bg-emerald-500/10"
              >
                Ya lo subí
              </button>
            </div>
          ))}
        </div>
      )}

      <PublishBoard posts={posts} onRetry={publishNow} busyId={busyId} canPublish={publishOn} publishPlatforms={publishPlatforms} />

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
                {post.status !== 'publishing' && (
                  <button onClick={() => deletePost(post)} className="text-xs text-red-300/80 hover:text-red-200" title="Eliminar este post">🗑️</button>
                )}
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
                {post.status !== 'publishing' && (
                  <button onClick={() => reopenPost(post)} className="text-xs text-amber-200 border border-amber-500/40 rounded-md px-2 py-1 hover:bg-amber-500/10" title="Volver a Por aprobar para cambiar texto, imagen o carrusel">
                    ✏️ Editar
                  </button>
                )}
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
            <div key={post.id} className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="flex-1 truncate">{PLATFORM_CONFIG[post.platform]?.emoji} {post.topic}</span>
                {post.externalUrl && (
                  <a href={post.externalUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200">Ver post ↗</a>
                )}
                <button onClick={() => reopenPost(post)} className="text-amber-200/90 hover:text-amber-100" title="Volver a Por aprobar para cambiar texto, imagen o carrusel">✏️ Editar</button>
                <button onClick={() => deletePost(post)} className="text-red-300/80 hover:text-red-200" title="Eliminar este post">🗑️ Eliminar</button>
              </div>
              <MetricsForm key={`${post.id}-${post.metric?.source ?? ''}`} post={post} onSaved={load} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

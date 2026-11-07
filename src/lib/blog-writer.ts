import { AI_MODEL_RESEARCH, AI_MODEL_SMART, callClaude, extractJson } from '@/lib/ai'
import { classifyAiError } from '@/lib/ai-health'
import { logActivity, runAs } from '@/lib/agent-ledger'
import { BlogApiError, blogEnvName, createBlogDraft, listBlogPosts, resolveBlogTarget, type BlogPostCreated, type BlogPostInput } from '@/lib/blog-api'
import { lintPost } from '@/lib/compliance'
import { prisma } from '@/lib/prisma'
import { isRepeat } from '@/lib/topic-memory'
import { sendNextArticle } from '@/lib/blog-queue'
import { LEGAL_NOTE_EN, LEGAL_NOTE_ES } from '@/lib/blog-topics-data'

// Luis, el redactor del blog: propone un tema nuevo, investiga, escribe el artículo en español y en inglés y los manda
// al blog de Reports Systems SIEMPRE como borrador. El dueño los revisa y los publica desde su panel.

export interface BlogRun {
  ok: boolean
  topic?: string
  created?: BlogPostCreated[]
  warnings?: string[]
  error?: string
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
const words = (s: string) => s.trim().split(/\s+/).length

/** Limpia lo que la API no admite: HTML, títulos # (el título ya es el único H1) y espacios raros. */
function cleanMarkdown(md: string): string {
  return md
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/^#\s+/gm, '## ')
    .replace(/^#{4,}\s+/gm, '### ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface Draft { title: string; description: string; slug: string; tags: string[]; content: string }
function coerceDraft(raw: unknown): Draft | null {
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o.title !== 'string' || typeof o.content !== 'string') return null
  const title = o.title.trim().slice(0, 140)
  let description = typeof o.description === 'string' ? o.description.trim() : ''
  if (description.length > 300) description = description.slice(0, 297) + '…'
  const content = cleanMarkdown(o.content)
  const tags = (Array.isArray(o.tags) ? o.tags : []).filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 10)
  const slug = typeof o.slug === 'string' && SLUG.test(o.slug) ? o.slug : slugify(title)
  if (title.length < 5 || description.length < 30 || content.length < 200) return null
  return { title, description, slug, tags, content }
}

const HOW = `REGLAS DEL ARTÍCULO (obligatorias):
- Markdown con "##" para los subtítulos (nunca "#"), sin HTML. Entre 800 y 1500 palabras.
- Útil y concreto: pasos que el lector pueda aplicar, ejemplos simples, listas cortas. Primer párrafo que responde la pregunta del título.
- Termina SIEMPRE con una sección práctica antes del cierre (por ejemplo "## Qué hacer hoy": pasos o lista de chequeo que el lector pueda hacer ese mismo día).\n- NO inventes cifras, estadísticas, leyes, clientes, testimonios ni funciones del producto. Usa SOLO datos de las NOTAS DE INVESTIGACIÓN. Si no hay un dato, no lo afirmes: explica el concepto sin cifras.
- Sin promesas ni garantías de resultados ("aumentarás", "garantizado"). Tono profesional y cercano; sin relleno.
- "description": entre 120 y 160 caracteres, atractiva para Google. "title": entre 5 y 140. "tags": de 3 a 6, cortos.`

export async function writeBlogArticle(opts: { companyId: string; topic?: string }): Promise<BlogRun> {

  // Empresa del blog (por defecto la que se llama "Reports Systems").
  const company = await prisma.cEOCompany.findFirst({ where: { id: opts.companyId } })
  const profile = company ? await prisma.brandProfile.findFirst({ where: { companyId: company.id } }) : null
  if (!company || !profile) return { ok: false, error: 'No encontré la empresa o su perfil de marca. Guarda primero el perfil del blog en Equipo → Luis.' }
  const target = resolveBlogTarget(company, profile)
  if (!target) return { ok: false, error: `Falta conectar el blog de ${company.name}: guarda la dirección del blog en su perfil y agrega en Railway la variable ${blogEnvName(company.name)} con una clave de "solo borradores".` }

  return runAs('luis', async () => {
    try {
      // 1) Lo que ya existe, para no repetir.
      const [es, en] = await Promise.all([listBlogPosts(target, 'es'), listBlogPosts(target, 'en')])
      const existing = Array.from(new Set([...es, ...en].map((p) => p.title))).slice(0, 80)
      const pillars = Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : []
      const rules = (profile.blogRules ?? '').trim()
      const cta = (profile.blogCta ?? '').trim()
      const brief = `Empresa: ${company.name}${profile.website ? ` (${profile.website})` : ''}. Público: ${profile.targetAudience}. Tono: ${profile.tone}. Temas del blog: ${pillars.join(', ') || 'los de su producto'}.${rules ? `\nREGLAS DEL DUEÑO (obligatorias):\n${rules}` : ''}`

      // 2) Tema (barato, con búsqueda web) o el que pidió el dueño.
      let topic = opts.topic?.trim() ?? ''
      let queued: { id: string; kind: string; category: string } | null = null
      let hint = ''
      if (!topic) {
        // Primero, el banco de temas del dueño (por prioridad); se saltan los que ya existen en el blog.
        const candidates = await prisma.blogTopic.findMany({ where: { companyId: company.id, status: 'pending', kind: { not: 'needs_input' } }, orderBy: { priority: 'asc' }, take: 12 })
        for (const c of candidates) {
          if (isRepeat(c.title, existing)) { await prisma.blogTopic.update({ where: { id: c.id }, data: { status: 'used', usedAt: new Date() } }); continue }
          queued = { id: c.id, kind: c.kind, category: c.category }
          topic = c.title
          break
        }
      }
      if (queued?.kind === 'legal') hint = 'TEMA LEGAL: las reglas cambian según el estado y el tipo de licencia. Explica solo lo general, recomienda confirmar con un abogado o con la autoridad del estado, y NO des cifras, plazos ni leyes que no estén en las notas de investigación.'
      if (!topic) {
        const t = await callClaude({
          model: AI_MODEL_RESEARCH, maxTokens: 800, webSearch: true, maxSearches: 2,
          messages: [{ role: 'user', content: `[tarea: tema del blog] ${brief}\nElige uno de los temas del blog que menos se haya cubierto, con un ángulo nuevo.\nArtículos que YA existen (no repetir ni parafrasear): ${existing.join(' | ') || 'ninguno'}.\nBusca qué preguntas se hace hoy este público y propón UN tema nuevo que ayude a quien busca esto en Google. Responde ÚNICAMENTE con JSON: {"topic":"título de trabajo","why":"por qué ahora, 1 frase"}` }],
        })
        topic = (extractJson(t) as { topic?: string } | null)?.topic?.trim() ?? ''
        if (!topic) return { ok: false, error: 'No pude proponer un tema. Intenta de nuevo o escribe uno.' }
      }

      // 3) Notas de investigación con fuente (barato).
      const notes = (await callClaude({
        model: AI_MODEL_RESEARCH, maxTokens: 1500, webSearch: true, maxSearches: 3,
        messages: [{ role: 'user', content: `[tarea: notas de investigación] Hoy es ${new Date().toISOString().slice(0, 10)}. Para un artículo de blog sobre "${topic}" (${brief}), busca en la web información confiable y actual. Devuelve NOTAS, una por línea: "- dato o idea concreta | fuente (nombre) | URL exacta". Solo datos que viste en una fuente real. Si no hay datos fiables, responde solo: SIN DATOS.` }],
      })).trim()
      const usable = notes.length > 40 && !/^SIN DATOS/i.test(notes) ? notes.slice(0, 5000) : ''

      // 4) Artículo en español.
      const esRaw = await callClaude({
        model: AI_MODEL_SMART, maxTokens: 4500,
        messages: [{ role: 'user', content: `[tarea: escribir artículo en español] ${brief}\nTema: ${topic}${hint ? `\n${hint}` : ''}\nArtículos ya publicados (no repetir): ${existing.join(' | ') || 'ninguno'}\nNOTAS DE INVESTIGACIÓN:\n${usable || '(no hay notas: no uses cifras ni datos externos)'}\n\n${HOW}\n\nResponde ÚNICAMENTE con JSON: {"title":"…","description":"…","slug":"minusculas-con-guiones","tags":["…"],"content":"markdown completo"}` }],
      })
      const esDraft = coerceDraft(extractJson(esRaw))
      if (!esDraft) return { ok: false, topic, error: 'El artículo en español salió incompleto. Intenta de nuevo.' }
      if (words(esDraft.content) < 600) return { ok: false, topic, error: `El artículo salió muy corto (${words(esDraft.content)} palabras). Intenta de nuevo.` }

      // 5) Versión en inglés (adaptada, no literal).
      const enRaw = await callClaude({
        model: AI_MODEL_SMART, maxTokens: 4500,
        messages: [{ role: 'user', content: `[tarea: versión en inglés] Adapt this Spanish blog article into natural English for an English-speaking audience (not a word-for-word translation). Keep the same facts and structure; same Markdown rules (use "##" for headings, no HTML); do not add any new facts or numbers. "description" 120-160 characters.\n\n${JSON.stringify(esDraft)}\n\nReply ONLY with JSON: {"title":"…","description":"…","slug":"lowercase-with-hyphens","tags":["…"],"content":"full markdown"${cta ? `,"cta":"this call to action in natural English, keeping any link or phone number exactly as written: ${cta.replace(/"/g, "'")}"` : ''}}` }],
      })
      const enDraft = coerceDraft(extractJson(enRaw))

      // 6) Fuentes al final (solo enlaces reales de las notas).
      const urls = Array.from(new Set((usable.match(/https?:\/\/[^\s|)\]]+/g) ?? []).map((u) => u.replace(/[.,;]+$/, '')))).slice(0, 6)
      const isLegal = queued?.kind === 'legal' || /permiso|licencia|ley|legal|cumplimiento|compliance/i.test(topic)
      const legalEs = isLegal && !/abogado|autoridad/i.test(esDraft.content) ? `\n\n> ${LEGAL_NOTE_ES}` : ''
      const legalEn = isLegal && enDraft && !/attorney|lawyer|authority/i.test(enDraft.content) ? `\n\n> ${LEGAL_NOTE_EN}` : ''
      const ctaEs = cta ? `${legalEs}\n\n---\n\n${cta}` : legalEs
      const enRawObj = extractJson(enRaw) as { cta?: unknown } | null
      const linksOf = (t: string) => t.match(/https?:\/\/\S+|\+?\d[\d\s().-]{7,}\d/g) ?? []
      const ctaEnText = typeof enRawObj?.cta === 'string' && linksOf(cta).every((l) => (enRawObj.cta as string).includes(l.replace(/[.,;]+$/, ''))) ? (enRawObj.cta as string).trim() : cta
      const ctaEn = cta ? `${legalEn}\n\n---\n\n${ctaEnText}` : legalEn
      const addSources = (d: Draft, label: string): Draft => (urls.length ? { ...d, content: `${d.content}\n\n## ${label}\n\n${urls.map((u) => `- ${u}`).join('\n')}` } : d)
      const withCta = (d: Draft, c: string): Draft => ({ ...d, content: `${d.content}${c}` })

      // 7) Revisión de cumplimiento (promesas) antes de enviar.
      const blocked = [esDraft, enDraft].filter((d): d is Draft => !!d).flatMap((d) => lintPost({ copy: d.content }).filter((i) => i.level === 'error').map((i) => i.message))
      if (blocked.length) return { ok: false, topic, error: `No se envió: el texto ${Array.from(new Set(blocked)).join('; ')}.` }

      // 8) Enviar como borrador (reintenta con otro slug si ya existe).
      const translationKey = esDraft.slug.slice(0, 80)
      const send = async (d: Draft, locale: 'es' | 'en'): Promise<BlogPostCreated> => {
        const base: BlogPostInput = { title: d.title, description: d.description, content: d.content, locale, tags: d.tags, translationKey }
        for (let n = 1; n <= 3; n++) {
          try { return await createBlogDraft(target, { ...base, slug: n === 1 ? d.slug : `${d.slug}-${n}` }) }
          catch (e) { if (!(e instanceof BlogApiError && e.status === 409) || n === 3) throw e }
        }
        throw new BlogApiError('No se pudo crear el borrador.', 500)
      }
      const created: BlogPostCreated[] = [await send(withCta(addSources(esDraft, 'Fuentes'), ctaEs), 'es')]
      const warnings: string[] = []
      if (enDraft) created.push(await send(withCta(addSources(enDraft, 'Sources'), ctaEn), 'en'))
      else warnings.push('La versión en inglés salió incompleta: solo se envió la de español.')
      if (!usable) warnings.push('No hubo notas con fuente: el artículo no lleva cifras ni sección de fuentes. Revísalo con cuidado.')
      if (queued) await prisma.blogTopic.update({ where: { id: queued.id }, data: { status: 'used', usedAt: new Date(), articleSlug: created[0]?.slug } })
      await logActivity('luis', 'blog', `Envió el borrador «${esDraft.title.slice(0, 70)}» (${created.map((c) => c.locale.toUpperCase()).join(' y ')}) al blog`, { companyId: company.id })
      return { ok: true, topic, created, warnings }
    } catch (err) {
      if (err instanceof BlogApiError) return { ok: false, error: err.message }
      return { ok: false, error: classifyAiError(err).message }
    }
  })
}

/** Empresas que tienen blog con artículo semanal de Luis (perfil con blogEnabled). */
export async function listBlogCompanies() {
  const profiles = await prisma.brandProfile.findMany({ where: { blogEnabled: true }, include: { company: true } })
  return profiles.map((p) => ({ id: p.companyId, name: p.company.name, configured: !!resolveBlogTarget(p.company, p) }))
}

/** Artículo semanal: uno por cada empresa con blog conectado. */
export async function writeWeeklyArticles(): Promise<{ company: string; ok: boolean; created: number; error?: string; topic?: string }[]> {
  const out: { company: string; ok: boolean; created: number; error?: string; topic?: string }[] = []
  for (const c of await listBlogCompanies()) {
    if (!c.configured) { out.push({ company: c.name, ok: false, created: 0, error: 'blog sin conectar (falta la clave en Railway)' }); continue }
    // 1) Primero, los artículos que el dueño ya subió (sin costo de IA).
    const q = await sendNextArticle(c.id)
    if (!q.empty) { out.push({ company: c.name, ok: q.ok, created: q.sent?.length ?? 0, error: q.error, topic: q.title }); continue }
    // 2) Si la cola está vacía, Luis solo escribe con IA si el dueño lo permitió.
    const p = await prisma.brandProfile.findFirst({ where: { companyId: c.id }, select: { blogAiWrite: true } })
    if (!p?.blogAiWrite) { out.push({ company: c.name, ok: true, created: 0, topic: 'sin artículos listos en la cola' }); continue }
    const r = await writeBlogArticle({ companyId: c.id })
    out.push({ company: c.name, ok: r.ok, created: r.created?.length ?? 0, error: r.error, topic: r.topic })
  }
  return out
}

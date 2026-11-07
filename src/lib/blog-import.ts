import { lintPost } from '@/lib/compliance'
import { LEGAL_NOTE_EN, LEGAL_NOTE_ES, isLegalTopic } from '@/lib/blog-topics-data'

// Importa artículos escritos por el dueño (con otra IA) en un formato de texto simple:
//
// @@@ARTICULO
// idioma: es
// clave: cuadrar-la-caja
// titulo: Cómo cuadrar la caja al cerrar el turno
// descripcion: entre 120 y 160 caracteres
// slug: como-cuadrar-la-caja (opcional)
// etiquetas: caja, cierre, control (opcional)
// ---
// ...contenido en Markdown...
// @@@FIN
//
// El mismo "clave" en es y en en une las dos versiones como traducciones.

export interface ParsedArticle {
  locale: 'es' | 'en'
  translationKey: string
  title: string
  description: string
  slug: string
  tags: string[]
  content: string
}
export interface ImportResult { articles: ParsedArticle[]; errors: string[]; warnings: string[] }

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
const words = (s: string) => s.trim().split(/\s+/).length

export function cleanMarkdown(md: string): string {
  return md.replace(/<\/?[a-z][^>]*>/gi, '').replace(/^#\s+/gm, '## ').replace(/^#{4,}\s+/gm, '### ').replace(/\n{3,}/g, '\n\n').trim()
}

export function parseArticles(text: string): ImportResult {
  const out: ImportResult = { articles: [], errors: [], warnings: [] }
  const blocks = text.replace(/\r/g, '').split(/^\s*@@@ARTICULO\s*$/im).slice(1)
  if (blocks.length === 0) { out.errors.push('No encontré ningún "@@@ARTICULO". Revisa que cada artículo empiece con esa línea y termine con "@@@FIN".'); return out }
  blocks.forEach((raw, i) => {
    const label = `Artículo ${i + 1}`
    const body = raw.split(/^\s*@@@FIN\s*$/im)[0]
    const lines = body.split('\n')
    const sep = lines.findIndex((l) => /^\s*---\s*$/.test(l))
    if (sep < 0) { out.errors.push(`${label}: falta la línea "---" que separa los datos del contenido.`); return }
    const head: Record<string, string> = {}
    for (const l of lines.slice(0, sep)) {
      const m = l.match(/^\s*([a-záéíóúñ]+)\s*:\s*(.*)$/i)
      if (m) head[m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] = m[2].trim()
    }
    const locale = /^en/i.test(head.idioma ?? head.language ?? '') ? 'en' : /^es/i.test(head.idioma ?? head.language ?? '') ? 'es' : null
    const title = (head.titulo ?? head.title ?? '').slice(0, 140)
    const description = (head.descripcion ?? head.description ?? '').slice(0, 300)
    const key = slugify(head.clave ?? head.key ?? '') || ''
    const content = cleanMarkdown(lines.slice(sep + 1).join('\n'))
    const problems: string[] = []
    if (!locale) problems.push('falta "idioma: es" o "idioma: en"')
    if (!key) problems.push('falta "clave:" (la misma en español e inglés)')
    if (title.length < 5) problems.push('el título debe tener al menos 5 caracteres')
    if (description.length < 30) problems.push('la descripción debe tener al menos 30 caracteres')
    if (content.length < 200) problems.push('el contenido debe tener al menos 200 caracteres')
    const errs = content ? lintPost({ copy: content }).filter((x) => x.level === 'error').map((x) => x.message) : []
    if (errs.length) problems.push(`el texto ${Array.from(new Set(errs)).join('; ')}`)
    if (problems.length) { out.errors.push(`${label}${title ? ` («${title.slice(0, 50)}»)` : ''}: ${problems.join('; ')}.`); return }
    if (description.length < 110 || description.length > 170) out.warnings.push(`${label}: la descripción tiene ${description.length} caracteres (lo ideal es entre 120 y 160).`)
    if (words(content) < 600) out.warnings.push(`${label}: tiene ${words(content)} palabras (lo ideal es entre 800 y 1.500).`)
    const tags = (head.etiquetas ?? head.tags ?? '').split(',').map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 10)
    out.articles.push({ locale: locale!, translationKey: key, title, description, slug: slugify(head.slug ?? '') || slugify(title), tags, content })
  })
  return out
}

/** Notas que se agregan al guardar: aviso legal si el tema lo pide. */
export function withLegalNote(a: ParsedArticle): { content: string; isLegal: boolean } {
  const legal = isLegalTopic(a.title) || /permiso|licencia|cumplimiento|compliance|cheque devuelto/i.test(a.title)
  if (!legal) return { content: a.content, isLegal: false }
  const has = a.locale === 'en' ? /attorney|lawyer|authority/i.test(a.content) : /abogado|autoridad/i.test(a.content)
  return { content: has ? a.content : `${a.content}\n\n> ${a.locale === 'en' ? LEGAL_NOTE_EN : LEGAL_NOTE_ES}`, isLegal: true }
}

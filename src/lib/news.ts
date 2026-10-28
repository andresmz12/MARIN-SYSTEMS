import { XMLParser } from 'fast-xml-parser'

export interface NewsItem {
  title: string
  link: string
  summary: string
  publishedAt: Date | null
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' })

const FETCH_TIMEOUT_MS = 15_000
const MAX_FEED_BYTES = 2 * 1024 * 1024

/** Fuentes de noticias: URLs https (o http://localhost, para pruebas) de feeds RSS/Atom separadas por coma en NEWS_FEED_URLS. */
export function newsFeedUrls(): string[] {
  return (process.env.NEWS_FEED_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^(https:\/\/|http:\/\/localhost[:/])/i.test(u))
}

const text = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (v && typeof v === 'object' && '#text' in v) return text((v as Record<string, unknown>)['#text'])
  return ''
}

const stripHtml = (s: string) =>
  s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/** Lee un feed RSS 2.0 o Atom. Puro: recibe el XML ya descargado. */
export function parseFeed(xml: string): NewsItem[] {
  const doc = parser.parse(xml) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const rssItems = asArray(doc?.rss?.channel?.item)
  const atomEntries = asArray(doc?.feed?.entry)
  const items: NewsItem[] = []

  for (const it of rssItems) {
    const link = text(it.link).trim()
    const title = stripHtml(text(it.title))
    if (!link || !title) continue
    const when = new Date(text(it.pubDate) || text(it['dc:date']))
    items.push({
      title,
      link,
      summary: stripHtml(text(it.description) || text(it['content:encoded'])).slice(0, 1500),
      publishedAt: isNaN(when.getTime()) ? null : when,
    })
  }
  for (const en of atomEntries) {
    const links = asArray(en.link) as Array<Record<string, unknown> | string>
    const alt = links.find((l) => typeof l === 'object' && (l['@_rel'] === 'alternate' || !l['@_rel'])) ?? links[0]
    const link = typeof alt === 'string' ? alt : text(alt?.['@_href'])
    const title = stripHtml(text(en.title))
    if (!link || !title) continue
    const when = new Date(text(en.published) || text(en.updated))
    items.push({
      title,
      link,
      summary: stripHtml(text(en.summary) || text(en.content)).slice(0, 1500),
      publishedAt: isNaN(when.getTime()) ? null : when,
    })
  }
  return items
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
}

/** Todas las fechas de un trozo de HTML con su posición: <time datetime>, ISO, "28 de octubre de 2026", "October 28, 2026" o 10/28/2026. */
function datesIn(chunk: string): { at: number; date: Date }[] {
  const found: { at: number; date: Date }[] = []
  const add = (at: number, d: Date) => { if (!isNaN(d.getTime())) found.push({ at, date: d }) }
  const noTags = chunk.replace(/<[^>]*>/g, (t) => ' '.repeat(t.length)) // mismas posiciones, sin etiquetas
  let m: RegExpExecArray | null
  const time = /<time[^>]*datetime="([^"]+)"/gi
  while ((m = time.exec(chunk))) add(m.index, new Date(m[1]))
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g
  while ((m = iso.exec(noTags))) add(m.index, new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)))
  const es = /\b(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(20\d{2})\b/gi
  while ((m = es.exec(noTags))) if (MONTHS[m[2].toLowerCase()] !== undefined) add(m.index, new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1], 12)))
  const en = /\b([A-Za-z]+)\s+(\d{1,2}),\s+(20\d{2})\b/g
  while ((m = en.exec(noTags))) if (MONTHS[m[1].toLowerCase()] !== undefined) add(m.index, new Date(Date.UTC(+m[3], MONTHS[m[1].toLowerCase()], +m[2], 12)))
  const us = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g
  while ((m = us.exec(noTags))) add(m.index, new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 12)))
  return found
}

/** La fecha más cercana a una posición del HTML (la de su propia fila, no la del vecino). */
export function findDate(chunk: string, near = Math.floor(chunk.length / 2)): Date | null {
  const all = datesIn(chunk)
  if (all.length === 0) return null
  return all.reduce((best, c) => (Math.abs(c.at - near) < Math.abs(best.at - near) ? c : best)).date
}

/**
 * Página de listado (p. ej. "comunicados del mes" del IRS) en vez de un feed RSS: toma los enlaces
 * de noticias y busca la fecha de cada una en el HTML cercano. Es de mejor esfuerzo.
 */
export function parseListingHtml(html: string, baseUrl: string): NewsItem[] {
  const base = new URL(baseUrl)
  const body = html.replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
  const out: NewsItem[] = []
  const seen = new Set<string>([base.pathname.replace(/\/$/, '')])
  const re = /<a\s[^>]*href="([^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    let url: URL
    try { url = new URL(m[1], base) } catch { continue }
    if (url.host !== base.host || !/\/newsroom\//i.test(url.pathname)) continue
    const path = url.pathname.replace(/\/$/, '')
    if (seen.has(path)) continue
    const title = stripHtml(m[2])
    // Los enlaces de menú ("Sala de prensa", "Comunicados de prensa...") son cortos o son listados.
    if (title.length < 25 || /^(news ?releases?|comunicados|sala de prensa|newsroom|ver |más |read more)/i.test(title)) continue
    seen.add(path)
    const from = Math.max(0, m.index - 400)
    const around = body.slice(from, Math.min(body.length, m.index + m[0].length + 400))
    out.push({ title, link: url.toString(), summary: '', publishedAt: findDate(around, m.index - from + m[0].length / 2) })
  }
  return out
}

/** Texto principal de un artículo (para darle a la IA algo más que el titular). */
export async function fetchArticleText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'User-Agent': 'CorporacionMarin/1.0 (+news-watch)' } })
    if (!res.ok) return ''
    const html = (await res.text()).slice(0, MAX_FEED_BYTES)
    const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html
    const paragraphs = Array.from(main.replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
      .map((p) => stripHtml(p[1]))
      .filter((p) => p.length > 60)
    return paragraphs.join(' ').slice(0, 1800)
  } catch {
    return ''
  }
}

export async function fetchFeed(url: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'CorporacionMarin/1.0 (+news-watch)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8' },
  })
  if (!res.ok) throw new Error(`${url} respondió HTTP ${res.status}`)
  const body = await res.text()
  if (body.length > MAX_FEED_BYTES) throw new Error(`${url} es demasiado grande`)
  const isXml = /<(rss|feed)[\s>]/i.test(body.slice(0, 2000))
  const items = isXml ? parseFeed(body) : parseListingHtml(body, url)
  // Mejor fallar a la vista que quedarse callado: si no hay nada, o cambió la página o la dirección no es la correcta.
  if (items.length === 0) throw new Error(`${url}: no se encontraron noticias (${isXml ? 'el feed está vacío' : 'la página no tiene el formato esperado'})`)
  return items
}

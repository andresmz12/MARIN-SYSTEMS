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

export async function fetchFeed(url: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'CorporacionMarin/1.0 (+news-watch)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
  })
  if (!res.ok) throw new Error(`${url} respondió HTTP ${res.status}`)
  const body = await res.text()
  if (body.length > MAX_FEED_BYTES) throw new Error(`${url} es demasiado grande`)
  return parseFeed(body)
}

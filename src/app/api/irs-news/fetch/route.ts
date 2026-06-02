import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

interface NewsItem {
  title: string
  url: string
  summary: string
  publishedAt: Date
}

async function tryRssFeed(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: 0 } })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('xml') && !ct.includes('rss')) return null
    return await res.text()
  } catch {
    return null
  }
}

function parseRssXml(xml: string): NewsItem[] {
  const items: NewsItem[] = []
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? []
  for (const block of itemMatches) {
    const title = (block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? block.match(/<title[^>]*>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? ''
    const link = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/) ?? block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/))?.[1]?.trim() ?? ''
    const desc = (block.match(/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ?? block.match(/<description[^>]*>([\s\S]*?)<\/description>/))?.[1]?.replace(/<[^>]*>/g, '').trim() ?? ''
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? ''
    if (!title || !link) continue
    items.push({ title, url: link, summary: desc, publishedAt: pubDate ? new Date(pubDate) : new Date() })
  }
  return items
}

async function scrapeIrsNewsroom(): Promise<NewsItem[]> {
  const res = await fetch('https://www.irs.gov/newsroom', { headers: BROWSER_HEADERS, next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`IRS newsroom returned HTTP ${res.status}`)
  const html = await res.text()

  const items: NewsItem[] = []
  const seen = new Set<string>()

  // Match article links: /newsroom/slug-with-words (not category pages ending in common words)
  const linkRe = /href="(\/newsroom\/[a-z0-9][a-z0-9-]{10,})"[^>]*>\s*([^<]{10,})\s*</gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const path = m[1]
    const text = m[2].trim()
    if (seen.has(path)) continue
    seen.add(path)
    const fullUrl = `https://www.irs.gov${path}`
    items.push({ title: text, url: fullUrl, summary: '', publishedAt: new Date() })
    if (items.length >= 30) break
  }

  // Extract dates from nearby content (best-effort — if missing, we use today)
  const dateRe = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b/g
  const dates: Date[] = []
  let dm: RegExpExecArray | null
  while ((dm = dateRe.exec(html)) !== null) {
    const d = new Date(dm[0])
    if (!isNaN(d.getTime())) dates.push(d)
  }
  items.forEach((item, i) => {
    if (dates[i]) item.publishedAt = dates[i]
  })

  return items
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let items: NewsItem[] = []

  // 1. Try known RSS feed URLs first
  const RSS_URLS = [
    'https://www.irs.gov/rss/newsroom.xml',
    'https://www.irs.gov/rss/news-releases.xml',
    'https://www.irs.gov/rss/irs-guidance.xml',
  ]
  for (const url of RSS_URLS) {
    const xml = await tryRssFeed(url)
    if (xml) {
      items = parseRssXml(xml)
      if (items.length > 0) break
    }
  }

  // 2. Fall back to HTML scraping if RSS unavailable
  if (items.length === 0) {
    try {
      items = await scrapeIrsNewsroom()
    } catch (err) {
      return NextResponse.json(
        { error: `No se pudo obtener noticias del IRS: ${err instanceof Error ? err.message : err}` },
        { status: 502 }
      )
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ error: 'No se encontraron noticias en el IRS' }, { status: 502 })
  }

  let added = 0
  let skipped = 0

  for (const item of items) {
    if (!item.url || !item.title) { skipped++; continue }
    try {
      await prisma.irsNews.create({
        data: { title: item.title, summary: item.summary, url: item.url, publishedAt: item.publishedAt },
      })
      added++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ added, skipped })
}

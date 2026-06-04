import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
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
  for (const block of xml.match(/<item[\s\S]*?<\/item>/gi) ?? []) {
    const title = (block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? block.match(/<title[^>]*>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? ''
    const link = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/) ?? block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/))?.[1]?.trim() ?? ''
    const desc = (block.match(/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ?? block.match(/<description[^>]*>([\s\S]*?)<\/description>/))?.[1]?.replace(/<[^>]*>/g, '').trim() ?? ''
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? ''
    if (!title || !link) continue
    items.push({ title, url: link, summary: desc, publishedAt: pubDate ? new Date(pubDate) : new Date() })
  }
  return items
}

/** Extract a publication date from the HTML near a specific position (within 800 chars after the link). */
function extractNearbyDate(html: string, fromIndex: number): Date | null {
  const chunk = html.slice(fromIndex, fromIndex + 800)

  // <time datetime="YYYY-MM-DD">
  const timeMatch = chunk.match(/datetime="(\d{4}-\d{2}-\d{2})/)
  if (timeMatch) {
    const d = new Date(timeMatch[1] + 'T12:00:00Z')
    if (!isNaN(d.getTime())) return d
  }

  // "June 4, 2026" or "Jun. 4, 2026"
  const textMatch = chunk.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),\s+(20\d{2})\b/i)
  if (textMatch) {
    const monthKey = textMatch[1].toLowerCase().replace('.', '').slice(0, 3)
    const fullMonthKey = Object.keys(MONTHS).find(k => k.startsWith(monthKey)) ?? ''
    if (fullMonthKey !== undefined) {
      const d = new Date(Date.UTC(parseInt(textMatch[3]), MONTHS[fullMonthKey] ?? 0, parseInt(textMatch[2]), 12))
      if (!isNaN(d.getTime())) return d
    }
  }

  return null
}

/** Fetch a single IRS article page and extract its publication date. */
async function fetchArticleDate(url: string): Promise<Date | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: 0 } })
    if (!res.ok) return null
    const html = await res.text()

    // <time datetime="YYYY-MM-DD">
    const timeMatch = html.match(/<time[^>]+datetime="(\d{4}-\d{2}-\d{2})[^"]*"/)
    if (timeMatch) {
      const d = new Date(timeMatch[1] + 'T12:00:00Z')
      if (!isNaN(d.getTime())) return d
    }

    // Structured date text in first 3000 chars (before body content)
    const head = html.slice(0, 5000)
    const textMatch = head.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/i)
    if (textMatch) {
      const monthKey = textMatch[1].toLowerCase()
      const d = new Date(Date.UTC(parseInt(textMatch[3]), MONTHS[monthKey] ?? 0, parseInt(textMatch[2]), 12))
      if (!isNaN(d.getTime())) return d
    }
    return null
  } catch {
    return null
  }
}

async function scrapeIrsNewsroom(): Promise<NewsItem[]> {
  const res = await fetch('https://www.irs.gov/newsroom', { headers: BROWSER_HEADERS, next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`IRS newsroom returned HTTP ${res.status}`)
  const html = await res.text()

  const items: NewsItem[] = []
  const seen = new Set<string>()

  const NAV_SLUGS = new Set([
    'newsroom', 'news-releases-and-fact-sheets', 'multimedia-center', 'archive-of-news-releases',
    'irs-guidance-and-other-announcements', 'commissioners-comments-statements-and-remarks',
    'tax-tips', 'e-news-subscriptions', 'irs-news', 'tax-statistics', 'irs-statements-and-announcements',
  ])

  const linkRe = /href="(\/newsroom\/(ir-\d{4}-\d+|irs-[a-z][a-z0-9-]{15,}))"[^>]*>\s*([^<]{15,})\s*</gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const path = m[1]
    const slug = m[2]
    const text = m[3].trim()
    if (seen.has(path) || NAV_SLUGS.has(slug)) continue
    seen.add(path)

    // Try to find the date in the HTML right after this link
    const nearbyDate = extractNearbyDate(html, m.index + m[0].length)

    items.push({
      title: text,
      url: `https://www.irs.gov${path}`,
      summary: '',
      publishedAt: nearbyDate ?? new Date(),
    })
    if (items.length >= 30) break
  }

  // For items still missing a real date, fetch their article pages in parallel
  const needDate = items.filter((item) => item.publishedAt.getTime() === new Date().setHours(0,0,0,0) || item.publishedAt > new Date(Date.now() - 60_000))
  if (needDate.length > 0) {
    const results = await Promise.allSettled(needDate.map((item) => fetchArticleDate(item.url)))
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        needDate[i].publishedAt = result.value
      }
    })
  }

  return items
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let items: NewsItem[] = []

  // 1. Try RSS feeds first (have real dates in pubDate)
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

  // 2. Fall back to HTML scraping (fetches article pages to get real dates)
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

  // Delete unused articles so stale data is replaced on every refresh
  await prisma.irsNews.deleteMany({ where: { used: false } })

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

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { XMLParser } from 'fast-xml-parser'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

const RSS_CANDIDATES = [
  'https://www.irs.gov/rss/newsroom.xml',
  'https://www.irs.gov/newsroom/newsroom.xml',
  'https://www.irs.gov/pub/rss/newsroom.xml',
]

const NEWSROOM_URL = 'https://www.irs.gov/newsroom/news-releases-for-current-month'

function extractText(val: unknown): string {
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number') return String(val)
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>
    if ('#text' in obj) return String(obj['#text']).trim()
  }
  return ''
}

interface ParsedItem { title: string; summary: string; url: string; pubDate: Date }

async function fetchViaRss(): Promise<ParsedItem[] | null> {
  for (const rssUrl of RSS_CANDIDATES) {
    try {
      const res = await fetch(rssUrl, { headers: HEADERS, next: { revalidate: 0 } })
      if (!res.ok) continue
      const xml = await res.text()
      if (!xml.includes('<item>') && !xml.includes('<item ')) continue

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        isArray: (name) => name === 'item',
      })
      const parsed = parser.parse(xml)
      const channel = (parsed?.rss as Record<string, unknown>)?.channel as Record<string, unknown>
      const raw = channel?.item ?? []
      const list = (Array.isArray(raw) ? raw : [raw]) as Array<Record<string, unknown>>

      const items: ParsedItem[] = []
      for (const item of list) {
        const title = extractText(item.title)
        const summary = extractText(item.description).replace(/<[^>]*>/g, '').trim()
        const url = extractText(item.link) || extractText(item.guid)
        const pubDateRaw = extractText(item.pubDate)
        if (!url || !title) continue
        items.push({ title, summary, url, pubDate: pubDateRaw ? new Date(pubDateRaw) : new Date() })
      }
      if (items.length > 0) return items
    } catch {
      continue
    }
  }
  return null
}

async function fetchViaHtml(): Promise<ParsedItem[]> {
  const res = await fetch(NEWSROOM_URL, { headers: HEADERS, next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`Newsroom page HTTP ${res.status}`)
  const html = await res.text()

  const seen = new Set<string>()
  const items: ParsedItem[] = []

  const pattern = /href="(\/newsroom\/(?:irs|news-release|ir-)[a-z0-9-]{8,})"[^>]*>([\s\S]{20,250}?)<\/a>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const path = match[1]
    const rawTitle = match[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    const url = `https://www.irs.gov${path}`
    if (!seen.has(url) && rawTitle.length >= 20) {
      seen.add(url)
      items.push({ title: rawTitle, summary: '', url, pubDate: new Date() })
    }
    if (items.length >= 25) break
  }

  if (items.length === 0) throw new Error('No se pudieron extraer noticias del sitio del IRS')
  return items
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let items: ParsedItem[]
  let source = 'rss'

  const rssItems = await fetchViaRss()
  if (rssItems && rssItems.length > 0) {
    items = rssItems
  } else {
    source = 'html'
    try {
      items = await fetchViaHtml()
    } catch (err) {
      return NextResponse.json(
        { error: `No se pudieron obtener noticias del IRS: ${err instanceof Error ? err.message : err}` },
        { status: 502 }
      )
    }
  }

  let added = 0
  let skipped = 0

  for (const { title, summary, url, pubDate } of items) {
    try {
      await prisma.irsNews.create({ data: { title, summary, url, publishedAt: pubDate } })
      added++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ added, skipped, source })
}

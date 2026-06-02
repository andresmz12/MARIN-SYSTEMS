import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { XMLParser } from 'fast-xml-parser'

const IRS_RSS_URLS = [
  'https://www.irs.gov/rss/newsroom.xml',
  'https://www.irs.gov/rss/news-releases.xml',
  'https://www.irs.gov/rss/irs-news.xml',
]

function extractText(val: unknown): string {
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number') return String(val)
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>
    if ('#text' in obj) return String(obj['#text']).trim()
  }
  return ''
}

async function fetchIrsRss(): Promise<string> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; MarinSystems/1.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  }
  for (const url of IRS_RSS_URLS) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 0 } })
      if (res.ok) return await res.text()
    } catch {
      // try next URL
    }
  }
  throw new Error('Ningún feed del IRS está disponible en este momento')
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let xml: string
  try {
    xml = await fetchIrsRss()
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo obtener el feed del IRS: ${err instanceof Error ? err.message : err}` },
      { status: 502 }
    )
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => name === 'item',
  })

  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(xml)
  } catch (err) {
    return NextResponse.json({ error: `Error al parsear XML: ${err}` }, { status: 500 })
  }

  const channel = (parsed?.rss as Record<string, unknown>)?.channel as Record<string, unknown>
  const raw = channel?.item ?? []
  const list = Array.isArray(raw) ? raw : [raw]

  let added = 0
  let skipped = 0

  for (const item of list as Array<Record<string, unknown>>) {
    const title = extractText(item.title)
    const summary = extractText(item.description).replace(/<[^>]*>/g, '').trim()
    const url = extractText(item.link) || extractText(item.guid)
    const pubDateRaw = extractText(item.pubDate)
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : new Date()

    if (!url || !title) { skipped++; continue }

    try {
      await prisma.irsNews.create({ data: { title, summary, url, publishedAt: pubDate } })
      added++
    } catch {
      // unique constraint violation = duplicate, skip silently
      skipped++
    }
  }

  return NextResponse.json({ added, skipped })
}

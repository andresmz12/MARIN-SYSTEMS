import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { XMLParser } from 'fast-xml-parser'

const IRS_RSS_URL = 'https://www.irs.gov/rss/newsroom.xml'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let xml: string
  try {
    const res = await fetch(IRS_RSS_URL, { next: { revalidate: 0 } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    xml = await res.text()
  } catch (err) {
    return NextResponse.json({ error: 'No se pudo obtener el feed del IRS' }, { status: 502 })
  }

  const parser = new XMLParser({ ignoreAttributes: false })
  const parsed = parser.parse(xml)
  const items: Array<Record<string, string>> = parsed?.rss?.channel?.item ?? []
  const list = Array.isArray(items) ? items : [items]

  let added = 0
  let skipped = 0

  for (const item of list) {
    const url = typeof item.link === 'string' ? item.link.trim() : String(item.guid ?? '').trim()
    const title = String(item.title ?? '').trim()
    const summary = String(item.description ?? '').replace(/<[^>]*>/g, '').trim()
    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date()

    if (!url || !title) { skipped++; continue }

    try {
      await prisma.irsNews.create({ data: { title, summary, url, publishedAt: pubDate } })
      added++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ added, skipped })
}

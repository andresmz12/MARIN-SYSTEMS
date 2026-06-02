import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

async function fetchIrsItems(): Promise<RssItem[]> {
  // Try RSS feeds first
  const RSS_URLS = [
    'https://www.irs.gov/rss/newsroom.xml',
    'https://www.irs.gov/rss/news-releases.xml',
    'https://www.irs.gov/rss/irs-guidance.xml',
  ]
  for (const url of RSS_URLS) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: 0 } })
      if (!res.ok) continue
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('xml') && !ct.includes('rss')) continue
      const xml = await res.text()
      const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? []
      const items: RssItem[] = itemBlocks.slice(0, 5).map((block) => {
        const title = (block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? block.match(/<title[^>]*>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? ''
        const url2 = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/) ?? block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/))?.[1]?.trim() ?? ''
        const desc = (block.match(/<description[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ?? block.match(/<description[^>]*>([\s\S]*?)<\/description>/))?.[1]?.replace(/<[^>]*>/g, '').trim() ?? ''
        const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? new Date().toUTCString()
        return { title, summary: desc, url: url2, pubDate }
      }).filter((i) => i.title && i.url)
      if (items.length > 0) return items
    } catch { /* try next */ }
  }

  // Fall back to HTML scraping
  const res = await fetch('https://www.irs.gov/newsroom', { headers: BROWSER_HEADERS, next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const items: RssItem[] = []
  const seen = new Set<string>()
  const linkRe = /href="(\/newsroom\/[a-z0-9][a-z0-9-]{10,})"[^>]*>\s*([^<]{10,})\s*</gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null && items.length < 5) {
    const path = m[1]
    if (seen.has(path)) continue
    seen.add(path)
    items.push({ title: m[2].trim(), summary: '', url: `https://www.irs.gov${path}`, pubDate: new Date().toUTCString() })
  }
  if (items.length === 0) throw new Error('No se encontraron noticias')
  return items
}

export interface RssItem {
  title: string
  summary: string
  url: string
  pubDate: string
}

export interface MapaNode {
  id: string
  emoji: string
  texto: string
  color: string
}
export interface MapaHijo {
  id: string
  texto: string
  color: string
}
export interface MapaRama extends MapaNode {
  hijos: MapaHijo[]
}
export interface MapaJson {
  centro: MapaNode
  ramas: MapaRama[]
}

/* GET — returns the 5 most recent IRS news items */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const items = await fetchIrsItems()
    return NextResponse.json(items)
  } catch {
    return NextResponse.json({ error: 'No se pudo obtener noticias del IRS' }, { status: 502 })
  }
}

/* POST — generate mapa conceptual + guion for one news item */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, summary } = await req.json() as { title: string; summary: string }
  if (!title) return NextResponse.json({ error: 'title requerido' }, { status: 400 })

  const client = new Anthropic()

  const prompt = `Eres un experto en impuestos para la comunidad hispana en EE.UU.

A partir de esta noticia del IRS, genera DOS cosas:

1. Un mapa mental en JSON con EXACTAMENTE esta estructura (4 ramas, 2 hijos cada una):
{
  "centro": { "id": "c", "emoji": "🏛", "texto": "TÍTULO CORTO (máx 3 palabras)", "color": "#1e3a5f" },
  "ramas": [
    {
      "id": "r1", "emoji": "📌", "texto": "Rama corta (máx 3 palabras)", "color": "#dc2626",
      "hijos": [
        { "id": "r1h1", "texto": "texto hijo (máx 4 palabras)", "color": "#fca5a5" },
        { "id": "r1h2", "texto": "texto hijo (máx 4 palabras)", "color": "#fca5a5" }
      ]
    },
    {
      "id": "r2", "emoji": "💡", "texto": "Rama corta (máx 3 palabras)", "color": "#2563eb",
      "hijos": [
        { "id": "r2h1", "texto": "texto hijo (máx 4 palabras)", "color": "#93c5fd" },
        { "id": "r2h2", "texto": "texto hijo (máx 4 palabras)", "color": "#93c5fd" }
      ]
    },
    {
      "id": "r3", "emoji": "✅", "texto": "Rama corta (máx 3 palabras)", "color": "#16a34a",
      "hijos": [
        { "id": "r3h1", "texto": "texto hijo (máx 4 palabras)", "color": "#86efac" },
        { "id": "r3h2", "texto": "texto hijo (máx 4 palabras)", "color": "#86efac" }
      ]
    },
    {
      "id": "r4", "emoji": "⚠️", "texto": "Rama corta (máx 3 palabras)", "color": "#d97706",
      "hijos": [
        { "id": "r4h1", "texto": "texto hijo (máx 4 palabras)", "color": "#fcd34d" },
        { "id": "r4h2", "texto": "texto hijo (máx 4 palabras)", "color": "#fcd34d" }
      ]
    }
  ]
}

2. Un guion de 35-45 segundos en español latino conversacional, como explicándole a un amigo.
   - Empieza con un gancho (¿Sabías que...? o ¡Atención! o similar)
   - Cubre cada rama y sus puntos clave en orden
   - Termina con llamada a la acción ("Guarda este video", "Comenta si te ayudó", etc.)
   - Sin muletillas, directo al punto

NOTICIA:
Título: ${title}
Resumen: ${summary}

Responde SOLO con JSON válido (sin markdown, sin texto extra):
{ "mapaJson": {...}, "guionCompleto": "..." }`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''

  let result: { mapaJson: MapaJson; guionCompleto: string }
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    result = match ? JSON.parse(match[0]) : { mapaJson: null, guionCompleto: raw }
  } catch {
    return NextResponse.json({ error: 'Error al parsear respuesta de IA', raw }, { status: 500 })
  }

  return NextResponse.json(result)
}

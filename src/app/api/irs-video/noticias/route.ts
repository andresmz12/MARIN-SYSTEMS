import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { XMLParser } from 'fast-xml-parser'
import Anthropic from '@anthropic-ai/sdk'

const IRS_RSS = 'https://www.irs.gov/rss/newsroom.xml'

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

/* GET — returns the 5 most recent IRS news items from RSS */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let xml: string
  try {
    const res = await fetch(IRS_RSS, { next: { revalidate: 0 } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    xml = await res.text()
  } catch {
    return NextResponse.json({ error: 'No se pudo obtener el feed del IRS' }, { status: 502 })
  }

  const parser = new XMLParser({ ignoreAttributes: false })
  const parsed = parser.parse(xml)
  const raw: Array<Record<string, string>> = parsed?.rss?.channel?.item ?? []
  const list = (Array.isArray(raw) ? raw : [raw]).slice(0, 5)

  const items: RssItem[] = list.map((item) => ({
    title: String(item.title ?? '').trim(),
    summary: String(item.description ?? '').replace(/<[^>]*>/g, '').trim(),
    url: (typeof item.link === 'string' ? item.link : String(item.guid ?? '')).trim(),
    pubDate: String(item.pubDate ?? new Date().toUTCString()),
  }))

  return NextResponse.json(items)
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

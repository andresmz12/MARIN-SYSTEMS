import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { XMLParser } from 'fast-xml-parser'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const IRS_RSS = 'https://www.irs.gov/rss/newsroom.xml'
const ELEVENLABS_VOICE_ID = 'YPh7OporwNAJ28F5IQrm'

export interface RssItem {
  title: string
  summary: string
  url: string
  pubDate: string
}

function extractText(val: unknown): string {
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number') return String(val)
  if (val && typeof val === 'object') {
    const o = val as Record<string, unknown>
    if ('#text' in o) return String(o['#text']).trim()
  }
  return ''
}

/* ── GET: return 5 most recent IRS news items ── */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const res = await fetch(IRS_RSS, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarinSystems/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      isArray: (name) => name === 'item',
    })
    const parsed = parser.parse(xml)
    const channel = (parsed?.rss as Record<string, unknown>)?.channel as Record<string, unknown>
    const raw = (channel?.item ?? []) as Array<Record<string, unknown>>
    const list = (Array.isArray(raw) ? raw : [raw]).slice(0, 5)

    const items: RssItem[] = list.map((item) => ({
      title: extractText(item.title),
      summary: extractText(item.description).replace(/<[^>]*>/g, '').trim(),
      url: extractText(item.link) || extractText(item.guid),
      pubDate: extractText(item.pubDate) || new Date().toUTCString(),
    }))

    return NextResponse.json(items)
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo obtener el feed: ${err instanceof Error ? err.message : err}` },
      { status: 502 }
    )
  }
}

/* ── POST: generate mapa + audio → StudioSession ── */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, summary, spanishSummary } = await req.json() as {
    title: string; summary: string; spanishSummary?: string
  }
  if (!title) return NextResponse.json({ error: 'title requerido' }, { status: 400 })

  const client = new Anthropic()
  const context = spanishSummary || summary

  const prompt = `Eres un experto en impuestos para la comunidad hispana en EE.UU.

Esta es una noticia del IRS:
Título: ${title}
Resumen: ${context}

Genera un mapa educativo con 5 ramas temáticas: Qué es / Cómo funciona / Qué debes hacer / Fechas y montos / Errores comunes.

Responde SOLO con JSON válido (sin markdown, sin texto extra):
{
  "centro": { "id": "c", "emoji": "🏛", "texto": "TÍTULO CORTO (máx 3 palabras)", "color": "#1e3a5f" },
  "ramas": [
    { "id": "r1", "emoji": "📖", "texto": "Qué es (3 palabras)", "color": "#dc2626",
      "hijos": [{ "id": "r1h1", "texto": "detalle (4 palabras)", "color": "#fca5a5" }, { "id": "r1h2", "texto": "detalle (4 palabras)", "color": "#fca5a5" }] },
    { "id": "r2", "emoji": "⚙️", "texto": "Cómo funciona (2 palabras)", "color": "#2563eb",
      "hijos": [{ "id": "r2h1", "texto": "detalle (4 palabras)", "color": "#93c5fd" }, { "id": "r2h2", "texto": "detalle (4 palabras)", "color": "#93c5fd" }] },
    { "id": "r3", "emoji": "✅", "texto": "Qué hacer (3 palabras)", "color": "#16a34a",
      "hijos": [{ "id": "r3h1", "texto": "detalle (4 palabras)", "color": "#86efac" }, { "id": "r3h2", "texto": "detalle (4 palabras)", "color": "#86efac" }] },
    { "id": "r4", "emoji": "📅", "texto": "Fechas y montos (2 palabras)", "color": "#d97706",
      "hijos": [{ "id": "r4h1", "texto": "detalle (4 palabras)", "color": "#fcd34d" }, { "id": "r4h2", "texto": "detalle (4 palabras)", "color": "#fcd34d" }] },
    { "id": "r5", "emoji": "⚠️", "texto": "Errores comunes (2 palabras)", "color": "#7c3aed",
      "hijos": [{ "id": "r5h1", "texto": "detalle (4 palabras)", "color": "#c4b5fd" }, { "id": "r5h2", "texto": "detalle (4 palabras)", "color": "#c4b5fd" }] }
  ],
  "guion": "Guion de 60 segundos en español latino conversacional. Gancho inicial. Cubre las 5 ramas en orden. Llamada a la acción final. Sin corchetes, sin etiquetas, texto limpio listo para leer en voz alta."
}`

  /* 1 — Claude */
  let mapaJson: unknown, guion: string
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON')
    const parsed = JSON.parse(match[0])
    mapaJson = { centro: parsed.centro, ramas: parsed.ramas }
    // Strip bracket tags just in case
    guion = (parsed.guion as string).replace(/\[[^\]]*\]/g, '').trim()
  } catch {
    return NextResponse.json({ error: 'Error generando el mapa, intenta de nuevo' }, { status: 500 })
  }

  /* 2 — ElevenLabs */
  let audioData: string
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY ?? ''
    const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: guion,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true },
      }),
    })
    if (elRes.status === 401) return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
    if (elRes.status === 429) return NextResponse.json({ error: 'Sin créditos disponibles' }, { status: 429 })
    if (!elRes.ok) throw new Error(`HTTP ${elRes.status}`)
    audioData = Buffer.from(await elRes.arrayBuffer()).toString('base64')
  } catch (err) {
    if (err instanceof Error && err.message.includes('401')) return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
    if (err instanceof Error && err.message.includes('429')) return NextResponse.json({ error: 'Sin créditos disponibles' }, { status: 429 })
    return NextResponse.json({ error: 'Error de conexión con ElevenLabs' }, { status: 503 })
  }

  /* 3 — StudioSession */
  const studioSession = await prisma.studioSession.create({
    data: {
      tema: title,
      redSocial: 'TikTok',
      duracion: '60s',
      mapaJson: mapaJson as object,
      guion,
      audioData,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  return NextResponse.json({ url: `${baseUrl}/studio/${studioSession.token}` })
}

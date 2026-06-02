import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
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

/* GET — returns recent IRS news from DB */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const news = await prisma.irsNews.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 30,
    })
    return NextResponse.json(news)
  } catch {
    return NextResponse.json({ error: 'Error al obtener noticias' }, { status: 500 })
  }
}

/* POST — generate mapa conceptual + guion, then save to DB */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, summary, spanishSummary } = await req.json() as {
    title: string
    summary: string
    spanishSummary?: string
  }
  if (!title) return NextResponse.json({ error: 'title requerido' }, { status: 400 })

  const client = new Anthropic()

  const contextLine = spanishSummary
    ? `\nContexto en español: ${spanishSummary}`
    : summary
    ? `\nResumen: ${summary}`
    : ''

  const prompt = `Eres un experto en impuestos para la comunidad hispana en EE.UU.

A partir de esta noticia del IRS, genera DOS cosas:

1. Un mapa mental RICO EN INFORMACIÓN con EXACTAMENTE 5 ramas y 3 hijos por rama.
   Los textos de los hijos deben ser FRASES COMPLETAS E INFORMATIVAS (no solo palabras sueltas).
   Incluye números reales, fechas, montos o porcentajes cuando aplique.

Estructura JSON exacta:
{
  "centro": { "id": "c", "emoji": "🏛", "texto": "TÍTULO (máx 4 palabras)", "color": "#1e3a5f" },
  "ramas": [
    {
      "id": "r1", "emoji": "📌", "texto": "Qué es (4-5 palabras)", "color": "#dc2626",
      "hijos": [
        { "id": "r1h1", "texto": "frase informativa específica (5-8 palabras)", "color": "#fca5a5" },
        { "id": "r1h2", "texto": "frase informativa específica (5-8 palabras)", "color": "#fca5a5" },
        { "id": "r1h3", "texto": "frase informativa específica (5-8 palabras)", "color": "#fca5a5" }
      ]
    },
    {
      "id": "r2", "emoji": "💡", "texto": "Cómo funciona (4-5 palabras)", "color": "#2563eb",
      "hijos": [
        { "id": "r2h1", "texto": "frase informativa específica (5-8 palabras)", "color": "#93c5fd" },
        { "id": "r2h2", "texto": "frase informativa específica (5-8 palabras)", "color": "#93c5fd" },
        { "id": "r2h3", "texto": "frase informativa específica (5-8 palabras)", "color": "#93c5fd" }
      ]
    },
    {
      "id": "r3", "emoji": "✅", "texto": "Qué debo hacer (4-5 palabras)", "color": "#16a34a",
      "hijos": [
        { "id": "r3h1", "texto": "acción concreta con detalle (5-8 palabras)", "color": "#86efac" },
        { "id": "r3h2", "texto": "acción concreta con detalle (5-8 palabras)", "color": "#86efac" },
        { "id": "r3h3", "texto": "acción concreta con detalle (5-8 palabras)", "color": "#86efac" }
      ]
    },
    {
      "id": "r4", "emoji": "📅", "texto": "Fechas y montos (4-5 palabras)", "color": "#d97706",
      "hijos": [
        { "id": "r4h1", "texto": "fecha o monto específico (5-8 palabras)", "color": "#fcd34d" },
        { "id": "r4h2", "texto": "fecha o monto específico (5-8 palabras)", "color": "#fcd34d" },
        { "id": "r4h3", "texto": "fecha o monto específico (5-8 palabras)", "color": "#fcd34d" }
      ]
    },
    {
      "id": "r5", "emoji": "⚠️", "texto": "Errores comunes (4-5 palabras)", "color": "#7c3aed",
      "hijos": [
        { "id": "r5h1", "texto": "error o riesgo específico (5-8 palabras)", "color": "#c4b5fd" },
        { "id": "r5h2", "texto": "error o riesgo específico (5-8 palabras)", "color": "#c4b5fd" },
        { "id": "r5h3", "texto": "error o riesgo específico (5-8 palabras)", "color": "#c4b5fd" }
      ]
    }
  ]
}

Ejemplos de frases BUENAS (informativas):
✓ "Aplica a trabajadores independientes 1099"
✓ "Multa de hasta $5,000 por no reportar"
✓ "Presentar antes del 15 de octubre"
✓ "Descargar formulario W-9 actualizado"

Ejemplos de frases MALAS (demasiado genéricas):
✗ "Más información"
✗ "Ver detalles"
✗ "Aplica a todos"

2. Un guion de 50-65 segundos en español latino conversacional.
   - Gancho impactante al inicio (¿Sabías que...? / ¡Atención si eres...! / Esto te puede costar...)
   - Menciona cifras, fechas y hechos concretos de la noticia
   - Cubre las 5 áreas del mapa en orden
   - Termina con llamada a la acción específica y directa
   - Sin muletillas, sin "básicamente", sin "en resumen"

NOTICIA:
Título: ${title}${contextLine}

Responde SOLO con JSON válido (sin markdown, sin texto extra):
{ "mapaJson": {...}, "guionCompleto": "..." }`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
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

  // Save to DB (non-fatal if fails)
  try {
    await prisma.irsVideoContent.create({
      data: {
        titulo: title.slice(0, 200),
        guionCompleto: result.guionCompleto,
        mapaJson: result.mapaJson as object,
        publishedAt: new Date(),
      },
    })
  } catch { /* ignore — return result anyway */ }

  return NextResponse.json(result)
}

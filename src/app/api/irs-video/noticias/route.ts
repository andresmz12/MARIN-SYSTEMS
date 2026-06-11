import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { datePrefix } from '@/lib/ai-date'

export const maxDuration = 60

const CLAUDE_SYS_BASE = `Eres experto en contenido viral para latinos en EE.UU. sobre taxes, LLC e ITIN. Español latino conversacional. Responde SOLO JSON válido. Sin markdown. Sin texto extra.

REGLAS ESTRICTAS DE LONGITUD DEL GUION:
- TikTok 30s: máximo 70 palabras total
- TikTok 45s: máximo 100 palabras total
- TikTok 60s: máximo 130 palabras total
- Instagram Reels: mismo que TikTok
- YouTube Shorts: máximo 130 palabras
- Facebook: máximo 130 palabras

El guion de CADA NODO debe ser MUY CORTO:
- Centro: máximo 15 palabras
- Rama: máximo 12 palabras
- Hijo: máximo 8 palabras

Estilo: frases cortas, directas, sin explicaciones largas. Como hablar en Twitter, no en un artículo.

EJEMPLOS CORRECTOS:
- Centro: "Si no declaras taxes, el IRS te cobra multa y intereses."
- Rama: "La multa por no presentar es 5% mensual."
- Hijo: "Máximo 25% del impuesto."

EJEMPLOS INCORRECTOS (muy largos):
- "El IRS cobra dos multas separadas: una por no presentar y otra por no pagar. Pueden combinarse y comerse tu reembolso..." (demasiado largo)`

function buildGuion(mapa: any): string {
  const parts: string[] = []
  if (mapa.centro?.guion) parts.push(mapa.centro.guion.trim())
  for (const rama of mapa.ramas ?? []) {
    if (rama.guion) parts.push(rama.guion.trim())
    for (const hijo of rama.hijos ?? []) {
      if (hijo.guion) parts.push(hijo.guion.trim())
    }
  }
  if (mapa.cta) parts.push(mapa.cta.trim())
  return parts.join(' ')
}

/* GET — returns recent IRS news from DB */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const news = await prisma.irsNews.findMany({ orderBy: { publishedAt: 'desc' }, take: 30 })
    return NextResponse.json(news)
  } catch {
    return NextResponse.json({ error: 'Error al obtener noticias' }, { status: 500 })
  }
}

/* POST — generate educational mind map + narration script */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, summary, spanishSummary } = await req.json() as {
    title: string; summary: string; spanishSummary?: string
  }
  if (!title) return NextResponse.json({ error: 'title requerido' }, { status: 400 })

  const context = spanishSummary || summary || ''
  const client = new Anthropic()

  const prompt = `Genera mapa conceptual sobre esta noticia del IRS:
${title}${context ? `\n${context}` : ''}

ESTRUCTURA OBLIGATORIA: 1 centro, 5 ramas exactas, 3 hijos por rama exactos. Total 21 nodos.

REGLAS ESTRICTAS DEL TEXTO (crítico):
- Centro: máximo 3 palabras
- Rama: máximo 3 palabras
- Hijo: máximo 3 palabras
- Separar en 2 líneas con \\n si hay 2 datos
- CORRECTO: "Multa\\n5%", "Form 1099-K", "Antes\\nAbril"
- INCORRECTO: "Multas y cargos extra", "Intereses que crecen solos"
- El texto es una ETIQUETA corta — el detalle va en el guion

JSON exacto (sin nada más):
{
  "centro": {
    "id": "centro",
    "emoji": "🏛",
    "texto": "Palabra\\nPalabra",
    "color": "#1e3a5f",
    "guion": "2 oraciones introduciendo esta noticia del IRS para la comunidad latina."
  },
  "ramas": [
    {
      "id": "r1", "emoji": "📌", "texto": "Texto\\nCorto", "color": "#dc2626",
      "guion": "2 oraciones explicando esta categoría con ejemplo concreto para latinos.",
      "hijos": [
        { "id": "h1a", "texto": "Dato corto", "color": "#fca5a5", "guion": "1 oración con dato específico: monto, fecha o acción." },
        { "id": "h1b", "texto": "Dato corto", "color": "#fca5a5", "guion": "1 oración con dato específico." },
        { "id": "h1c", "texto": "Dato corto", "color": "#fca5a5", "guion": "1 oración con dato específico." }
      ]
    },
    {
      "id": "r2", "emoji": "💡", "texto": "Texto\\nCorto", "color": "#2563eb",
      "guion": "2 oraciones.",
      "hijos": [
        { "id": "h2a", "texto": "Dato corto", "color": "#93c5fd", "guion": "1 oración." },
        { "id": "h2b", "texto": "Dato corto", "color": "#93c5fd", "guion": "1 oración." },
        { "id": "h2c", "texto": "Dato corto", "color": "#93c5fd", "guion": "1 oración." }
      ]
    },
    {
      "id": "r3", "emoji": "✅", "texto": "Texto\\nCorto", "color": "#16a34a",
      "guion": "2 oraciones.",
      "hijos": [
        { "id": "h3a", "texto": "Dato corto", "color": "#86efac", "guion": "1 oración." },
        { "id": "h3b", "texto": "Dato corto", "color": "#86efac", "guion": "1 oración." },
        { "id": "h3c", "texto": "Dato corto", "color": "#86efac", "guion": "1 oración." }
      ]
    },
    {
      "id": "r4", "emoji": "📅", "texto": "Texto\\nCorto", "color": "#d97706",
      "guion": "2 oraciones.",
      "hijos": [
        { "id": "h4a", "texto": "Dato corto", "color": "#fcd34d", "guion": "1 oración." },
        { "id": "h4b", "texto": "Dato corto", "color": "#fcd34d", "guion": "1 oración." },
        { "id": "h4c", "texto": "Dato corto", "color": "#fcd34d", "guion": "1 oración." }
      ]
    },
    {
      "id": "r5", "emoji": "⚠️", "texto": "Texto\\nCorto", "color": "#7c3aed",
      "guion": "2 oraciones.",
      "hijos": [
        { "id": "h5a", "texto": "Dato corto", "color": "#c4b5fd", "guion": "1 oración." },
        { "id": "h5b", "texto": "Dato corto", "color": "#c4b5fd", "guion": "1 oración." },
        { "id": "h5c", "texto": "Dato corto", "color": "#c4b5fd", "guion": "1 oración." }
      ]
    }
  ],
  "cta": "¿Tienes preguntas sobre esto? Escríbeme y te ayudo 👇"
}`

  let raw: string
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: datePrefix() + CLAUDE_SYS_BASE,
      messages: [{ role: 'user', content: prompt }],
    })
    raw = message.content[0].type === 'text' ? message.content[0].text : ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error al llamar a la IA: ${msg}` }, { status: 500 })
  }

  let mapaJson: any
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    if (!parsed?.centro || !Array.isArray(parsed.ramas)) throw new Error('Invalid response')
    for (const r of parsed.ramas) { if (!Array.isArray(r.hijos)) r.hijos = [] }
    mapaJson = parsed
  } catch {
    return NextResponse.json({ error: 'Error generando el mapa, intenta de nuevo.' }, { status: 500 })
  }

  const guionCompleto = buildGuion(mapaJson)

  // Create studio session
  let studioToken: string
  try {
    const studioSession = await prisma.studioSession.create({
      data: {
        userId: session.user.id,
        tema: title.slice(0, 200),
        redSocial: 'TikTok',
        duracion: '60s',
        mapaJson,
        guion: guionCompleto,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      select: { token: true },
    })
    studioToken = studioSession.token
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error guardando sesión: ${msg}` }, { status: 500 })
  }

  // Save IRS history (non-fatal)
  try {
    await prisma.irsVideoContent.create({
      data: {
        titulo: title.slice(0, 200),
        guionCompleto,
        mapaJson,
        publishedAt: new Date(),
      },
    })
  } catch { /* ignore */ }

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return NextResponse.json({ url: `${base}/studio/${studioToken}`, token: studioToken, guionCompleto, mapaJson })
}

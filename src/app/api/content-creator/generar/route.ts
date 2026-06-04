import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { datePrefix } from '@/lib/ai-date'

export const maxDuration = 60

const CLAUDE_SYS_BASE = `Eres experto en contenido viral para latinos en EE.UU. sobre taxes, LLC e ITIN. Español latino conversacional. Responde SOLO JSON válido. Sin markdown. Sin texto extra.`

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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tema, redSocial, duracion } = await req.json() as {
    tema: string; redSocial: string; duracion: string
  }
  if (!tema) return NextResponse.json({ error: 'tema requerido' }, { status: 400 })

  const client = new Anthropic()

  const prompt = `Genera mapa conceptual para video de ${duracion} sobre: "${tema}"
Para: ${redSocial}

ESTRUCTURA OBLIGATORIA: 1 centro, 5 ramas exactas, 3 hijos por rama exactos. Total 21 nodos.

REGLAS ESTRICTAS DEL TEXTO (crítico):
- Centro: máximo 3 palabras
- Rama: máximo 3 palabras
- Hijo: máximo 3 palabras
- Separar en 2 líneas con \\n si hay 2 datos
- CORRECTO: "Multa\\n5%", "Form 1099-K", "Antes\\nAbril"
- INCORRECTO: "Multas y cargos extra", "Intereses que crecen solos"
- El texto es una ETIQUETA corta — el detalle va en el guion
- NO textos genéricos. SÍ datos reales: montos, fechas, formularios, porcentajes

JSON exacto (sin nada más):
{
  "centro": {
    "id": "centro",
    "emoji": "🎯",
    "texto": "Palabra\\nPalabra",
    "color": "#1e3a5f",
    "guion": "2 oraciones introduciendo el tema de forma clara para la comunidad latina."
  },
  "ramas": [
    {
      "id": "r1", "emoji": "📌", "texto": "Texto\\nCorto", "color": "#dc2626",
      "guion": "2 oraciones explicando esta categoría con ejemplo concreto.",
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
      "id": "r4", "emoji": "⚡", "texto": "Texto\\nCorto", "color": "#d97706",
      "guion": "2 oraciones.",
      "hijos": [
        { "id": "h4a", "texto": "Dato corto", "color": "#fcd34d", "guion": "1 oración." },
        { "id": "h4b", "texto": "Dato corto", "color": "#fcd34d", "guion": "1 oración." },
        { "id": "h4c", "texto": "Dato corto", "color": "#fcd34d", "guion": "1 oración." }
      ]
    },
    {
      "id": "r5", "emoji": "🚀", "texto": "Texto\\nCorto", "color": "#7c3aed",
      "guion": "2 oraciones.",
      "hijos": [
        { "id": "h5a", "texto": "Dato corto", "color": "#c4b5fd", "guion": "1 oración." },
        { "id": "h5b", "texto": "Dato corto", "color": "#c4b5fd", "guion": "1 oración." },
        { "id": "h5c", "texto": "Dato corto", "color": "#c4b5fd", "guion": "1 oración." }
      ]
    }
  ],
  "cta": "¿Tienes preguntas? Escríbeme y te ayudo 👇"
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
    return NextResponse.json({ error: `Error generando el mapa, intenta de nuevo. (${msg})` }, { status: 500 })
  }

  let mapaJson: any
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    if (!parsed?.centro || !Array.isArray(parsed.ramas)) throw new Error('Invalid response')
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
        tema: tema.slice(0, 200),
        redSocial,
        duracion,
        mapaJson,
        guion: guionCompleto,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: { token: true },
    })
    studioToken = studioSession.token
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error guardando sesión: ${msg}` }, { status: 500 })
  }

  // Save content history (non-fatal)
  try {
    await prisma.contentCreatorHistory.create({
      data: {
        userId: session.user.id,
        tema: tema.slice(0, 200),
        redSocial,
        duracion,
        mapaJson,
        guion: guionCompleto,
        titulo: '',
        hashtags: [],
      },
    })
  } catch { /* ignore */ }

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return NextResponse.json({ url: `${base}/studio/${studioToken}`, guionCompleto })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const history = await prisma.contentCreatorHistory.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, tema: true, redSocial: true, duracion: true, titulo: true, createdAt: true },
    })
    return NextResponse.json(history)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}

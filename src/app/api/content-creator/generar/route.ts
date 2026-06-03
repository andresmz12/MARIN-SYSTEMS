import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tema, redSocial, duracion } = await req.json() as {
    tema: string; redSocial: string; duracion: string
  }
  if (!tema) return NextResponse.json({ error: 'tema requerido' }, { status: 400 })

  const wordCount = duracion === '30s' ? 75 : duracion === '45s' ? 110 : 150
  const wordCountLabel = `${wordCount} palabras (~${duracion})`

  const prompt = `Eres un experto en contenido viral para latinos en EE.UU. sobre impuestos, LLC, ITIN y servicios financieros. Tu contenido es educativo, en español latino conversacional, como si le explicaras a un amigo. Nunca uses términos muy técnicos sin explicarlos primero.

Genera contenido sobre este tema: "${tema}"
Red social destino: ${redSocial}
Duración objetivo: ${duracion} (${wordCountLabel})

Genera los siguientes elementos en UN SOLO JSON válido (sin markdown):

{
  "mapaJson": {
    "centro": {
      "id": "c",
      "emoji": "🎯",
      "texto": "TÍTULO CORTO (máx 4 palabras)",
      "color": "#1e3a5f",
      "explicacion": "2-3 oraciones que presentan el tema de forma clara y sencilla."
    },
    "ramas": [
      {
        "id": "r1", "emoji": "📌", "texto": "Categoría 1 (3-4 palabras)", "color": "#dc2626",
        "explicacion": "2 oraciones explicando esta categoría con un ejemplo concreto.",
        "hijos": [
          { "id": "r1h1", "texto": "punto clave (4-6 palabras)", "color": "#fca5a5", "explicacion": "1-2 oraciones específicas." },
          { "id": "r1h2", "texto": "punto clave (4-6 palabras)", "color": "#fca5a5", "explicacion": "1-2 oraciones específicas." }
        ]
      },
      {
        "id": "r2", "emoji": "💡", "texto": "Categoría 2 (3-4 palabras)", "color": "#2563eb",
        "explicacion": "2 oraciones explicando esta categoría.",
        "hijos": [
          { "id": "r2h1", "texto": "punto clave", "color": "#93c5fd", "explicacion": "1-2 oraciones." },
          { "id": "r2h2", "texto": "punto clave", "color": "#93c5fd", "explicacion": "1-2 oraciones." }
        ]
      },
      {
        "id": "r3", "emoji": "✅", "texto": "Categoría 3 (3-4 palabras)", "color": "#16a34a",
        "explicacion": "2 oraciones con pasos concretos o beneficios.",
        "hijos": [
          { "id": "r3h1", "texto": "punto clave", "color": "#86efac", "explicacion": "1-2 oraciones." },
          { "id": "r3h2", "texto": "punto clave", "color": "#86efac", "explicacion": "1-2 oraciones." }
        ]
      },
      {
        "id": "r4", "emoji": "⚡", "texto": "Categoría 4 (3-4 palabras)", "color": "#d97706",
        "explicacion": "2 oraciones sobre datos clave, fechas o montos importantes.",
        "hijos": [
          { "id": "r4h1", "texto": "punto clave", "color": "#fcd34d", "explicacion": "1-2 oraciones." },
          { "id": "r4h2", "texto": "punto clave", "color": "#fcd34d", "explicacion": "1-2 oraciones." }
        ]
      }
    ]
  },
  "guion": "El guion completo aquí. Tono conversacional como hablarle a un amigo. Total: ${wordCountLabel}. Termina con: ¿Tienes preguntas? Escríbeme y te ayudo 👇",
  "titulo": "Título optimizado para ${redSocial} (max 60 chars, con emoji al inicio)",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
}`

  const client = new Anthropic()
  let raw: string
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })
    raw = message.content[0].type === 'text' ? message.content[0].text : ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error generando el mapa, intenta de nuevo. (${msg})` }, { status: 500 })
  }

  let result: { mapaJson: object; guion: string; titulo: string; hashtags: string[] }
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    if (!parsed?.mapaJson) throw new Error('Invalid response')
    result = parsed
  } catch {
    return NextResponse.json({ error: 'Error generando el mapa, intenta de nuevo.' }, { status: 500 })
  }

  // Create studio session
  let studioToken: string
  try {
    const studioSession = await prisma.studioSession.create({
      data: {
        tema: tema.slice(0, 200),
        redSocial,
        duracion,
        mapaJson: result.mapaJson,
        guion: result.guion,
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
        mapaJson: result.mapaJson,
        guion: result.guion,
        titulo: result.titulo,
        hashtags: result.hashtags,
      },
    })
  } catch { /* ignore */ }

  const base = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return NextResponse.json({
    url: `${base}/studio/${studioToken}`,
    guionCompleto: result.guion,
  })
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

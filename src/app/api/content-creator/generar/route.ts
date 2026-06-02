import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tema, redSocial, duracion } = await req.json() as {
    tema: string; redSocial: string; duracion: string
  }
  if (!tema) return NextResponse.json({ error: 'tema requerido' }, { status: 400 })

  const prompt = `Eres un experto en contenido viral para latinos en EE.UU. sobre impuestos, LLC, ITIN y servicios financieros. Tu contenido es educativo, en español latino conversacional, como si le explicaras a un amigo. Nunca uses términos muy técnicos sin explicarlos primero.

Genera contenido sobre este tema: "${tema}"
Red social destino: ${redSocial}
Duración objetivo: ${duracion}

Genera UN SOLO JSON válido (sin markdown, sin texto antes o después):

{
  "mapaJson": {
    "centro": {
      "id": "centro",
      "emoji": "🎯",
      "texto": "TÍTULO CORTO (máx 4 palabras)",
      "color": "#1e3a5f",
      "guion": "1-2 oraciones introduciendo el tema de forma clara. ¿Qué es? ¿A quién ayuda?"
    },
    "ramas": [
      {
        "id": "r1", "emoji": "📌", "texto": "Categoría 1 (3-4 palabras)", "color": "#dc2626",
        "guion": "1-2 oraciones explicando esta categoría con un ejemplo concreto.",
        "hijos": [
          { "id": "r1h1", "texto": "punto clave (4-6 palabras)", "color": "#fca5a5", "guion": "1 oración específica sobre este punto." },
          { "id": "r1h2", "texto": "punto clave (4-6 palabras)", "color": "#fca5a5", "guion": "1 oración específica sobre este punto." }
        ]
      },
      {
        "id": "r2", "emoji": "💡", "texto": "Categoría 2 (3-4 palabras)", "color": "#2563eb",
        "guion": "1-2 oraciones explicando esta categoría.",
        "hijos": [
          { "id": "r2h1", "texto": "punto clave", "color": "#93c5fd", "guion": "1 oración." },
          { "id": "r2h2", "texto": "punto clave", "color": "#93c5fd", "guion": "1 oración." }
        ]
      },
      {
        "id": "r3", "emoji": "✅", "texto": "Categoría 3 (3-4 palabras)", "color": "#16a34a",
        "guion": "1-2 oraciones con pasos concretos o beneficios.",
        "hijos": [
          { "id": "r3h1", "texto": "punto clave", "color": "#86efac", "guion": "1 oración." },
          { "id": "r3h2", "texto": "punto clave", "color": "#86efac", "guion": "1 oración." }
        ]
      },
      {
        "id": "r4", "emoji": "⚡", "texto": "Categoría 4 (3-4 palabras)", "color": "#d97706",
        "guion": "1-2 oraciones sobre datos clave, fechas o montos importantes.",
        "hijos": [
          { "id": "r4h1", "texto": "punto clave", "color": "#fcd34d", "guion": "1 oración." },
          { "id": "r4h2", "texto": "punto clave", "color": "#fcd34d", "guion": "1 oración." }
        ]
      }
    ]
  },
  "cta": "Frase final call to action. ¿Tienes preguntas? Escríbeme y te ayudo 👇",
  "titulo": "Título optimizado para ${redSocial} (max 60 chars, con emoji al inicio)",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
}

IMPORTANTE: Cada campo "guion" debe sonar natural al hablar en voz alta, fluir de uno al siguiente, y cubrir exactamente lo que dice el nodo. El audio se construye concatenando todos los guiones en orden.`

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
    return NextResponse.json({ error: `Error al llamar a la IA: ${msg}` }, { status: 500 })
  }

  let parsed: { mapaJson: any; cta: string; titulo: string; hashtags: string[] }
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    parsed = match ? JSON.parse(match[0]) : null
    if (!parsed?.mapaJson) throw new Error('JSON inválido')
  } catch {
    return NextResponse.json({ error: 'Error al parsear respuesta de la IA', raw }, { status: 500 })
  }

  // Build full guion by concatenating all node guiones in order
  const guion = buildGuion(parsed.mapaJson, parsed.cta ?? '')

  const result = { mapaJson: parsed.mapaJson, guion, titulo: parsed.titulo, hashtags: parsed.hashtags }

  try {
    await prisma.contentCreatorHistory.create({
      data: {
        userId: session.user.id,
        tema: tema.slice(0, 200),
        redSocial,
        duracion,
        mapaJson: result.mapaJson as object,
        guion: result.guion,
        titulo: result.titulo,
        hashtags: result.hashtags,
      },
    })
  } catch { /* ignore */ }

  return NextResponse.json(result)
}

function buildGuion(mapaJson: any, cta: string): string {
  const parts: string[] = []
  if (mapaJson.centro?.guion) parts.push(mapaJson.centro.guion.trim())
  for (const rama of mapaJson.ramas ?? []) {
    if (rama.guion) parts.push(rama.guion.trim())
    for (const hijo of rama.hijos ?? []) {
      if (hijo.guion) parts.push(hijo.guion.trim())
    }
  }
  if (cta) parts.push(cta.trim())
  return parts.join(' ')
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const history = await prisma.contentCreatorHistory.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        tema: true,
        redSocial: true,
        duracion: true,
        mapaJson: true,
        guion: true,
        titulo: true,
        hashtags: true,
        createdAt: true,
      },
    })
    return NextResponse.json(history)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}

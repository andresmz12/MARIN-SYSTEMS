import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

const SYSTEM = `Eres experto en contenido educativo viral para latinos en EE.UU. sobre taxes, LLC, ITIN y servicios financieros. Hablas en español latino conversacional. Responde SOLO con JSON válido. Sin markdown. Sin texto extra.`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tema, redSocial, duracion } = await req.json() as {
    tema: string; redSocial: string; duracion: string
  }
  if (!tema) return NextResponse.json({ error: 'tema requerido' }, { status: 400 })

  const prompt = `Crea un mapa conceptual y guion para un video sobre: "${tema}"
Red social: ${redSocial}
Duración: ${duracion}

El guion se construye NODO POR NODO en este orden exacto:
centro → rama1 → hijo1a → hijo1b → rama2 → hijo2a → hijo2b → rama3 → hijo3a → hijo3b → rama4 → hijo4a → hijo4b → cta

Cada nodo tiene su propio texto corto para el mapa Y su propia frase para el audio. Deben decir lo mismo.

Responde con este JSON exacto:
{
  "centro": {
    "id": "centro",
    "emoji": "⚠️",
    "texto": "Texto corto para el mapa",
    "color": "#c0392b",
    "guion": "Frase completa que dice la voz sobre este nodo. 1-2 oraciones."
  },
  "ramas": [
    {
      "id": "r1",
      "emoji": "💸",
      "texto": "Texto corto para el mapa",
      "color": "#e67e22",
      "guion": "Frase completa que dice la voz sobre esta rama. 1-2 oraciones.",
      "hijos": [
        {
          "id": "h1a",
          "texto": "Texto corto para el mapa",
          "color": "#f39c12",
          "guion": "Frase corta sobre este punto. 1 oración."
        },
        {
          "id": "h1b",
          "texto": "Texto corto para el mapa",
          "color": "#f39c12",
          "guion": "Frase corta sobre este punto. 1 oración."
        }
      ]
    }
  ],
  "cta": "Frase final. Escríbeme y te ayudo 👇"
}

REGLAS CRÍTICAS:
- texto del nodo: máximo 3 palabras por línea, máximo 2 líneas
- guion del nodo: debe explicar exactamente lo que dice el texto. Si el texto dice "Multa $500" el guion dice "Si no declaras a tiempo, el IRS te puede multar con 500 dólares"
- El texto y el guion del mismo nodo deben ser COHERENTES entre sí
- 4 ramas siempre, 2 hijos por rama siempre
- Colores hex vibrantes, diferentes por rama`

  const client = new Anthropic()
  let raw: string
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })
    raw = message.content[0].type === 'text' ? message.content[0].text : ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error al llamar a la IA: ${msg}` }, { status: 500 })
  }

  let parsed: { centro: any; ramas: any[]; cta: string; titulo?: string; hashtags?: string[] }
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    parsed = match ? JSON.parse(match[0]) : null
    if (!parsed?.centro || !parsed?.ramas) throw new Error('JSON inválido')
  } catch {
    return NextResponse.json({ error: 'Error al parsear respuesta de la IA', raw }, { status: 500 })
  }

  const mapaJson = { centro: parsed.centro, ramas: parsed.ramas, cta: parsed.cta ?? '' }
  const guion = buildGuion(mapaJson, parsed.cta ?? '')
  const titulo = parsed.titulo ?? tema
  const hashtags = parsed.hashtags ?? []

  try {
    await prisma.contentCreatorHistory.create({
      data: {
        userId: session.user.id,
        tema: tema.slice(0, 200),
        redSocial,
        duracion,
        mapaJson: mapaJson as object,
        guion,
        titulo,
        hashtags,
      },
    })
  } catch { /* ignore */ }

  return NextResponse.json({ mapaJson, guion, titulo, hashtags })
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

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const ELEVENLABS_VOICE_ID = 'YPh7OporwNAJ28F5IQrm'

function buildPrompt(tema: string, redSocial: string, duracion: string): string {
  const secs = duracion.replace('s', '')
  return `Eres un experto creador de contenido en español para comunidades hispanas en EE.UU.

Crea contenido para un video de ${secs} segundos sobre: "${tema}"
Plataforma: ${redSocial}

Genera EXACTAMENTE este JSON (sin markdown, sin texto extra):
{
  "centro": { "id": "c", "emoji": "🎯", "texto": "TÍTULO CORTO (máx 3 palabras)", "color": "#1e3a5f" },
  "ramas": [
    {
      "id": "r1", "emoji": "📌", "texto": "Punto clave 1 (3 palabras)", "color": "#dc2626",
      "hijos": [
        { "id": "r1h1", "texto": "detalle (4 palabras)", "color": "#fca5a5" },
        { "id": "r1h2", "texto": "detalle (4 palabras)", "color": "#fca5a5" }
      ]
    },
    {
      "id": "r2", "emoji": "💡", "texto": "Punto clave 2 (3 palabras)", "color": "#2563eb",
      "hijos": [
        { "id": "r2h1", "texto": "detalle (4 palabras)", "color": "#93c5fd" },
        { "id": "r2h2", "texto": "detalle (4 palabras)", "color": "#93c5fd" }
      ]
    },
    {
      "id": "r3", "emoji": "✅", "texto": "Punto clave 3 (3 palabras)", "color": "#16a34a",
      "hijos": [
        { "id": "r3h1", "texto": "detalle (4 palabras)", "color": "#86efac" },
        { "id": "r3h2", "texto": "detalle (4 palabras)", "color": "#86efac" }
      ]
    },
    {
      "id": "r4", "emoji": "⚠️", "texto": "Punto clave 4 (3 palabras)", "color": "#d97706",
      "hijos": [
        { "id": "r4h1", "texto": "detalle (4 palabras)", "color": "#fcd34d" },
        { "id": "r4h2", "texto": "detalle (4 palabras)", "color": "#fcd34d" }
      ]
    }
  ],
  "guion": "Guion de ${secs} segundos en español latino conversacional para ${redSocial}. Empieza con gancho ('¿Sabías que...?' o '¡Atención!'). Cubre los 4 puntos del mapa. Termina con llamada a la acción. Sin muletillas.",
  "titulo": "Título llamativo para el video",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
}`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tema, redSocial, duracion } = await req.json() as {
    tema: string; redSocial: string; duracion: string
  }
  if (!tema?.trim()) {
    return NextResponse.json({ error: 'El tema es requerido' }, { status: 400 })
  }

  const client = new Anthropic()

  /* 1 — Claude: generate mapa + guion */
  let mapaJson: unknown, guion: string
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: buildPrompt(tema, redSocial, duracion) }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')
    const parsed = JSON.parse(match[0])
    mapaJson = { centro: parsed.centro, ramas: parsed.ramas }
    guion = parsed.guion as string
  } catch {
    return NextResponse.json({ error: 'Error generando el mapa, intenta de nuevo' }, { status: 500 })
  }

  /* 2 — ElevenLabs: generate audio */
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
    if (elRes.status === 401) {
      return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
    }
    if (elRes.status === 429) {
      return NextResponse.json({ error: 'Sin créditos disponibles' }, { status: 429 })
    }
    if (!elRes.ok) {
      throw new Error(`HTTP ${elRes.status}`)
    }
    const buf = await elRes.arrayBuffer()
    audioData = Buffer.from(buf).toString('base64')
  } catch (err) {
    if (err instanceof Error && (err.message.includes('401') || err.message.includes('invalid'))) {
      return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('429')) {
      return NextResponse.json({ error: 'Sin créditos disponibles' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Error de conexión con ElevenLabs' }, { status: 503 })
  }

  /* 3 — Persist StudioSession */
  const studioSession = await prisma.studioSession.create({
    data: {
      tema: tema.trim(),
      redSocial,
      duracion,
      mapaJson: mapaJson as object,
      guion,
      audioData,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  return NextResponse.json({ url: `${baseUrl}/studio/${studioSession.token}` })
}

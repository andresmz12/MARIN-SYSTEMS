import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 120

const VOICE_ID   = '9AHim1BsYT5o3WGDtPE0'
const CLAUDE_SYS = `Eres experto en contenido viral para latinos en EE.UU. sobre taxes, LLC, ITIN y servicios financieros. Hablas en español latino conversacional. Responde SOLO con JSON válido. Sin markdown. Sin texto extra.`

// ─── Claude: generate mapaJson ────────────────────────────────
async function generarMapa(tema: string, redSocial: string, duracion: string): Promise<any> {
  const client = new Anthropic()
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: CLAUDE_SYS,
    messages: [{
      role: 'user',
      content: `Crea un mapa conceptual para un video de ${duracion} sobre: "${tema}"
Red social: ${redSocial}

El guion se construye NODO POR NODO en este orden:
centro → rama1 → hijo1a → hijo1b → rama2 → hijo2a → hijo2b → rama3 → hijo3a → hijo3b → rama4 → hijo4a → hijo4b → cta

REGLAS:
- texto del nodo: máximo 3 palabras por línea, máximo 2 líneas
- guion del nodo: frase completa que explica exactamente lo que dice el texto
- Si texto dice "Multa $500" el guion dice "Si no declaras, el IRS te multa con 500 dólares"
- 4 ramas siempre, 2 hijos por rama siempre
- Colores hex vibrantes, distintos por rama

Responde con este JSON (sin nada más):
{
  "centro": { "id": "centro", "emoji": "🎯", "texto": "Texto corto", "color": "#hex", "guion": "1-2 oraciones." },
  "ramas": [
    {
      "id": "r1", "emoji": "📌", "texto": "Texto corto", "color": "#hex",
      "guion": "1-2 oraciones.",
      "hijos": [
        { "id": "h1a", "texto": "Texto corto", "color": "#hex", "guion": "1 oración." },
        { "id": "h1b", "texto": "Texto corto", "color": "#hex", "guion": "1 oración." }
      ]
    }
  ],
  "cta": "Frase final call to action. Escríbeme y te ayudo 👇"
}`,
    }],
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude no devolvió JSON válido')
  const parsed = JSON.parse(match[0])
  if (!parsed.centro || !parsed.ramas) throw new Error('JSON de Claude incompleto')
  return parsed
}

// ─── Build ordered guion ──────────────────────────────────────
function construirGuion(mapa: any): string {
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

// ─── Proportional timestamps (0–1) ───────────────────────────
function calcularTimestamps(mapa: any, guionCompleto: string) {
  const totalW = guionCompleto.split(/\s+/).filter(Boolean).length
  const orden: { id: string; guion: string }[] = []
  orden.push({ id: mapa.centro.id ?? 'centro', guion: mapa.centro.guion ?? '' })
  for (const rama of mapa.ramas ?? []) {
    orden.push({ id: rama.id, guion: rama.guion ?? '' })
    for (const hijo of rama.hijos ?? []) {
      orden.push({ id: hijo.id, guion: hijo.guion ?? '' })
    }
  }
  if (mapa.cta) orden.push({ id: 'cta', guion: mapa.cta })

  let acum = 0
  return orden.map(nodo => {
    const w    = nodo.guion.split(/\s+/).filter(Boolean).length
    const prop = w / Math.max(totalW, 1)
    const ts   = { id: nodo.id, inicio: acum, fin: acum + prop }
    acum += prop
    return ts
  })
}

// ─── ElevenLabs with retry ───────────────────────────────────
async function generarAudio(apiKey: string, text: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
        {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      )
      if (res.status === 401) throw new Error('API key inválida')
      if (res.status === 429) throw new Error('Sin créditos disponibles')
      if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer()).toString('base64')
    } catch (err) {
      console.error(`ElevenLabs intento ${attempt} falló:`, err)
      if (attempt === 3) throw err
      await new Promise(r => setTimeout(r, 2000 * attempt))
    }
  }
  throw new Error('No se pudo generar el audio')
}

// ─── Handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY no configurado' }, { status: 500 })

  const { tema, redSocial, duracion } = await req.json() as {
    tema: string; redSocial: string; duracion: string
  }
  if (!tema) return NextResponse.json({ error: 'tema requerido' }, { status: 400 })

  // Step 1: Claude
  let mapaJson: any
  try {
    mapaJson = await generarMapa(tema, redSocial ?? 'TikTok', duracion ?? '60s')
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error generando mapa' },
      { status: 500 },
    )
  }

  // Step 2: Build guion + timestamps
  const guionCompleto = construirGuion(mapaJson)
  const timestamps    = calcularTimestamps(mapaJson, guionCompleto)

  // Step 3: ElevenLabs
  let audioData: string
  try {
    audioData = await generarAudio(apiKey, guionCompleto)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error generando audio' },
      { status: 503 },
    )
  }

  // Step 4: Save
  const studioSession = await prisma.studioSession.create({
    data: {
      tema,
      redSocial: redSocial ?? 'TikTok',
      duracion:  duracion  ?? '60s',
      mapaJson,
      guion: guionCompleto,
      audioData,
      timestamps,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? ''
  return NextResponse.json({ url: `${baseUrl}/studio/${studioSession.token}` })
}

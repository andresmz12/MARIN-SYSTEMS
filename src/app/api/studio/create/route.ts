import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const maxDuration = 60

const VOICE_ID = '9AHim1BsYT5o3WGDtPE0'

function parseDurationSecs(dur: string): number {
  const m = dur.match(/(\d+)/)
  return m ? parseInt(m[1]) : 60
}

function generateTimestamps(
  mapaJson: { centro: { id: string }; ramas: Array<{ id: string; hijos: Array<{ id: string }> }> },
  duracion: string,
) {
  const total   = parseDurationSecs(duracion)
  const { centro, ramas } = mapaJson as any
  const centerSecs = Math.max(4, total * 0.07)
  const remaining  = total - centerSecs

  // weight: branch=1, child=0.7
  const totalWeight = ramas.reduce(
    (s: number, r: any) => s + 1 + (r.hijos?.length ?? 0) * 0.7, 0,
  )
  const sps = remaining / Math.max(totalWeight, 1)

  const result: Array<{ nodoId: string; inicio: number; fin: number }> = []
  let t = 0

  result.push({ nodoId: centro.id, inicio: 0, fin: Math.round(centerSecs * 10) / 10 })
  t = centerSecs

  for (const rama of ramas) {
    const rs = sps
    result.push({ nodoId: rama.id, inicio: Math.round(t * 10) / 10, fin: Math.round((t + rs) * 10) / 10 })
    t += rs
    for (const hijo of (rama.hijos ?? [])) {
      const hs = sps * 0.7
      result.push({ nodoId: hijo.id, inicio: Math.round(t * 10) / 10, fin: Math.round((t + hs) * 10) / 10 })
      t += hs
    }
  }
  // Clamp last entry to total duration
  if (result.length) result[result.length - 1].fin = total
  return result
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY no configurado' }, { status: 500 })

  const { mapaJson, guion, tema, redSocial, duracion } = await req.json() as {
    mapaJson: object
    guion: string
    tema: string
    redSocial: string
    duracion: string
  }
  if (!mapaJson || !guion || !tema) {
    return NextResponse.json({ error: 'mapaJson, guion y tema son requeridos' }, { status: 400 })
  }

  // Strip section markers before sending to ElevenLabs
  const cleanGuion = guion.replace(/\[(INTRO|R[1-9]|CTA)\]\s*/g, '').trim()

  let audioData: string
  try {
    const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanGuion,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true },
      }),
    })
    if (elRes.status === 401) return NextResponse.json({ error: 'API key inválida' }, { status: 401 })
    if (elRes.status === 429) return NextResponse.json({ error: 'Sin créditos disponibles' }, { status: 429 })
    if (!elRes.ok) throw new Error(`ElevenLabs HTTP ${elRes.status}`)
    audioData = Buffer.from(await elRes.arrayBuffer()).toString('base64')
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error generando audio' },
      { status: 503 }
    )
  }

  const timestamps = generateTimestamps(mapaJson as any, duracion ?? '60s')

  const studioSession = await prisma.studioSession.create({
    data: {
      tema,
      redSocial: redSocial ?? 'TikTok',
      duracion: duracion ?? '60s',
      mapaJson,
      guion: cleanGuion,
      audioData,
      timestamps,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? ''
  return NextResponse.json({ url: `${baseUrl}/studio/${studioSession.token}` })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const ANGIE_VOICE_ID = 'YPh7OporwNAJ28F5IQrm'

const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.80,
  style: 0.25,
  use_speaker_boost: true,
}

function parseElevenLabsError(status: number): string {
  if (status === 401) return 'API key inválida'
  if (status === 429) return 'Sin créditos disponibles'
  return 'Error generando audio, intenta de nuevo'
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY no configurado en el servidor' }, { status: 500 })

  const { text } = await req.json() as { text: string }
  if (!text) return NextResponse.json({ error: 'text requerido' }, { status: 400 })

  let resp: Response
  try {
    resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ANGIE_VOICE_ID}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: VOICE_SETTINGS,
      }),
    })
  } catch {
    return NextResponse.json({ error: 'Error de conexión con ElevenLabs. Verifica la red del servidor.' }, { status: 503 })
  }

  if (!resp.ok) {
    const userMsg = parseElevenLabsError(resp.status)
    return NextResponse.json({ error: userMsg }, { status: resp.status })
  }

  const audioBuffer = await resp.arrayBuffer()
  return new NextResponse(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'attachment; filename="audio-angie.mp3"',
    },
  })
}

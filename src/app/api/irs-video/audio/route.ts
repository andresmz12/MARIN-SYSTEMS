import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, voiceId, apiKey } = await req.json() as {
    text: string
    voiceId: string
    apiKey: string
  }

  if (!text || !voiceId || !apiKey) {
    return NextResponse.json({ error: 'text, voiceId y apiKey son requeridos' }, { status: 400 })
  }

  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.85,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    return NextResponse.json(
      { error: `ElevenLabs error ${resp.status}: ${errText}` },
      { status: resp.status }
    )
  }

  const audioBuffer = await resp.arrayBuffer()
  return new NextResponse(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'attachment; filename="guion-irs.mp3"',
    },
  })
}

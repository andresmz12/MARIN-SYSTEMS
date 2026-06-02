import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

interface Alignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, voiceId, apiKey, withTimestamps } = await req.json() as {
    text: string
    voiceId: string
    apiKey: string
    withTimestamps?: boolean
  }

  if (!text || !voiceId || !apiKey) {
    return NextResponse.json({ error: 'text, voiceId y apiKey son requeridos' }, { status: 400 })
  }

  const voiceSettings = {
    stability: 0.4,
    similarity_boost: 0.85,
    style: 0.3,
    use_speaker_boost: true,
  }

  if (withTimestamps) {
    // Use the /with-timestamps endpoint — returns JSON with audio_base64 + alignment
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: voiceSettings,
        }),
      }
    )

    if (!resp.ok) {
      const errText = await resp.text()
      return NextResponse.json(
        { error: `ElevenLabs error ${resp.status}: ${errText}` },
        { status: resp.status }
      )
    }

    const data = await resp.json() as {
      audio_base64: string
      alignment: Alignment
      normalized_alignment: Alignment
    }

    return NextResponse.json({
      audioBase64: data.audio_base64,
      alignment: data.alignment,
    })
  }

  // Standard: return raw MP3 binary
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: voiceSettings,
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

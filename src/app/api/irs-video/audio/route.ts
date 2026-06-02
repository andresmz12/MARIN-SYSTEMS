import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const ANGIE_VOICE_ID = 'YPh7OporwNAJ28F5IQrm'

interface Alignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.80,
  style: 0.25,
  use_speaker_boost: true,
}

function parseElevenLabsError(status: number, body: string): string {
  if (status === 401) {
    try {
      const j = JSON.parse(body) as { detail?: { status?: string; message?: string } | string }
      const detail = j.detail
      if (typeof detail === 'object' && detail?.status === 'detected_unusual_activity')
        return 'Tu cuenta de ElevenLabs detectó actividad inusual y fue bloqueada. Necesitas una cuenta de pago en elevenlabs.io para generar audio.'
    } catch { /* ignore */ }
    return 'Tu cuenta de ElevenLabs no tiene acceso. Por favor actualiza a una cuenta de pago en elevenlabs.io'
  }
  if (status === 429) return 'Límite de ElevenLabs alcanzado. Intenta en unos minutos.'
  return `Error de ElevenLabs (${status}). Verifica tu API key en Railway.`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY no configurado en el servidor' }, { status: 500 })

  const { text, withTimestamps } = await req.json() as {
    text: string
    withTimestamps?: boolean
  }

  if (!text) return NextResponse.json({ error: 'text requerido' }, { status: 400 })

  if (withTimestamps) {
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ANGIE_VOICE_ID}/with-timestamps`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: VOICE_SETTINGS,
        }),
      }
    )

    if (!resp.ok) {
      const errText = await resp.text()
      const userMsg = parseElevenLabsError(resp.status, errText)
      return NextResponse.json({ error: userMsg }, { status: resp.status })
    }

    const data = await resp.json() as {
      audio_base64: string
      alignment: Alignment
      normalized_alignment: Alignment
    }

    return NextResponse.json({ audioBase64: data.audio_base64, alignment: data.alignment })
  }

  // Standard: return raw MP3 binary
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ANGIE_VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: VOICE_SETTINGS,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    const userMsg = parseElevenLabsError(resp.status, errText)
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

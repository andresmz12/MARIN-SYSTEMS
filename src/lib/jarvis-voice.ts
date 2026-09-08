// Voz de Jarvis vía ElevenLabs — grave, calmada, tono "mayordomo" (estilo Daniel:
// británico, autoritativo, funciona bien en español con el modelo multilingüe).
// Si esta voz deja de existir en tu cuenta de ElevenLabs, cámbiala aquí por otra
// de tu Voice Library (elevenlabs.io/app/voice-library) — es la única constante
// que hay que tocar.
const JARVIS_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'

const MAX_CHARS = 600 // mantiene las respuestas cortas -> menor costo y latencia

async function readElevenLabsError(res: Response): Promise<string> {
  try {
    const errJson = (await res.json()) as { detail?: { message?: string; status?: string } | string }
    return typeof errJson.detail === 'string'
      ? errJson.detail
      : errJson.detail?.message ?? errJson.detail?.status ?? JSON.stringify(errJson)
  } catch {
    return res.text().catch(() => '')
  }
}

/**
 * Streams synthesized speech instead of buffering the whole clip — the /stream
 * endpoint has ElevenLabs itself send audio as it's generated, and piping that
 * straight through to the browser lets <audio> start playing on the first
 * chunk instead of waiting for the full clip to generate + download twice
 * (server<-ElevenLabs, then client<-server). This is the single biggest lever
 * on perceived latency, more than anything on the Claude side.
 */
export async function streamJarvisVoice(text: string): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY no configurado')

  const trimmed = text.trim().slice(0, MAX_CHARS)
  if (!trimmed) throw new Error('Texto vacío')

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${JARVIS_VOICE_ID}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: trimmed,
      model_id: 'eleven_multilingual_v2',
      // Lower stability = more natural pitch/pace variation instead of a flat
      // "reading a script" cadence; optimize_streaming_latency is gone entirely —
      // that setting explicitly trades prosody quality for a small speed win,
      // which is exactly what made it sound choppy/robotic.
      voice_settings: { stability: 0.32, similarity_boost: 0.75, style: 0.55, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const detail = await readElevenLabsError(res)
    if (res.status === 401) throw new Error(`API key de ElevenLabs inválida — ${detail}`)
    if (res.status === 429) throw new Error(`Sin créditos disponibles en ElevenLabs — ${detail}`)
    throw new Error(`ElevenLabs error ${res.status} — ${detail}`)
  }
  if (!res.body) throw new Error('ElevenLabs no devolvió cuerpo de audio')

  return res.body
}

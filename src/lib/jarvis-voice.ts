// Voz de Jarvis vía ElevenLabs — grave, calmada, tono "mayordomo" (estilo Daniel:
// británico, autoritativo, funciona bien en español con el modelo multilingüe).
// Si esta voz deja de existir en tu cuenta de ElevenLabs, cámbiala aquí por otra
// de tu Voice Library (elevenlabs.io/app/voice-library) — es la única constante
// que hay que tocar.
const JARVIS_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'

const MAX_CHARS = 600 // mantiene las respuestas cortas -> menor costo y latencia

export async function synthesizeJarvisVoice(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY no configurado')

  const trimmed = text.trim().slice(0, MAX_CHARS)
  if (!trimmed) throw new Error('Texto vacío')

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${JARVIS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: trimmed,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (res.status === 401) throw new Error('API key de ElevenLabs inválida')
  if (res.status === 429) throw new Error('Sin créditos disponibles en ElevenLabs')
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}`)

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

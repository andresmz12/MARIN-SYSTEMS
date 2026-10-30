// Generación de imágenes con la API de OpenAI (solo posts de una imagen; los carruseles se hacen en Gemini).
// Con imágenes de referencia (logo, cara de la vocera) usa /images/edits; sin ellas, /images/generations.

const api = () => `${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/images`

export const openaiImageReady = () => !!process.env.OPENAI_API_KEY
const model = () => process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
const quality = () => process.env.OPENAI_IMAGE_QUALITY || 'high'

export class OpenAiImageError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function friendly(status: number, code: string, msg: string): string {
  if (status === 401) return 'La clave de OpenAI (OPENAI_API_KEY) no es válida. Revísala en Railway.'
  if (status === 402 || /billing|quota|insufficient|hard limit/i.test(`${code} ${msg}`)) return 'OpenAI no tiene saldo. Recarga crédito en platform.openai.com → Billing.'
  if (status === 429) return 'OpenAI está limitando las peticiones. Espera un minuto e intenta de nuevo.'
  if (status === 403 && /verif/i.test(msg)) return 'OpenAI pide verificar la organización para usar este modelo de imágenes (platform.openai.com → Settings → Organization → Verify).'
  if (/safety|moderation|content_policy/i.test(`${code} ${msg}`)) return 'OpenAI rechazó el prompt por sus filtros de seguridad. Cambia un poco el texto o la escena.'
  return `OpenAI no pudo generar la imagen (${status}): ${msg.slice(0, 200)}`
}

export interface RefImage { data: Buffer; mime: string; name: string }

/** Devuelve la imagen generada (PNG, 1024x1536 vertical). */
export async function generateImage(prompt: string, refs: RefImage[] = []): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new OpenAiImageError('Falta la clave OPENAI_API_KEY en Railway.', 400)

  let res: Response
  try {
    if (refs.length > 0) {
      const form = new FormData()
      form.append('model', model())
      form.append('prompt', prompt)
      form.append('size', '1024x1536')
      form.append('quality', quality())
      form.append('n', '1')
      for (const r of refs) form.append('image[]', new Blob([new Uint8Array(r.data)], { type: r.mime }), r.name)
      res = await fetch(`${api()}/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(170_000) })
    } else {
      res = await fetch(`${api()}/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model(), prompt, size: '1024x1536', quality: quality(), n: 1 }),
        signal: AbortSignal.timeout(170_000),
      })
    }
  } catch (err) {
    const timeout = err instanceof Error && /timeout|aborted/i.test(err.message)
    throw new OpenAiImageError(timeout ? 'OpenAI tardó demasiado en responder. Intenta de nuevo.' : 'No se pudo conectar con OpenAI.', 504)
  }

  const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string; url?: string }[]; error?: { code?: string; message?: string } }
  if (!res.ok) throw new OpenAiImageError(friendly(res.status, body.error?.code ?? '', body.error?.message ?? ''), res.status === 400 ? 422 : res.status)
  const item = body.data?.[0]
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item?.url) {
    const img = await fetch(item.url)
    if (img.ok) return Buffer.from(await img.arrayBuffer())
  }
  throw new OpenAiImageError('OpenAI no devolvió ninguna imagen.', 502)
}

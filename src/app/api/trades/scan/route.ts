import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const MAX_BYTES = 5 * 1024 * 1024

const SYSTEM_PROMPT = `Eres un asistente especializado en análisis técnico de trading. Analiza este pantallazo de TradingView y extrae la información disponible. Responde SOLO con JSON válido, sin markdown ni texto extra.

- "pair": símbolo del instrumento visible en el chart. Mapéalo al más cercano de: EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, NZD/USD, USD/CAD, GBP/JPY, EUR/JPY, XAU/USD. Si no coincide con ninguno, usa el símbolo tal cual.
- "date": fecha visible en el eje X o en el título (formato YYYY-MM-DD). Omitir si no es clara.
- "setup": describe brevemente el patrón o setup que se ve dibujado (ej. "Rebote soporte/resistencia", "London Breakout", "Estructura H4", "Fibonacci", "Price Action"). Omitir si no hay anotaciones claras.
- "result": "win" / "loss" / "be" solo si el trade ya está cerrado y hay ganancia/pérdida visible. Omitir si el chart es un análisis pre-trade.
- "pips": número de pips solo si es explícitamente visible en el chart. Omitir si no.
- "notes": resumen breve (1-2 frases) de lo que muestra el análisis: niveles clave, dirección propuesta, contexto de mercado visible.

JSON exacto (omitir campos que no puedas determinar con certeza):
{"pair":"EUR/USD","date":"2025-06-05","setup":"Rebote soporte/resistencia","result":"win","pips":25.5,"notes":"..."}`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Servicio de visión no configurado' }, { status: 503 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Formato de solicitud inválido' }, { status: 400 })
  }

  const file = formData.get('image')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Se requiere una imagen' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'La imagen no puede superar 5 MB' }, { status: 400 })
  }

  const mediaType = (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp')
    ? file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    : 'image/jpeg'

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: SYSTEM_PROMPT,
              },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[trades/scan] Anthropic error:', err)
      return NextResponse.json({ error: 'Error al analizar la imagen' }, { status: 502 })
    }

    const data = await res.json() as { content?: { type: string; text?: string }[] }
    const text = data.content?.find((c) => c.type === 'text')?.text ?? ''

    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: 'No se pudo extraer información del chart' }, { status: 422 })
    }

    const extracted = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>

    const result: Record<string, unknown> = {}
    if (typeof extracted.pair === 'string' && extracted.pair) result.pair = extracted.pair
    if (typeof extracted.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(extracted.date)) result.date = extracted.date
    if (typeof extracted.setup === 'string' && extracted.setup) result.setup = extracted.setup
    if (extracted.result === 'win' || extracted.result === 'loss' || extracted.result === 'be') result.result = extracted.result
    if (typeof extracted.pips === 'number') result.pips = extracted.pips
    if (typeof extracted.notes === 'string' && extracted.notes) result.notes = extracted.notes

    return NextResponse.json(result)
  } catch (err) {
    console.error('[trades/scan] Unexpected error:', err)
    return NextResponse.json({ error: 'Error interno al analizar la imagen' }, { status: 500 })
  }
}

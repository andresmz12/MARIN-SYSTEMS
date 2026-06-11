import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'GBP/JPY', 'EUR/JPY', 'XAU/USD']

const SYSTEM = `Eres un extractor de datos de pantallazos de TradingView. Tu única tarea es leer lo que ESTÁ ESCRITO O VISIBLE en la imagen y devolverlo como JSON. NO interpretes, NO inferras, NO inventes nada que no esté explícitamente visible. Responde SOLO con JSON válido, sin markdown ni texto extra.`

const PROMPT = `Extrae SOLO los datos que puedas leer directamente en este pantallazo de TradingView.

Reglas estrictas:
- Solo incluye un campo si puedes leerlo con certeza en la imagen
- Si no ves claramente un valor, NO lo incluyas (omite el campo)
- NO inventes, NO interpretes, NO asumas

Campos a extraer:
- "pair": símbolo del par visible en la pantalla (ej: "XAUUSD" → "XAU/USD"). Solo de: ${PAIRS.join(', ')}
- "result": SOLO si ves un P&L o resultado explícito — "win" si positivo, "loss" si negativo, "be" si ~0
- "pips": SOLO si ves un número de pips o puntos ganados/perdidos explícito (número, positivo o negativo)
- "date": SOLO si ves una fecha explícita en formato YYYY-MM-DD
- "notes": SOLO lo que ves escrito en el chart (máximo 80 caracteres, sin inventar análisis)

Devuelve {} si no puedes leer nada con certeza.`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let file: File | null = null
  try {
    const fd = await req.formData()
    file = fd.get('image') as File | null
  } catch {
    return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
  }

  if (!file || !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Se requiere una imagen' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'La imagen debe ser menor a 5 MB' }, { status: 400 })
  }

  const mediaType = (file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif')
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  let raw: string
  try {
    const client = new Anthropic()
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    })
    raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error al analizar la imagen: ${msg}` }, { status: 500 })
  }

  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    if (!parsed) throw new Error('No JSON')
    // Validate pair against known list
    if (parsed.pair && !PAIRS.includes(parsed.pair)) delete parsed.pair
    // Validate result
    if (parsed.result && !['win', 'loss', 'be'].includes(parsed.result)) delete parsed.result
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'No se pudieron extraer datos de la imagen' }, { status: 500 })
  }
}

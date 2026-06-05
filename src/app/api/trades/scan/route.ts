import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'GBP/JPY', 'EUR/JPY', 'XAU/USD']

const SYSTEM = `Eres un asistente experto en trading forex. Analiza pantallazos de TradingView (charts, análisis, historial de trades) y extrae información estructurada. Responde SOLO con JSON válido, sin markdown ni texto extra.`

const PROMPT = `Analiza este pantallazo de TradingView y extrae los datos del trade o análisis visible.

Pares válidos: ${PAIRS.join(', ')}
- "pair": el par más cercano a lo que se ve (obligatorio si es visible)
- "result": "win" si P&L es positivo, "loss" si es negativo, "be" si es ~0 o no aplica
- "pips": número de pips ganados (positivo) o perdidos (negativo), sin unidades
- "date": fecha del trade visible en formato YYYY-MM-DD (omitir si no se ve claramente)
- "notes": descripción breve del análisis, setup o patrón visible en el chart (máximo 200 caracteres)

Devuelve solo los campos que puedas determinar con certeza. Si no hay trade cerrado visible, igualmente extrae el par y las notas del análisis.

JSON:
{
  "pair": "EUR/USD",
  "result": "win",
  "pips": 32.5,
  "date": "2025-06-05",
  "notes": "Ruptura de resistencia en H1 con cierre por encima, entrada en retesteo"
}`

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

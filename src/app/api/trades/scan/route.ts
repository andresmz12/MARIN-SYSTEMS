import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'GBP/JPY', 'EUR/JPY', 'XAU/USD']

const SYSTEM = `Eres un experto en extraer datos de operaciones de trading desde pantallazos de TradingView. Conoces perfectamente la interfaz de TradingView y cómo leer trades cerrados, anotaciones, P&L y métricas. Responde SOLO con JSON válido, sin markdown ni texto extra.`

const PROMPT = `Analiza este pantallazo de TradingView y extrae los datos del trade cerrado o la operación visible.

INSTRUMENTOS VÁLIDOS: ${PAIRS.join(', ')}

CÓMO EXTRAER CADA CAMPO:

"pair" — Lee el símbolo del instrumento en la pantalla (título del chart, widget de precio, o anotaciones).
  Convierte: XAUUSD → XAU/USD, EURUSD → EUR/USD, etc.

"result" — Determina si fue ganadora o perdedora:
  - Busca P&L visible (positivo = "win", negativo = "loss", ~0 = "be")
  - Busca colores en las anotaciones de trade: verde = win, rojo = loss
  - Busca texto como "Cerrado", "Closed", ganancia/pérdida

"pips" — Extrae el movimiento del precio. IMPORTANTE: cada instrumento se mide diferente:
  • XAU/USD (Oro): Los "pips" son puntos de precio. Si ves "PnL: 46.93" con 1 lot estándar (100oz),
    pips = PnL / 10. Si ves el movimiento de precio directamente (ej: de 2350 a 2396), pips = diferencia.
    Si ves el P&L en dólares con lot size visible, calcula el movimiento en precio.
  • EUR/USD, GBP/USD, etc.: 1 pip = 0.0001. Si precio movió de 1.0850 a 1.0920 = 70 pips.
  • USD/JPY: 1 pip = 0.01
  • Si hay un número de pips/puntos explícito en la imagen, úsalo directamente.
  • Pips positivos = ganancia, negativos = pérdida.

"date" — Fecha del trade en formato YYYY-MM-DD. Busca en la línea de tiempo, anotaciones o en el widget.

"notes" — Extrae datos clave y visibles del trade en formato conciso (máx 120 chars):
  Si ves P&L, lot size, R:R ratio, precio de entrada/salida — inclúyelos.
  Ejemplo: "PnL: +$46.93 | Lot: 1 | R:R: 4.53 | Entry: 2350 Exit: 2396"
  NO inventes lo que no está visible.

IMPORTANTE: Omite cualquier campo que NO puedas determinar con certeza. Devuelve {} si no hay trade visible.

JSON:`

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

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { callClaude } from '@/lib/ai'

const MODEL = 'claude-haiku-4-5-20251001'

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'GBP/JPY', 'EUR/JPY', 'XAU/USD']

const SYSTEM = `Eres un trader profesional y analista técnico experto. Puedes leer pantallazos de TradingView con precisión: identificas trades cerrados, lees precios de entrada/salida, calculas pips correctamente según el instrumento, y analizas el contexto técnico del gráfico (tendencia, estructura, niveles, patrones). Responde SOLO con JSON válido, sin markdown ni texto extra.`

const PROMPT = `Analiza este pantallazo de TradingView. Extrae los datos del trade Y analiza el gráfico.

INSTRUMENTOS VÁLIDOS: ${PAIRS.join(', ')}

═══ CAMPO: "pair" ═══
Lee el símbolo en el título del chart o widget de precio. Convierte: XAUUSD→XAU/USD, EURUSD→EUR/USD, etc.

═══ CAMPO: "result" ═══
Busca el resultado del trade:
- Anotación verde / PnL positivo → "win"
- Anotación roja / PnL negativo → "loss"
- PnL ~0 → "be"

═══ CAMPO: "pips" ═══
Calcula el movimiento real del precio según el instrumento:

▸ XAU/USD (Oro):
  1 pip = $0.01 de movimiento en precio por onza
  Fórmula: pips = |precio_salida - precio_entrada| × 100
  Ejemplo: entrada 2350.00, salida 2354.69 → |4.69| × 100 = 469 pips
  Si solo ves el P&L en dólares: pips ≈ movimiento_precio × 100
  Si ves "4.690" como movimiento → 4.690 × 100 = 469 pips

▸ EUR/USD, GBP/USD, AUD/USD, NZD/USD, USD/CAD, USD/CHF:
  1 pip = 0.0001. Ejemplo: 1.0920 - 1.0850 = 0.0070 = 70 pips

▸ GBP/JPY, EUR/JPY, USD/JPY:
  1 pip = 0.01. Ejemplo: 155.50 - 154.80 = 0.70 = 70 pips

Resultado positivo si win, negativo si loss.

═══ CAMPO: "date" ═══
Fecha del trade visible en el chart (formato YYYY-MM-DD). Si no está clara, omite.

═══ CAMPO: "notes" ═══
Combina DOS cosas (máx 150 chars):
1. Datos del trade si visibles: PnL, lote, R:R, precio entrada/salida
2. Análisis del gráfico: ¿qué tendencia hay? ¿qué patrón o setup se ve? ¿qué niveles? ¿qué timeframe?
Ejemplo: "XAU H1 bajista | Ruptura soporte + retest | Entrada short en resistencia | R:R 4.5"

Omite campos que no puedas determinar. JSON:`

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
    raw = await callClaude({
      model: MODEL,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
      maxTokens: 512,
    })
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

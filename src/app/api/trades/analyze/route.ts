import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stats = await req.json()

  if (!stats || stats.total < 5) {
    return NextResponse.json(
      { error: 'Necesitas al menos 5 trades para generar un análisis.' },
      { status: 400 }
    )
  }

  const prompt = buildPrompt(stats)

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    return NextResponse.json({ analysis: text })
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error al generar análisis: ${err}` }, { status: 500 })
  }
}

function buildPrompt(s: Record<string, unknown>): string {
  const total = s.total as number
  const wins = s.wins as number
  const losses = s.losses as number
  const be = s.be as number
  const winRate = s.winRate as number
  const last10WinRate = s.last10WinRate as number
  const totalPips = s.totalPips as number
  const profitFactor = s.profitFactor as number
  const pctPlan = s.pctPlan as number
  const streak = s.streak as number
  const streakType = s.streakType as string

  const byEmotion = (s.byEmotion as { emotion: string; total: number; winRate: number; wins: number; losses: number }[]) ?? []
  const bySetup = (s.bySetup as { setup: string; total: number; winRate: number; wins: number; losses: number }[]) ?? []
  const byPair = (s.byPair as { pair: string; total: number; winRate: number; totalPips: number }[]) ?? []
  const performance = (s.performance as { month: string; pips: number }[]) ?? []
  const equityCurve = (s.equityCurve as { date: string; cumPips: number }[]) ?? []

  // Trend from equity curve
  const curveLen = equityCurve.length
  const recentTrend = curveLen >= 10
    ? equityCurve[curveLen - 1].cumPips - equityCurve[curveLen - 10].cumPips
    : null

  // Best/worst emotion
  const sortedEmotions = [...byEmotion].sort((a, b) => b.winRate - a.winRate)
  const bestEmotion = sortedEmotions[0]
  const worstEmotion = sortedEmotions[sortedEmotions.length - 1]

  // Best/worst setup
  const sortedSetups = [...bySetup].filter(s => s.total >= 3).sort((a, b) => b.winRate - a.winRate)
  const bestSetup = sortedSetups[0]
  const worstSetup = sortedSetups[sortedSetups.length - 1]

  // Best/worst pair
  const sortedPairs = [...byPair].filter(p => p.total >= 3).sort((a, b) => b.winRate - a.winRate)
  const bestPair = sortedPairs[0]
  const worstPair = sortedPairs[sortedPairs.length - 1]

  return `Eres un coach de trading profesional con experiencia en psicología del trading y análisis de rendimiento.
Analiza los siguientes datos reales de un trader y genera un informe profesional completo en español.

═══════════════════════════════════════
DATOS DEL TRADER
═══════════════════════════════════════

RENDIMIENTO GENERAL:
- Total de trades: ${total} (${wins} wins · ${losses} losses · ${be} BE)
- Win Rate global: ${winRate}%
- Win Rate últimos 10 trades: ${last10WinRate}%
- Total pips: ${totalPips > 0 ? '+' : ''}${totalPips}
- Profit Factor: ${profitFactor}
- Siguió su plan de trading: ${pctPlan}% de las veces
- Racha actual: ${streak} ${streakType === 'win' ? 'victorias' : streakType === 'loss' ? 'pérdidas' : 'BE'} consecutivas
${recentTrend !== null ? `- Tendencia reciente (últimos 10 trades en pips): ${recentTrend > 0 ? '+' : ''}${Math.round(recentTrend * 10) / 10}` : ''}

RENDIMIENTO POR EMOCIÓN AL ENTRAR:
${byEmotion.length > 0
  ? byEmotion.map(e => `  • ${e.emotion}: ${e.winRate}% win rate (${e.total} trades, ${e.wins}W/${e.losses}L)`).join('\n')
  : '  (sin datos de emoción registrados)'}
${bestEmotion ? `  → Mejor emoción: ${bestEmotion.emotion} (${bestEmotion.winRate}% WR)` : ''}
${worstEmotion && worstEmotion !== bestEmotion ? `  → Peor emoción: ${worstEmotion.emotion} (${worstEmotion.winRate}% WR)` : ''}

RENDIMIENTO POR SETUP (mín. 3 trades):
${sortedSetups.length > 0
  ? sortedSetups.map(s => `  • ${s.setup}: ${s.winRate}% win rate (${s.total} trades)`).join('\n')
  : '  (sin datos de setup suficientes)'}

RENDIMIENTO POR PAR (mín. 3 trades):
${sortedPairs.length > 0
  ? sortedPairs.map(p => `  • ${p.pair}: ${p.winRate}% WR, ${p.totalPips > 0 ? '+' : ''}${p.totalPips} pips (${p.total} trades)`).join('\n')
  : '  (sin datos de par suficientes)'}

RENDIMIENTO MENSUAL (pips):
${performance.length > 0
  ? performance.map(p => `  • ${p.month}: ${p.pips > 0 ? '+' : ''}${p.pips} pips`).join('\n')
  : '  (sin datos mensuales)'}

═══════════════════════════════════════
INSTRUCCIONES
═══════════════════════════════════════

Genera un informe estructurado con las siguientes secciones. Sé específico, usa los números reales, y da recomendaciones accionables. No des consejos genéricos — cada punto debe estar respaldado por los datos del trader.

Formato de respuesta (usa este markdown exacto):

## 📊 Resumen Ejecutivo
[2-3 oraciones con el estado general del trader. Sé directo y honesto.]

## ✅ Fortalezas
[Lista de 3-5 puntos fuertes basados en los datos. Con números específicos.]

## ⚠️ Áreas Críticas a Mejorar
[Lista de 3-5 problemas concretos identificados en los datos.]

## 🧠 Perfil Psicológico
[Análisis de las emociones al entrar, adherencia al plan, y qué dicen sobre la psicología del trader.]

## 🎯 Setups y Pares
[Qué setups y pares están funcionando vs. cuáles están dañando el rendimiento.]

## 📈 Tendencia y Consistencia
[Análisis de la curva de equity, rendimiento mensual y consistencia.]

## 🚀 Plan de Acción (próximas 4 semanas)
[3-5 acciones concretas y medibles que el trader debe implementar, basadas en sus datos específicos.]`
}

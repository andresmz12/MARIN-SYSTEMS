import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseDateOnly } from '@/lib/ceo'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
  const trades = await prisma.trade.findMany({
    where: { userId: session.user.id },
    orderBy: { date: 'asc' },
  })

  const total = trades.length
  const wins = trades.filter((t) => t.result === 'win').length
  const losses = trades.filter((t) => t.result === 'loss').length
  const be = trades.filter((t) => t.result === 'be').length
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0

  const followed = trades.filter((t) => t.followedPlan).length
  const pctPlan = total > 0 ? Math.round((followed / total) * 100) : 0

  const totalPips = trades.reduce((sum, t) => sum + (t.pips || 0), 0)
  const winPips = trades.filter((t) => t.result === 'win').reduce((sum, t) => sum + (t.pips || 0), 0)
  const lossPips = Math.abs(trades.filter((t) => t.result === 'loss').reduce((sum, t) => sum + (t.pips || 0), 0))
  const profitFactor = lossPips > 0 ? Math.round((winPips / lossPips) * 100) / 100 : winPips > 0 ? 999 : 0

  // Current streak
  let streak = 0
  let streakType: 'win' | 'loss' | 'none' = 'none'
  for (let i = trades.length - 1; i >= 0; i--) {
    const t = trades[i]
    if (t.result === 'be') continue
    if (streakType === 'none') {
      streakType = t.result as 'win' | 'loss'
      streak = 1
    } else if (t.result === streakType) {
      streak++
    } else {
      break
    }
  }

  // Trades by emotion
  const emotionMap: Record<string, { wins: number; losses: number; total: number }> = {}
  for (const trade of trades) {
    if (!trade.emotion) continue
    if (!emotionMap[trade.emotion]) emotionMap[trade.emotion] = { wins: 0, losses: 0, total: 0 }
    emotionMap[trade.emotion].total++
    if (trade.result === 'win') emotionMap[trade.emotion].wins++
    if (trade.result === 'loss') emotionMap[trade.emotion].losses++
  }
  const byEmotion = Object.entries(emotionMap).map(([emotion, data]) => ({
    emotion,
    ...data,
    winRate: Math.round((data.wins / data.total) * 100),
  }))

  // Performance over time (by month)
  const byMonth: Record<string, number> = {}
  for (const trade of trades) {
    const month = trade.date.toISOString().slice(0, 7)
    if (!byMonth[month]) byMonth[month] = 0
    byMonth[month] += trade.pips || 0
  }
  const performance = Object.entries(byMonth).map(([month, pips]) => ({ month, pips: Math.round(pips * 10) / 10 }))

  // By setup
  const setupMap: Record<string, { wins: number; losses: number; total: number }> = {}
  for (const trade of trades) {
    if (!trade.setup || trade.setup.trim() === '') continue
    if (!setupMap[trade.setup]) setupMap[trade.setup] = { wins: 0, losses: 0, total: 0 }
    setupMap[trade.setup].total++
    if (trade.result === 'win') setupMap[trade.setup].wins++
    if (trade.result === 'loss') setupMap[trade.setup].losses++
  }
  const bySetup = Object.entries(setupMap).map(([setup, data]) => ({
    setup,
    ...data,
    winRate: Math.round((data.wins / data.total) * 100),
  }))

  // By pair
  const pairMap: Record<string, { wins: number; losses: number; total: number; totalPips: number }> = {}
  for (const trade of trades) {
    if (!trade.pair) continue
    if (!pairMap[trade.pair]) pairMap[trade.pair] = { wins: 0, losses: 0, total: 0, totalPips: 0 }
    pairMap[trade.pair].total++
    pairMap[trade.pair].totalPips += trade.pips || 0
    if (trade.result === 'win') pairMap[trade.pair].wins++
    if (trade.result === 'loss') pairMap[trade.pair].losses++
  }
  const byPair = Object.entries(pairMap).map(([pair, data]) => ({
    pair,
    wins: data.wins,
    losses: data.losses,
    total: data.total,
    winRate: Math.round((data.wins / data.total) * 100),
    totalPips: Math.round(data.totalPips * 10) / 10,
  }))

  // Equity curve (cumulative pips per trade, chronological)
  let cumPips = 0
  const equityCurve = trades.map((trade) => {
    cumPips += trade.pips || 0
    return {
      date: trade.date.toISOString().split('T')[0],
      cumPips: Math.round(cumPips * 10) / 10,
    }
  })

  // Win rate últimos 10 trades
  const last10 = trades.slice(-10).filter((t) => t.result !== 'be')
  const last10Wins = last10.filter((t) => t.result === 'win').length
  const last10WinRate = last10.length > 0 ? Math.round((last10Wins / last10.length) * 100) : 0

  // Correlación mood (journal) ↔ win rate por día
  const journalEntries = await prisma.journalEntry.findMany({
    where: { userId: session.user.id },
    select: { date: true, mood: true },
  })
  const moodByDate: Record<string, number> = {}
  for (const j of journalEntries) {
    moodByDate[j.date.toISOString().split('T')[0]] = j.mood
  }
  // Agrupar trades por día con su mood
  const tradesByDate: Record<string, { wins: number; total: number; mood: number }> = {}
  for (const t of trades) {
    const dateStr = t.date.toISOString().split('T')[0]
    if (!tradesByDate[dateStr]) tradesByDate[dateStr] = { wins: 0, total: 0, mood: moodByDate[dateStr] ?? -1 }
    if (t.result !== 'be') {
      tradesByDate[dateStr].total++
      if (t.result === 'win') tradesByDate[dateStr].wins++
    }
  }
  const moodCorrelation = Object.entries(tradesByDate)
    .filter(([, d]) => d.mood > 0 && d.total > 0)
    .map(([date, d]) => ({
      date,
      mood: d.mood,
      winRate: Math.round((d.wins / d.total) * 100),
      trades: d.total,
    }))

  // Mood chart últimos 7 días
  const moodChart: { date: string; mood: number | null }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    moodChart.push({ date: dateStr, mood: moodByDate[dateStr] ?? null })
  }

  // Racha de hábitos (días consecutivos completando al menos 1 hábito)
  const habitHistory = await prisma.habitCompletion.findMany({
    where: { userId: session.user.id },
    select: { date: true },
    orderBy: { date: 'desc' },
  })
  const habitDateSet = new Set(habitHistory.map((h) => h.date.toISOString().split('T')[0]))
  const habitDates = Array.from(habitDateSet).sort((a, b) => b.localeCompare(a))
  let habitStreak = 0
  if (habitDates.length > 0) {
    const todayStr = new Date().toISOString().split('T')[0]
    const startDate = habitDates[0] === todayStr ? todayStr : (() => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      return yesterday.toISOString().split('T')[0]
    })()
    if (habitDates[0] === todayStr || habitDates[0] === startDate) {
      let current = new Date(habitDates[0])
      for (const dateStr of habitDates) {
        const d = new Date(dateStr)
        const diff = Math.round((current.getTime() - d.getTime()) / 86400000)
        if (diff <= 1) { habitStreak++; current = d } else break
      }
    }
  }

  // CEO Command Center: today's plan progress (non-fixed blocks only)
  const todayStr = new Date().toISOString().split('T')[0]
  const todayDate = parseDateOnly(todayStr)
  const todayPlan = await prisma.dailyPlan.findUnique({
    where: { userId_date: { userId: session.user.id, date: todayDate } },
    include: { workBlocks: { where: { isFixed: false } } },
  })
  const ceoBlocks = todayPlan?.workBlocks ?? []
  const ceoDoneBlocks = ceoBlocks.filter((b) => b.status === 'done')
  const ceoSkippedBlocks = ceoBlocks.filter((b) => b.status === 'skipped')
  const ceoWorkedHours = ceoDoneBlocks.reduce((s, b) => s + b.durationHours, 0)

  return NextResponse.json({
    total,
    wins,
    losses,
    be,
    winRate,
    pctPlan,
    totalPips: Math.round(totalPips * 10) / 10,
    profitFactor,
    streak,
    streakType,
    byEmotion,
    performance,
    last10WinRate,
    moodCorrelation,
    moodChart,
    habitStreak,
    bySetup,
    byPair,
    equityCurve,
    ceo: todayPlan
      ? {
          totalBlocks: ceoBlocks.length,
          doneBlocks: ceoDoneBlocks.length,
          skippedBlocks: ceoSkippedBlocks.length,
          workedHours: Math.round(ceoWorkedHours * 10) / 10,
          pct: ceoBlocks.length > 0 ? Math.round((ceoDoneBlocks.length / ceoBlocks.length) * 100) : 0,
        }
      : null,
  })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener estadísticas' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDayStart, getDayEnd } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date')
  const result = searchParams.get('result')
  const pair = searchParams.get('pair')
  const limit = searchParams.get('limit')

  const where: Record<string, unknown> = { userId: session.user.id }

  if (dateStr) {
    where.date = { gte: getDayStart(dateStr), lte: getDayEnd(dateStr) }
  }
  if (result) where.result = result
  if (pair) where.pair = { contains: pair, mode: 'insensitive' }

  const trades = await prisma.trade.findMany({
    where,
    orderBy: { date: 'desc' },
    take: limit ? parseInt(limit) : undefined,
  })

  return NextResponse.json(trades)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { pair, result, pips, setup, emotion, followedPlan, notes, date } = body

  if (!pair || !result) {
    return NextResponse.json({ error: 'Par y resultado son requeridos' }, { status: 400 })
  }

  const trade = await prisma.trade.create({
    data: {
      userId: session.user.id,
      date: date ? new Date(date) : new Date(),
      pair,
      result,
      pips: pips ? parseFloat(pips) : null,
      setup: setup || null,
      emotion: emotion || null,
      followedPlan: Boolean(followedPlan),
      notes: notes || null,
    },
  })

  return NextResponse.json(trade, { status: 201 })
}

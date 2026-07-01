import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDayStart, getDayEnd } from '@/lib/utils'
import { TradeSchema } from '@/lib/schemas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('date')
    const fromStr = searchParams.get('from')
    const toStr = searchParams.get('to')
    const result = searchParams.get('result')
    const pair = searchParams.get('pair')
    const limit = searchParams.get('limit')
    const page = parseInt(searchParams.get('page') ?? '1')
    const pageSize = limit ? parseInt(limit) : 50

    const where: Record<string, unknown> = { userId: session.user.id }

    if (dateStr) {
      where.date = { gte: getDayStart(dateStr), lte: getDayEnd(dateStr) }
    } else if (fromStr || toStr) {
      const dateFilter: Record<string, Date> = {}
      if (fromStr) dateFilter.gte = new Date(fromStr + 'T00:00:00')
      if (toStr) dateFilter.lte = new Date(toStr + 'T23:59:59')
      where.date = dateFilter
    }
    if (result) where.result = result
    if (pair) where.pair = { contains: pair, mode: 'insensitive' }

    const trades = await prisma.trade.findMany({
      where,
      orderBy: { date: 'desc' },
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: {
        id: true,
        date: true,
        pair: true,
        result: true,
        pips: true,
        setup: true,
        emotion: true,
        followedPlan: true,
        notes: true,
        createdAt: true,
        screenshot: true,
      },
    })

    // Strip screenshot data from list response — clients fetch individually via GET /api/trades/[id]
    return NextResponse.json(
      trades.map(({ screenshot, ...t }) => ({ ...t, hasScreenshot: screenshot !== null }))
    )
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener trades' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = TradeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { pair, result, pips, setup, emotion, followedPlan, notes, date } = parsed.data

    const trade = await prisma.trade.create({
      data: {
        userId: session.user.id,
        date: date ? new Date(date) : new Date(),
        pair,
        result,
        pips: pips ?? null,
        setup: setup ?? null,
        emotion: emotion ?? null,
        followedPlan: followedPlan ?? false,
        notes: notes ?? null,
        screenshot: parsed.data.screenshot ?? null,
      },
    })

    return NextResponse.json(trade, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al crear trade' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDayStart, getDayEnd } from '@/lib/utils'

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
    })

    return NextResponse.json(trades)
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
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al crear trade' }, { status: 500 })
  }
}
